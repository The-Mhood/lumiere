/**
 * TMDB catalogue adapter.
 *
 * Imports the same public movie/TV metadata API used by CineLite, then
 * enriches existing catalogue entries with regional legal watch-provider
 * availability. TMDB does not provide playable streams.
 *
 * Requires a TMDB v3 API key in TMDB_API_KEY.
 */
import type { AggregatedAvailability, AggregatedTitle, AggregatorAdapter, AdapterContext } from "./types";

const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";
const POSTER_SIZE = "w500";
const BACKDROP_SIZE = "w1280";
const REGIONS = (process.env.TMDB_REGIONS ?? "NG,PK,US,GB,IN").split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);

interface TmdbGenre { id: number; name: string }
interface TmdbListResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
}
interface TmdbPage { page: number; results: TmdbListResult[]; total_pages: number }
interface WatchProvider { provider_id: number; provider_name: string; logo_path?: string }
interface RegionBlock { link: string; flatrate?: WatchProvider[]; free?: WatchProvider[]; ads?: WatchProvider[]; rent?: WatchProvider[]; buy?: WatchProvider[] }

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is missing");
  const url = new URL(API + path);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return (await res.json()) as T;
}

function toTitle(item: TmdbListResult, kind: "movie" | "series", genreNames: Map<number, string>): AggregatedTitle | null {
  const name = (kind === "movie" ? item.title : item.name)?.trim();
  if (!name) return null;
  const date = kind === "movie" ? item.release_date : item.first_air_date;
  const year = date && /^\\d{4}/.test(date) ? Number(date.slice(0, 4)) : 0;
  return {
    externalSource: "tmdb",
    externalId: String(item.id),
    kind,
    name,
    originalName: (kind === "movie" ? item.original_title : item.original_name) || name,
    synopsis: item.overview || `${name} — metadata supplied by TMDB.`,
    year,
    releaseDate: date || undefined,
    country: "Unknown",
    language: item.original_language || "und",
    rating: Math.max(0, Math.min(10, Number(item.vote_average) || 0)),
    voteCount: Number(item.vote_count) || 0,
    popularity: Number(item.popularity) || 0,
    posterUrl: item.poster_path ? `${IMAGE}/${POSTER_SIZE}${item.poster_path}` : undefined,
    backdropUrl: item.backdrop_path ? `${IMAGE}/${BACKDROP_SIZE}${item.backdrop_path}` : undefined,
    license: "Metadata and artwork references supplied by The Movie Database (TMDB); playback rights must be verified separately.",
    genres: (item.genre_ids ?? []).map((id) => genreNames.get(id)).filter((name): name is string => Boolean(name)),
    sources: [],
    availability: [],
  };
}

async function fetchPopular(kind: "movie" | "series", limit: number, genreNames: Map<number, string>, ctx: AdapterContext) {
  const endpoint = kind === "movie" ? "/discover/movie" : "/discover/tv";
  const pageCount = Math.max(1, Math.ceil(limit / 20));
  const out: AggregatedTitle[] = [];
  for (let page = 1; page <= pageCount && out.length < limit; page++) {
    const data = await tmdb<TmdbPage>(endpoint, {
      page: String(page),
      sort_by: "popularity.desc",
      include_adult: "false",
      include_video: "false",
      language: "en-US",
    });
    for (const item of data.results) {
      const title = toTitle(item, kind, genreNames);
      if (title) out.push(title);
      if (out.length >= limit) break;
    }
    ctx.log(`TMDB ${kind}: page ${page}/${Math.min(pageCount, data.total_pages || pageCount)}, ${data.results.length} results`);
  }
  return out;
}

export const tmdbAdapter: AggregatorAdapter = {
  key: "tmdb",
  name: "TMDB · CineLite catalogue + where to watch",
  description: "Imports popular movie and TV metadata and poster artwork from the TMDB catalogue used by CineLite, then adds regional legal watch-provider links.",
  configured: () => Boolean(process.env.TMDB_API_KEY),
  providers: [],

  async fetchCatalogue(ctx: AdapterContext) {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdb<{ genres: TmdbGenre[] }>("/genre/movie/list", { language: "en-US" }),
      tmdb<{ genres: TmdbGenre[] }>("/genre/tv/list", { language: "en-US" }),
    ]);
    const genreNames = new Map<number, string>();
    for (const genre of [...movieGenres.genres, ...tvGenres.genres]) genreNames.set(genre.id, genre.name);

    const movieLimit = Math.ceil(ctx.limit / 2);
    const seriesLimit = Math.floor(ctx.limit / 2);
    const [movies, series] = await Promise.all([
      fetchPopular("movie", movieLimit, genreNames, ctx),
      fetchPopular("series", seriesLimit, genreNames, ctx),
    ]);
    const combined = [...movies, ...series].sort((a, b) => b.popularity - a.popularity);
    ctx.log(`TMDB catalogue: imported candidates — ${movies.length} movies, ${series.length} TV titles`);
    return combined;
  },

  async enrich(existing, ctx: AdapterContext) {
    const results: { titleId: number; availability: AggregatedAvailability[] }[] = [];
    for (const t of existing.slice(0, ctx.limit)) {
      try {
        const type = t.kind === "series" ? "tv" : "movie";
        const search = await tmdb<{ results: { id: number }[] }>(`/search/${type}`, {
          query: t.name,
          ...(t.kind === "movie" ? { year: String(t.year) } : { first_air_date_year: String(t.year) }),
        });
        const hit = search.results[0];
        if (!hit) continue;
        const wp = await tmdb<{ results: Record<string, RegionBlock> }>(`/${type}/${hit.id}/watch/providers`);
        const availability: AggregatedAvailability[] = [];
        for (const region of REGIONS) {
          const block = wp.results[region];
          if (!block) continue;
          const push = (list: WatchProvider[] | undefined, kind: AggregatedAvailability["kind"]) =>
            list?.forEach((p) =>
              availability.push({
                platform: p.provider_name,
                platformSlug: p.provider_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                kind,
                region,
                url: block.link,
                logoUrl: p.logo_path ? `${IMAGE}/w92${p.logo_path}` : undefined,
              }),
            );
          push(block.flatrate, "subscription");
          push(block.free, "free");
          push(block.ads, "free");
          push(block.rent, "rent");
          push(block.buy, "buy");
        }
        if (availability.length) results.push({ titleId: t.id, availability });
      } catch (e) {
        ctx.log(`tmdb error for ${t.name}: ${(e as Error).message}`);
      }
    }
    return results;
  },
};
