import { cp, mkdir, rm, access, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const server = new URL('.next/standalone/', root);
await access(new URL('server.js', server));
// Never ship developer secrets or an existing user's database.
await rm(new URL('.env', server), { force: true });
await rm(new URL('.lumiere-data', server), { force: true, recursive: true });
await mkdir(new URL('.next/', server), { recursive: true });
await cp(new URL('.next/static/', root), new URL('.next/static/', server), { recursive: true });
await cp(new URL('public/', root), new URL('public/', server), { recursive: true });
console.log('Standalone desktop server prepared.');
// Turbopack traces external packages through .next/node_modules symlinks
// (junctions on Windows). NSIS/7zip cannot reliably archive those junctions.
// Materialize links before copying the server into native app resources.
const { readdir, lstat, realpath, rename } = await import('node:fs/promises');
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');
async function materialize(directory) {
  for (const name of await readdir(directory)) {
    const entry = path.join(directory, name);
    const stat = await lstat(entry);
    if (stat.isSymbolicLink()) {
      const resolved = await realpath(entry);
      const temp = `${entry}.materialized`;
      await cp(resolved, temp, { recursive: true, dereference: true });
      await rm(entry, { recursive: true, force: true });
      await rename(temp, entry);
    } else if (stat.isDirectory()) await materialize(entry);
  }
}
await materialize(fileURLToPath(server));
console.log('Standalone runtime links materialized for native packaging.');

// Bake only a public HTTPS deployment URL into installers. Never embed tokens.
const deploymentPath = new URL('electron/deployment.json', root);
if (process.env.LUMIERE_DESKTOP_SERVER_URL) {
  const endpoint = new URL(process.env.LUMIERE_DESKTOP_SERVER_URL);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Desktop server URL must be a clean HTTPS origin');
  await writeFile(deploymentPath, JSON.stringify({ serverUrl: endpoint.origin }));
} else await rm(deploymentPath, { force: true });
