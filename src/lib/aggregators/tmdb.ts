/**
 * TMDB adapter — metadata + cross-platform "where to watch" availability
 * (TMDB's watch-provider data is supplied by JustWatch and links to the legal
 * platform page: Netflix, Prime Video, Apple TV, Disney+, YouTube, etc.).
 *
 * Requires TMDB_API_KEY. Without it the adapter reports "not configured" and
 * the runner skips it gracefully.
 */
import type { AggregatedAvailability, AggregatorAdapter, AdapterContext } from "./types";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w92";
const REGIONS = (process.env.TMDB_REGIONS ?? "PK,US,GB,IN").split(",").map((r) => r.trim().toUpperCase());

interface WatchProvider { provider_id: number; provider_name: string; logo_path?: string }
interface RegionBlock { link: string; flatrate?: WatchProvider[]; free?: WatchProvider[]; ads?: WatchProvider[]; rent?: WatchProvider[]; buy?: WatchProvider[] }

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.TMDB_API_KEY!;
  const url = new URL(API + path);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return (await res.json()) as T;
}

export const tmdbAdapter: AggregatorAdapter = {
  key: "tmdb",
  name: "TMDB · Where to watch",
  description: "Enriches the catalogue with legal streaming availability across Netflix, Prime Video, Apple TV, Disney+, YouTube and 100+ platforms (JustWatch data via TMDB).",
  configured: () => Boolean(process.env.TMDB_API_KEY),
  providers: [],

  async fetchCatalogue() {
    // TMDB provides metadata, not playable streams — nothing to import directly.
    return [];
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
        if (!hit) {
          ctx.log(`tmdb: no match for ${t.name}`);
          continue;
        }
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
                logoUrl: p.logo_path ? IMG + p.logo_path : undefined,
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
