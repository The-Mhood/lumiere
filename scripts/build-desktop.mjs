import { spawnSync } from 'node:child_process';
// Each Next build worker needs its own ephemeral DB. Sharing a file-backed
// PGlite database across build workers corrupts data; desktop user data must
// only be opened by the single runtime server process.
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit', env: { ...process.env, DATABASE_URL: '', LUMIERE_DATA_DIR: 'memory' },
});
process.exit(result.status ?? 1);
