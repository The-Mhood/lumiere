/**
 * Request-scoped resolver for direct media URLs declared on public title pages.
 * It never writes playback URLs to the catalogue database.
 */
import type { PlayableSource, StreamFormat } from "@/lib/streaming";

const SITES = [
  { slug: "cinejoy", name: "Cinejoy", origin: "https://cinejoy.pk" },
  { slug: "cinelite", name: "CineLite", origin: "https://cinelite.xyz" },
] as const;

type ResolveInput = { title: string; year: number; episode?: string };

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/")
  .replace(/\\u0026/g, "&").replace(/\\\//g, "/")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatOf(url: string): StreamFormat | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith(".m3u8")) return "hls";
    if (path.endsWith(".mpd")) return "dash";
    if (/\.(mp4|webm)$/.test(path)) return "mp4";
  } catch {}
  return null;
}

function allowedMediaHost(url: string, site: (typeof SITES)[number]) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const key = site.slug === "cinejoy" ? "CINEJOY_PLAYBACK_HOSTS" : "CINELITE_PLAYBACK_HOSTS";
    const configured = (process.env[key] ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    const hosts = configured.length ? configured : [new URL(site.origin).hostname];
    return hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith("." + host));
  } catch { return false; }
}

async function fetchPage(url: string, site: (typeof SITES)[number]) {
  const parsed = new URL(url);
  if (parsed.origin !== site.origin) throw new Error("Refusing to fetch a URL outside the configured provider origin");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LumierePlaybackResolver/1.0)" },
    signal: AbortSignal.timeout(10000), cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function candidatePages(site: (typeof SITES)[number], input: ResolveInput) {
  let entries: string[] = [];
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    try {
      const xml = await fetchPage(site.origin + path, site);
      entries = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => decode(m[1].trim()));
      if (entries.length) break;
    } catch {}
  }

  const all: string[] = [];
  for (const entry of entries.slice(0, 20)) {
    if (!/\.xml(?:\?|$)/i.test(entry)) { all.push(entry); continue; }
    try {
      const xml = await fetchPage(entry, site);
      all.push(...[...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => decode(m[1].trim())));
    } catch {}
  }

  // Resolve the series page by series title first. Combining the episode name
  // into the sitemap query can hide valid series pages whose URL only contains
  // the show title (e.g. Black Mirror).
  const titleTerms = slug(input.title).split("-").filter((x) => x.length > 2);
  const episodeTerms = slug(input.episode ?? "").split("-").filter((x) => x.length > 2);
  const titleMatches = all.filter((url) => {
    try {
      const u = new URL(url);
      if (u.origin !== site.origin) return false;
      const path = slug(decodeURIComponent(u.pathname));
      return titleTerms.length > 0 &&
        titleTerms.filter((term) => path.includes(term)).length >= Math.min(2, titleTerms.length);
    } catch { return false; }
  });

  // Prefer episode-specific pages when their URL contains the episode name,
  // but always fall back to the matching series page.
  if (!episodeTerms.length) return titleMatches.slice(0, 8);
  const episodeMatches = titleMatches.filter((url) => {
    try {
      const path = slug(decodeURIComponent(new URL(url).pathname));
      return episodeTerms.some((term) => path.includes(term));
    } catch { return false; }
  });
  return (episodeMatches.length ? episodeMatches : titleMatches).slice(0, 8);
}

function extractSources(html: string, pageUrl: string, site: (typeof SITES)[number]): PlayableSource[] {
  const found = new Set<string>();
  const patterns = [
    /<(?:source|video)[^>]+src=["']([^"']+)["']/gi,
    /["'](?:file|src|hls|dash|url)["']\s*:\s*["']([^"']+\.(?:m3u8|mpd|mp4|webm)(?:\?[^"']*)?)["']/gi,
    /https?:\/\/[^"'\s<>]+?\.(?:m3u8|mpd|mp4|webm)(?:\?[^"'\s<>]*)?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = decode(match[1] ?? match[0]).replace(/\\/g, "");
      try {
        const url = new URL(raw, pageUrl).href;
        if (formatOf(url) && allowedMediaHost(url, site)) found.add(url);
      } catch {}
    }
  }
  return [...found].map((url, index) => ({
    id: -(SITES.indexOf(site) * 1000 + index + 1),
    label: `${site.name} · Source ${index + 1}`,
    provider: site.name, providerSlug: site.slug, url, format: formatOf(url)!,
    resolutions: [], audioLanguages: ["en"], subtitleLanguages: [], subtitles: [],
    status: "unknown" as const, priority: SITES.indexOf(site) * 100 + index,
  }));
}

export async function resolveOwnedSitePlayback(input: ResolveInput): Promise<PlayableSource[]> {
  const results: PlayableSource[] = [];
  // Search both sites so the player can fall back from Cinejoy to CineLite.
  for (const site of SITES) {
    let pages: string[];
    try { pages = await candidatePages(site, input); } catch { continue; }
    const pageResults = await Promise.all(pages.map(async (url) => {
      try {
        const html = await fetchPage(url, site);
        const titleText = decode(
          html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
          ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
        ).toLowerCase();
        if (!titleText.includes(input.title.toLowerCase())) return [];
        if (input.year && !titleText.includes(String(input.year)) && !html.slice(0, 12000).includes(String(input.year))) return [];
        return extractSources(html, url, site);
      } catch { return []; }
    }));
    results.push(...pageResults.flat());
  }
  return results.map((source, index) => ({ ...source, id: -(index + 1), priority: index }));
}
