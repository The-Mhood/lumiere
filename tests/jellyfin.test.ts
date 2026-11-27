import { afterEach, describe, expect, it, vi } from 'vitest';
import { JellyfinMediaGateway, JellyfinProvider, jellyfinSettings, type JellyfinSettings } from '@/lib/streaming/jellyfin';
import { rankSources } from '@/lib/streaming';
import type { TitleMatch } from '@/lib/streaming/resolver';

const settings: JellyfinSettings = { baseUrl: new URL('https://jf.example.com'), apiKey: 'test-jellyfin-key-0123456789', priority: 10, allowHttp: false };
const movie: TitleMatch = { slug: 'tmdb-movie-27205', name: 'Inception', year: 2010, kind: 'movie', tmdbId: 27205 };
const episode: TitleMatch = { slug: 'tmdb-series-1396', name: 'Breaking Bad', year: 2008, kind: 'series', tmdbId: 1396, seasonNumber: 1, episodeNumber: 2, episodeId: 2 };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('jellyfin configuration', () => {
  it('is absent unless both URL and key are configured, and rejects malformed origins', () => {
    expect(jellyfinSettings()).toBeNull();
    vi.stubEnv('LUMIERE_JELLYFIN_URL', 'https://jf.example.com');
    vi.stubEnv('LUMIERE_JELLYFIN_API_KEY', 'short');
    expect(() => jellyfinSettings()).toThrow();
    vi.stubEnv('LUMIERE_JELLYFIN_API_KEY', 'test-jellyfin-key-0123456789');
    expect(jellyfinSettings()?.baseUrl.hostname).toBe('jf.example.com');
    vi.stubEnv('LUMIERE_JELLYFIN_URL', 'http://jf.example.com');
    expect(() => jellyfinSettings()).toThrow(/HTTPS/);
    vi.stubEnv('LUMIERE_JELLYFIN_ALLOW_HTTP', '1');
    expect(jellyfinSettings()?.allowHttp).toBe(true);
    vi.stubEnv('LUMIERE_JELLYFIN_URL', 'https://user:pass@jf.example.com');
    expect(() => jellyfinSettings()).toThrow();
  });
});

describe('jellyfin resolution', () => {
  it('resolves a movie by TMDB provider ID into direct MP4 + HLS fallback, keeping the key server-side', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Items: [{ Id: 'item1', ProviderIds: { Tmdb: '27205' }, MediaSources: [{ Id: 'ms1', Container: 'mp4', SupportsDirectPlay: true, MediaStreams: [{ Type: 'Video', Codec: 'h264' }] }] }] })));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new JellyfinProvider(settings);
    const ranked = rankSources(await provider.resolve(movie, new AbortController().signal));
    expect(ranked).toHaveLength(2);
    expect(ranked[0].label).toContain('Direct MP4');
    // The browser-facing URL is the opaque same-origin relay, never the raw origin.
    for (const source of ranked) expect(source.url).toMatch(/^\/api\/jellyfin\/[A-Za-z0-9_-]{32}\/media\.(mp4|m3u8)$/);
    expect(JSON.stringify(ranked)).not.toContain(settings.apiKey);
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain('AnyProviderIdEquals=Tmdb.27205');
    expect(call[1].headers['X-Emby-Token']).toBe(settings.apiKey);
  });
  it('rejects mismatched identities instead of playing the wrong film', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ Items: [{ Id: 'item1', ProviderIds: { Tmdb: '999' } }] }))));
    expect(await new JellyfinProvider(settings).resolve(movie, new AbortController().signal)).toEqual([]);
  });
  it('resolves the exact season/episode of the matching series; missing episodes stay unavailable', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: URL) => new Response(JSON.stringify(
      url.pathname.includes('/Episodes')
        ? { Items: [
            { Id: 'ep1', SeriesId: 'series1', IndexNumber: 1, ParentIndexNumber: 1, MediaSources: [{ Id: 'm1', Container: 'mkv' }] },
            { Id: 'ep2', SeriesId: 'series1', IndexNumber: 2, ParentIndexNumber: 1, MediaSources: [{ Id: 'm2', Container: 'mkv' }] },
          ] }
        : { Items: [{ Id: 'series1', ProviderIds: { Tmdb: '1396' } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const ranked = rankSources(await new JellyfinProvider(settings).resolve(episode, new AbortController().signal));
    expect(ranked).toHaveLength(1); // mkv: no direct play, Jellyfin transcodes to HLS
    expect(ranked[0].format).toBe('hls');
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/Shows/series1/Episodes') && String(c[0]).includes('Season=1'))).toBe(true);
    const missing = await new JellyfinProvider(settings).resolve({ ...episode, episodeNumber: 99 }, new AbortController().signal);
    expect(missing).toEqual([]);
  });
  it('requires episode coordinates for series and a TMDB identity for everything', async () => {
    const provider = new JellyfinProvider(settings);
    expect(await provider.resolve({ ...episode, episodeNumber: undefined }, new AbortController().signal)).toEqual([]);
    expect(await provider.resolve({ ...movie, tmdbId: undefined }, new AbortController().signal)).toEqual([]);
  });
});

describe('jellyfin media gateway', () => {
  it('relays manifests with credential-free same-origin segment URLs and forwards byte ranges', async () => {
    const gateway = new JellyfinMediaGateway(settings);
    const upstream = new URL('https://jf.example.com/Videos/item1/master.m3u8?MediaSourceId=ms1&api_key=' + settings.apiKey);
    const path = gateway.register(upstream).replace('/jellyfin/', '');
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('api_key')).toBeNull();
      if (url.pathname.endsWith('master.m3u8')) return new Response(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,CODECS="avc1.640028,mp4a.40.2"\nmain.m3u8?MediaSourceId=ms1&api_key=${settings.apiKey}\n`, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } });
      if (url.pathname.endsWith('main.m3u8')) return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nmain0.ts?api_key=${settings.apiKey}\n#EXT-X-ENDLIST\n`, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } });
      return new Response('segment-bytes', { status: 206, headers: { 'Content-Type': 'video/mp2t', 'Content-Range': 'bytes 0-12/100' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const master = await gateway.serve(path);
    expect(master.status).toBe(200);
    const masterText = await master.text();
    expect(masterText).not.toContain(settings.apiKey);
    const variant = masterText.split('\n').find(line => line.startsWith('/api/jellyfin/'))!;
    expect(variant).toMatch(/^\/api\/jellyfin\/[A-Za-z0-9_-]{32}\/media\.m3u8$/);
    const variantText = await (await gateway.serve(variant.replace('/api/jellyfin/', ''))).text();
    expect(variantText).not.toContain(settings.apiKey);
    const segment = variantText.split('\n').find(line => line.startsWith('/api/jellyfin/'))!;
    expect(segment).toMatch(/media\.ts$/);
    const media = await gateway.serve(segment.replace('/api/jellyfin/', ''), 'bytes=0-12');
    expect(media.status).toBe(206);
    expect(media.headers.get('content-range')).toBe('bytes 0-12/100');
    expect(fetchMock.mock.calls.at(-1)![1].headers).toEqual({ 'X-Emby-Token': settings.apiKey, Range: 'bytes=0-12' });
  });
  it('only registers the configured origin and rejects unknown or malformed grants', async () => {
    const gateway = new JellyfinMediaGateway(settings);
    expect(() => gateway.register(new URL('https://evil.com/a.m3u8'))).toThrow();
    expect((await gateway.serve('b'.repeat(32) + '/media.mp4')).status).toBe(404);
    expect((await gateway.serve('not-a-grant')).status).toBe(404);
    const path = gateway.register(new URL('https://jf.example.com/Videos/x/stream.mp4')).replace('/jellyfin/', '');
    expect((await gateway.serve(path, 'bytes=abc')).status).toBe(416);
  });
  it('fails closed when Jellyfin is not configured', async () => {
    const { GET } = await import('@/app/api/jellyfin/[...path]/route');
    const response = await GET(new Request('http://app/api/jellyfin/x'), { params: Promise.resolve({ path: ['a'.repeat(32), 'media.mp4'] }) });
    expect(response.status).toBe(503);
    const bad = await GET(new Request('http://app/api/jellyfin/bad'), { params: Promise.resolve({ path: ['https:', 'evil.test'] }) });
    expect(bad.status).toBe(404);
  });
});
