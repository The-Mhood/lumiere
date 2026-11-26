import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
for (const name of ['home', 'detail']) {
  const $ = load(readFileSync(`catalogue-report/${name}.html`, 'utf8'));
  const report = { name, scripts: $('script').map((_, e) => $(e).attr('src') || $(e).text().slice(0, 2500)).get(), meta: $('meta').map((_, e) => ({ key: $(e).attr('property') || $(e).attr('name'), value: $(e).attr('content') })).get(), media: $('video,source,iframe').toString(), card: $('a[href*="/movie/"]').first().toString() };
  console.log('::notice title=Catalogue inspection::' + JSON.stringify(report).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D'));
}
const home = load(readFileSync('catalogue-report/home.html', 'utf8'));
const cards = home('a[href*="/movie/"], a[href*="/series/"]').map((_, e) => { const a = home(e); const image = a.find('img').first(); return '<a href=' + JSON.stringify(a.attr('href')) + '><img alt=' + JSON.stringify(image.attr('alt') || '') + ' src=' + JSON.stringify(image.attr('src') || '') + '></a>'; }).get().join('\n');
const { gzipSync } = await import('node:zlib');
const payload = gzipSync(cards).toString('base64');
if (payload.length > 55000) throw new Error('Catalogue snapshot exceeds annotation limit');
for (let i = 0; i < payload.length; i += 3000) console.log(`::notice title=Rendered catalogue snapshot ${i / 3000}::` + payload.slice(i, i + 3000));
