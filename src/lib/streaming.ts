/**
 * Provider-independent streaming source logic.
 *
 * A source is only exposed to the player when:
 *  1. Its provider is marked authorized.
 *  2. Its playback URL host matches the provider's allow-list.
 *  3. Its declared format matches what the URL actually looks like.
 *  4. It is not known to be offline.
 */

export type StreamFormat = "hls" | "dash" | "mp4";
export type SourceStatus = "online" | "degraded" | "offline" | "unknown";

export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

export interface PlayableSource {
  id: number;
  label: string;
  provider: string;
  providerSlug: string;
  url: string;
  format: StreamFormat;
  resolutions: string[];
  audioLanguages: string[];
  subtitleLanguages: string[];
  subtitles: SubtitleTrack[];
  status: SourceStatus;
  priority: number;
}

export interface SourceRecord {
  /** Set only by server-side adapters that validated response MIME/manifest. */
  formatVerified?: boolean;
  /** Only server-created opaque same-origin media relay paths are permitted. */
  playbackUrl?: string;
  id: number;
  label: string;
  url: string;
  format: StreamFormat;
  resolutions: string[];
  audioLanguages: string[];
  subtitleLanguages: string[];
  subtitles: SubtitleTrack[];
  status: SourceStatus;
  priority: number;
  provider: {
    slug: string;
    name: string;
    authorized: boolean;
    allowedHosts: string[];
    priority: number;
  };
}

const RESOLUTION_RANK: Record<string, number> = {
  "240p": 240,
  "360p": 360,
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2160p": 2160,
  "4K": 2160,
  "4k": 2160,
};

export function resolutionRank(r: string): number {
  return RESOLUTION_RANK[r] ?? (parseInt(r, 10) || 0);
}

export function detectFormat(url: string): StreamFormat | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (pathname.endsWith(".m3u8")) return "hls";
  if (pathname.endsWith(".mpd")) return "dash";
  if (pathname.endsWith(".mp4") || pathname.endsWith(".webm")) return "mp4";
  return null;
}

export function hostAllowed(url: string, allowedHosts: string[]): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedHosts.some((h) => {
    const allowed = h.toLowerCase();
    if (allowed.startsWith("*.")) {
      const base = allowed.slice(2);
      return host === base || host.endsWith("." + base);
    }
    return host === allowed;
  });
}

export function isSourcePlayable(src: SourceRecord): boolean {
  if (!src.provider.authorized) return false;
  if (!hostAllowed(src.url, src.provider.allowedHosts)) return false;
  const detected = detectFormat(src.url);
  if (detected ? detected !== src.format : !src.formatVerified) return false;
  if (src.status === "offline") return false;
  return true;
}

export function maxResolution(resolutions: string[]): string {
  return [...resolutions].sort((a, b) => resolutionRank(b) - resolutionRank(a))[0] ?? "auto";
}

/**
 * Orders sources for the player: healthy first, then provider priority,
 * then source priority, then by best available resolution.
 */
export function rankSources(sources: SourceRecord[]): PlayableSource[] {
  const statusRank: Record<SourceStatus, number> = { online: 0, unknown: 1, degraded: 2, offline: 3 };
  return sources
    .filter(isSourcePlayable)
    .sort((a, b) => {
      const s = statusRank[a.status] - statusRank[b.status];
      if (s !== 0) return s;
      const p = a.provider.priority - b.provider.priority;
      if (p !== 0) return p;
      const sp = a.priority - b.priority;
      if (sp !== 0) return sp;
      return resolutionRank(maxResolution(b.resolutions)) - resolutionRank(maxResolution(a.resolutions));
    })
    .map((s) => ({
      id: s.id,
      label: s.label,
      provider: s.provider.name,
      providerSlug: s.provider.slug,
      url: s.playbackUrl && /^\/api\/playback\/[A-Za-z0-9_-]{32}\/media\.(?:m3u8|mp4)$/.test(s.playbackUrl) ? s.playbackUrl : s.url,
      format: s.format,
      resolutions: s.resolutions,
      audioLanguages: s.audioLanguages,
      subtitleLanguages: s.subtitleLanguages,
      subtitles: s.subtitles,
      status: s.status,
      priority: s.priority,
    }));
}
