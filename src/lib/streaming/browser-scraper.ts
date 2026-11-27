import defaultSites from "../../../scrapers/sites.json";
import { createHash } from 'node:crypto';
import type { ProviderAdapter, TitleMatch } from './resolver';
import { detectFormat, hostAllowed, type SourceRecord } from '../streaming';

export interface ScraperSite { id: string; name: string; mediaHosts: string[]; priority?: number }
interface WorkerResult { provider: string; sources: { url: string; format: string; label?: string }[] }

export function configuredScraperSites(): ScraperSite[] {
  const raw = process.env.LUMIERE_SCRAPER_PROVIDERS;
  if (!raw) return process.env.LUMIERE_MEDIA_WORKER_URL ? defaultSites.map(s => ({ id: s.id, name: s.name, mediaHosts: s.mediaHosts })) : [];
  let sites: ScraperSite[];
  try { sites = JSON.parse(raw); } catch { throw new Error('Invalid LUMIERE_SCRAPER_PROVIDERS JSON'); }
  if (!Array.isArray(sites) || sites.length > 20 || sites.some(s => !s || !/^[a-z0-9-]+$/.test(s.id) || typeof s.name !== 'string' || !Array.isArray(s.mediaHosts) || !s.mediaHosts.length || s.mediaHosts.some(h => typeof h !== 'string' || h === '*'))) throw new Error('Invalid scraper provider configuration');
  return sites;
}

/** All sites resolve the clicked identity on demand, independently of whether
 * its movie appeared in an imported catalogue. The browser worker never sends
 * account cookies, credentials or request headers to the application. */
export class BrowserScraperProvider implements ProviderAdapter {
  readonly id = 'web-scrapers';
  readonly priority = 20;
  readonly timeoutMs = 45000;
  readonly retries = 0;
  private pending = new Map<string, Promise<SourceRecord[]>>();
  constructor(private endpoint: string, private token: string, private sites: ScraperSite[]) {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid media worker URL');
    if (!token || token.length < 24) throw new Error('Media worker token is missing or too short');
  }
  async search(): Promise<TitleMatch[]> { return []; }
  async resolve(title: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]> {
    if (!title.tmdbId || (title.kind === 'series' && (title.seasonNumber === undefined || title.episodeNumber === undefined))) return [];
    const key = JSON.stringify([title.kind, title.tmdbId, title.seasonNumber, title.episodeNumber]);
    // Single-flight only: do not retain expiring media URLs in catalogue/cache.
    const existing = this.pending.get(key);
    if (existing) return existing;
    const work = this.fetchSources(title, signal).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }
  private async fetchSources(title: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]> {
    const response = await fetch(new URL('/resolve', this.endpoint), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ tmdbId: title.tmdbId, kind: title.kind, seasonNumber: title.seasonNumber, episodeNumber: title.episodeNumber }),
      redirect: 'error', signal,
    });
    if (!response.ok) throw new Error(`Media scraper worker HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 256000) throw new Error('Media scraper response too large');
    const data = JSON.parse(text);
    if (data.identity?.tmdbId !== title.tmdbId || data.identity?.kind !== title.kind || (title.kind === 'series' && (data.identity.seasonNumber !== title.seasonNumber || data.identity.episodeNumber !== title.episodeNumber))) throw new Error('Scraper returned the wrong playback identity');
    if (!Array.isArray(data.results)) throw new Error('Invalid scraper response');
    const records: SourceRecord[] = [];
    for (const result of (data.results as WorkerResult[]).slice(0, 20)) {
      const site = this.sites.find(s => s.id === result.provider);
      if (!site || !Array.isArray(result.sources)) continue;
      for (const source of result.sources.slice(0, 10)) {
        if (!source || typeof source.url !== 'string') continue;
        let url: URL;
        try { url = new URL(source.url); } catch { continue; }
        if (url.protocol !== 'https:' || url.username || url.password || !hostAllowed(url.href, site.mediaHosts)) continue;
        // Extensionless URLs require the worker's response MIME validation.
        // A contradictory known extension must still be rejected here.
        const format = detectFormat(url.href);
        if (!['mp4', 'hls', 'dash'].includes(source.format) || (format && format !== source.format)) continue;
        const id = -parseInt(createHash('sha256').update(`${site.id}:${url.href}`).digest('hex').slice(0, 7), 16);
        records.push({ id, label: `${site.name} · ${source.format.toUpperCase()}`, url: url.href,
          format: source.format as SourceRecord['format'], formatVerified: true, resolutions: [], audioLanguages: [], subtitleLanguages: [], subtitles: [], status: 'unknown', priority: site.priority ?? 20,
          provider: { slug: site.id, name: site.name, authorized: true, allowedHosts: site.mediaHosts, priority: site.priority ?? 20 },
        });
      }
    }
    return records;
  }
}
