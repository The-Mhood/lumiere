import { getTitleBySlug } from '@/lib/content';
import { playbackIdentity } from '@/lib/streaming/identity';
import { issuePreviewSession, remotePreviewConfigured } from '@/lib/streaming/remote-preview';
export const dynamic = 'force-dynamic';
const windows = new Map<string, { count: number; until: number }>();
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = req.headers.get('origin');
  if ((origin && origin !== process.env.LUMIERE_PREVIEW_ORIGIN) || req.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  if (!remotePreviewConfigured()) return Response.json({ error: 'Playback preview worker is not configured' }, { status: 503 });
  const now = Date.now();
  for (const [ip, entry] of windows) if (entry.until < now) windows.delete(ip);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  const window = windows.get(ip) || { count: 0, until: now + 60000 };
  if (++window.count > 12 || windows.size > 10000) return Response.json({ error: 'Too many playback requests; retry shortly' }, { status: 429 });
  windows.set(ip, window);
  const title = await getTitleBySlug((await params).slug);
  if (!title) return Response.json({ error: 'Title not found' }, { status: 404 });
  const identity = playbackIdentity(title);
  if (!identity.tmdbId || identity.kind !== 'movie') return Response.json({ error: 'Remote preview currently supports identified movies only' }, { status: 422 });
  return Response.json(await issuePreviewSession(identity), { headers: { 'Cache-Control': 'no-store' } });
}
