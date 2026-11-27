import { tmdbConfigured, tmdbGet } from './tmdb-discovery';

// TMDB provider identities are catalogue labels, NEVER scraper endpoints.
export const PLATFORMS = [
  { id: 8, name: 'Netflix', mark: 'N', color: '#E50914' },
  { id: 9, name: 'Prime Video', mark: 'prime', color: '#00A8E1' },
  { id: 1899, name: 'HBO Max', mark: 'HBO', color: '#9257FF' },
  { id: 337, name: 'Disney+', mark: 'Disney+', color: '#2577EE' },
  { id: 350, name: 'Apple TV+', mark: 'tv+', color: '#E5E7EB' },
  { id: 15, name: 'Hulu', mark: 'hulu', color: '#1CE783' },
  { id: 531, name: 'Paramount+', mark: 'P+', color: '#3588FF' },
  { id: 386, name: 'Peacock', mark: 'peacock', color: '#FCCC12' },
] as const;
export async function platformCatalogueIds(provider: number, kind: 'movie' | 'series', page = 1) {
  if (!tmdbConfigured()) throw new Error('TMDB platform metadata is not configured');
  const result = await tmdbGet<{ results: { id: number }[]; total_pages: number }>(`/discover/${kind === 'series' ? 'tv' : 'movie'}`, {
    with_watch_providers: String(provider), watch_region: process.env.TMDB_WATCH_REGION || 'US',
    include_adult: 'false', sort_by: 'popularity.desc', page: String(Math.max(1, Math.min(500, page))),
  });
  return { ids: result.results.map(item => item.id), pages: Math.min(500, result.total_pages) };
}
