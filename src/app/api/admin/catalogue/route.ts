import { timingSafeEqual } from 'node:crypto';
import { catalogueSyncStatus, syncCatalogue } from '@/lib/catalogue-sync';
export const dynamic = 'force-dynamic';
function authorized(req: Request) {
  const token = process.env.AGGREGATOR_TOKEN;
  if (!token || token.length < 24) return false;
  const actual = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json(catalogueSyncStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!catalogueSyncStatus().running) void syncCatalogue();
  return Response.json(catalogueSyncStatus(), { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
