import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Reject mapped/private/link-local/loopback and multicast IPv6. Public global
  // unicast currently lives in 2000::/3; fail closed for every other prefix.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}

export function mediaFormat(url, contentType = '') {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || /\.(?:m4s|cmfv|cmfa|ts|aac)$/i.test(parsed.pathname)) return null;
  if (/\.m3u8$/i.test(parsed.pathname) || /(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(contentType)) return 'hls';
  if (/\.mpd$/i.test(parsed.pathname) || /dash\+xml/i.test(contentType)) return 'dash';
  if (/\.mp4$/i.test(parsed.pathname) || /video\/mp4/i.test(contentType)) return 'mp4';
  return null;
}

export function hostMatches(host, allowed) {
  return allowed.some(rule => host === rule || (rule.startsWith('*.') && host.endsWith(rule.slice(1)) && host !== rule.slice(2)));
}

export function validateRequest(input) {
  if (!input || !['movie', 'series'].includes(input.kind) || !Number.isSafeInteger(input.tmdbId) || input.tmdbId < 1) throw new Error('A valid TMDB identity is required');
  if (input.kind === 'series' && (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 0 || !Number.isInteger(input.episodeNumber) || input.episodeNumber < 1)) throw new Error('Season and episode numbers are required');
  return input;
}

/** Visit the normal public player and observe only media requested by it.
 * No cookies/headers/keys are extracted or replayed, no site JS is decrypted,
 * no login/captcha/DRM is circumvented. Every scrape uses a fresh context.
 * Sites and playback-host allowlists are operator configuration, not user URLs. */
export async function scrapeMedia(browser, site, input, { timeoutMs = 40000, retainContext = false, onContext } = {}) {
  const started = Date.now();
  validateRequest(input);
  const template = input.kind === 'movie' ? site.movieUrl : site.episodeUrl;
  if (!template) return { sources: [], reason: 'This site does not support the requested media type' };
  const pageUrl = template.replaceAll('{tmdbId}', String(input.tmdbId)).replaceAll('{season}', String(input.seasonNumber ?? '')).replaceAll('{episode}', String(input.episodeNumber ?? ''));
  const url = new URL(pageUrl);
  if (url.protocol !== 'https:' || !hostMatches(url.hostname, site.pageHosts)) throw new Error('Scraper page origin is not allowed');
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
  onContext?.(context);
  let retained = false;
  const found = new Map();
  const observedHosts = new Set();
  const dns = new Map();
  let finish;
  const observed = new Promise(resolve => { finish = resolve; });
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); });
  const tasks = new Set();
  let closed = false;
  async function safeHost(hostname) {
    if (!dns.has(hostname)) dns.set(hostname, lookup(hostname, { all: true }).then(records => records.length > 0 && records.every(r => publicAddress(r.address))).catch(() => false));
    return dns.get(hostname);
  }
  try {
    await context.route('**/*', async route => {
      try {
        const target = new URL(route.request().url());
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || !await safeHost(target.hostname)) return route.abort();
        if (retained && route.request().resourceType() === 'fetch' && !hostMatches(target.hostname, site.mediaHosts)) return route.abort();
        if (['font', 'image'].includes(route.request().resourceType())) return route.abort();
        return route.continue();
      } catch { await route.abort().catch(() => {}); }
    });
    const page = await context.newPage();
    page.on('popup', popup => { void popup.close(); });
    page.on('response', response => {
      const task = (async () => {
        if (closed || !response.ok()) return;
        const target = new URL(response.url());
        if (mediaFormat(target.href, response.headers()['content-type'])) observedHosts.add(target.hostname);
        if (!hostMatches(target.hostname, site.mediaHosts) || !await safeHost(target.hostname)) return;
        const format = mediaFormat(target.href, response.headers()['content-type']);
        if (!format) return;
        // A request's URL extension is insufficient: reject HTML error pages
        // masquerading as media and require actual manifest/video MIME types.
        const mime = response.headers()['content-type'] || '';
        if (/text\/html|application\/json/i.test(mime)) return;
        let master = false;
        if (format !== 'mp4') {
          const body = await response.text();
          master = format === 'hls' && body.includes('#EXT-X-STREAM-INF');
          if (format === 'hls' ? !body.trimStart().startsWith('#EXTM3U') : !/<(?:\w+:)?MPD\b/.test(body)) return;
        }
        found.set(target.href, { url: target.href, format, master, label: `${site.name} · ${format.toUpperCase()}` });
        finish();
      })().catch(() => {});
      tasks.add(task);
      void task.finally(() => tasks.delete(task));
    });
    const visit = (async () => {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 25000) });
      if (site.playSelector) await page.locator(site.playSelector).first().click({ timeout: Math.min(timeoutMs, 15000) });
      else await page.getByRole('button', { name: /^play$/i }).first().click({ timeout: Math.min(timeoutMs, 15000) });
    })();
    // Catch navigation errors immediately without leaving rejected promises.
    let visitError;
    await Promise.race([visit.catch(error => { visitError = error; }), deadline]);
    if (!found.size && !visitError) await Promise.race([observed, deadline]);
    if (found.size) {
      try {
        await page.waitForFunction(() => [...document.querySelectorAll('video')].some(v => v.readyState >= 3 && v.currentTime > 0.5), undefined, { timeout: Math.max(1, timeoutMs - (Date.now() - started)) });
      } catch { return { sources: [], reason: 'Public player did not start decoding media before its deadline', observedHosts: [...observedHosts] }; }
      const masters = [...found.values()].filter(s => s.master).reverse();
      const playable = masters.length ? masters : [...found.values()].reverse();
      if (!retainContext) return { sources: playable };
      retained = true;
      page.removeAllListeners('response');
      await page.locator('video').evaluateAll(nodes => nodes.forEach(v => v.pause())).catch(() => {});
      let idleTimer;
      const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { void context.close(); }, 15 * 60000); idleTimer.unref(); };
      touch();
      context.once('close', () => clearTimeout(idleTimer));
      // Fetch within the normal public page origin. No headers/cookies are
      // extracted or fabricated, and browser CORS enforcement remains enabled.
      const fetchMedia = async (url, range) => {
        touch();
        return page.evaluate(async ({ url, range }) => {
          const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(25000), ...(range ? { headers: { Range: range } } : {}) });
          if (!response.ok) return { status: response.status, headers: {}, body: '' };
          const reader = response.body.getReader();
          const chunks = []; let size = 0;
          for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16000000) { await reader.cancel(); throw new Error('Browser media chunk too large'); } chunks.push(part.value); }
          const parts = [];
          for (const chunk of chunks) for (let i = 0; i < chunk.length; i += 32768) parts.push(String.fromCharCode(...chunk.subarray(i, i + 32768)));
          const headers = {};
          for (const name of ['content-type', 'content-range', 'accept-ranges']) { const value = response.headers.get(name); if (value) headers[name] = value; }
          return { status: response.status, headers, body: btoa(parts.join('')) };
        }, { url, range });
      };
      return { sources: playable, fetchMedia };
    }
    return { sources: [], reason: visitError ? 'Public player could not be opened' : 'Public player produced no allowed, directly playable media before its deadline', observedHosts: [...observedHosts] };
  } finally {
    clearTimeout(timer);
    closed = true;
    if (!retained) await context.close().catch(() => {});
    // Closing the context rejects any outstanding manifest body reads.
    await Promise.allSettled([...tasks]);
  }
}
