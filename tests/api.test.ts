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

const { db, pool } = await import("@/db");
const { users } = await import("@/db/schema");
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
  await pool.end();
});

describe("catalogue", () => {
  it("filters by kind, genre, year, country and sorts", async () => {
    const movies = await queryCatalogue({ kind: "movie", sort: "rating" });
    expect(movies.items.length).toBeGreaterThan(0);
    expect(movies.items.every((m) => m.kind === "movie")).toBe(true);
    for (let i = 1; i < movies.items.length; i++) expect(movies.items[i - 1].rating).toBeGreaterThanOrEqual(movies.items[i].rating);

    const sci = await queryCatalogue({ genre: "sci-fi" });
    expect(sci.items.some((m) => m.slug === "tears-of-steel")).toBe(true);
    const y = await queryCatalogue({ year: 2010 });
    expect(y.items.map((m) => m.slug)).toContain("sintel");
    const ar = await queryCatalogue({ country: "Argentina" });
    expect(ar.items.map((m) => m.slug)).toEqual(["caminandes"]);
    const search = await queryCatalogue({ q: "dragon" });
    expect(search.items.map((m) => m.slug)).toContain("sintel");
  });

  it("hides unauthorized providers and ranks the 4K source first", async () => {
    const t = await getTitleBySlug("big-buck-bunny");
    expect(t).not.toBeNull();
    expect(t!.sources.some((s) => s.providerSlug === "legacy-mirror")).toBe(false);
    expect(t!.sources[0].resolutions).toContain("2160p");
    expect(t!.similar.length).toBeGreaterThan(0);
  });

  it("returns series with seasons, episodes and per-episode sources", async () => {
    const s = await getTitleBySlug("caminandes");
    expect(s!.seasons.length).toBe(2);
    expect(s!.seasons[0].episodes.length).toBe(3);
    expect(s!.seasons[0].episodes[0].sources.length).toBeGreaterThan(0);
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
