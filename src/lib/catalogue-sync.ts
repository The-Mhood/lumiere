import { db } from '@/db';
import { titles, playbackChecks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { PLATFORMS, platformCatalogueIds } from './platforms';
import { materializeTmdbMovie, materializeTmdbSeries, tmdbConfigured, tmdbGet } from './tmdb-discovery';
import { getTitleBySlug } from './content';
import { getResolver } from './streaming/providers';
import { playbackIdentity } from './streaming/identity';
import { recordPlaybackLookup } from './streaming/availability';
import { cache } from './cache';

export interface SyncStatus { running: boolean; checked: number; available: number; failed: number; startedAt?: string; finishedAt?: string; error?: string }
const shared = globalThis as typeof globalThis & { __catalogueSync?: SyncStatus; __catalogueCycle?: number };
export function catalogueSyncStatus(): SyncStatus { return shared.__catalogueSync ?? { running: false, checked: 0, available: 0, failed: 0 }; }

/** Bounded recurring sync: metadata supplies identity/categories, source adapters
 * independently determine availability. Never promotes metadata-only records. */
export async function syncCatalogue() {
  if (catalogueSyncStatus().running) return;
  const state: SyncStatus = { running: true, checked: 0, available: 0, failed: 0, startedAt: new Date().toISOString() };
  shared.__catalogueSync = state;
  try {
    if (!tmdbConfigured()) throw new Error('TMDB metadata credential is missing');
    if (!process.env.LUMIERE_MEDIA_WORKER_URL || !process.env.LUMIERE_MEDIA_WORKER_TOKEN) throw new Error('Media worker is not configured');
    const cycle = shared.__catalogueCycle ?? 0;
    shared.__catalogueCycle = cycle + 1;
    const provider = PLATFORMS[cycle % PLATFORMS.length];
    const kind = Math.floor(cycle / PLATFORMS.length) % 2 ? 'series' : 'movie';
    const page = 1 + Math.floor(cycle / (PLATFORMS.length * 2)) % 5;
    const catalogue = await platformCatalogueIds(provider.id, kind, page);
    const trending = await tmdbGet<{ results: { id: number }[] }>(`/trending/${kind === 'series' ? 'tv' : 'movie'}/day`);
    const candidates = [...new Set([...catalogue.ids, ...trending.results.map(t => t.id)])];
    const resolver = await getResolver();
    for (const id of candidates) {
      if (state.checked >= 12) break;
      const slug = `tmdb-${kind}-${id}`;
      const [existing] = await db.select({ id: titles.id }).from(titles).where(eq(titles.slug, slug));
      if (existing) {
        const [check] = await db.select().from(playbackChecks).where(eq(playbackChecks.titleId, existing.id));
        if (check && Date.now() - check.checkedAt.getTime() < 6 * 3600000) continue;
      }
      state.checked++;
      try {
        if (kind === 'movie') await materializeTmdbMovie(slug); else await materializeTmdbSeries(id);
        const title = await getTitleBySlug(slug);
        if (!title) throw new Error('Metadata could not be stored');
        const episode = title.seasons.flatMap(s => s.episodes)[0];
        const result = await resolver.resolve(playbackIdentity(title, episode?.id));
        await recordPlaybackLookup(title.id, result.sources.length > 0);
        if (result.sources.length) state.available++; else state.failed++;
      } catch { state.failed++; }
    }
    cache.clearPrefix('home');
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Catalogue sync failed';
  } finally { state.running = false; state.finishedAt = new Date().toISOString(); }
}
