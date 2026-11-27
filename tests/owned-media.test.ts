import { describe, expect, it } from 'vitest';
import { OwnedMediaProvider, parseOwnedMediaConfig } from '@/lib/streaming/owned-media';
import { rankSources } from '@/lib/streaming';
import type { TitleMatch } from '@/lib/streaming/resolver';

const config = JSON.stringify({
  provider: { id: 'owned-media', name: 'Lumière Library', priority: 5 },
  allowedHosts: ['cdn.example.com', '*.r2.dev'],
  items: [
    { tmdbId: 27205, kind: 'movie', sources: [
      { url: 'https://cdn.example.com/inception/hls/master.m3u8', format: 'hls', resolutions: ['1080p', '720p'], subtitles: [{ lang: 'en', label: 'English', url: 'https://cdn.example.com/inception/en.vtt' }] },
      { url: 'https://cdn.example.com/inception/fallback.mp4', format: 'mp4', resolutions: ['720p'] },
    ] },
    { tmdbId: 1396, kind: 'series', seasonNumber: 1, episodeNumber: 1, sources: [{ url: 'https://assets.r2.dev/bb/s01e01.m3u8', format: 'hls' }] },
    { tmdbId: 1396, kind: 'series', seasonNumber: 1, episodeNumber: 2, sources: [{ url: 'https://assets.r2.dev/bb/s01e02.m3u8', format: 'hls' }] },
    { slug: 'local-film', kind: 'movie', sources: [{ url: 'https://cdn.example.com/local/master.m3u8', format: 'hls' }] },
  ],
});

const movie: TitleMatch = { slug: 'tmdb-movie-27205', name: 'Inception', year: 2010, kind: 'movie', tmdbId: 27205 };
const episode = (n: number): TitleMatch => ({ slug: 'tmdb-series-1396', name: 'Breaking Bad', year: 2008, kind: 'series', tmdbId: 1396, seasonNumber: 1, episodeNumber: n, episodeId: n });

describe('owned media configuration', () => {
  it('parses a valid library and applies defaults', () => {
    const parsed = parseOwnedMediaConfig(config);
    expect(parsed.provider).toEqual({ id: 'owned-media', name: 'Lumière Library', priority: 5 });
    expect(parsed.items).toHaveLength(4);
    expect(parseOwnedMediaConfig(JSON.stringify({ allowedHosts: ['cdn.example.com'], items: [{ tmdbId: 1, kind: 'movie', sources: [{ url: 'https://cdn.example.com/a.m3u8', format: 'hls' }] }] })).provider.id).toBe('owned-media');
  });
  it('fails closed on wildcard hosts, non-HTTPS URLs, host mismatches and format contradictions', () => {
    const base = { allowedHosts: ['cdn.example.com'], items: [{ tmdbId: 1, kind: 'movie', sources: [{ url: 'https://cdn.example.com/a.m3u8', format: 'hls' }] }] };
    expect(() => parseOwnedMediaConfig(JSON.stringify({ ...base, allowedHosts: ['*'] }))).toThrow();
    expect(() => parseOwnedMediaConfig(JSON.stringify({ ...base, items: [{ tmdbId: 1, kind: 'movie', sources: [{ url: 'http://cdn.example.com/a.m3u8', format: 'hls' }] }] }))).toThrow();
    expect(() => parseOwnedMediaConfig(JSON.stringify({ ...base, items: [{ tmdbId: 1, kind: 'movie', sources: [{ url: 'https://evil.com/a.m3u8', format: 'hls' }] }] }))).toThrow();
    expect(() => parseOwnedMediaConfig(JSON.stringify({ ...base, items: [{ tmdbId: 1, kind: 'movie', sources: [{ url: 'https://cdn.example.com/a.mp4', format: 'hls' }] }] }))).toThrow();
    expect(() => parseOwnedMediaConfig(JSON.stringify({ ...base, items: [{ kind: 'series', tmdbId: 1, sources: [{ url: 'https://cdn.example.com/a.m3u8', format: 'hls' }] }] }))).toThrow(/seasonNumber/);
    expect(() => parseOwnedMediaConfig('not json')).toThrow();
  });
});

describe('owned media resolution', () => {
  const provider = new OwnedMediaProvider(parseOwnedMediaConfig(config));
  it('resolves movies by TMDB identity into ranked, playable sources with subtitles', async () => {
    const records = await provider.resolve(movie, new AbortController().signal);
    expect(records).toHaveLength(2);
    const ranked = rankSources(records);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].url).toBe('https://cdn.example.com/inception/hls/master.m3u8');
    expect(ranked[0].subtitles).toEqual([{ lang: 'en', label: 'English', url: 'https://cdn.example.com/inception/en.vtt' }]);
    expect(ranked[0].providerSlug).toBe('owned-media');
  });
  it('isolates episodes: each episode resolves only its own media, missing episodes return nothing', async () => {
    const one = rankSources(await provider.resolve(episode(1), new AbortController().signal));
    const two = rankSources(await provider.resolve(episode(2), new AbortController().signal));
    expect(one[0].url).toContain('s01e01');
    expect(two[0].url).toContain('s01e02');
    expect(await provider.resolve(episode(3), new AbortController().signal)).toEqual([]);
    expect(await provider.resolve({ ...episode(1), seasonNumber: undefined, episodeNumber: undefined }, new AbortController().signal)).toEqual([]);
  });
  it('matches locally curated slugs and rejects unrelated identities', async () => {
    const local = await provider.resolve({ slug: 'local-film', name: 'Local', year: 2020, kind: 'movie' }, new AbortController().signal);
    expect(local).toHaveLength(1);
    expect(await provider.resolve({ ...movie, tmdbId: 999 }, new AbortController().signal)).toEqual([]);
  });
  it('ranks the owned library ahead of lower-priority providers', async () => {
    const owned = await provider.resolve(movie, new AbortController().signal);
    const other = owned.map(r => ({ ...r, id: r.id - 1000000, provider: { ...r.provider, slug: 'elsewhere', priority: 50 }, priority: 50 }));
    const ranked = rankSources([...other, ...owned]);
    expect(ranked[0].providerSlug).toBe('owned-media');
  });
});
