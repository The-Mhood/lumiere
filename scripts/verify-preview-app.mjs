import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const report = JSON.parse(await readFile('.cache/preview-host/endpoint.json', 'utf8'));
let configured = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    const response = await fetch(`${report.origin}/api/preview-status`, { signal: AbortSignal.timeout(10000) });
    const status = await response.json();
    if (status.configured && status.endpoint === report.endpoint) { configured = true; break; }
  } catch { /* Wait for the workspace to connect this endpoint. */ }
  await delay(5000);
}
if (!configured) throw new Error('Workspace did not connect this preview endpoint within the verification window');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${report.origin}/watch/the-godfather-1972`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('video').waitFor({ timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, undefined, { timeout: 60000 });
  await page.locator('video').evaluate(async v => { v.muted = true; await v.play(); });
  await page.waitForFunction(() => document.querySelector('video').currentTime > 2, undefined, { timeout: 30000 });
  const media = await page.locator('video').evaluate(v => ({ time: v.currentTime, duration: v.duration, readyState: v.readyState }));
  if (media.duration < 10000) throw new Error('Unexpected full-film duration');
  await page.locator('video').evaluate(v => { v.currentTime = 120; });
  await page.waitForFunction(() => document.querySelector('video').currentTime > 121, undefined, { timeout: 30000 });
  console.log('::notice title=Actual app preview playback::' + JSON.stringify({ status: 'passed', title: 'The Godfather (1972)', ...media, seek: 'passed', origin: report.origin, expiresAt: report.expiresAt }));
} catch (error) {
  console.error('::error title=Actual app preview playback::' + error.message.replace(/https?:\/\/\S+/g, '[URL omitted]').replaceAll('\n', '%0A'));
  throw error;
} finally { await browser.close(); }
