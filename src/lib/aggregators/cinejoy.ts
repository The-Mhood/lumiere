import { load } from "cheerio";
import type { AggregatedTitle, AggregatorAdapter } from "./types";

const ORIGIN = "https://cinejoy.pk";

/** Catalogue metadata is not proof of playback availability. Only import a
 * first-party availability link here; the resolver must independently verify
 * media before presenting a source to our player. Never execute site scripts. */
export function parseCinejoyCatalogue(html: string): AggregatedTitle[] {
  const $ = load(html);
  const items = new Map<string, AggregatedTitle>();
  $('a[href]').each((_, element) => {
    const a = $(element);
    let url: URL;
    try { url = new URL(a.attr('href')!, ORIGIN); } catch { return; }
    if (url.origin !== ORIGIN) return;
    const match = url.pathname.match(/^\/(movie|series)\/(\d+)-(.+)-(\d{4})\/?$/);
    if (!match) return;
    const [, type, id, slug, year] = match;
    const key = `${type}:${id}`;
    if (items.has(key)) return;
    const image = a.find('img').first();
    const name = image.attr('alt')?.trim() || a.find('h2,h3,h4').first().text().trim() || slug.replaceAll('-', ' ');
    if (!name) return;
    let posterUrl: string | undefined;
    try {
      const poster = new URL(image.attr('src') || image.attr('data-src') || '', ORIGIN);
      if (poster.protocol === 'https:' && ['image.tmdb.org', 'cinejoy.pk'].includes(poster.hostname) && poster.pathname !== '/') posterUrl = poster.href;
    } catch { /* Missing artwork is allowed. */ }
    items.set(key, {
      externalSource: 'cinejoy', externalId: key, kind: type === 'series' ? 'series' : 'movie',
      name, synopsis: `${name} (${year}). Imported catalogue listing; in-app playback has not been verified.`,
      year: Number(year), country: '', language: 'en', rating: 0, voteCount: 0,
      popularity: Math.max(1, 100 - items.size), posterUrl, backdropUrl: posterUrl,
      license: 'Third-party catalogue metadata; streaming rights not verified', genres: [], sources: [],
      availability: [{ platform: 'Cinejoy', platformSlug: 'cinejoy', kind: 'free', region: 'GLOBAL', url: url.href }],
    });
  });
  return [...items.values()];
}

export async function fetchCinejoyPage(path: string, signal?: AbortSignal) {
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN) throw new Error('Unexpected catalogue origin');
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    redirect: 'error', headers: { 'User-Agent': 'Lumiere-Catalogue/1.0', Accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`Cinejoy catalogue HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 8_000_000) throw new Error('Catalogue response too large');
  return body;
}

export const cinejoyAdapter: AggregatorAdapter = {
  key: 'cinejoy', name: 'Cinejoy catalogue',
  description: 'Public movie and series listings. Catalogue presence does not imply verified in-app playback.',
  configured: () => true, providers: [],
  async fetchCatalogue(ctx) {
    const found = new Map<string, AggregatedTitle>();
    const limit = Math.max(1, Math.min(500, ctx.limit));
    for (const path of ['/', '/category/movie/trending', '/category/tv/trending']) {
      const items = parseCinejoyCatalogue(await fetchCinejoyPage(path));
      ctx.log(`${path}: ${items.length} public listings`);
      for (const item of items) found.set(item.externalId, item);
      if (found.size >= limit) break;
    }
    if (!found.size) throw new Error('Cinejoy returned no recognizable catalogue listings (layout changed or blocked)');
    return [...found.values()].slice(0, limit);
  },
};
