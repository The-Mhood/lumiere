// Original typographic catalogue artwork; no external artwork is bundled.
import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const seed = await readFile('src/db/catalogue-seed.ts', 'utf8');
await mkdir('public/posters', { recursive: true });
await mkdir('electron/assets', { recursive: true });
let index = 0;
for (const [, slug, name] of seed.matchAll(/slug: "([^"]+)",\s+kind: "(?:movie|series)",\s+name: "([^"]+)"/g)) {
  const hue = (index++ * 43 + 12) % 360;
  const words = name.toUpperCase().split(' ');
  const lines = []; let line = '';
  for (const word of words) { if ((line + word).length > 14) { lines.push(line.trim()); line = ''; } line += word + ' '; }
  if (line) lines.push(line.trim());
  const svg = `<svg width="600" height="900" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue},55%,25%)"/><stop offset="1" stop-color="#080a12"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="430" cy="270" r="220" fill="none" stroke="hsl(${hue},60%,65%)" stroke-width="1"/><circle cx="430" cy="270" r="170" fill="none" stroke="hsl(${hue},60%,65%)" stroke-width="2"/><path d="M250 150 L470 275 L250 400Z" fill="hsl(${hue},70%,65%)" opacity=".7"/><text x="45" y="64" fill="#f3f4fa" font-family="sans-serif" font-size="18" letter-spacing="6">LUMIÈRE / OPEN CINEMA</text>${lines.map((l,i)=>`<text x="40" y="${620+i*57}" fill="#f3f4fa" font-family="sans-serif" font-size="44" font-weight="bold">${l.replaceAll('&','&amp;')}</text>`).join('')}<text x="45" y="850" fill="#a7adc4" font-family="sans-serif" font-size="15" letter-spacing="4">BLENDER FOUNDATION COLLECTION</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(`public/posters/${slug === "agent-327-operation-barbershop" ? "agent-327" : slug}.jpg`);
}
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" rx="220" fill="#0d0f16"/><circle cx="512" cy="512" r="350" fill="none" stroke="#ff5c38" stroke-width="24"/><path d="M410 290 L740 512 L410 734Z" fill="#ff5c38"/></svg>`;
await sharp(Buffer.from(icon)).png().toFile('electron/assets/icon.png');
await writeFile('public/icon.svg',icon);
console.log(`Created ${index} original covers and application icon.`);
