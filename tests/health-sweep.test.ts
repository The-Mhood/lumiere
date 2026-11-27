import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const { db, closeDb } = await import('@/db');
const { providers, sources, titles } = await import('@/db/schema');
const { sweepSourceHealth, sourceHealthStatus } = await import('@/lib/streaming/health-sweep');

const [provider] = await db.insert(providers).values({ slug: 'sweep-cdn', name: 'Sweep CDN', allowedHosts: ['cdn.sweep.test'], authorized: true, priority: 10 }).returning();
const [title] = await db.insert(titles).values({ slug: 'sweep-film', kind: 'movie', name: 'Sweep Film', synopsis: '', year: 2020, country: 'US', license: 'owner', externalSource: 'test', externalId: 'movie:1' }).returning();
const insert = (url: string) => db.insert(sources).values({ providerId: provider.id, titleId: title.id, label: 'S', url, format: 'mp4' }).returning();
const [healthy] = await insert('https://cdn.sweep.test/good.mp4');
const [gone] = await insert('https://cdn.sweep.test/gone.mp4');
const [errorPage] = await insert('https://cdn.sweep.test/error.mp4');
const [flaky] = await insert('https://cdn.sweep.test/flaky.mp4');
const [misconfigured] = await insert('https://elsewhere.test/rogue.mp4');

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await closeDb(); });

describe('source health sweep', () => {
  it('probes least-recently-checked sources, persists status and never downloads bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('good.mp4')) return new Response('x', { status: 206, headers: { 'Content-Type': 'video/mp4' } });
      if (url.endsWith('gone.mp4')) return new Response('', { status: 404 });
      if (url.endsWith('error.mp4')) return new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await sweepSourceHealth(10);
    expect(result.running).toBe(false);
    expect(result.checked).toBe(5);
    expect(result.online).toBe(1);
    expect(result.offline).toBe(3); // 404 + HTML error page + host not on allow-list
    expect(result.degraded).toBe(1); // network failure
    const statusOf = async (id: number) => (await db.select().from(sources).where(eq(sources.id, id)))[0];
    expect((await statusOf(healthy.id)).status).toBe('online');
    expect((await statusOf(gone.id)).status).toBe('offline');
    expect((await statusOf(errorPage.id)).status).toBe('offline');
    expect((await statusOf(flaky.id)).status).toBe('degraded');
    expect((await statusOf(misconfigured.id)).status).toBe('offline');
    expect((await statusOf(healthy.id)).lastCheckedAt).toBeInstanceOf(Date);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers.Range).toBe('bytes=0-1');
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('elsewhere.test'))).toBe(false);
    expect(sourceHealthStatus().checked).toBe(5);
  });
  it('re-checks recovered sources and updates their status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 200, headers: { 'Content-Type': 'video/mp4' } })));
    const result = await sweepSourceHealth(10);
    expect(result.online).toBe(4); // misconfigured host stays offline
    expect((await db.select().from(sources).where(eq(sources.id, flaky.id)))[0].status).toBe('online');
  });
});

describe('admin health endpoint', () => {
  it('requires the private admin token and reports sweep + worker state', async () => {
    const route = await import('@/app/api/admin/health/route');
    expect((await route.GET(new Request('http://localhost/api/admin/health'))).status).toBe(401);
    vi.stubEnv('AGGREGATOR_TOKEN', 'test-admin-token-with-32-characters');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 200, headers: { 'Content-Type': 'video/mp4' } })));
    const response = await route.GET(new Request('http://localhost/api/admin/health', { headers: { Authorization: 'Bearer test-admin-token-with-32-characters' } }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sweep.checked).toBeGreaterThan(0);
    expect(data.worker).toEqual({ configured: false, healthy: false });
    expect(JSON.stringify(data)).not.toContain('test-admin-token');
  });
});
