import fs from 'node:fs';
for (const file of ['native-build.log', 'native-package.log', 'native-smoke.log']) {
  if (!fs.existsSync(file)) continue;
  const log = fs.readFileSync(file, 'utf8').slice(-10000);
  console.log(`::error title=${file}::${log.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
}
if (process.platform === 'darwin') {
  const os = await import('node:os');
  const path = await import('node:path');
  const directory = path.join(os.homedir(), 'Library/Logs/DiagnosticReports');
  try {
    const names = fs.readdirSync(directory).filter((n) => /lumi|electron/i.test(n.normalize('NFD')) && n.endsWith('.ips'));
    for (const name of names.slice(-2)) {
      const text = fs.readFileSync(path.join(directory, name), 'utf8');
      let summary = text.slice(0, 10000);
      try {
        const report = JSON.parse(text.slice(text.indexOf('\n') + 1));
        summary = JSON.stringify({ exception: report.exception, termination: report.termination,
          asi: report.asi, faultingThread: report.threads?.[report.faultingThread] }).slice(0, 12000);
      } catch {}
      console.log(`::error title=Native macOS crash::${summary.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
    }
  } catch {}
}
