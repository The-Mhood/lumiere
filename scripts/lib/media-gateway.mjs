import { randomBytes, createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { Readable } from 'node:stream';
import { hostMatches, publicAddress, mediaFormat } from './browser-media.mjs';

/** Opaque, host-scoped relay grants, not an arbitrary-URL/open proxy. */
export class MediaGateway {
  grants = new Map();
  secret = randomBytes(32);
  cleanedAt = 0;
  register(url, hosts, format = mediaFormat(url), transport) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !hostMatches(parsed.hostname, hosts)) throw new Error('Media origin not allowed');
    const now = Date.now();
    if (now - this.cleanedAt > 60000) {
      for (const [key, grant] of this.grants) if (grant.expires < now) this.grants.delete(key);
      this.cleanedAt = now;
    }
    const id = createHmac('sha256', this.secret).update(JSON.stringify([url, hosts])).digest('base64url').slice(0, 32);
    if (!this.grants.has(id) && this.grants.size >= 50000) throw new Error('Media gateway capacity reached');
    this.grants.set(id, { url, hosts, format, transport, expires: now + 6 * 3600000 });
    const extension = ({ hls: 'm3u8', dash: 'mpd', mp4: 'mp4' })[format] || parsed.pathname.match(/\.(ts|m4s|aac|mp3|vtt|key|webm)$/i)?.[1]?.toLowerCase() || 'bin';
    return `/stream/${id}/media.${extension}`;
  }
  rewriteHls(text, base, hosts, transport) {
    const uri = value => this.register(new URL(value, base).href, hosts, undefined, transport).replace('/stream/', '/api/playback/');
    return text.split('\n').map(line => {
      if (!line.trim()) return line;
      if (line.trimStart().startsWith('#')) return line.replace(/\bURI="([^"]+)"/g, (_, value) => `URI="${uri(value)}"`);
      return uri(line.trim());
    }).join('\n');
  }
  async upstream(url, hosts, headers, signal) {
    for (let redirects = 0; redirects < 4; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !hostMatches(parsed.hostname, hosts)) throw new Error('Media origin not allowed');
      const records = await lookup(parsed.hostname, { all: true });
      if (!records.length || !records.every(r => publicAddress(r.address))) throw new Error('Private media origin blocked');
      const response = await fetch(url, { headers, redirect: 'manual', signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Invalid media redirect');
      url = new URL(location, url).href;
    }
    throw new Error('Too many media redirects');
  }
  async serve(req, res) {
    const match = req.url?.match(/^\/stream\/([A-Za-z0-9_-]{32})\/media\.(?:m3u8|mp4|mpd|bin|ts|m4s|aac|mp3|vtt|key|webm)$/);
    const grant = match && this.grants.get(match[1]);
    if (!grant || grant.expires < Date.now()) { res.writeHead(404); res.end(); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    res.once('close', () => { controller.abort(); clearTimeout(timer); });
    try {
      const headers = {};
      if (req.headers.range) {
        if (!/^bytes=\d*-\d*$/.test(req.headers.range)) { res.writeHead(416); res.end(); return; }
        headers.Range = req.headers.range;
      }
      let upstream;
      if (grant.transport && grant.format !== 'mp4') {
        const data = await grant.transport(grant.url, headers.Range);
        upstream = new Response(data.status === 204 ? null : Buffer.from(data.body, 'base64'), { status: data.status, headers: data.headers });
        Object.defineProperty(upstream, 'url', { value: grant.url });
      } else upstream = await this.upstream(grant.url, grant.hosts, headers, controller.signal);
      if (!upstream.ok) { console.warn(JSON.stringify({ gateway: 'upstream error', status: upstream.status, host: new URL(upstream.url).hostname })); await upstream.body?.cancel(); res.writeHead(upstream.status); res.end(); return; }
      const mime = upstream.headers.get('content-type') || '';
      if (/text\/html|application\/json/i.test(mime)) { await upstream.body?.cancel(); res.writeHead(502); res.end(); return; }
      const format = mediaFormat(upstream.url, mime) || grant.format;
      if (format === 'hls') {
        const reader = upstream.body.getReader();
        const chunks = [];
        let length = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 2000000) { await reader.cancel(); throw new Error('Manifest too large'); }
          chunks.push(Buffer.from(value));
        }
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS manifest');
        const codecs = [...new Set([...text.matchAll(/CODECS="([^"]+)"/g)].map(m => m[1]))];
        if (codecs.length) console.log(JSON.stringify({ gateway: 'manifest codecs', codecs: codecs.slice(0, 12) }));
        const body = this.rewriteHls(text, upstream.url, grant.hosts, grant.transport);
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
        res.end(body);
      } else {
        const resultHeaders = { 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'no-store' };
        for (const name of ['content-length', 'content-range', 'accept-ranges']) {
          const value = upstream.headers.get(name); if (value) resultHeaders[name] = value;
        }
        res.writeHead(upstream.status, resultHeaders);
        if (!upstream.body) res.end();
        else Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
      }
    } catch (error) { console.warn(JSON.stringify({ gateway: 'relay error', reason: error.message.replace(/https?:\/\/[^\s"']+/g, '[URL omitted]') })); if (!res.headersSent) res.writeHead(502); res.end(); }
    finally { if (res.writableEnded) clearTimeout(timer); }
  }
}
