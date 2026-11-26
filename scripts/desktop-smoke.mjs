import { chromium, expect } from '@playwright/test';
import { readdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
const dirs = await readdir('release');
const exe = process.platform === 'win32' ? path.resolve('release/win-unpacked/Lumière.exe') :
  path.resolve('release', dirs.find((d) => d === 'mac' || d.startsWith('mac-')), 'Lumière.app/Contents/MacOS/Lumière');
const profile = await mkdtemp(path.join(os.tmpdir(), 'lumiere-smoke-'));
let child;
let browser;
let output = '';
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function closeApp() {
  if (!child) return;
  const process = child;
  child = undefined;
  const exited = new Promise((resolve) => process.once('exit', resolve));
  if (browser) {
    // CDP is used only for the test. It avoids injecting a Node inspector into
    // a signed Electron main process (which can crash on macOS ARM).
    await writeFile(path.join(profile, 'smoke-quit'), 'quit');
    await browser.close().catch(() => {}); browser = undefined;
  }
  let timer;
  try {
    if (process.exitCode !== null || process.signalCode) return;
    await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => { process.kill('SIGKILL'); reject(new Error('Packaged application did not shut down')); }, 15000);
    })]);
  } finally { clearTimeout(timer); }
}
async function launch() {
  const port = await freePort();
  output = '';
  child = spawn(exe, [`--remote-debugging-port=${port}`, '--enable-logging=stderr'], {
    env: { ...process.env, LUMIERE_USER_DATA_DIR: profile, LUMIERE_SMOKE_TEST: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  child.on('error', (e) => { output += e.stack; });
  const deadline = Date.now() + 90000;
  let available = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) throw new Error(`Application exited during startup (code=${child.exitCode}, signal=${child.signalCode}): ${output}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { available = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!available) throw new Error(`Application debugging endpoint did not start: ${output}`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page', { timeout: 90000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/, { timeout: 90000 });
  return page;
}
try {
  console.log('Launching packaged executable');
  let page = await launch();
  const origin = new URL(page.url()).origin;
  console.log('Checking search');
  await page.goto(`${origin}/search?q=sintel`);
  await page.getByText('Sintel', { exact: true }).first().waitFor();
  console.log('Checking title pages');
  await page.goto(`${origin}/title/sintel`);
  await page.getByRole('heading', { name: 'Sintel', exact: true }).waitFor();
  await page.goto(`${origin}/title/caminandes`);
  await page.getByRole('heading', { name: 'Caminandes', exact: true }).waitFor();
  console.log('Checking device settings');
  await page.goto(`${origin}/settings`);
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
  if (process.env.LUMIERE_LIVE_MEDIA_TEST === '1') {
    console.log('Checking live playback with primary-source failure');
    let primaryBlocked = false;
    const blockedMaster = '**/object-storage/streaming_playlists/hls/**/*master.m3u8';
    await page.route(blockedMaster, (route) => { primaryBlocked = true; return route.abort('failed'); });
    await page.route('**/akamai/bbb_30fps/bbb_30fps.mpd', (route) => { primaryBlocked = true; return route.abort('failed'); });
    await page.goto(`${origin}/watch/big-buck-bunny`);
    const video = page.locator('video');
    await expect.poll(() => video.evaluate((v) => v.readyState), { timeout: 100000 }).toBeGreaterThanOrEqual(2);
    if (await video.evaluate((v) => v.paused)) await page.getByRole('button', { name: 'Play (k)', exact: true }).click();
    await expect.poll(() => video.evaluate((v) => v.currentTime), { timeout: 30000 }).toBeGreaterThan(1);
    if (!primaryBlocked) throw new Error('Primary-source failure interception was not exercised');
    await page.mouse.move(300, 300);
    await page.getByRole('button', { name: 'Pause (k)', exact: true }).click();
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
    const before = await video.evaluate((v) => v.currentTime);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => video.evaluate((v) => v.currentTime)).toBeGreaterThan(before + 3);
    await page.getByRole('button', { name: 'Fullscreen (f)', exact: true }).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    const fillsWindow = await page.evaluate(() => {
      const bounds = document.fullscreenElement.getBoundingClientRect();
      return Math.abs(bounds.width - innerWidth) < 2 && Math.abs(bounds.height - innerHeight) < 2;
    });
    if (!fillsWindow) throw new Error('Media fullscreen does not fill the app display');
    await page.evaluate(() => document.exitFullscreen());
    console.log('PASS: live source fallback, playback, pause, seek and media fullscreen.');
    await page.unroute(blockedMaster);
    const movies = ['sintel', 'tears-of-steel', 'elephants-dream', 'cosmos-laundromat', 'spring', 'agent-327-operation-barbershop', 'sprite-fright', 'charge'];
    for (const slug of movies) {
      console.log(`Checking full catalogue playback: ${slug}`);
      await page.goto(`${origin}/watch/${slug}`);
      await expect.poll(() => video.evaluate((v) => v.readyState), { timeout: 90000 }).toBeGreaterThanOrEqual(2);
      if (await video.evaluate((v) => v.paused)) await page.getByRole('button', { name: 'Play (k)', exact: true }).click();
      await expect.poll(() => video.evaluate((v) => v.currentTime), { timeout: 30000 }).toBeGreaterThan(1);
      console.log(`PASS: ${slug} playback`);
    }
    console.log('::notice title=Movie playback coverage::PASS: all nine curated movies started in the packaged desktop player');
  }
  console.log('Closing and restarting packaged executable');
  await closeApp();
  await new Promise((r) => setTimeout(r, 1000));
  page = await launch();
  await page.goto(`${new URL(page.url()).origin}/settings`);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  console.log('PASS: independently launched package, search, details, settings and restart.');
  console.log('Subtitles, audio/quality, episode playback and signed installation remain manual release gates.');
} catch (error) {
  console.error('Smoke failure:', error);
  console.error('Application output:', output);
  for (const name of ['desktop.log', 'server.log']) {
    try { console.error(name, await readFile(path.join(profile, name), 'utf8')); } catch {}
  }
  throw error;
} finally {
  await closeApp();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch((e) => console.warn('Temporary profile cleanup:', e.message));
}
