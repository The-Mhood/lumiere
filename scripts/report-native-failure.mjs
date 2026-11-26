import fs from 'node:fs';
for (const file of ['native-build.log', 'native-package.log', 'native-smoke.log']) {
  if (!fs.existsSync(file)) continue;
  const log = fs.readFileSync(file, 'utf8').slice(-10000);
  console.log(`::error title=${file}::${log.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
}
