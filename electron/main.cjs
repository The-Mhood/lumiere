const { app, BrowserWindow, dialog, Menu, utilityProcess, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
// Hardware acceleration remains enabled for video decoding on both platforms.
// Explicit opt-out is available for machines with a broken graphics driver.
if (process.env.LUMIERE_DISABLE_GPU === '1') app.disableHardwareAcceleration();
let server;
let window;
let origin;
let quitting = false;
if (process.env.LUMIERE_USER_DATA_DIR) app.setPath('userData', process.env.LUMIERE_USER_DATA_DIR);
const dataPath = app.getPath('userData');
const settingsPath = path.join(dataPath, 'window.json');
fs.mkdirSync(dataPath, { recursive: true });
function diagnostic(message) { fs.appendFileSync(path.join(dataPath, 'desktop.log'), `${new Date().toISOString()} ${message}\n`); }
diagnostic('Main process started');
// Trusted parent-process smoke control; never exposed to renderer content.
if (process.env.LUMIERE_SMOKE_TEST === '1') {
  const quitFile = path.join(dataPath, 'smoke-quit');
  fs.watchFile(quitFile, { interval: 200 }, (stat) => {
    if (stat.size) { fs.unwatchFile(quitFile); fs.unlinkSync(quitFile); diagnostic('Smoke requested graceful quit'); app.quit(); }
  });
}
process.on('uncaughtException', (error) => { diagnostic(error.stack || String(error)); app.exit(1); });
function settings() { try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; } }
function saveWindow() {
  if (!window || window.isDestroyed()) return;
  fs.writeFileSync(settingsPath, JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }));
}
async function freePort() {
  const portPath = path.join(dataPath, "server-port");
  let preferred = 0;
  try { preferred = Number(fs.readFileSync(portPath, "utf8")) || 0; } catch {}
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(preferred, '127.0.0.1', () => { const p = s.address().port; s.close(() => { fs.writeFileSync(portPath, String(p)); resolve(p); }); });
  });
}
async function startServer() {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const root = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, '..', '.next', 'standalone');
  const secretPath = path.join(dataPath, 'auth-secret');
  if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  const log = fs.createWriteStream(path.join(dataPath, 'server.log'), { flags: 'a' });
  server = utilityProcess.fork(path.join(root, 'server.js'), [], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1',
      DATABASE_URL: '', LUMIERE_DATA_DIR: path.join(dataPath, 'database'),
      AUTH_SECRET: fs.readFileSync(secretPath, 'utf8'), COOKIE_SECURE: 'false' },
    stdio: 'pipe', serviceName: 'Lumière server',
  });
  server.stdout.on('data', (d) => log.write(d));
  server.stderr.on('data', (d) => log.write(d));
  let exited = false;
  server.on('exit', () => { exited = true; log.end(); if (!quitting && window) dialog.showErrorBox('Lumière server stopped', `Restart Lumière. Diagnostic log: ${dataPath}`); });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !exited) {
    try { const r = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Local server did not start. See ${path.join(dataPath, 'server.log')}`);
}
function openWindow() {
  const s = settings();
  window = new BrowserWindow({ width: s.width || 1440, height: s.height || 900, minWidth: 800, minHeight: 600,
    backgroundColor: '#07080c', title: 'Lumière', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.on('close', saveWindow);
  window.once('ready-to-show', () => {
    if (s.maximized) window.maximize();
    window.show();
    if (process.platform === 'darwin') app.focus({ steal: true });
    window.focus();
    diagnostic('Window shown');
  });
  window.loadURL(origin).catch((e) => dialog.showErrorBox('Lumière could not open', e.message));
}
// A filesystem lock also protects the embedded DB when a second executable
// is launched directly, without relying on a platform-native singleton broker.
const lockPath = path.join(dataPath, 'instance.lock');
let ownsLock = false;
function acquireLock() {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
    ownsLock = true; return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const pid = Number(fs.readFileSync(lockPath, 'utf8'));
      if (!pid) return false;
      try { process.kill(pid, 0); return false; } catch (e) { if (e.code !== 'ESRCH') return false; }
      fs.unlinkSync(lockPath); return acquireLock();
    } catch { return false; }
  }
}
process.on('exit', () => { if (ownsLock) { try { fs.unlinkSync(lockPath); } catch {} } });
if (!acquireLock()) app.quit();
else {
  diagnostic('Instance lock acquired');
  app.whenReady().then(async () => {
    diagnostic('Electron ready');
    fs.mkdirSync(dataPath, { recursive: true });
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
      { role: 'editMenu' }, { role: 'windowMenu' },
    ]));
    try { await startServer(); diagnostic('Server ready'); openWindow(); } catch (e) { diagnostic(`Startup failed: ${e.stack || e.message}`); dialog.showErrorBox('Lumière startup failed', e.message); app.quit(); }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && origin) openWindow(); });
  });
  app.on('before-quit', () => { diagnostic('Application quitting'); quitting = true; session.defaultSession.flushStorageData(); server?.kill(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
