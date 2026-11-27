import { timingSafeEqual } from 'node:crypto';
import { sourceHealthStatus, sweepSourceHealth } from '@/lib/streaming/health-sweep';

export const dynamic = 'force-dynamic';

function authorized(req: Request) {
  const token = process.env.AGGREGATOR_TOKEN;
  if (!token || token.length < 24) return false;
  const actual = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Private, token-gated source-health monitoring. GET reports the last sweep
 * plus live worker health; POST starts a bounded sweep (least-recently-checked
 * catalogue sources first). The scheduler calls this every cycle. */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let worker: { configured: boolean; healthy: boolean } = { configured: false, healthy: false };
  const endpoint = process.env.LUMIERE_MEDIA_WORKER_URL;
  const token = process.env.LUMIERE_MEDIA_WORKER_TOKEN;
  if (endpoint && token) {
    worker.configured = true;
    try {
      const response = await fetch(new URL('/health', endpoint), { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(8000), cache: 'no-store' });
      const data = response.ok ? await response.json() : null;
      worker.healthy = Boolean(data?.status === 'ok');
    } catch { /* worker unreachable */ }
  }
  return Response.json({ sweep: sourceHealthStatus(), worker }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 40);
  if (!sourceHealthStatus().running) void sweepSourceHealth(Number.isFinite(limit) ? limit : 40);
  return Response.json(sourceHealthStatus(), { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
