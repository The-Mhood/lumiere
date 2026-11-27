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

import { MediaGateway } from '../scripts/lib/media-gateway.mjs';
describe('opaque same-origin media gateway', () => {
  it('rewrites variants, segments and key URIs without exposing upstream URLs', () => {
    const gateway = new MediaGateway();
    const input = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nsegment.ts\nvariant.m3u8';
    const output = gateway.rewriteHls(input, 'https://media.example.org/film/master.m3u8', ['media.example.org']);
    expect(output).not.toContain('https://');
    expect(output).toContain('/api/playback/');
    expect(output).toMatch(/URI="\/api\/playback\/[A-Za-z0-9_-]{32}\/media.bin"/);
    expect(gateway.grants.size).toBe(3);
  });
  it('refuses unknown origins and reuses handles without permitting arbitrary target URLs', () => {
    const gateway = new MediaGateway();
    const url = 'https://media.example.org/film.mp4';
    expect(gateway.register(url, ['media.example.org'])).toBe(gateway.register(url, ['media.example.org']));
    expect(() => gateway.register('https://evil.test/video.mp4', ['media.example.org'])).toThrow();
    expect(() => gateway.rewriteHls('#EXTM3U\nhttp://127.0.0.1/private', url, ['media.example.org'])).toThrow();
  });
});

import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyPreviewCapability } from '../scripts/lib/preview-capability.mjs';
describe('short-lived public-key playback sessions', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const identity = { kind: 'movie', tmdbId: 238 };
  function capability(overrides = {}) {
    const payload = Buffer.from(JSON.stringify({ version: 1, origin: 'https://preview.example', identity, exp: Math.floor(Date.now() / 1000) + 300, nonce: 'test-nonce', ...overrides })).toString('base64url');
    return `Bearer ${payload}.${createSign('RSA-SHA256').update(payload).sign(privateKey).toString('base64url')}`;
  }
  it('accepts only the signed origin and requested movie', () => {
    expect(verifyPreviewCapability(capability(), publicKey, 'https://preview.example', identity)?.identity).toEqual(identity);
    expect(verifyPreviewCapability(capability(), publicKey, 'https://evil.example', identity)).toBeNull();
    expect(verifyPreviewCapability(capability(), publicKey, 'https://preview.example', { ...identity, tmdbId: 1 })).toBeNull();
  });
  it('rejects expired, altered and long-lived credentials', () => {
    expect(verifyPreviewCapability(capability({ exp: 1 }), publicKey, 'https://preview.example', identity)).toBeNull();
    expect(verifyPreviewCapability(capability({ exp: Math.floor(Date.now() / 1000) + 3600 }), publicKey, 'https://preview.example', identity)).toBeNull();
    expect(verifyPreviewCapability(capability() + 'x', publicKey, 'https://preview.example', identity)).toBeNull();
  });
  it('rewrites remote manifests to the public gateway, not the sandbox', () => {
    const gateway = new MediaGateway('https://worker.example/media/');
    const manifest = gateway.rewriteHls('#EXTM3U\n#EXTINF:4,\npart.ts', 'https://media.example/film.m3u8', ['media.example']);
    expect(manifest).toContain('https://worker.example/media/');
    expect(manifest).not.toContain('/api/playback/');
  });
});
