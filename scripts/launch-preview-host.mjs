import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

await mkdir('.cache/preview-host', { recursive: true });
const tunnelLog = await open('.cache/preview-host/tunnel.log', 'a');
const workerLog = await open('.cache/preview-host/worker.log', 'a');
const tunnel = spawn('.cache/cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3200', '--protocol', 'http2'], { detached: true, stdio: ['ignore', tunnelLog.fd, tunnelLog.fd] });
tunnel.unref();
let worker;
try {
  let endpoint;
  for (let attempt = 0; attempt < 60; attempt++) {
    const text = await readFile('.cache/preview-host/tunnel.log', 'utf8');
    endpoint = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (endpoint) break;
    await delay(1000);
  }
  if (!endpoint) throw new Error('HTTPS preview tunnel did not start');
  const expiresAt = new Date(Date.now() + 3 * 3600000).toISOString();
  worker = spawn(process.execPath, ['scripts/media-worker.mjs'], { detached: true, stdio: ['ignore', workerLog.fd, workerLog.fd], env: {
    ...process.env, MEDIA_WORKER_PORT: '3200', LUMIERE_MEDIA_WORKER_TOKEN: randomBytes(32).toString('hex'),
    LUMIERE_PUBLIC_WORKER_URL: endpoint, LUMIERE_PREVIEW_EXPIRES_AT: expiresAt,
    LUMIERE_BROWSER_PUBLIC_KEY_FILE: 'scrapers/preview-public-key.pem',
  } });
  worker.unref();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { const response = await fetch(`${endpoint}/public-health`, { signal: AbortSignal.timeout(5000) }); if (response.ok) { ready = true; break; } } catch { /* DNS/tunnel startup may take several seconds. */ }
    await delay(1000);
  }
  if (!ready) throw new Error('Worker did not become reachable through HTTPS');
  const report = { endpoint, expiresAt, origin: process.env.LUMIERE_PREVIEW_ORIGIN };
  await writeFile('.cache/preview-host/endpoint.json', JSON.stringify(report));
  await writeFile('.cache/preview-host/processes.json', JSON.stringify({ tunnel: tunnel.pid, worker: worker.pid }));
  console.log(`::notice title=Remote preview endpoint::${JSON.stringify(report)}`);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Temporary movie preview worker\n\nEndpoint: ${endpoint}\n\nExpires: ${expiresAt}\n\nAnonymous signed playback sessions only; no signing private key is on this host.\n`);
} catch (error) {
  tunnel.kill(); worker?.kill();
  throw error;
} finally { await tunnelLog.close(); await workerLog.close(); }
