import { afterEach, expect, it, vi } from 'vitest';
import { PLATFORMS, platformCatalogueIds } from '../src/lib/platforms';
import { cache } from '../src/lib/cache';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); cache.clearPrefix('tmdb:discovery:'); });
it('uses unique metadata provider identities, not made-up platform membership', () => {
  expect(new Set(PLATFORMS.map(p => p.id)).size).toBe(PLATFORMS.length);
  expect(PLATFORMS.map(p => p.name)).toEqual(expect.arrayContaining(['Netflix', 'Prime Video', 'HBO Max']));
});
it('requests series metadata using the TV discovery endpoint and configured region', async () => {
  vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'test-token'); vi.stubEnv('TMDB_WATCH_REGION', 'NG');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 123 }], total_pages: 3 })));
  vi.stubGlobal('fetch', fetch);
  expect(await platformCatalogueIds(8, 'series', 2)).toEqual({ ids: [123], pages: 3 });
  const url = fetch.mock.calls[0][0] as URL;
  expect(url.pathname).toBe('/3/discover/tv');
  expect(url.searchParams.get('watch_region')).toBe('NG');
  expect(url.searchParams.get('with_watch_providers')).toBe('8');
  expect(url.searchParams.get('page')).toBe('2');
});
