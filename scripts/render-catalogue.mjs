import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const failures = [];
  const apiRequests = new Set();
  const playerRequests = new Set();
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'api2.wing.st') {
      for (const key of [...url.searchParams.keys()]) if (/token|key|auth|secret/i.test(key)) url.searchParams.set(key, '[redacted]');
      playerRequests.add(url.href);
    }
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (/json/i.test(response.headers()['content-type'] || '')) apiRequests.add(url.origin + url.pathname);
  });
  page.on('pageerror', e => failures.push(e.message));
  for (const [name, url] of [['home', 'https://cinejoy.pk/'], ['detail', 'https://cinejoy.pk/movie/27205-inception-2010']]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try { await page.locator('a[href*="/movie/"], button:has-text("Play")').first().waitFor({ timeout: 30000 }); } catch { /* Preserve failure markup for diagnostics. */ }
    await writeFile(`catalogue-report/${name}.html`, await page.content());
    if (name === 'detail') {
      try {
        await page.getByRole('button', { name: /^Play$/i }).first().click({ timeout: 10000 });
        await page.waitForTimeout(15000);
        console.log('::notice title=Player surface::' + JSON.stringify(await page.locator('video,source,iframe').evaluateAll(nodes => nodes.map(n => ({ tag: n.tagName, origin: n.src ? new URL(n.src).origin : null })))));
      } catch (e) { console.log('::notice title=Player activation::' + e.message.slice(0, 1000).replaceAll('\n', '%0A')); }
    }
  }
  console.log('::notice title=Public player requests::' + JSON.stringify([...playerRequests]));
  console.log('::notice title=Public catalogue endpoints::' + JSON.stringify([...apiRequests]));
  console.log('::notice title=Catalogue browser errors::' + JSON.stringify(failures).slice(0, 15000).replaceAll('%', '%25').replaceAll('\n', '%0A'));
} finally { await browser.close(); }
