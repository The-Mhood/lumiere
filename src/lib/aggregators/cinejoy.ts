import { load } from "cheerio";
import { readFile } from "node:fs/promises";
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

export const cinejoyAdapter: AggregatorAdapter = {
  key: 'cinejoy', name: 'Cinejoy catalogue',
  description: 'Public movie and series listings. Catalogue presence does not imply verified in-app playback.',
  configured: () => Boolean(process.env.CINEJOY_RENDERED_HTML), providers: [],
  async fetchCatalogue(ctx) {
    // The upstream is a client-rendered SPA. A browser sync worker supplies
    // its rendered snapshot; never claim the empty HTTP shell is a catalogue.
    if (process.env.CINEJOY_RENDERED_HTML) {
      const items = parseCinejoyCatalogue(await readFile(process.env.CINEJOY_RENDERED_HTML, 'utf8'));
      if (!items.length) throw new Error('Rendered Cinejoy snapshot contains no listings');
      ctx.log(`Rendered snapshot: ${items.length} listings`);
      return items.slice(0, Math.max(1, Math.min(500, ctx.limit)));
    }
    throw new Error('Cinejoy requires a browser-rendered snapshot. Run the external catalogue worker and set CINEJOY_RENDERED_HTML.');
  },
};
