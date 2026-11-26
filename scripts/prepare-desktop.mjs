import { cp, mkdir, rm, access } from 'node:fs/promises';
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
