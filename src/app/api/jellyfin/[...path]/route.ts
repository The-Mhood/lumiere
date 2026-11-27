import { getJellyfinGateway, jellyfinSettings } from '@/lib/streaming/jellyfin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Same-origin relay for the operator's own Jellyfin server. Accepts only
 * unguessable grants issued during resolution — never a target URL — and keeps
 * the Jellyfin API key server-side, including inside rewritten HLS manifests. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!/^[A-Za-z0-9_-]{32}\/media\.(?:m3u8|mp4|ts|m4s|aac|mp3|vtt|key|bin)$/.test(path)) return new Response(null, { status: 404 });
  let settings;
  try { settings = jellyfinSettings(); } catch { return new Response(null, { status: 503 }); }
  if (!settings) return new Response(null, { status: 503 });
  try {
    return await getJellyfinGateway(settings).serve(path, req.headers.get('range') ?? undefined);
  } catch { return new Response(null, { status: 502 }); }
}
