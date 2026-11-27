import { describe, expect, it } from 'vitest';
import { buildHlsArgs, buildIngestItem, buildMp4Args, buildPosterArgs, selectRungs } from '../scripts/lib/transcode-plan.mjs';
import { mergeOwnedMediaItem } from '../scripts/register-media.mjs';
import { parseOwnedMediaConfig } from '../src/lib/streaming/owned-media.ts';

describe('transcode ladder planning', () => {
  it('never upscales: rungs are capped at the source height', () => {
    expect(selectRungs(2160).map(r => r.height)).toEqual([2160, 1440, 1080, 720, 480]);
    expect(selectRungs(1080).map(r => r.height)).toEqual([1080, 720, 480]);
    expect(selectRungs(700).map(r => r.height)).toEqual([480]);
    expect(selectRungs(360)).toEqual([{ height: 360, videoKbps: 900, audioKbps: 96 }]);
    expect(() => selectRungs(0)).toThrow();
  });
  it('builds a multi-variant VOD HLS command with aligned keyframes and per-rung bitrates', () => {
    const rungs = selectRungs(1080);
    const args = buildHlsArgs({ input: 'in.mkv', outDir: '/out/hls', rungs, hasAudio: true });
    expect(args).toContain('-filter_complex');
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('split=3');
    expect(args[args.indexOf('-var_stream_map') + 1]).toBe('v:0,a:0 v:1,a:1 v:2,a:2');
    expect(args).toContain('libx264');
    expect(args[args.indexOf('-hls_playlist_type') + 1]).toBe('vod');
    expect(args[args.indexOf('-master_pl_name') + 1]).toBe('master.m3u8');
    expect(args[args.indexOf('-b:v:0') + 1]).toBe('6000k');
    expect(args.at(-1)).toBe('/out/hls/v%v/index.m3u8');
    const silent = buildHlsArgs({ input: 'in.mkv', outDir: '/out/hls', rungs, hasAudio: false });
    expect(silent[silent.indexOf('-var_stream_map') + 1]).toBe('v:0 v:1 v:2');
    expect(silent).not.toContain('aac');
  });
  it('builds faststart MP4 fallback and poster commands', () => {
    const mp4 = buildMp4Args({ input: 'in.mkv', output: '/out/fallback.mp4' });
    expect(mp4).toContain('+faststart');
    expect(mp4).toContain('yuv420p');
    expect(mp4.at(-1)).toBe('/out/fallback.mp4');
    expect(buildMp4Args({ input: 'in.mkv', output: 'o.mp4', hasAudio: false })).toContain('-an');
    const poster = buildPosterArgs({ input: 'in.mkv', output: '/out/poster.jpg' });
    expect(poster[poster.indexOf('-frames:v') + 1]).toBe('1');
  });
});

describe('library registration', () => {
  const item = buildIngestItem({ slug: 'my-film', tmdbId: 27205, baseUrl: 'https://cdn.example.com/library', rungs: selectRungs(1080), hasMp4: true });
  it('emits a valid owned-media item that the app adapter accepts', () => {
    expect(item.sources[0].url).toBe('https://cdn.example.com/library/my-film/hls/master.m3u8');
    expect(item.sources[0].resolutions).toEqual(['1080p', '720p', '480p']);
    const config = mergeOwnedMediaItem({ allowedHosts: [], items: [] }, item);
    expect(() => parseOwnedMediaConfig(JSON.stringify(config))).not.toThrow();
    expect(config.allowedHosts).toEqual(['cdn.example.com']);
  });
  it('is idempotent per identity and keeps episodes separate', () => {
    let config = mergeOwnedMediaItem({ allowedHosts: [], items: [] }, item);
    config = mergeOwnedMediaItem(config, { ...item, sources: [item.sources[0]] });
    expect(config.items).toHaveLength(1);
    expect(config.items[0].sources).toHaveLength(1);
    const e1 = buildIngestItem({ slug: 'show-s01e01', tmdbId: 1396, kind: 'series', seasonNumber: 1, episodeNumber: 1, baseUrl: 'https://cdn.example.com/library', rungs: selectRungs(720), hasMp4: false });
    const e2 = buildIngestItem({ slug: 'show-s01e02', tmdbId: 1396, kind: 'series', seasonNumber: 1, episodeNumber: 2, baseUrl: 'https://cdn.example.com/library', rungs: selectRungs(720), hasMp4: false });
    config = mergeOwnedMediaItem(mergeOwnedMediaItem(config, e1), e2);
    expect(config.items).toHaveLength(3);
    expect(() => parseOwnedMediaConfig(JSON.stringify(config))).not.toThrow();
  });
  it('rejects invalid identities and non-HTTPS hosting', () => {
    expect(() => buildIngestItem({ slug: 'Bad Slug', baseUrl: 'https://cdn.example.com', rungs: selectRungs(720), hasMp4: false })).toThrow();
    expect(() => buildIngestItem({ slug: 'x', baseUrl: 'http://cdn.example.com', rungs: selectRungs(720), hasMp4: false })).toThrow();
    expect(() => buildIngestItem({ slug: 'x', kind: 'series', baseUrl: 'https://cdn.example.com', rungs: selectRungs(720), hasMp4: false })).toThrow(/seasonNumber/);
    expect(() => mergeOwnedMediaItem({ allowedHosts: [], items: [] }, { kind: 'movie', slug: 'x', sources: [{ url: 'http://cdn.example.com/a.m3u8', format: 'hls' }] })).toThrow();
  });
});
