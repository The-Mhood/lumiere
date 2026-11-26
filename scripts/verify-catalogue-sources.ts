import { writeFile } from 'node:fs/promises';
import { BlenderProvider, BLENDER_FILMS } from '../src/lib/streaming/blender';
import { rankSources } from '../src/lib/streaming';
const provider = new BlenderProvider();
const report = [];
for (const [slug, film] of Object.entries(BLENDER_FILMS)) {
  try {
    const records = await provider.resolve({ slug, name: film.name, year: film.year, kind: 'movie' }, AbortSignal.timeout(30000));
    const sources = rankSources(records);
    if (!sources.length) throw new Error('No matching official source');
    const probes = [];
    for (const source of sources) {
      const response = await fetch(source.url, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
      const type = response.headers.get('content-type');
      const ok = response.ok && !type?.includes('text/html');
      await response.body?.cancel();
      probes.push({ format: source.format, status: response.status, ok, contentType: type, url: source.url });
    }
    report.push({ slug, name: film.name, ok: probes.some((p) => p.ok), sources: probes });
  } catch (e) { report.push({ slug, name: film.name, ok: false, error: String(e) }); }
}
console.log('::notice title=Official source coverage::' + JSON.stringify(report).replaceAll('%','%25').replaceAll('\n','%0A'));
await writeFile('source-coverage.json', JSON.stringify({ checkedAt: new Date().toISOString(), report }, null, 2));
if (report.some((r) => !r.ok)) process.exitCode = 1;
