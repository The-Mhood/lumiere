import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

await mkdir('.cache/preview-host', { recursive: true });
const logs = {};
for (const name of ['tunnel', 'worker', 'app']) logs[name] = await open(`.cache/preview-host/${name}.log`, 'a');
const children = {};
const start = (name, command, args, env) => {
  const child = spawn(command, args, { detached: true, stdio: ['ignore', logs[name].fd, logs[name].fd], env: env || process.env });
  child.unref(); children[name] = child; return child;
};
start('tunnel', '.cache/cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3100', '--protocol', 'http2']);
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
  const token = randomBytes(32).toString('hex');
  const baseEnv = { ...process.env };
  for (const key of ['LUMIERE_REMOTE_APP_URL', 'LUMIERE_PUBLIC_WORKER_URL', 'LUMIERE_BROWSER_PUBLIC_KEY_FILE', 'LUMIERE_PREVIEW_SIGNING_KEY_FILE']) delete baseEnv[key];
  start('worker', process.execPath, ['scripts/media-worker.mjs'], { ...baseEnv, MEDIA_WORKER_PORT: '3200', LUMIERE_MEDIA_WORKER_TOKEN: token });
  start('app', process.execPath, ['.next/standalone/server.js'], {
    ...baseEnv, HOSTNAME: '0.0.0.0', PORT: '3100', NODE_ENV: 'production', AUTH_SECRET: randomBytes(32).toString('hex'), COOKIE_SECURE: 'true',
    LUMIERE_DATA_DIR: resolve('.cache/preview-host/data'), CINEJOY_RENDERED_HTML: resolve('.cache/preview-host/catalogue.html'),
    LUMIERE_MEDIA_WORKER_URL: 'http://127.0.0.1:3200', LUMIERE_MEDIA_WORKER_TOKEN: token, LUMIERE_PREVIEW_EXPIRES_AT: expiresAt,
  });
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const [worker, app] = await Promise.all([
        fetch('http://127.0.0.1:3200/health', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }),
        fetch(`${endpoint}/api/health`, { signal: AbortSignal.timeout(5000) }),
      ]);
      if (worker.ok && app.ok) { ready = true; break; }
    } catch { /* DNS/tunnel/server startup can take several seconds. */ }
    await delay(1000);
  }
  if (!ready) throw new Error('Hosted app and media worker did not become ready');
  const report = { endpoint, expiresAt, origin: endpoint, mode: 'full-app' };
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    const api = async (path, body) => {
      const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Deployment publication failed: HTTP ${response.status}`);
      return response.json();
    };
    const deployment = await api('deployments', { ref: process.env.GITHUB_SHA, environment: 'lumiere-preview', auto_merge: false, required_contexts: [], transient_environment: true, production_environment: false, description: 'Temporary full app and movie worker preview' });
    report.deploymentId = deployment.id;
    await api(`deployments/${deployment.id}/statuses`, { state: 'success', environment_url: endpoint, log_url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, description: `Temporary app expires ${expiresAt}` });
  }
  await writeFile('.cache/preview-host/endpoint.json', JSON.stringify(report));
  await writeFile('.cache/preview-host/processes.json', JSON.stringify(Object.fromEntries(Object.entries(children).map(([name, child]) => [name, child.pid]))));
  console.log(`::notice title=Remote preview endpoint::${JSON.stringify(report)}`);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Temporary connected movie app\n\nApp: ${endpoint}\n\nExpires: ${expiresAt}\n\nThe app and its private media worker run together. Preview account data is ephemeral.\n`);
} catch (error) {
  for (const child of Object.values(children)) child.kill();
  throw error;
} finally { for (const file of Object.values(logs)) await file.close(); }
