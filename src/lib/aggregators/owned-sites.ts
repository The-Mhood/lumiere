/**
 * Catalogue-only importer for Lumiere properties.
 *
 * Reads public sitemap entries and Open Graph metadata from the configured
 * catalogue websites. It deliberately does not extract player URLs, embeds,
 * download links, or media files. This keeps catalogue discovery separate
 * from the rights-checked playback-source pipeline.
 */
import type { AggregatorAdapter, AggregatedTitle, AdapterContext } from "./types";

const SITES = [
  { key: "cinejoy", name: "Cinejoy", origin: "https://cinejoy.pk" },
  { key: "cinelite", name: "CineLite", origin: "https://cinelite.xyz" },
] as const;

const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"];

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attr(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decode(m[1].trim());
  }
  return "";
}

function cleanTitle(raw: string, siteName: string) {
  return decode(raw)
    .replace(/\s*[|–—-]\s*(?:Watch.*|Stream.*|Free.*)?$/i, "")
    .replace(new RegExp(`\\s*[|–—-]\\s*${siteName}.*$`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "LumiereCatalogueBot/1.0 (+catalogue metadata import)" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function sitemapLocations(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => decode(m[1].trim()));
}

async function discoverPages(origin: string, limit: number, ctx: AdapterContext) {
  const pages = new Set<string>();
  const pending: string[] = [];
  for (const path of SITEMAP_PATHS) {
    try {
      const xml = await fetchText(origin + path);
      pending.push(...sitemapLocations(xml));
      if (pending.length) break;
    } catch (error) {
      ctx.log(`sitemap unavailable at ${origin + path}: ${(error as Error).message}`);
    }
  }

  // Support both a sitemap index and a direct URL set.
  for (const entry of pending.slice(0, 12)) {
    if (pages.size >= limit) break;
    if (!/^https?:\/\//i.test(entry)) continue;
    const parsed = new URL(entry);
    if (parsed.origin !== origin) continue;
    if (/\.xml(?:\?|$)/i.test(parsed.pathname)) {
      try {
        const nested = await fetchText(entry);
        for (const loc of sitemapLocations(nested)) {
          const u = new URL(loc);
          if (u.origin === origin && /\/(?:movie|movies|series|tv)\//i.test(u.pathname)) pages.add(u.href);
          if (pages.size >= limit) break;
        }
      } catch (error) {
        ctx.log(`nested sitemap failed: ${(error as Error).message}`);
      }
    } else if (/\/(?:movie|movies|series|tv)\//i.test(parsed.pathname)) {
      pages.add(parsed.href);
    }
  }
  return [...pages].slice(0, limit);
}

function parsePage(html: string, url: string, site: (typeof SITES)[number]): AggregatedTitle | null {
  const parsed = new URL(url);
  const isSeries = /\/(?:series|tv)\//i.test(parsed.pathname);
  const rawTitle = attr(html, "og:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const name = cleanTitle(rawTitle, site.name);
  if (!name || name.length < 2) return null;

  const synopsis = attr(html, "og:description") || attr(html, "description") ||
    `${name} — catalogue entry imported from ${site.name}.`;
  const poster = attr(html, "og:image") || attr(html, "twitter:image");
  const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const yearMatch = (rawTitle + " " + synopsis + " " + bodyText.slice(0, 5000)).match(/\b(19\d{2}|20\d{2})\b/);
  const ratingMatch = bodyText.match(/(?:rating|score)[^\d]{0,20}(\d(?:\.\d)?)/i);
  const id = parsed.pathname.replace(/\/$/, "").split("/").pop() || encodeURIComponent(name);

  return {
    externalSource: site.key,
    externalId: id,
    kind: isSeries ? "series" : "movie",
    name,
    originalName: name,
    synopsis: synopsis.slice(0, 1800),
    year: yearMatch ? Number(yearMatch[1]) : new Date().getFullYear(),
    country: "Unknown",
    language: "en",
    rating: ratingMatch ? Math.min(10, Number(ratingMatch[1])) : 0,
    voteCount: 0,
    popularity: 1,
    posterUrl: poster || undefined,
    backdropUrl: poster || undefined,
    license: `Catalogue metadata supplied by ${site.name}; playback rights must be verified separately.`,
    genres: [],
    sources: [],
    availability: [],
  };
}

export const ownedSitesAdapter: AggregatorAdapter = {
  key: "owned-sites",
  name: "Cinejoy + CineLite",
  description: "Imports catalogue titles and poster references from the configured Cinejoy and CineLite sitemaps. Does not import video/player URLs.",
  configured: () => true,
  providers: [],
  async fetchCatalogue(ctx: AdapterContext) {
    const out: AggregatedTitle[] = [];
    for (const site of SITES) {
      try {
        const urls = await discoverPages(site.origin, Math.max(ctx.limit, 10), ctx);
        ctx.log(`${site.name}: discovered ${urls.length} movie/series pages`);
        for (const url of urls) {
          if (out.length >= ctx.limit) break;
          try {
            const html = await fetchText(url);
            const title = parsePage(html, url, site);
            if (title) out.push(title);
          } catch (error) {
            ctx.log(`${site.name} page failed ${url}: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        ctx.log(`${site.name} import failed: ${(error as Error).message}`);
      }
      if (out.length >= ctx.limit) break;
    }
    ctx.log(`owned-sites: parsed ${out.length} catalogue records`);
    return out;
  },
};
