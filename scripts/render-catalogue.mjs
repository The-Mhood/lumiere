import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  for (const [name, url] of [['home', 'https://cinejoy.pk/'], ['detail', 'https://cinejoy.pk/movie/27205-inception-2010']]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try { await page.locator('a[href*="/movie/"], button:has-text("Play")').first().waitFor({ timeout: 30000 }); } catch { /* Preserve failure markup for diagnostics. */ }
    await writeFile(`catalogue-report/${name}.html`, await page.content());
  }
  console.log('::notice title=Catalogue browser errors::' + JSON.stringify(failures).slice(0, 15000).replaceAll('%', '%25').replaceAll('\n', '%0A'));
} finally { await browser.close(); }
