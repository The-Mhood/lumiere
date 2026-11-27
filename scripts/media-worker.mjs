import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { chromium } from '@playwright/test';
import { verifyPreviewCapability } from './lib/preview-capability.mjs';
import { MediaGateway } from './lib/media-gateway.mjs';
import { scrapeMedia, validateRequest } from './lib/browser-media.mjs';

const token = process.env.LUMIERE_MEDIA_WORKER_TOKEN;
if (!token || token.length < 24) throw new Error('Set LUMIERE_MEDIA_WORKER_TOKEN to a random secret of at least 24 characters');
const configPath = process.env.LUMIERE_SCRAPER_SITES || new URL('../scrapers/sites.json', import.meta.url);
const sites = JSON.parse(await readFile(configPath, 'utf8'));
if (!Array.isArray(sites) || !sites.length || sites.length > 20 || sites.some(s => !/^[a-z0-9-]+$/.test(s.id) || !s.name || !Array.isArray(s.pageHosts) || !Array.isArray(s.mediaHosts) || !s.mediaHosts.length || s.mediaHosts.some(h => typeof h !== 'string' || h === '*'))) throw new Error('Each scraper requires an id, name, pageHosts and explicit mediaHosts');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
const maxConcurrent = Math.min(4, Math.max(1, Number(process.env.LUMIERE_SCRAPER_CONCURRENCY) || 2));
let active = 0;
let streams = 0;
let browserContexts = 0;
const publicUrl = process.env.LUMIERE_PUBLIC_WORKER_URL;
const allowedOrigin = process.env.LUMIERE_PREVIEW_ORIGIN;
const publicKey = process.env.LUMIERE_BROWSER_PUBLIC_KEY_FILE ? await readFile(process.env.LUMIERE_BROWSER_PUBLIC_KEY_FILE, 'utf8') : null;
const gateway = new MediaGateway(publicUrl ? `${new URL(publicUrl).origin}/media/` : undefined);
const previewResults = new Map();
function authorized(req) {
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  const origin = req.headers.origin;
  if (origin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type,Content-Range,Accept-Ranges,Content-Length');
    res.setHeader('Access-Control-Max-Age', '300');
  } else if (origin) return send(403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return origin === allowedOrigin ? send(204, null) : send(403, { error: 'Origin not allowed' });
  if (req.method === 'GET' && req.url === '/public-health' && publicKey) return send(200, { status: 'ok', expiresAt: process.env.LUMIERE_PREVIEW_EXPIRES_AT });
  const serverAuthorized = authorized(req);
  const publicMedia = publicKey && publicUrl && req.method === 'GET' && /^\/media\/[A-Za-z0-9_-]{32}\/media\.(?:m3u8|mp4|bin|ts|m4s|aac|mp3|vtt|key|webm)$/.test(req.url || '');
  const browserResolve = publicKey && origin === allowedOrigin && req.method === 'POST' && req.url === '/resolve';
  if (!serverAuthorized && !publicMedia && !browserResolve) return send(401, { error: 'Unauthorized' });
  if (publicMedia) req.url = req.url.replace('/media/', '/stream/');
  if (req.method === 'GET' && req.url?.startsWith('/stream/')) {
    if (streams >= 32) return send(503, { error: 'Media gateway capacity reached' });
    streams++;
    res.once('close', () => { streams--; });
    return gateway.serve(req, res);
  }
  if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', sites: sites.map(s => s.id), active });
  if (req.method !== 'POST' || req.url !== '/resolve') return send(404, { error: 'Not found' });
  if (active >= maxConcurrent || browserContexts >= 4) return send(503, { error: 'Scraper capacity reached; retry later' });
  active++;
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 4096) return send(413, { error: 'Request too large' });
    }
    const input = validateRequest(JSON.parse(raw));
    const capability = serverAuthorized ? null : verifyPreviewCapability(req.headers.authorization, publicKey, origin, input);
    if (!serverAuthorized && !capability) return send(401, { error: 'Playback session invalid or expired' });
    for (const [key, value] of previewResults) if (value.until < Date.now()) previewResults.delete(key);
    if (capability && previewResults.has(capability.nonce)) return send(200, await previewResults.get(capability.nonce).work);
    const work = (async () => {
    const results = await Promise.all(sites.map(async site => {
      try {
        const result = await scrapeMedia(browser, site, input, { retainContext: true, onContext: context => { browserContexts++; context.once('close', () => { browserContexts--; }); } });
        console.log(JSON.stringify({ provider: site.id, sources: result.sources.length, reason: result.reason, observedHosts: result.observedHosts }));
        return { provider: site.id, ...result, sources: result.sources.map(source => ({ ...source, ...(source.format !== 'dash' ? { playbackPath: gateway.register(source.url, site.mediaHosts, source.format, result.fetchMedia) } : {}) })) };
      } catch { return { provider: site.id, sources: [], reason: 'Scraper failed' }; }
    }));
    return { identity: { tmdbId: input.tmdbId, kind: input.kind, seasonNumber: input.seasonNumber, episodeNumber: input.episodeNumber }, results };
    })();
    if (capability) previewResults.set(capability.nonce, { until: capability.exp * 1000, work });
    send(200, await work);
  } catch { send(400, { error: 'Invalid playback identity or request' }); }
  finally { active--; }
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.listen(Number(process.env.MEDIA_WORKER_PORT || process.env.PORT) || 3200, '0.0.0.0', () => console.log('Media scraper worker listening'));
async function shutdown() {
  server.close();
  server.closeAllConnections();
  await browser.close();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
