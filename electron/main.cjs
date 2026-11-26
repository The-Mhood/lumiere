const { app, BrowserWindow, dialog, Menu, utilityProcess, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
let server;
let window;
let origin;
let quitting = false;
const dataPath = app.getPath('userData');
const settingsPath = path.join(dataPath, 'window.json');
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
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.on('close', saveWindow);
  window.once('ready-to-show', () => { if (s.maximized) window.maximize(); window.show(); });
  window.loadURL(origin).catch((e) => dialog.showErrorBox('Lumière could not open', e.message));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    fs.mkdirSync(dataPath, { recursive: true });
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
      { role: 'editMenu' }, { role: 'windowMenu' },
    ]));
    try { await startServer(); openWindow(); } catch (e) { dialog.showErrorBox('Lumière startup failed', e.message); app.quit(); }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && origin) openWindow(); });
  });
  app.on('before-quit', () => { quitting = true; server?.kill(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
