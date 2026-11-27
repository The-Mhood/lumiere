import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ProviderAdapter, TitleMatch } from './resolver';
import { detectFormat, hostAllowed, type SourceRecord, type StreamFormat } from '../streaming';

/**
 * Owned / licensed direct-media adapter.
 *
 * The operator declares media they control or are licensed to redistribute:
 * their own object storage / CDN (S3, R2, GCS, nginx, Caddy…), a licensed
 * partner endpoint, or the output of `scripts/transcode.mjs`. Every entry is
 * an ordinary HTTPS HLS/DASH/MP4 URL on an explicit host allow-list — no
 * third-party access control is involved or bypassed.
 *
 * Configuration: `LUMIERE_OWNED_MEDIA` (inline JSON) or
 * `LUMIERE_OWNED_MEDIA_FILE` (path to a JSON file, re-read at most every 30 s).
 * See `deploy/library/owned-media.example.json`.
 */

export interface OwnedMediaSource {
  url: string;
  format: StreamFormat;
  label?: string;
  resolutions?: string[];
  audioLanguages?: string[];
  subtitles?: { lang: string; label: string; url: string }[];
}
export interface OwnedMediaItem {
  /** TMDB identity (preferred: matches live-discovery titles). */
  tmdbId?: number;
  /** Catalogue slug for locally curated titles without a TMDB identity. */
  slug?: string;
  kind: 'movie' | 'series';
  seasonNumber?: number;
  episodeNumber?: number;
  sources: OwnedMediaSource[];
}
export interface OwnedMediaConfig {
  provider: { id: string; name: string; priority: number };
  allowedHosts: string[];
  items: OwnedMediaItem[];
}

const HOST = /^\*?\.?[a-z0-9.-]+\.[a-z]{2,}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

function validMediaUrl(url: unknown, allowedHosts: string[]): url is string {
  if (typeof url !== 'string' || url.length > 2048) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && hostAllowed(url, allowedHosts);
}

/** Strict, fail-closed validation: a malformed library file disables the
 * adapter with a clear error instead of silently exposing unchecked URLs. */
export function parseOwnedMediaConfig(raw: string): OwnedMediaConfig {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('Owned media config is not valid JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Owned media config must be a JSON object');
  const input = data as Record<string, unknown>;
  const allowedHosts = input.allowedHosts;
  if (!Array.isArray(allowedHosts) || !allowedHosts.length || allowedHosts.length > 50 ||
      allowedHosts.some(h => typeof h !== 'string' || h === '*' || !HOST.test(h))) throw new Error('Owned media config needs explicit allowedHosts');
  const providerInput = (input.provider ?? {}) as Record<string, unknown>;
  const provider = {
    id: typeof providerInput.id === 'string' && /^[a-z0-9-]{1,40}$/.test(providerInput.id) ? providerInput.id : 'owned-media',
    name: typeof providerInput.name === 'string' && providerInput.name.trim() ? providerInput.name.slice(0, 80) : 'Lumière Library',
    priority: Number.isInteger(providerInput.priority) && (providerInput.priority as number) >= 0 && (providerInput.priority as number) <= 1000 ? providerInput.priority as number : 5,
  };
  if (!Array.isArray(input.items) || input.items.length > 5000) throw new Error('Owned media config items must be an array of at most 5000 entries');
  const items: OwnedMediaItem[] = input.items.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const fail = (reason: string) => { throw new Error(`Owned media item ${index}: ${reason}`); };
    if (!item || typeof item !== 'object') return fail('must be an object');
    if (item.kind !== 'movie' && item.kind !== 'series') return fail('kind must be movie or series');
    const tmdbId = item.tmdbId === undefined ? undefined : Number(item.tmdbId);
    if (tmdbId !== undefined && (!Number.isSafeInteger(tmdbId) || tmdbId < 1)) return fail('tmdbId must be a positive integer');
    if (item.slug !== undefined && (typeof item.slug !== 'string' || !SLUG.test(item.slug))) return fail('slug is malformed');
    if (tmdbId === undefined && item.slug === undefined) return fail('needs tmdbId or slug');
    if (item.kind === 'series' && (!Number.isInteger(item.seasonNumber) || (item.seasonNumber as number) < 0 || !Number.isInteger(item.episodeNumber) || (item.episodeNumber as number) < 1)) return fail('series items need seasonNumber and episodeNumber');
    if (!Array.isArray(item.sources) || !item.sources.length || item.sources.length > 10) return fail('needs 1-10 sources');
    const sources: OwnedMediaSource[] = item.sources.map((entry2: unknown) => {
      const source = entry2 as Record<string, unknown>;
      if (!source || typeof source !== 'object' || !validMediaUrl(source.url, allowedHosts as string[])) return fail('source URL must be HTTPS on an allowed host');
      if (!['hls', 'dash', 'mp4'].includes(source.format as string)) return fail('source format must be hls, dash or mp4');
      const detected = detectFormat(source.url as string);
      if (detected && detected !== source.format) return fail('source format contradicts its URL');
      const subtitles = Array.isArray(source.subtitles) ? source.subtitles.map((track: unknown) => {
        const t = track as Record<string, unknown>;
        if (!t || typeof t.lang !== 'string' || typeof t.label !== 'string' || !validMediaUrl(t.url, allowedHosts as string[])) return fail('subtitle track is malformed');
        return { lang: t.lang.slice(0, 12), label: t.label.slice(0, 80), url: t.url as string };
      }) : [];
      return {
        url: source.url as string,
        format: source.format as StreamFormat,
        label: typeof source.label === 'string' ? source.label.slice(0, 80) : undefined,
        resolutions: Array.isArray(source.resolutions) ? source.resolutions.filter((r: unknown): r is string => typeof r === 'string').slice(0, 8) : [],
        audioLanguages: Array.isArray(source.audioLanguages) ? source.audioLanguages.filter((l: unknown): l is string => typeof l === 'string').slice(0, 16) : [],
        subtitles,
      };
    });
    return {
      tmdbId, slug: item.slug as string | undefined, kind: item.kind as 'movie' | 'series',
      seasonNumber: item.seasonNumber as number | undefined, episodeNumber: item.episodeNumber as number | undefined, sources,
    };
  });
  return { provider, allowedHosts: allowedHosts as string[], items };
}

let cached: { signature: string; config: OwnedMediaConfig | null; at: number } | undefined;

/** Load the operator library. A missing file means "not configured yet";
 * malformed content is an error. Results are cached for 30 seconds. */
export async function loadOwnedMediaConfig(): Promise<OwnedMediaConfig | null> {
  const inline = process.env.LUMIERE_OWNED_MEDIA;
  const file = process.env.LUMIERE_OWNED_MEDIA_FILE;
  if (!inline && !file) return null;
  const signature = JSON.stringify([inline ?? null, file ?? null]);
  if (cached && cached.signature === signature && Date.now() - cached.at < 30000) return cached.config;
  let raw = inline;
  if (!raw && file) {
    try { raw = await readFile(file, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { cached = { signature, config: null, at: Date.now() }; return null; }
      throw error;
    }
  }
  const config = parseOwnedMediaConfig(raw!);
  cached = { signature, config, at: Date.now() };
  return config;
}

/** Test seam: forget the cached library file. */
export function resetOwnedMediaCache() { cached = undefined; }

export class OwnedMediaProvider implements ProviderAdapter {
  readonly id: string;
  readonly priority: number;
  readonly timeoutMs = 4000;
  readonly retries = 0;
  constructor(private config: OwnedMediaConfig) {
    this.id = config.provider.id;
    this.priority = config.provider.priority;
  }
  async search(): Promise<TitleMatch[]> { return []; }
  async resolve(title: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]> {
    signal.throwIfAborted();
    if (title.kind === 'series' && (title.seasonNumber === undefined || title.episodeNumber === undefined)) return [];
    const matches = this.config.items.filter(item =>
      item.kind === title.kind &&
      ((item.tmdbId !== undefined && item.tmdbId === title.tmdbId) || (item.slug !== undefined && item.slug === title.slug)) &&
      (title.kind !== 'series' || (item.seasonNumber === title.seasonNumber && item.episodeNumber === title.episodeNumber)));
    const records: SourceRecord[] = [];
    for (const item of matches) {
      for (const source of item.sources) {
        const id = -parseInt(createHash('sha256').update(`${this.id}:${source.url}`).digest('hex').slice(0, 7), 16);
        records.push({
          id,
          label: source.label ?? `${this.config.provider.name} · ${source.format.toUpperCase()}`,
          url: source.url,
          format: source.format,
          // The operator explicitly declared this format for their own media;
          // extensionless CDN URLs are therefore trusted like worker-verified ones.
          formatVerified: true,
          resolutions: source.resolutions ?? [],
          audioLanguages: source.audioLanguages ?? [],
          subtitleLanguages: (source.subtitles ?? []).map(t => t.lang),
          subtitles: source.subtitles ?? [],
          status: 'unknown',
          priority: this.priority,
          provider: { slug: this.id, name: this.config.provider.name, authorized: true, allowedHosts: this.config.allowedHosts, priority: this.priority },
        });
      }
    }
    return records;
  }
}
