import { timingSafeEqual } from 'node:crypto';
import { tmdbConfigured, tmdbGet } from '@/lib/tmdb-discovery';
import { configuredScraperSites } from '@/lib/streaming/browser-scraper';
import { jellyfinSettings } from '@/lib/streaming/jellyfin';
import { loadOwnedMediaConfig } from '@/lib/streaming/owned-media';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const token = process.env.AGGREGATOR_TOKEN;
  const actual = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${token || ''}`);
  if (!token || token.length < 24 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let metadata = false;
  try { if (tmdbConfigured()) { await tmdbGet('/configuration'); metadata = true; } } catch { /* Report failure without upstream URLs/credentials. */ }
  let worker = false;
  let adapters: { id: string; movie: boolean; series: boolean }[] = [];
  const endpoint = process.env.LUMIERE_MEDIA_WORKER_URL;
  const workerToken = process.env.LUMIERE_MEDIA_WORKER_TOKEN;
  try {
    if (endpoint && workerToken) {
      const response = await fetch(new URL('/health', endpoint), { headers: { Authorization: `Bearer ${workerToken}` }, redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store' });
      const data = await response.json();
      worker = response.ok && data.status === 'ok';
      const registered = new Set(configuredScraperSites().map(s => s.id));
      adapters = (Array.isArray(data.adapters) ? data.adapters : []).filter((a: { id: string }) => registered.has(a.id)).map((a: { id: string; movie?: boolean; series?: boolean }) => ({ id: a.id, movie: a.movie === true, series: a.series === true }));
    }
  } catch { /* A health check is not permission to expose worker internals. */ }
  // App-side library adapters (operator-owned media / own Jellyfin server).
  const libraryAdapters: { id: string; movie: boolean; series: boolean }[] = [];
  try {
    const owned = await loadOwnedMediaConfig();
    if (owned) libraryAdapters.push({ id: owned.provider.id, movie: owned.items.some(i => i.kind === 'movie'), series: owned.items.some(i => i.kind === 'series') });
  } catch { /* malformed library config: report as absent, never expose its contents */ }
  try {
    if (jellyfinSettings()) libraryAdapters.push({ id: 'jellyfin', movie: true, series: true });
  } catch { /* malformed Jellyfin config */ }
  return Response.json({ metadata, worker, adapters, libraryAdapters,
    movieLookupReady: metadata && ((worker && adapters.some(a => a.movie)) || libraryAdapters.some(a => a.movie)),
    tvLookupReady: metadata && ((worker && adapters.some(a => a.series)) || libraryAdapters.some(a => a.series)),
    note: 'Configuration readiness only; source support does not certify title coverage or successful video decoding.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
