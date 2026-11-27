import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { parseCinejoyCatalogue } from '../src/lib/aggregators/cinejoy';
import { runAggregation } from '../src/lib/aggregators';
import { closeDb } from '../src/db';

// Import rendered HTML, never arbitrary serialized DB/source records.
const path = process.argv[2];
try {
  if (!path) throw new Error('Usage: tsx scripts/sync-external-catalogue.ts rendered-page.html');
  const html = await readFile(path, 'utf8');
  const titles = parseCinejoyCatalogue(html);
  if (!titles.length) throw new Error('No catalogue entries found; refusing empty import');
  const report = await runAggregation('cinejoy', titles.length, titles);
  await writeFile('catalogue-report/import.json', JSON.stringify({ ...report, listings: titles.length }, null, 2));
  console.log('::notice title=Catalogue import::' + JSON.stringify(report));
  if (report.status !== 'success') process.exitCode = 1;
} finally { await closeDb(); }
