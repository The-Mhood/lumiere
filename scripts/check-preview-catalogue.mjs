import { readFile } from 'node:fs/promises';
const candidates = JSON.parse(await readFile('.cache/preview-host/candidates.json', 'utf8'));
let index = 0, passed = 0, failed = 0;
// One browser source lookup at a time: protect upstream and runner resources.
for (const { slug } of candidates.slice(0, 120)) {
  index++;
  try {
    const response = await fetch(`http://127.0.0.1:3100/api/titles/${encodeURIComponent(slug)}/sources`, { signal: AbortSignal.timeout(55000) });
    const result = await response.json();
    if (response.ok && result.sources?.length) passed++; else failed++;
  } catch { failed++; }
  if (index % 10 === 0) console.log(`Checked ${index} movie identities: ${passed} with playback sources; ${failed} unavailable.`);
}
console.log(`::notice title=Catalogue source checks::${passed} movies returned playable sources; ${failed} remain hidden. This checks source resolution, not full-film viewing.`);
