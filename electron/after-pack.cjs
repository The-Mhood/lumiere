const fs = require('node:fs');
const path = require('node:path');
module.exports = async (context) => {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const destination = path.join(resources, 'server');
  // Copy the already-traced server verbatim. Dependency packaging filters must
  // not prune Next's own node_modules tree from extra resources.
  fs.cpSync(path.resolve('.next/standalone'), destination, { recursive: true, dereference: true });
  for (const file of ['server.js', 'node_modules/next/package.json', 'node_modules/next/dist/server/next.js', 'node_modules/@electric-sql/pglite/dist/pglite.wasm']) {
    fs.accessSync(path.join(destination, file));
  }
  console.log('Verified packaged Next/PGlite runtime:', destination);
};
