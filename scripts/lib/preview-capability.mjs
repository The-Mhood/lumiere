import { createVerify } from 'node:crypto';

export function verifyPreviewCapability(authorization, publicKey, origin, identity) {
  try {
    const token = authorization?.replace(/^Bearer /, '');
    if (!token || token.length > 4096) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    if (!createVerify('RSA-SHA256').update(payload).verify(publicKey, Buffer.from(signature, 'base64url'))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    if (data.version !== 1 || data.exp < now || data.exp > now + 330 || data.origin !== origin || typeof data.nonce !== 'string') return null;
    for (const field of ['tmdbId', 'kind', 'seasonNumber', 'episodeNumber']) if (data.identity?.[field] !== identity[field]) return null;
    return data;
  } catch { return null; }
}
