import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '../src/lib/cache';
import { discoverMovies, tmdbHomeMovies, tmdbConfigured } from '../src/lib/tmdb-discovery';
import { playbackIdentity } from '../src/lib/streaming/identity';
import type { TitleDetail } from '../src/lib/content';

beforeEach(() => { cache.clearPrefix('tmdb:discovery:'); vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'owner-test-token'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('live movie discovery, not bulk imports', () => {
  const movie = { id: 27205, title: 'Inception', release_date: '2010-07-14', vote_average: 8.4, poster_path: '/poster.jpg', overview: 'A movie' };
  it('searches the full TMDB movie index and creates a click-resolvable route', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [movie], total_results: 1, total_pages: 1, page: 1 })));
    vi.stubGlobal('fetch', fetch);
    const result = await discoverMovies({ q: 'Inception' });
    expect(result.items[0].slug).toBe('tmdb-movie-27205');
    expect(result.items[0].maxQuality).toBe('unverified');
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/3/search/movie');
    expect(url.searchParams.get('query')).toBe('Inception');
    expect(url.searchParams.has('api_key')).toBe(false);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer owner-test-token');
  });
  it('builds separate trending, popular, current and top-rated rails', async () => {
    const fetch = vi.fn().mockImplementation(async (url: URL) => new Response(JSON.stringify(
      url.pathname.endsWith('/genre/movie/list') ? { genres: [{ id: 28, name: 'Action' }] } :
      url.pathname.endsWith('/watch/providers/movie') ? { results: [{ provider_id: 8, provider_name: 'Netflix', display_priority: 1 }] } : { results: [movie] }
    )));
    vi.stubGlobal('fetch', fetch);
    const home = await tmdbHomeMovies();
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(home.collections[0].genre.slug).toBe("action");
    expect(home.watchProviders[0].id).toBe(8);
    expect(home.featured[0].externalId).toBe('movie:27205');
    expect(home.trending[0].name).toBe('Inception');
  });
  it('does not borrow third-party API credentials when unconfigured', () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', ''); vi.stubEnv('TMDB_API_KEY', '');
    expect(tmdbConfigured()).toBe(false);
  });
});
describe('playback identity', () => {
  it('never confuses database IDs, TMDB IDs or episode coordinates', () => {
    const title = { slug: 'example', name: 'Example', year: 2020, kind: 'series', externalSource: 'cinejoy', externalId: 'series:123', seasons: [{ number: 2, episodes: [{ id: 999, name: 'Second episode', number: 3 }] }] } as unknown as TitleDetail;
    expect(playbackIdentity(title, 999)).toMatchObject({ tmdbId: 123, seasonNumber: 2, episodeNumber: 3, episodeId: 999 });
    expect(playbackIdentity({ ...title, externalSource: 'internet-archive' }, 999).tmdbId).toBeUndefined();
    expect(playbackIdentity({ ...title, externalId: 'movie:123' }, 999).tmdbId).toBeUndefined();
  });
});

describe('matching movie and TV search', () => {
  it('preserves the search input and maps series to real series routes, not movie routes', async () => {
    const { searchTmdb } = await import('../src/lib/tmdb-discovery');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { id: 1396, media_type: 'tv', name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: '/bb.jpg' },
      { id: 1, media_type: 'person', name: 'An actor' },
      { id: 27205, media_type: 'movie', title: 'Inception', release_date: '2010-07-14' },
    ], total_results: 3, total_pages: 1 })));
    vi.stubGlobal('fetch', fetch);
    const result = await searchTmdb('  Breaking Bad  ');
    expect(result.items.map(item => item.slug)).toEqual(['tmdb-series-1396', 'tmdb-movie-27205']);
    expect(result.items[0]).toMatchObject({ kind: 'series', name: 'Breaking Bad', year: 2008 });
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/3/search/multi');
    expect(url.searchParams.get('query')).toBe('Breaking Bad');
    expect(result.items[0].maxQuality).toBe('unverified');
  });
  it('does not send empty searches upstream', async () => {
    const { searchTmdb } = await import('../src/lib/tmdb-discovery');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await searchTmdb('   ')).items).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
