import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseCinejoyCatalogue } from '../src/lib/aggregators/cinejoy';
import { runAggregation } from '../src/lib/aggregators';
import { closeDb, db } from '../src/db';
import { titles } from '../src/db/schema';
import { and, eq, desc } from 'drizzle-orm';
await mkdir('.cache/preview-host', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('https://cinejoy.pk/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('a[href^="/movie/"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  const html = await page.content();
  await writeFile('.cache/preview-host/catalogue.html', html);
  const catalogue = parseCinejoyCatalogue(html);
  if (!catalogue.length) throw new Error('No upstream movie catalogue was returned');
  const result = await runAggregation('cinejoy', catalogue.length, catalogue);
  if (result.status !== 'success') throw new Error('Preview catalogue could not be initialized');
  await db.update(titles).set({ featured: false });
  const featured = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.externalSource, 'cinejoy'), eq(titles.kind, 'movie'))).orderBy(desc(titles.popularity)).limit(5);
  for (const title of featured) await db.update(titles).set({ featured: true }).where(eq(titles.id, title.id));
  console.log(`Initialized ${catalogue.length} real movie/series listings. Playback remains on demand.`);
} finally { await browser.close(); await closeDb(); }
