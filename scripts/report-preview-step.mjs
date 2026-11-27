import { spawn } from 'node:child_process';
const [command, ...args] = process.argv.slice(2);
const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
let tail = '';
for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) stream.on('data', data => { output.write(data); tail = (tail + data.toString()).slice(-3500); });
child.on('exit', code => {
  if (code) console.log('::error title=Preview startup failure::' + tail.replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D'));
  process.exit(code ?? 1);
});
