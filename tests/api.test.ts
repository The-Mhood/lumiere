/**
 * Integration tests against the real database (DATABASE_URL). They exercise the
 * catalogue query layer and the auth/watchlist/progress route handlers directly.
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const cookieJar = new Map<string, string>();
// Minimal next/headers shim so route handlers can run outside a Next request.
import { vi } from "vitest";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k)! } : undefined),
    set: (k: string, v: string) => cookieJar.set(k, v),
    delete: (k: string) => cookieJar.delete(k),
  }),
}));

const { db, closeDb } = await import("@/db");
const { seedDatabase } = await import('@/db/catalogue-seed');
await seedDatabase(db);
const { users, titles, playbackChecks } = await import("@/db/schema");
const { queryCatalogue, getTitleBySlug } = await import("@/lib/content");
const register = (await import("@/app/api/auth/register/route")).POST;
const login = (await import("@/app/api/auth/login/route")).POST;
const watchlistRoute = await import("@/app/api/watchlist/route");
const progressRoute = await import("@/app/api/progress/route");

const email = `test-${Date.now()}@lumiere.test`;
const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

afterAll(async () => {
  await db.delete(users).where(eq(users.email, email));
  await closeDb();
});

describe("catalogue", () => {
  it("normalizes malformed paging instead of generating invalid SQL", async () => {
    const result = await queryCatalogue({ page: Number.NaN, pageSize: Number.NaN });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(24);
  });
  it("resolves matching sources through the provider API and rejects wrong episodes", async () => {
    const { GET } = await import("@/app/api/titles/[slug]/sources/route");
    const response = await GET(new Request("http://localhost/api/titles/sintel/sources"), { params: Promise.resolve({ slug: "sintel" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sources.length).toBeGreaterThan(0);
    expect(data.reports.some((r: { status: string }) => r.status === "available")).toBe(true);
    const wrong = await GET(new Request("http://localhost/api/titles/sintel/sources?episodeId=1"), { params: Promise.resolve({ slug: "sintel" }) });
    expect(wrong.status).toBe(400);
  });
  it("filters by kind, genre, year, country and sorts", async () => {
    const movies = await queryCatalogue({ kind: "movie", sort: "rating" });
    expect(movies.items).toEqual([]); // Demo fixtures are no longer public catalogue content.
    for (const query of [{ genre: 'sci-fi' }, { year: 2010 }, { country: 'Argentina' }, { q: 'dragon' }]) {
      expect((await queryCatalogue(query)).items).toEqual([]);
    }
  });

  it("hides unauthorized providers and ranks the 4K source first", async () => {
    const t = await getTitleBySlug("big-buck-bunny");
    expect(t).not.toBeNull();
    expect(t!.sources.some((s) => s.providerSlug === "legacy-mirror")).toBe(false);
    expect(t!.sources[0].resolutions).toContain("2160p");
    expect(t!.similar).toEqual([]);
  });

  it("returns series navigation without mislabeling unrelated demo films as episode sources", async () => {
    const s = await getTitleBySlug("caminandes");
    expect(s!.seasons.length).toBe(2);
    expect(s!.seasons[0].episodes.length).toBe(3);
    expect(s!.seasons[0].episodes[0].sources).toEqual([]);
  });
});

describe('playable-only catalogue', () => {
  it('requires recent successful checks and hides stale, failed and demo entries', async () => {
    const [fixture] = await db.insert(titles).values({ slug: 'checked-external-test', kind: 'movie', name: 'Checked external', synopsis: 'Test fixture', year: 2020, country: 'US', license: 'test', externalSource: 'test', externalId: 'movie:123' }).returning();
    const { recordPlaybackLookup } = await import('@/lib/streaming/availability');
    try {
      expect((await queryCatalogue({ q: 'Checked external' })).items).toEqual([]);
      await recordPlaybackLookup(fixture.id, true);
      expect((await queryCatalogue({ q: 'Checked external' })).items.map(item => item.id)).toEqual([fixture.id]);
      await db.update(playbackChecks).set({ checkedAt: new Date(Date.now() - 25 * 3600000) }).where(eq(playbackChecks.titleId, fixture.id));
      expect((await queryCatalogue({ q: 'Checked external' })).items).toEqual([]);
      await recordPlaybackLookup(fixture.id, false);
      expect((await queryCatalogue({ q: 'Checked external' })).items).toEqual([]);
    } finally { await db.delete(titles).where(eq(titles.id, fixture.id)); }
  });
  it('never falls back to unrelated local movies when platform metadata is missing', async () => {
    vi.stubEnv('TMDB_API_KEY', ''); vi.stubEnv('TMDB_READ_ACCESS_TOKEN', '');
    try {
      const result = await queryCatalogue({ watchProvider: 8 });
      expect(result.items).toEqual([]);
      expect(result.discoveryNotice).toContain('not configured');
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('catalogue operations', () => {
  it('rejects unauthenticated catalogue scheduling even when the token is unset', async () => {
    const route = await import('@/app/api/admin/catalogue/route');
    vi.stubEnv('AGGREGATOR_TOKEN', '');
    try {
      expect((await route.GET(new Request('http://localhost/api/admin/catalogue'))).status).toBe(401);
      expect((await route.POST(new Request('http://localhost/api/admin/catalogue', { method: 'POST' }))).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
  it('reads private scheduler status with the configured bearer token', async () => {
    const route = await import('@/app/api/admin/catalogue/route');
    vi.stubEnv('AGGREGATOR_TOKEN', 'test-admin-token-with-32-characters');
    try {
      const response = await route.GET(new Request('http://localhost/api/admin/catalogue', { headers: { Authorization: 'Bearer test-admin-token-with-32-characters' } }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ running: false });
    } finally { vi.unstubAllEnvs(); }
  });
  it('materializes genuine TV episode coordinates idempotently without inventing sources', async () => {
    const { materializeTmdbSeries } = await import('@/lib/tmdb-discovery');
    const { cache } = await import('@/lib/cache');
    cache.clearPrefix('tmdb:discovery:');
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith('/season/1') ? {
      episodes: [{ episode_number: 1, name: 'Pilot', overview: 'A real episode description', air_date: '2008-01-20', runtime: 58 }],
    } : { id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', genres: [{ id: 18, name: 'Drama' }], seasons: [{ season_number: 1, name: 'Season 1' }] }))));
    try {
      await materializeTmdbSeries(1396); await materializeTmdbSeries(1396);
      const result = await getTitleBySlug('tmdb-series-1396');
      expect(result?.seasons).toHaveLength(1);
      expect(result?.seasons[0].episodes).toHaveLength(1);
      expect(result?.seasons[0].episodes[0]).toMatchObject({ number: 1, name: 'Pilot', sources: [] });
      const { playbackIdentity } = await import('@/lib/streaming/identity');
      expect(playbackIdentity(result!, result!.seasons[0].episodes[0].id)).toMatchObject({ tmdbId: 1396, seasonNumber: 1, episodeNumber: 1 });
    } finally {
      await db.delete(titles).where(eq(titles.slug, 'tmdb-series-1396'));
      vi.unstubAllEnvs(); vi.unstubAllGlobals(); cache.clearPrefix('tmdb:discovery:');
    }
  });
});

describe("auth + library", () => {
  it("rejects weak registrations", async () => {
    const res = await register(json("/api/auth/register", "POST", { email: "bad", name: "x", password: "123" }));
    expect(res.status).toBe(400);
  });

  it("registers, logs in, manages watchlist and progress", async () => {
    const r = await register(json("/api/auth/register", "POST", { email, name: "Tester", password: "supersecret1" }));
    expect(r.status).toBe(200);
    expect(cookieJar.has("lumiere_session")).toBe(true);

    cookieJar.clear();
    const bad = await login(json("/api/auth/login", "POST", { email, password: "wrong" }));
    expect(bad.status).toBe(401);
    const ok = await login(json("/api/auth/login", "POST", { email, password: "supersecret1" }));
    expect(ok.status).toBe(200);

    const t = await getTitleBySlug("sintel");
    await watchlistRoute.POST(json("/api/watchlist", "POST", { titleId: t!.id }));
    let list = await (await watchlistRoute.GET()).json();
    expect(list.items.map((i: { slug: string }) => i.slug)).toContain("sintel");
    await watchlistRoute.DELETE(json("/api/watchlist", "DELETE", { titleId: t!.id }));
    list = await (await watchlistRoute.GET()).json();
    expect(list.items.length).toBe(0);

    await progressRoute.POST(json("/api/progress", "POST", { titleId: t!.id, position: 120, duration: 900 }));
    await progressRoute.POST(json("/api/progress", "POST", { titleId: t!.id, position: 300, duration: 900 }));
    const p = await (await progressRoute.GET(new Request(`http://localhost/api/progress?titleId=${t!.id}`))).json();
    expect(p.progress.positionSeconds).toBe(300);
    expect(p.progress.completed).toBe(false);

    const done = await (await progressRoute.POST(json("/api/progress", "POST", { titleId: t!.id, position: 890, duration: 900 }))).json();
    expect(done.completed).toBe(true);
  });
});
