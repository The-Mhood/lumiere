import { cache } from './cache';
import type { TitleCard, CatalogueQuery } from './content';
import type { Title } from '@/db/schema';

interface Movie {
  id: number; title: string; original_title?: string; overview?: string;
  release_date?: string; vote_average?: number; vote_count?: number; popularity?: number;
  poster_path?: string; backdrop_path?: string; runtime?: number; original_language?: string;
  production_countries?: { name: string }[]; genres?: { id: number; name: string }[];
}
interface Page { results: Movie[]; total_results: number; total_pages: number; page: number }
const IMAGE = 'https://image.tmdb.org/t/p/';
export const tmdbConfigured = () => Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY);

export async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!tmdbConfigured()) throw new Error('TMDB discovery is not configured');
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) url.searchParams.set('api_key', process.env.TMDB_API_KEY!);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const key = `tmdb:discovery:${path}:${JSON.stringify(params)}`;
  const hit = cache.get<T>(key);
  if (hit) return hit;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`TMDB discovery HTTP ${response.status}`);
  const data = await response.json() as T;
  cache.set(key, data, 300);
  return data;
}

export function movieCard(movie: Movie): TitleCard {
  return {
    id: -movie.id * 2, slug: `tmdb-movie-${movie.id}`, kind: 'movie', name: movie.title,
    year: Number(movie.release_date?.slice(0, 4)) || 0, rating: movie.vote_average ?? 0,
    posterUrl: movie.poster_path ? `${IMAGE}w500${movie.poster_path}` : null,
    maxQuality: 'unverified', runtimeMinutes: movie.runtime ?? null, country: movie.production_countries?.[0]?.name ?? '',
  };
}

export async function discoverMovies(q: CatalogueQuery) {
  const page = Math.min(500, Math.max(1, Math.floor(q.page || 1)));
  const params: Record<string, string> = { page: String(page), include_adult: 'false' };
  let path = '/discover/movie';
  if (q.q?.trim()) { path = '/search/movie'; params.query = q.q.trim().slice(0, 200); }
  else {
    params.sort_by = ({ rating: 'vote_average.desc', year: 'primary_release_date.desc', newest: 'primary_release_date.desc', title: 'title.asc', popular: 'popularity.desc' } as const)[q.sort ?? 'popular'] || 'popularity.desc';
    if (q.sort === 'rating') params['vote_count.gte'] = '200';
    if (q.genre) {
      const { genres } = await tmdbGet<{ genres: { id: number; name: string }[] }>('/genre/movie/list');
      const genre = genres.find(g => g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === q.genre);
      if (genre) params.with_genres = String(genre.id);
    }
  }
  if (!q.q && q.watchProvider && Number.isSafeInteger(q.watchProvider) && q.watchProvider > 0) {
    params.with_watch_providers = String(q.watchProvider);
    params.watch_region = process.env.TMDB_WATCH_REGION || 'US';
  }
  if (q.year) params[q.q ? 'year' : 'primary_release_year'] = String(q.year);
  const data = await tmdbGet<Page>(path, params);
  return { items: data.results.filter(m => Number.isSafeInteger(m.id) && m.title).map(movieCard), total: data.total_results, page, pageSize: 20, pages: Math.min(500, data.total_pages) };
}

export async function tmdbHomeMovies() {
  const paths = ['/trending/movie/day', '/movie/popular', '/movie/now_playing', '/movie/top_rated'];
  const pages = await Promise.all(paths.map(path => tmdbGet<Page>(path)));
  const [trending, popular, recent, topRated] = pages.map(p => p.results.map(movieCard));
  // Hero content is metadata only. Opening a card resolves its external ID;
  // no batch-import of search/category results is required.
  const featured: Title[] = pages[0].results.slice(0, 5).map(m => ({
    ...movieCard(m), originalName: m.original_title ?? m.title, synopsis: m.overview ?? '', tagline: null,
    releaseDate: m.release_date ?? null, voteCount: m.vote_count ?? 0, popularity: m.popularity ?? 0,
    backdropUrl: m.backdrop_path ? `${IMAGE}w1280${m.backdrop_path}` : null, language: m.original_language ?? 'en',
    trailerUrl: null, license: 'Playback rights depend on the selected provider', featured: true,
    externalSource: 'tmdb', externalId: `movie:${m.id}`, createdAt: new Date(0),
  }));
  const [providerPage, genrePage] = await Promise.all([
    tmdbGet<{ results: { provider_id: number; provider_name: string; logo_path?: string; display_priority: number }[] }>('/watch/providers/movie', { watch_region: process.env.TMDB_WATCH_REGION || 'US' }),
    tmdbGet<{ genres: { id: number; name: string }[] }>('/genre/movie/list'),
  ]);
  const watchProviders = providerPage.results.sort((a, b) => a.display_priority - b.display_priority).slice(0, 16).map(p => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ? `${IMAGE}w154${p.logo_path}` : null }));
  const collections = await Promise.all(genrePage.genres.filter(g => [28, 35, 27, 878, 16, 18].includes(g.id)).map(async genre => {
    const page = await tmdbGet<Page>('/discover/movie', { with_genres: String(genre.id), include_adult: 'false', sort_by: 'popularity.desc' });
    return { genre: { ...genre, slug: genre.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, items: page.results.slice(0, 12).map(movieCard) };
  }));
  return { trending, popular, recent, topRated, featured, watchProviders, collections };
}

/** Persist only a clicked movie so existing watchlists/history keep stable IDs. */
export async function materializeTmdbMovie(slug: string) {
  const match = slug.match(/^tmdb-movie-([1-9]\d{0,9})$/);
  if (!match || !tmdbConfigured()) return;
  const id = Number(match[1]);
  const movie = await tmdbGet<Movie>(`/movie/${id}`);
  if (movie.id !== id || !movie.title || !movie.release_date) throw new Error('TMDB returned mismatched movie metadata');
  const [{ db }, { titles, genres, titleGenres }, { eq }] = await Promise.all([import('@/db'), import('@/db/schema'), import('drizzle-orm')]);
  await db.transaction(async tx => {
    await tx.insert(titles).values({ slug, kind: 'movie', name: movie.title, originalName: movie.original_title,
      synopsis: movie.overview || '', year: Number(movie.release_date!.slice(0, 4)), releaseDate: movie.release_date,
      runtimeMinutes: movie.runtime, country: movie.production_countries?.[0]?.name ?? '', language: movie.original_language ?? 'en',
      rating: movie.vote_average ?? 0, voteCount: movie.vote_count ?? 0, popularity: movie.popularity ?? 0,
      posterUrl: movie.poster_path ? `${IMAGE}w500${movie.poster_path}` : null,
      backdropUrl: movie.backdrop_path ? `${IMAGE}w1280${movie.backdrop_path}` : null,
      maxQuality: 'unverified', license: 'Playback rights depend on the selected provider', externalSource: 'tmdb', externalId: `movie:${id}`,
    }).onConflictDoNothing();
    const [title] = await tx.select().from(titles).where(eq(titles.slug, slug)).limit(1);
    if (!title) throw new Error('Movie identity conflict');
    for (const genre of movie.genres ?? []) {
      const genreSlug = genre.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await tx.insert(genres).values({ slug: genreSlug, name: genre.name }).onConflictDoNothing();
      const [row] = await tx.select().from(genres).where(eq(genres.slug, genreSlug)).limit(1);
      await tx.insert(titleGenres).values({ titleId: title.id, genreId: row.id }).onConflictDoNothing();
    }
  });
}

/** Fetch real series/episode identities; never manufacture episode fixtures. */
export async function materializeTmdbSeries(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid TMDB series ID');
  const series = await tmdbGet<{ id: number; name: string; original_name?: string; overview?: string; first_air_date?: string; poster_path?: string; backdrop_path?: string; original_language?: string; vote_average?: number; vote_count?: number; popularity?: number; genres?: { id: number; name: string }[]; seasons?: { season_number: number; name: string; overview?: string; poster_path?: string; air_date?: string }[] }>(`/tv/${id}`);
  if (series.id !== id || !series.name) throw new Error('TMDB returned mismatched series metadata');
  const [{ db }, schema, { eq }] = await Promise.all([import('@/db'), import('@/db/schema'), import('drizzle-orm')]);
  const slug = `tmdb-series-${id}`;
  await db.insert(schema.titles).values({ slug, kind: 'series', name: series.name, originalName: series.original_name,
    synopsis: series.overview || '', year: Number(series.first_air_date?.slice(0, 4)) || 0, releaseDate: series.first_air_date,
    country: '', language: series.original_language || 'en', rating: series.vote_average || 0, voteCount: series.vote_count || 0, popularity: series.popularity || 0,
    posterUrl: series.poster_path ? `${IMAGE}w500${series.poster_path}` : null, backdropUrl: series.backdrop_path ? `${IMAGE}w1280${series.backdrop_path}` : null,
    maxQuality: 'unverified', license: 'Playback depends on available media sources', externalSource: 'tmdb', externalId: `series:${id}`,
  }).onConflictDoNothing();
  const [title] = await db.select().from(schema.titles).where(eq(schema.titles.slug, slug));
  for (const genre of series.genres || []) {
    const genreSlug = genre.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await db.insert(schema.genres).values({ slug: genreSlug, name: genre.name }).onConflictDoNothing();
    const [row] = await db.select().from(schema.genres).where(eq(schema.genres.slug, genreSlug));
    await db.insert(schema.titleGenres).values({ titleId: title.id, genreId: row.id }).onConflictDoNothing();
  }
  for (const season of (series.seasons || []).filter(s => s.season_number > 0).slice(0, 30)) {
    const detail = await tmdbGet<{ episodes: { episode_number: number; name: string; overview?: string; air_date?: string; runtime?: number; still_path?: string }[] }>(`/tv/${id}/season/${season.season_number}`);
    await db.insert(schema.seasons).values({ titleId: title.id, number: season.season_number, name: season.name }).onConflictDoNothing();
    const rows = await db.select().from(schema.seasons).where(eq(schema.seasons.titleId, title.id));
    const row = rows.find(s => s.number === season.season_number)!;
    for (const episode of detail.episodes || []) {
      if (!episode.episode_number || !episode.name) continue;
      await db.insert(schema.episodes).values({ titleId: title.id, seasonId: row.id, number: episode.episode_number, name: episode.name,
        overview: episode.overview || '', airDate: episode.air_date, runtimeMinutes: episode.runtime,
        stillUrl: episode.still_path ? `${IMAGE}w780${episode.still_path}` : null }).onConflictDoNothing();
    }
  }
  return slug;
}

/** Search metadata is deliberately separate from the playable-only home rails. */
export async function searchTmdb(query: string, kind?: 'movie' | 'series', page = 1) {
  const text = query.trim().slice(0, 200);
  const currentPage = Math.max(1, Math.min(500, Math.floor(page) || 1));
  if (!text) return { items: [] as TitleCard[], total: 0, page: currentPage, pageSize: 20, pages: 1 };
  type Result = Movie & { media_type?: string; name?: string; original_name?: string; first_air_date?: string };
  const result = await tmdbGet<{ results: Result[]; total_results: number; total_pages: number }>(`/search/${kind === 'series' ? 'tv' : kind === 'movie' ? 'movie' : 'multi'}`, { query: text, include_adult: 'false', page: String(currentPage) });
  const items = result.results.filter(item => Number.isSafeInteger(item.id) && (item.title || item.name) && (kind || ['movie', 'tv'].includes(item.media_type || ''))).map(item => {
    const series = kind === 'series' || item.media_type === 'tv';
    const card = movieCard({ ...item, title: item.title || item.name!, release_date: item.release_date || item.first_air_date });
    return series ? { ...card, id: -item.id * 2 - 1, kind: 'series' as const, slug: `tmdb-series-${item.id}` } : card;
  });
  return { items, total: result.total_results, page: currentPage, pageSize: 20, pages: Math.max(1, Math.min(500, result.total_pages)) };
}
