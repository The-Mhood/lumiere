import { describe, expect, it } from 'vitest';
import { publicAddress, mediaFormat, hostMatches, validateRequest } from '../scripts/lib/browser-media.mjs';
describe('browser worker safety and media detection', () => {
  it('blocks loopback, private networks and mapped IPv6', () => {
    for (const ip of ['127.0.0.1', '10.1.1.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1']) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress('1.1.1.1')).toBe(true);
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('does not return segments, blob URLs or random scripts as movies', () => {
    expect(mediaFormat('https://media.example/master.m3u8?token=public')).toBe('hls');
    expect(mediaFormat('https://media.example/manifest', 'application/dash+xml')).toBe('dash');
    expect(mediaFormat('https://media.example/chunk.m4s', 'video/mp4')).toBeNull();
    expect(mediaFormat('blob:https://example.org/1', 'video/mp4')).toBeNull();
    expect(mediaFormat('https://example.org/player.js')).toBeNull();
  });
  it('does not confuse host suffixes and requires episode coordinates', () => {
    expect(hostMatches('evil-lightspeed.st', ['*.lightspeed.st'])).toBe(false);
    expect(hostMatches('a.lightspeed.st', ['*.lightspeed.st'])).toBe(true);
    expect(() => validateRequest({ kind: 'series', tmdbId: 1 })).toThrow();
    expect(() => validateRequest({ kind: 'movie', tmdbId: '1' })).toThrow();
  });
});
