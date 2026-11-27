import { remotePreviewConfigured } from '@/lib/streaming/remote-preview';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ configured: remotePreviewConfigured(), endpoint: process.env.LUMIERE_PUBLIC_WORKER_URL || null, expiresAt: process.env.LUMIERE_PREVIEW_EXPIRES_AT || null }, { headers: { 'Cache-Control': 'no-store' } });
}
