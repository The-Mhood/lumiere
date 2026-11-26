import { _electron as electron, expect } from '@playwright/test';
import { readdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const dirs = await readdir('release');
const exe = process.platform === 'win32' ? path.resolve('release/win-unpacked/Lumière.exe') :
  path.resolve('release', dirs.find((d) => d === 'mac' || d.startsWith('mac-')), 'Lumière.app/Contents/MacOS/Lumière');
const profile = await mkdtemp(path.join(os.tmpdir(), 'lumiere-smoke-'));
let app;
async function launch() {
  app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`], env: { ...process.env, LUMIERE_USER_DATA_DIR: profile }, timeout: 90000 });
  const page = await app.firstWindow({ timeout: 90000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/, { timeout: 90000 });
  await page.waitForLoadState('domcontentloaded');
  return page;
}
try {
  let page = await launch();
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/search?q=sintel`);
  await page.getByText('Sintel', { exact: true }).first().waitFor();
  await page.goto(`${origin}/title/sintel`);
  await page.getByRole('heading', { name: 'Sintel', exact: true }).waitFor();
  await page.goto(`${origin}/title/caminandes`);
  await page.getByRole('heading', { name: 'Caminandes', exact: true }).waitFor();
  await page.goto(`${origin}/settings`);
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
  // Exercise native window fullscreen, independently of browser viewport size.
  assert.equal(await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]; win.setFullScreen(true); return true;
  }), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await app.close(); app = undefined;
  page = await launch();
  await page.goto(`${new URL(page.url()).origin}/settings`);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  console.log('PASS: packaged startup, search, details, settings, fullscreen request, restart.');
  console.log('Live playback/subtitle/media-fullscreen validation remains a manual release gate.');
} catch (error) {
  try { console.error('Bundled server diagnostics:', await readFile(path.join(profile, 'server.log'), 'utf8')); } catch {}
  throw error;
} finally { if (app) await app.close(); await rm(profile, { recursive: true, force: true }); }
