import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('deploy', { recursive: true });
const secret = () => randomBytes(48).toString('hex');
try {
  await writeFile('deploy/.env', `# Private deployment configuration. Never commit this file.\nLUMIERE_DOMAIN=\nTMDB_READ_ACCESS_TOKEN=\nTMDB_WATCH_REGION=NG\nAUTH_SECRET=${secret()}\nAGGREGATOR_TOKEN=${secret()}\nLUMIERE_MEDIA_WORKER_TOKEN=${secret()}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created private deploy/.env with generated service secrets. Fill in LUMIERE_DOMAIN and TMDB_READ_ACCESS_TOKEN before starting.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('deploy/.env already exists; it was NOT overwritten.');
  else throw error;
}
