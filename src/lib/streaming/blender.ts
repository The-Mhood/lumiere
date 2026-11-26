import { detectFormat, hostAllowed, type SourceRecord, type SubtitleTrack } from "../streaming";
import { cache } from "../cache";
import type { ProviderAdapter, TitleMatch } from "./resolver";

const BASE = "https://video.blender.org";
const CHANNEL = "blender_open_movies";
export const BLENDER_FILMS: Record<string, { name: string; year: number; pattern: RegExp; duration: [number, number] }> = {
  "big-buck-bunny": { name: "Big Buck Bunny", year: 2008, pattern: /^big buck bunny\b/i, duration: [500, 750] },
  sintel: { name: "Sintel", year: 2010, pattern: /^sintel\b/i, duration: [750, 1000] },
  "tears-of-steel": { name: "Tears of Steel", year: 2012, pattern: /^tears of steel\b/i, duration: [600, 850] },
  "elephants-dream": { name: "Elephants Dream", year: 2006, pattern: /^elephant'?s? dream\b/i, duration: [550, 800] },
  "cosmos-laundromat": { name: "Cosmos Laundromat", year: 2015, pattern: /^cosmos laundromat\b/i, duration: [500, 850] },
  spring: { name: "Spring", year: 2019, pattern: /^spring\b/i, duration: [400, 600] },
  "agent-327-operation-barbershop": { name: "Agent 327", year: 2017, pattern: /^agent 327\b/i, duration: [180, 300] },
  "sprite-fright": { name: "Sprite Fright", year: 2021, pattern: /^sprite fright\b/i, duration: [550, 750] },
  charge: { name: "Charge", year: 2022, pattern: /^charge\b/i, duration: [200, 350] },
};
const EPISODES: Record<string, RegExp> = {
  "llama drama": /\bllama drama\b/i,
  "gran dillama": /\bgran dillama\b/i,
  llamigos: /\bllamigos\b/i,
};
interface Video {
  uuid: string; name: string; duration: number;
  channel?: { name: string; host: string };
  privacy?: { id: number };
  files?: MediaFile[];
  streamingPlaylists?: { playlistUrl: string; files?: MediaFile[] }[];
}
interface MediaFile { fileUrl: string; hasAudio?: boolean; hasVideo?: boolean; resolution?: { id: number; label: string } }
interface Caption { captionPath: string; language: { id: string; label: string } }
const HOSTS = ["video.blender.org"];
function safeUrl(value: string) { return hostAllowed(value, HOSTS); }
function sourceId(identity: string): number {
  // Negative IDs are reserved for runtime sources, not persisted source rows.
  let hash = 2166136261;
  for (const c of identity) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return -(Math.abs(hash) + 1);
}
export function matchesBlenderVideo(title: TitleMatch, video: Video): boolean {
  if (/trailer|teaser|making.of|behind.the.scenes|breakdown|showreel/i.test(video.name)) return false;
  if (video.channel?.name !== CHANNEL || video.channel.host !== "video.blender.org") return false;
  if (video.privacy && video.privacy.id !== 1) return false;
  if (title.kind === "series") {
    const episode = EPISODES[(title.episodeName ?? "").toLowerCase()];
    return title.slug === "caminandes" && !!episode && /caminandes/i.test(video.name) && episode.test(video.name) && video.duration >= 60 && video.duration <= 300;
  }
  const film = BLENDER_FILMS[title.slug];
  return !!film && film.year === title.year && film.pattern.test(video.name) && video.duration >= film.duration[0] && video.duration <= film.duration[1];
}
export function normalizeBlenderVideo(video: Video, captions: Caption[] = []): SourceRecord[] {
  const provider = { slug: "blender-official", name: "Blender Open Movies · Official", authorized: true, allowedHosts: HOSTS, priority: 5 };
  const subtitles: SubtitleTrack[] = captions.flatMap((c) => {
    const url = new URL(c.captionPath, BASE).href;
    return safeUrl(url) && url.toLowerCase().split("?")[0].endsWith(".vtt") ? [{ url, lang: c.language.id, label: c.language.label }] : [];
  });
  const items: SourceRecord[] = [];
  const add = (url: string, label: string, resolutions: string[], priority: number) => {
    const format = detectFormat(url);
    if (!format || !safeUrl(url)) return;
    items.push({ id: sourceId(`${video.uuid}:${url}`), label, url, format, resolutions,
      audioLanguages: [], subtitleLanguages: subtitles.map((s) => s.lang), subtitles,
      priority, status: "unknown", provider });
  };
  for (const playlist of video.streamingPlaylists ?? []) add(playlist.playlistUrl, "Official · Adaptive HLS", (playlist.files ?? []).map((f) => f.resolution?.label ?? "auto"), 1);
  // Progressive files only: playlist fragment files are not standalone movies.
  for (const file of video.files ?? []) {
    if (file.hasAudio === false || file.hasVideo === false) continue;
    add(file.fileUrl, `Official · MP4 ${file.resolution?.label ?? ""}`, file.resolution ? [file.resolution.label] : [], 10 + (2160 - Math.min(2160, file.resolution?.id ?? 0)));
  }
  return items;
}
export class BlenderProvider implements ProviderAdapter {
  readonly id = "blender-official";
  readonly priority = 5;
  private async json<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(`${BASE}${path}`, { signal, redirect: "error", headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Blender API HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  private async catalogue(signal: AbortSignal): Promise<Video[]> {
    const key = "blender:official-channel";
    const hit = cache.get<Video[]>(key);
    if (hit) return hit;
    const all: Video[] = [];
    for (let start = 0; start < 500; start += 100) {
      const page = await this.json<{ total: number; data: Video[] }>(`/api/v1/video-channels/${CHANNEL}/videos?count=100&start=${start}`, signal);
      all.push(...page.data);
      if (!page.data.length || all.length >= page.total) break;
    }
    cache.set(key, all, 3600);
    return all;
  }
  async search(query: string, signal: AbortSignal): Promise<TitleMatch[]> {
    const catalogue = await this.catalogue(signal);
    return Object.entries(BLENDER_FILMS).flatMap(([slug, film]) => {
      const title: TitleMatch = { slug, name: film.name, year: film.year, kind: "movie" };
      return film.name.toLowerCase().includes(query.toLowerCase()) && catalogue.some((v) => matchesBlenderVideo(title, v)) ? [title] : [];
    });
  }
  async resolve(title: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]> {
    if (title.kind === "movie" ? !BLENDER_FILMS[title.slug] : title.slug !== "caminandes" || !EPISODES[(title.episodeName ?? "").toLowerCase()]) return [];
    const key = `blender:sources:${title.slug}:${title.year}:${title.episodeName ?? "movie"}`;
    const hit = cache.get<SourceRecord[]>(key);
    if (hit) return hit;
    const candidates = (await this.catalogue(signal)).filter((v) => matchesBlenderVideo(title, v));
    if (candidates.length > 1) throw new Error(`Ambiguous official title match: ${title.name}`);
    if (!candidates.length) return [];
    const video = await this.json<Video>(`/api/v1/videos/${encodeURIComponent(candidates[0].uuid)}`, signal);
    if (!matchesBlenderVideo(title, video) || video.uuid !== candidates[0].uuid) throw new Error("Official video identity changed");
    let captions: Caption[] = [];
    try { captions = (await this.json<{ data: Caption[] }>(`/api/v1/videos/${encodeURIComponent(video.uuid)}/captions`, signal)).data; }
    catch { signal.throwIfAborted(); /* Optional captions must not disable video. */ }
    const records = normalizeBlenderVideo(video, captions);
    if (records.length) cache.set(key, records, 300);
    return records;
  }
}
