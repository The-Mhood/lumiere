import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { chromium } from '@playwright/test';
import { scrapeMedia, validateRequest } from './lib/browser-media.mjs';

const token = process.env.LUMIERE_MEDIA_WORKER_TOKEN;
if (!token || token.length < 24) throw new Error('Set LUMIERE_MEDIA_WORKER_TOKEN to a random secret of at least 24 characters');
const configPath = process.env.LUMIERE_SCRAPER_SITES;
if (!configPath) throw new Error('Set LUMIERE_SCRAPER_SITES to the site-adapter JSON path');
const sites = JSON.parse(await readFile(configPath, 'utf8'));
if (!Array.isArray(sites) || !sites.length || sites.length > 20 || sites.some(s => !/^[a-z0-9-]+$/.test(s.id) || !s.name || !Array.isArray(s.pageHosts) || !Array.isArray(s.mediaHosts) || !s.mediaHosts.length || s.mediaHosts.some(h => typeof h !== 'string' || h === '*'))) throw new Error('Each scraper requires an id, name, pageHosts and explicit mediaHosts');
const browser = await chromium.launch({ headless: true });
const maxConcurrent = Math.min(4, Math.max(1, Number(process.env.LUMIERE_SCRAPER_CONCURRENCY) || 2));
let active = 0;
function authorized(req) {
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  if (!authorized(req)) return send(401, { error: 'Unauthorized' });
  if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', sites: sites.map(s => s.id), active });
  if (req.method !== 'POST' || req.url !== '/resolve') return send(404, { error: 'Not found' });
  if (active >= maxConcurrent) return send(503, { error: 'Scraper capacity reached; retry later' });
  active++;
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 4096) return send(413, { error: 'Request too large' });
    }
    const input = validateRequest(JSON.parse(raw));
    const results = await Promise.all(sites.map(async site => {
      try {
        const result = await scrapeMedia(browser, site, input);
        return { provider: site.id, ...result };
      } catch { return { provider: site.id, sources: [], reason: 'Scraper failed' }; }
    }));
    send(200, { identity: { tmdbId: input.tmdbId, kind: input.kind, seasonNumber: input.seasonNumber, episodeNumber: input.episodeNumber }, results });
  } catch { send(400, { error: 'Invalid playback identity or request' }); }
  finally { active--; }
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.listen(Number(process.env.PORT) || 3200, '0.0.0.0', () => console.log('Media scraper worker listening'));
async function shutdown() {
  server.close();
  server.closeAllConnections();
  await browser.close();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
