import { spawnSync } from 'node:child_process';
import { readdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const mac = readdirSync('release').find((n) => n === 'mac' || n.startsWith('mac-'));
const bundle = readdirSync(path.join('release', mac)).find((n) => n.endsWith('.app'));
const executable = readdirSync(path.join('release', mac, bundle, 'Contents', 'MacOS'))[0];
const exe = path.resolve('release', mac, bundle, 'Contents', 'MacOS', executable);
const profile = mkdtempSync(path.join(os.tmpdir(), 'lumiere-native-trace-'));
const result = spawnSync('lldb', ['--batch', '-o', 'settings set target.process.stop-on-sharedlibrary-events false', '-o', 'run', '-k', 'thread backtrace all', '--', exe, '--enable-logging=stderr'], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1", LUMIERE_USER_DATA_DIR: profile }, encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024,
});
const log = `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`;
writeFileSync('mac-native-trace.log', log);
console.log('::notice title=Native debugger::' + log.slice(0, 14000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
for (const name of ['desktop.log', 'server.log']) {
  try { console.log(`::notice title=${name}::` + readFileSync(path.join(profile, name), 'utf8').slice(-5000).replaceAll('%', '%25').replaceAll('\n', '%0A')); } catch {}
}
