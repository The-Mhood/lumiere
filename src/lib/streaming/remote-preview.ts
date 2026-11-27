import { readFile } from 'node:fs/promises';
import { createSign, randomBytes } from 'node:crypto';
import type { TitleMatch } from './resolver';

export function remotePreviewConfigured() {
  return Boolean(process.env.LUMIERE_PUBLIC_WORKER_URL && process.env.LUMIERE_PREVIEW_SIGNING_KEY_FILE && process.env.LUMIERE_PREVIEW_ORIGIN);
}

export async function issuePreviewSession(identity: TitleMatch) {
  if (!remotePreviewConfigured() || !identity.tmdbId) throw new Error('Remote preview is not configured for this title');
  const endpoint = new URL(process.env.LUMIERE_PUBLIC_WORKER_URL!);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Remote preview requires HTTPS');
  const origin = new URL(process.env.LUMIERE_PREVIEW_ORIGIN!).origin;
  const input = { tmdbId: identity.tmdbId, kind: identity.kind, seasonNumber: identity.seasonNumber, episodeNumber: identity.episodeNumber };
  const payload = Buffer.from(JSON.stringify({ version: 1, origin, identity: input, exp: Math.floor(Date.now() / 1000) + 300, nonce: randomBytes(18).toString('base64url') })).toString('base64url');
  const key = await readFile(process.env.LUMIERE_PREVIEW_SIGNING_KEY_FILE!, 'utf8');
  const signature = createSign('RSA-SHA256').update(payload).sign(key).toString('base64url');
  return { endpoint: endpoint.origin, capability: `${payload}.${signature}`, identity: input, expiresAt: Date.now() + 300000 };
}
