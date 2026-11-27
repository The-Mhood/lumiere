import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserScraperProvider } from '../src/lib/streaming/browser-scraper';
import { rankSources } from '../src/lib/streaming';
const token = 'a-long-worker-secret-for-unit-tests';
const site = { id: 'test-site', name: 'Test site', mediaHosts: ['media.example.org'] };
const movie = { slug: 'inception-2010', name: 'Inception', year: 2010, kind: 'movie' as const, tmdbId: 27205 };
function response(sources: unknown[], identity: unknown = { tmdbId: 27205, kind: 'movie' }) {
  return new Response(JSON.stringify({ identity, results: [{ provider: 'test-site', sources }] }));
}
afterEach(() => vi.unstubAllGlobals());
describe('on-demand browser media provider', () => {
  it('resolves an unimported TMDB identity with server-only authentication', async () => {
    const fetch = vi.fn().mockResolvedValue(response([{ url: 'https://media.example.org/movie/master.m3u8', format: 'hls' }]));
    vi.stubGlobal('fetch', fetch);
    const provider = new BrowserScraperProvider('http://127.0.0.1:3200', token, [site]);
    const sources = rankSources(await provider.resolve(movie, new AbortController().signal));
    expect(sources).toHaveLength(1);
    expect(sources[0].format).toBe('hls');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ tmdbId: 27205, kind: 'movie' });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  });
  it('rejects mismatched identities, even with a valid stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([], { tmdbId: 1, kind: 'movie' })));
    await expect(new BrowserScraperProvider('http://localhost:3200', token, [site]).resolve(movie, new AbortController().signal)).rejects.toThrow('wrong playback identity');
  });
  it('rejects foreign hosts, credentials, mismatched formats and unregistered sites', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([
      { url: 'https://evil.test/movie.mp4', format: 'mp4' },
      { url: 'https://user:pass@media.example.org/movie.mp4', format: 'mp4' },
      { url: 'https://media.example.org/movie.mp4', format: 'hls' },
    ])));
    expect(await new BrowserScraperProvider('http://localhost:3200', token, [site]).resolve(movie, new AbortController().signal)).toEqual([]);
  });
  it('requires external IDs and episode coordinates rather than scraping random search results', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const provider = new BrowserScraperProvider('http://localhost:3200', token, [site]);
    expect(await provider.resolve({ ...movie, tmdbId: undefined }, new AbortController().signal)).toEqual([]);
    expect(await provider.resolve({ ...movie, kind: 'series' }, new AbortController().signal)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('accepts an extensionless manifest only after worker MIME/manifest verification', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{ url: 'https://media.example.org/manifest?id=1', format: 'hls' }])));
    const sources = await new BrowserScraperProvider('http://localhost:3200', token, [site]).resolve(movie, new AbortController().signal);
    expect(rankSources(sources)).toHaveLength(1);
    expect(rankSources(sources.map(s => ({ ...s, formatVerified: false })))).toHaveLength(0);
  });
  it('coalesces concurrent identical resolutions without storing stream URLs afterwards', async () => {
    const fetch = vi.fn().mockImplementation(async () => response([])); vi.stubGlobal('fetch', fetch);
    const provider = new BrowserScraperProvider('http://localhost:3200', token, [site]);
    await Promise.all([provider.resolve(movie, new AbortController().signal), provider.resolve(movie, new AbortController().signal)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await provider.resolve(movie, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
