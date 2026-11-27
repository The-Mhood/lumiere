import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const report = JSON.parse(await readFile('.cache/preview-host/endpoint.json', 'utf8'));
const pids = JSON.parse(await readFile('.cache/preview-host/processes.json', 'utf8'));
try {
  while (Date.now() < Date.parse(report.expiresAt)) {
    await delay(Math.min(60000, Date.parse(report.expiresAt) - Date.now()));
    const response = await fetch('http://127.0.0.1:3200/public-health', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Preview worker stopped responding');
  }
} finally {
  if (report.deploymentId && process.env.GITHUB_TOKEN) await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/deployments/${report.deploymentId}/statuses`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'inactive', description: 'Temporary preview has expired' }) }).catch(() => {});
  for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGTERM'); } catch { /* Already stopped. */ } } }
