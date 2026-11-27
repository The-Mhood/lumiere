export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Relay only unguessable handles issued by the media worker. This route never
 * accepts a target URL, forwards browser cookies, or exposes the worker token. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!/^[A-Za-z0-9_-]{32}\/media\.(?:m3u8|mp4|mpd|bin)$/.test(path)) return new Response(null, { status: 404 });
  const endpoint = process.env.LUMIERE_MEDIA_WORKER_URL;
  const token = process.env.LUMIERE_MEDIA_WORKER_TOKEN;
  if (!endpoint || !token) return new Response(null, { status: 503 });
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = req.headers.get('range');
  if (range) {
    if (!/^bytes=\d*-\d*$/.test(range)) return new Response(null, { status: 416 });
    headers.Range = range;
  }
  try {
    const response = await fetch(new URL(`/stream/${path}`, endpoint), { headers, redirect: 'error', signal: AbortSignal.any([req.signal, AbortSignal.timeout(120000)]), cache: 'no-store' });
    const resultHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = response.headers.get(key); if (value) resultHeaders.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers: resultHeaders });
  } catch { return new Response(null, { status: 502 }); }
}
