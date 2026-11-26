import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
for (const name of ['home', 'detail']) {
  const $ = load(readFileSync(`catalogue-report/${name}.html`, 'utf8'));
  const report = { name, scripts: $('script').map((_, e) => $(e).attr('src') || $(e).text().slice(0, 2500)).get(), meta: $('meta').map((_, e) => ({ key: $(e).attr('property') || $(e).attr('name'), value: $(e).attr('content') })).get(), media: $('video,source,iframe').toString(), card: $('a[href*="/movie/"]').first().toString() };
  console.log('::notice title=Catalogue inspection::' + JSON.stringify(report).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D'));
}
