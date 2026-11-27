import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/playback/[...path]/route';
const handle = 'a'.repeat(32);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('same-origin playback relay', () => {
  it('does not accept arbitrary URL targets', async () => {
    const response = await GET(new Request('http://app/api/playback/bad'), { params: Promise.resolve({ path: ['https:', 'evil.test'] }) });
    expect(response.status).toBe(404);
  });
  it('keeps worker credentials on the server and forwards byte ranges only', async () => {
    vi.stubEnv('LUMIERE_MEDIA_WORKER_URL', 'http://worker:3200');
    vi.stubEnv('LUMIERE_MEDIA_WORKER_TOKEN', 'test-worker-secret');
    const fetch = vi.fn().mockResolvedValue(new Response('movie-bytes', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-10/100', 'Set-Cookie': 'never-forward-this=1' } }));
    vi.stubGlobal('fetch', fetch);
    const response = await GET(new Request('http://app/api/playback/path', { headers: { Range: 'bytes=0-10', Cookie: 'private-session=1' } }), { params: Promise.resolve({ path: [handle, 'media.mp4'] }) });
    expect(response.status).toBe(206);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('content-range')).toBe('bytes 0-10/100');
    expect(fetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer test-worker-secret', Range: 'bytes=0-10' });
  });
  it('fails closed when the worker is not configured', async () => {
    vi.stubEnv('LUMIERE_MEDIA_WORKER_URL', '');
    const response = await GET(new Request('http://app/api/playback/path'), { params: Promise.resolve({ path: [handle, 'media.m3u8'] }) });
    expect(response.status).toBe(503);
  });
});
