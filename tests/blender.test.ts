import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlenderProvider, BLENDER_FILMS, matchesBlenderVideo, normalizeBlenderVideo } from '@/lib/streaming/blender';
import { rankSources } from '@/lib/streaming';
import { cache } from '@/lib/cache';
const channel = { name: 'blender_open_movies', host: 'video.blender.org' };
const title = { slug: 'charge', name: 'Charge', year: 2022, kind: 'movie' as const };
const movie = { uuid: 'charge-id', name: 'Charge - Blender Open Movie', duration: 263, channel };
afterEach(() => { vi.unstubAllGlobals(); cache.clearPrefix('blender:'); });
describe('official Blender provider', () => {
  it('has explicit identity rules for every catalogue movie', () => {
    expect(Object.keys(BLENDER_FILMS)).toHaveLength(9);
    for (const [slug, film] of Object.entries(BLENDER_FILMS)) {
      expect(matchesBlenderVideo({ slug, ...film, kind: 'movie' }, { ...movie, name: `${film.name} - Open Movie`, duration: film.duration[0] + 1 })).toBe(true);
    }
  });
  it('rejects trailers, documentaries, wrong years, durations and unofficial accounts', () => {
    expect(matchesBlenderVideo(title, movie)).toBe(true);
    for (const patch of [{ name: 'Charge - Trailer' }, { name: 'Making of Charge' }, { duration: 30 }, { channel: { name: 'fake', host: 'video.blender.org' } }]) {
      expect(matchesBlenderVideo(title, { ...movie, ...patch })).toBe(false);
    }
    expect(matchesBlenderVideo({ ...title, year: 2021 }, movie)).toBe(false);
  });
  it('matches the actual named episode, never invented episodes or another movie', () => {
    const match = { slug: 'caminandes', name: 'Caminandes', year: 2013, kind: 'series' as const, episodeName: 'Llamigos' };
    expect(matchesBlenderVideo(match, { ...movie, name: 'Caminandes 3: Llamigos', duration: 150 })).toBe(true);
    expect(matchesBlenderVideo({ ...match, episodeName: 'Bullrun' }, { ...movie, name: 'Caminandes 3: Llamigos', duration: 150 })).toBe(false);
  });
  it('normalizes HLS, progressive MP4 and VTT without exposing torrent or foreign hosts', () => {
    const records = normalizeBlenderVideo({ ...movie,
      streamingPlaylists: [{ playlistUrl: 'https://video.blender.org/test/master.m3u8', files: [{ fileUrl: 'https://video.blender.org/fragment.mp4', resolution: { id: 1080, label: '1080p' } }] }],
      files: [{ fileUrl: 'https://video.blender.org/movie.mp4' }, { fileUrl: 'https://evil.example/movie.mp4' }],
    }, [{ captionPath: '/caption/en.vtt', language: { id: 'en', label: 'English' } }, { captionPath: 'https://evil.example/x.vtt', language: { id: 'xx', label: 'Bad' } }]);
    expect(rankSources(records)).toHaveLength(2);
    expect(records.map((r) => r.format)).toEqual(['hls', 'mp4']);
    expect(records[0].subtitles).toEqual([{ url: 'https://video.blender.org/caption/en.vtt', lang: 'en', label: 'English' }]);
    expect(records.every((r) => r.id < 0)).toBe(true);
    expect(new Set(records.map((r) => r.id)).size).toBe(2);
  });
  it('resolves using official metadata, caches short-lived results and never writes URLs to the DB', async () => {
    const fetch = vi.fn(async (url: string) => {
      const data = url.includes('/video-channels/') ? { total: 1, data: [movie] } : url.endsWith('/captions') ? { data: [] } : { ...movie, files: [{ fileUrl: 'https://video.blender.org/charge.mp4' }] };
      return Response.json(data);
    });
    vi.stubGlobal('fetch', fetch);
    const provider = new BlenderProvider();
    expect(await provider.search('charge', new AbortController().signal)).toEqual([title]);
    expect(await provider.resolve(title, new AbortController().signal)).toHaveLength(1);
    expect(await provider.resolve(title, new AbortController().signal)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('returns clear HTTP and changed-identity failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(new BlenderProvider().resolve(title, new AbortController().signal)).rejects.toThrow('HTTP 503');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('/video-channels/') ? { total: 1, data: [movie] } : { ...movie, uuid: 'wrong' })));
    await expect(new BlenderProvider().resolve(title, new AbortController().signal)).rejects.toThrow('identity changed');
  });
});
