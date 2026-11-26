/**
 * Aggregator adapter contract.
 *
 * An adapter talks to one external platform and normalises what it finds into
 * `AggregatedTitle`s. The runner (./index.ts) upserts them into the catalogue,
 * creates authorized `sources` for anything directly streamable, and records
 * cross-platform `availability` ("where to watch") entries.
 *
 * Adding a platform = implementing this interface and registering it in
 * `./registry.ts`. Nothing else in the app changes.
 */
import type { StreamFormat } from "../streaming";

export interface AggregatedSource {
  providerSlug: string;
  label: string;
  url: string;
  format: StreamFormat;
  resolutions: string[];
  audioLanguages?: string[];
  subtitleLanguages?: string[];
  priority?: number;
}

export interface AggregatedAvailability {
  platform: string;
  platformSlug: string;
  kind: "free" | "subscription" | "rent" | "buy";
  region?: string;
  url: string;
  logoUrl?: string;
  price?: string;
  quality?: string;
}

export interface AggregatedTitle {
  externalSource: string;
  externalId: string;
  kind: "movie" | "series";
  name: string;
  originalName?: string;
  synopsis: string;
  year: number;
  releaseDate?: string;
  runtimeMinutes?: number;
  country: string;
  language?: string;
  rating: number; // 0–10
  voteCount: number;
  popularity: number;
  posterUrl?: string;
  backdropUrl?: string;
  license: string;
  genres: string[];
  directors?: string[];
  sources: AggregatedSource[];
  availability: AggregatedAvailability[];
}

export interface AdapterContext {
  limit: number;
  log: (msg: string) => void;
}

export interface AggregatorAdapter {
  key: string;
  name: string;
  description: string;
  /** Whether the adapter has what it needs (API keys etc.) to run. */
  configured(): boolean;
  /** Which provider rows the runner must guarantee exist for this adapter's sources. */
  providers: { slug: string; name: string; allowedHosts: string[]; priority: number }[];
  /** Pull a catalogue from the platform. */
  fetchCatalogue(ctx: AdapterContext): Promise<AggregatedTitle[]>;
  /**
   * Optional enrichment pass over titles that already exist locally
   * (e.g. add "where to watch" links from a metadata platform).
   */
  enrich?(
    existing: { id: number; name: string; year: number; kind: "movie" | "series" }[],
    ctx: AdapterContext,
  ): Promise<{ titleId: number; availability: AggregatedAvailability[] }[]>;
}
