import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { BrowserScraperProvider } from '../src/lib/streaming/browser-scraper';
import { rankSources } from '../src/lib/streaming';

const token = randomBytes(32).toString('hex');
const worker = spawn(process.execPath, ['scripts/media-worker.mjs'], { env: { ...process.env, PORT: '3200', LUMIERE_MEDIA_WORKER_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
worker.stdout.on('data', chunk => { output += chunk; });
worker.stderr.on('data', chunk => { output += chunk; });
const watchdog = setTimeout(() => { console.error('Scraper verification exceeded 150 seconds'); worker.kill('SIGKILL'); process.exit(1); }, 150000);
const server = createServer(async (req, res) => {
  if (req.url === '/shaka.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(await readFile('node_modules/shaka-player/dist/shaka-player.compiled.js'));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><video controls muted autoplay></video><script src="/shaka.js"></script>'); }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Media worker did not start')), 20000);
    worker.stdout.on('data', () => { if (output.includes('listening')) { clearTimeout(timer); resolve(); } });
    worker.once('exit', () => { clearTimeout(timer); reject(new Error(`Media worker exited: ${output.slice(0, 1000)}`)); });
  });
  const provider = new BrowserScraperProvider('http://127.0.0.1:3200', token, [{ id: 'cinejoy', name: 'Cinejoy', mediaHosts: ['lightspeed.st', '*.lightspeed.st'] }]);
  const records = await provider.resolve({ slug: 'inception-2010', name: 'Inception', year: 2010, kind: 'movie', tmdbId: 27205 }, AbortSignal.timeout(50000));
  const sources = rankSources(records);
  if (!sources.length) throw new Error('Live scraper returned no directly playable sources');
  await new Promise<void>(resolve => server.listen(3300, '0.0.0.0', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3300');
  const errors: string[] = [];
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} from ${new URL(r.url()).hostname}`); });
  page.on('requestfailed', r => errors.push(`${new URL(r.url()).hostname}: ${r.failure()?.errorText}`));
  page.on('pageerror', error => errors.push(error.message));
  const playbackError = await page.evaluate(async url => {
    try {
    const shaka = (window as unknown as { shaka: { polyfill: { installAll(): void }; Player: new () => { attach(video: HTMLVideoElement): Promise<void>; load(url: string): Promise<void> } } }).shaka;
    shaka.polyfill.installAll();
    const player = new shaka.Player();
    const video = document.querySelector('video')!;
    await player.attach(video);
    await player.load(url);
    await video.play();
    return null;
    } catch (error) {
      const e = error as { code?: number; category?: number; severity?: number; message?: string; data?: unknown[] };
      return { code: e.code, category: e.category, severity: e.severity, message: e.message, data: e.data?.map(value => typeof value === 'string' ? value.replace(/https?:\/\/\S+/g, '[URL omitted]') : typeof value === 'number' ? value : '[detail omitted]') };
    }
  }, sources[0].url);
  if (playbackError) throw new Error(`Independent player failed: ${JSON.stringify(playbackError)}; network: ${JSON.stringify(errors)}`);
  await page.waitForFunction(() => document.querySelector('video')!.currentTime > 2, { timeout: 30000 });
  const media = await page.locator('video').evaluate((v: HTMLVideoElement) => ({ duration: v.duration, time: v.currentTime, readyState: v.readyState }));
  if (media.duration < 8000 || media.duration > 10000) throw new Error('Resolved media does not have the expected full-film duration');
  const report = { status: 'passed', movie: 'Inception (2010)', tmdbId: 27205, sources: sources.map(s => ({ provider: s.providerSlug, format: s.format, host: new URL(s.url).hostname })), media, errors };
  await mkdir('catalogue-report', { recursive: true });
  await writeFile('catalogue-report/playback.json', JSON.stringify(report, null, 2));
  console.log(`::notice title=Independent scraper playback::${JSON.stringify(report)}`);
} catch (error) {
  const message = `${error instanceof Error ? error.message : 'Scraper verification failed'}; worker: ${output.slice(-1500)}`.replace(/https?:\/\/[^\s"']+/g, '[URL omitted]').replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D');
  console.error(`::error title=Independent scraper playback::${message}`);
  throw error;
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.close();
  server.closeAllConnections();
  worker.kill('SIGTERM');
}
