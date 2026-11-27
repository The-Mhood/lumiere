import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { ProviderAdapter, TitleMatch } from './resolver';
import type { SourceRecord } from '../streaming';

/**
 * Jellyfin adapter — official REST integration with the operator's OWN
 * self-hosted media server (https://jellyfin.org). Authentication uses the
 * operator's server-issued API key over the documented API; nothing is
 * bypassed. The key never reaches the browser: media is relayed through
 * opaque same-origin grants (`/api/jellyfin/<grant>/media.*`), and HLS
 * manifests are rewritten so segment URLs carry no credentials either.
 *
 * Movies and TV episodes are matched by their TMDB provider IDs, so live
 * TMDB discovery resolves straight into the operator's library. Episode
 * lookups are per-episode: one missing episode never hides another.
 *
 * Env: LUMIERE_JELLYFIN_URL, LUMIERE_JELLYFIN_API_KEY,
 *      LUMIERE_JELLYFIN_PRIORITY (default 10),
 *      LUMIERE_JELLYFIN_ALLOW_HTTP=1 (LAN-only self-host; relayed server-side).
 */

export interface JellyfinSettings {
  baseUrl: URL;
  apiKey: string;
  priority: number;
  allowHttp: boolean;
}

export function jellyfinSettings(): JellyfinSettings | null {
  const raw = process.env.LUMIERE_JELLYFIN_URL;
  const apiKey = process.env.LUMIERE_JELLYFIN_API_KEY;
  if (!raw || !apiKey) return null;
  if (apiKey.length < 16) throw new Error('LUMIERE_JELLYFIN_API_KEY is missing or too short');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('LUMIERE_JELLYFIN_URL is not a valid URL'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('LUMIERE_JELLYFIN_URL must be a clean origin (no credentials, query or fragment)');
  const allowHttp = process.env.LUMIERE_JELLYFIN_ALLOW_HTTP === '1';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error('LUMIERE_JELLYFIN_URL must use HTTPS (or set LUMIERE_JELLYFIN_ALLOW_HTTP=1 for a trusted LAN server)');
  const priority = Number(process.env.LUMIERE_JELLYFIN_PRIORITY ?? 10);
  return { baseUrl: url, apiKey, priority: Number.isInteger(priority) && priority >= 0 && priority <= 1000 ? priority : 10, allowHttp };
}

interface JellyfinMediaStream { Type?: string; Codec?: string }
interface JellyfinMediaSource { Id?: string; Container?: string; SupportsDirectPlay?: boolean; MediaStreams?: JellyfinMediaStream[] }
interface JellyfinItem {
  Id: string;
  Type?: string;
  ProviderIds?: Record<string, string>;
  MediaSources?: JellyfinMediaSource[];
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesId?: string;
}

async function jfGet<T>(settings: JellyfinSettings, path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const url = new URL(settings.baseUrl.href.replace(/\/+$/, '') + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { 'X-Emby-Token': settings.apiKey, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    cache: 'no-store',
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Jellyfin HTTP ${response.status}`); }
  return response.json() as Promise<T>;
}

const tmdbIdOf = (item: JellyfinItem) => String(item.ProviderIds?.Tmdb ?? item.ProviderIds?.tmdb ?? '');

/** Opaque, single-origin media grants. Only the configured Jellyfin origin can
 * ever be fetched; the browser supplies a handle, never a URL. */
export class JellyfinMediaGateway {
  private grants = new Map<string, { url: string; expires: number }>();
  private secret = randomBytes(32);
  private cleanedAt = 0;
  constructor(private settings: JellyfinSettings) {}

  register(upstream: URL): string {
    if (upstream.origin !== this.settings.baseUrl.origin) throw new Error('Jellyfin media origin mismatch');
    upstream = new URL(upstream.href);
    upstream.searchParams.delete('api_key');
    upstream.searchParams.delete('ApiKey');
    const now = Date.now();
    if (now - this.cleanedAt > 60000) {
      for (const [key, grant] of this.grants) if (grant.expires < now) this.grants.delete(key);
      this.cleanedAt = now;
    }
    const id = createHmac('sha256', this.secret).update(upstream.href).digest('base64url').slice(0, 32);
    if (!this.grants.has(id) && this.grants.size >= 20000) throw new Error('Jellyfin gateway capacity reached');
    this.grants.set(id, { url: upstream.href, expires: now + 6 * 3600000 });
    const extension = upstream.pathname.match(/\.(m3u8|mp4|ts|m4s|aac|mp3|vtt|key)$/i)?.[1]?.toLowerCase() ?? 'bin';
    return `/jellyfin/${id}/media.${extension}`;
  }

  private rewriteManifest(text: string, base: URL): string {
    const uri = (value: string) => this.register(new URL(value, base)).replace('/jellyfin/', '/api/jellyfin/');
    return text.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) return line.replace(/\bURI="([^"]+)"/g, (_, value) => `URI="${uri(value)}"`);
      return uri(trimmed);
    }).join('\n');
  }

  async serve(path: string, range?: string): Promise<Response> {
    const match = path.match(/^([A-Za-z0-9_-]{32})\/media\.(m3u8|mp4|ts|m4s|aac|mp3|vtt|key|bin)$/);
    const grant = match && this.grants.get(match[1]);
    if (!grant || grant.expires < Date.now()) return new Response(null, { status: 404 });
    const headers: Record<string, string> = { 'X-Emby-Token': this.settings.apiKey };
    if (range) {
      if (!/^bytes=\d*-\d*$/.test(range)) return new Response(null, { status: 416 });
      headers.Range = range;
    }
    let upstream: Response;
    try {
      upstream = await fetch(grant.url, { headers, redirect: 'error', signal: AbortSignal.timeout(120000), cache: 'no-store' });
    } catch { return new Response(null, { status: 502 }); }
    if (!upstream.ok) { await upstream.body?.cancel(); return new Response(null, { status: upstream.status === 404 || upstream.status === 416 ? upstream.status : 502 }); }
    const mime = upstream.headers.get('content-type') ?? '';
    if (match![2] === 'm3u8' || /mpegurl/i.test(mime)) {
      const text = await upstream.text();
      if (text.length > 2000000 || !text.trimStart().startsWith('#EXTM3U')) return new Response(null, { status: 502 });
      return new Response(this.rewriteManifest(text, new URL(grant.url)), {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (/text\/html|application\/json/i.test(mime)) { await upstream.body?.cancel(); return new Response(null, { status: 502 }); }
    const resultHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': mime || 'application/octet-stream' });
    for (const key of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(key);
      if (value) resultHeaders.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: resultHeaders });
  }
}

const shared = globalThis as typeof globalThis & { __jellyfinGateway?: { signature: string; gateway: JellyfinMediaGateway } };
export function getJellyfinGateway(settings: JellyfinSettings): JellyfinMediaGateway {
  const signature = `${settings.baseUrl.href}|${settings.apiKey}`;
  if (!shared.__jellyfinGateway || shared.__jellyfinGateway.signature !== signature) {
    shared.__jellyfinGateway = { signature, gateway: new JellyfinMediaGateway(settings) };
  }
  return shared.__jellyfinGateway.gateway;
}

export class JellyfinProvider implements ProviderAdapter {
  readonly id = 'jellyfin';
  readonly priority: number;
  readonly timeoutMs = 20000;
  readonly retries = 0;
  constructor(private settings: JellyfinSettings) { this.priority = settings.priority; }
  async search(): Promise<TitleMatch[]> { return []; }

  async resolve(title: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]> {
    if (!title.tmdbId) return [];
    if (title.kind === 'series' && (title.seasonNumber === undefined || title.episodeNumber === undefined)) return [];
    const item = title.kind === 'movie' ? await this.findMovie(title.tmdbId, signal) : await this.findEpisode(title, signal);
    if (!item) return [];
    return this.sourcesFor(item);
  }

  private async findMovie(tmdbId: number, signal: AbortSignal): Promise<JellyfinItem | null> {
    const data = await jfGet<{ Items?: JellyfinItem[] }>(this.settings, '/Items', {
      Recursive: 'true', IncludeItemTypes: 'Movie', AnyProviderIdEquals: `Tmdb.${tmdbId}`,
      Fields: 'ProviderIds,MediaSources', Limit: '5', EnableTotalRecordCount: 'false',
    }, signal);
    return (data.Items ?? []).find(item => item.Id && tmdbIdOf(item) === String(tmdbId)) ?? null;
  }

  private async findEpisode(title: TitleMatch, signal: AbortSignal): Promise<JellyfinItem | null> {
    const seriesData = await jfGet<{ Items?: JellyfinItem[] }>(this.settings, '/Items', {
      Recursive: 'true', IncludeItemTypes: 'Series', AnyProviderIdEquals: `Tmdb.${title.tmdbId}`,
      Fields: 'ProviderIds', Limit: '5', EnableTotalRecordCount: 'false',
    }, signal);
    const series = (seriesData.Items ?? []).find(item => item.Id && tmdbIdOf(item) === String(title.tmdbId));
    if (!series) return null;
    const episodes = await jfGet<{ Items?: JellyfinItem[] }>(this.settings, `/Shows/${encodeURIComponent(series.Id)}/Episodes`, {
      Season: String(title.seasonNumber), Fields: 'ProviderIds,MediaSources', EnableTotalRecordCount: 'false',
    }, signal);
    return (episodes.Items ?? []).find(item =>
      item.Id && item.SeriesId === series.Id && item.IndexNumber === title.episodeNumber &&
      (item.ParentIndexNumber === undefined || item.ParentIndexNumber === title.seasonNumber)) ?? null;
  }

  private sourcesFor(item: JellyfinItem): SourceRecord[] {
    const gateway = getJellyfinGateway(this.settings);
    const base = this.settings.baseUrl.href.replace(/\/+$/, '');
    const mediaSource = item.MediaSources?.[0];
    const container = (mediaSource?.Container ?? '').toLowerCase();
    const directVideo = mediaSource?.MediaStreams?.find(stream => stream.Type === 'Video');
    // Direct play only when the file is already browser-shaped; otherwise let
    // Jellyfin's own transcoder produce H.264/AAC HLS (server-side, authorized).
    const directPlayable = mediaSource?.SupportsDirectPlay !== false && ['mp4', 'm4v', 'mov'].includes(container) &&
      (!directVideo || (directVideo.Codec ?? '').toLowerCase() === 'h264');
    const records: SourceRecord[] = [];
    const push = (upstream: URL, format: 'hls' | 'mp4', label: string, extraPriority: number) => {
      const playbackUrl = gateway.register(upstream).replace('/jellyfin/', '/api/jellyfin/');
      // The canonical URL is only used for host/format authorization checks.
      // With ALLOW_HTTP the actual (private-LAN) origin stays server-side in
      // the grant; the browser never fetches it directly.
      const canonical = new URL(upstream.href);
      canonical.search = '';
      if (canonical.protocol === 'http:') canonical.protocol = 'https:';
      const id = -parseInt(createHash('sha256').update(`jellyfin:${upstream.href}`).digest('hex').slice(0, 7), 16);
      records.push({
        id, label, url: canonical.href, playbackUrl, format, formatVerified: true,
        resolutions: [], audioLanguages: [], subtitleLanguages: [], subtitles: [], status: 'unknown',
        priority: this.priority + extraPriority,
        provider: { slug: this.id, name: 'Jellyfin Library', authorized: true, allowedHosts: [this.settings.baseUrl.hostname], priority: this.priority },
      });
    };
    if (directPlayable) {
      const direct = new URL(`${base}/Videos/${encodeURIComponent(item.Id)}/stream.mp4`);
      direct.searchParams.set('static', 'true');
      if (mediaSource?.Id) direct.searchParams.set('MediaSourceId', mediaSource.Id);
      push(direct, 'mp4', 'Jellyfin · Direct MP4', 0);
    }
    const hls = new URL(`${base}/Videos/${encodeURIComponent(item.Id)}/master.m3u8`);
    const params: Record<string, string> = {
      DeviceId: 'lumiere-server', PlaySessionId: randomBytes(8).toString('hex'),
      VideoCodec: 'h264', AudioCodec: 'aac', TranscodingMaxAudioChannels: '2',
      SegmentContainer: 'ts', MinSegments: '1', BreakOnNonKeyFrames: 'true', RequireAvc: 'false',
    };
    if (mediaSource?.Id) params.MediaSourceId = mediaSource.Id;
    for (const [key, value] of Object.entries(params)) hls.searchParams.set(key, value);
    push(hls, 'hls', directPlayable ? 'Jellyfin · HLS (fallback)' : 'Jellyfin · HLS', 1);
    return records;
  }
}
