// Multi Calendar Kiosk - Electron main process
// - Opens a fullscreen kiosk window
// - Fetches ICS feeds server-side (no browser CORS limits)
// - Reads/writes a JSON config (calendars, rotation, settings)
// - Can register itself to auto-start on Windows boot

const { app, BrowserWindow, ipcMain, globalShortcut, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ---- Persistent feed cache (survives restarts / offline boot) ----
const CACHE_DIR = path.join(app.getPath('userData'), 'cache');
function cacheFile(url){ return path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.ics'); }
function writeCache(url, text){ try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cacheFile(url), text, 'utf8'); } catch (e) {} }
function readCache(url){ try { return fs.readFileSync(cacheFile(url), 'utf8'); } catch (e) { return null; } }

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Rooms come pre-named for SP Jain. Paste each room's ICS/webcal URL in the
// in-app settings panel (gear / F10). Colors and visibility are editable too.
function room(name, color) {
  return { name: name, url: '', color: color, enabled: true };
}

const DEFAULT_CONFIG = {
  calendars: [
    room('LC1', '#2563eb'),
    room('LC2', '#0891b2'),
    room('LC3', '#0d9488'),
    room('LC4', '#16a34a'),
    room('LC5', '#65a30d'),
    room('LC6', '#d97706'),
    room('LC7', '#ea580c'),
    room('LC8', '#dc2626'),
    room('ELO1', '#db2777'),
    room('ELO2', '#9333ea'),
    room('Boardroom', '#4f46e5'),
    room('Meeting Room 1', '#0284c7'),
    room('Meeting Room 2', '#7c3aed'),
    room('Meeting Room 3', '#b45309')
  ],
  settings: {
    refreshMinutes: 30,          // one of: 5,15,30,60,240,360,480,720,1440
    dayStart: '08:00',           // timeline start hour
    dayEnd: '18:00',             // timeline end hour
    hiddenRooms: [],             // names of rooms hidden from the board
    hideBottom: false,           // hide footer summary
    timeFormat: '24',            // '12' | '24'
    dateFormat: 'ddd-d-mon-yyyy',// see app.js formatDate()
    palette: 'default',          // color palette name
    theme: 'light',              // light|dark|midnight|paper|slatepro|forest|contrast
    autoSwitch: false,           // rotate through themes automatically
    autoSwitchThemes: ['light','dark','midnight'], // presets to cycle
    autoSwitchMinutes: 15,       // switch interval
    layout: 'rows',              // 'rows' | 'nownext'
    headWidth: 200,              // room-name column width in px (mouse-draggable)
    boldText: false,             // bold all text
    header1: { bg:'', color:'', size:0, font:'' },  // top row: logo + title
    header2: { bg:'', color:'', size:0, font:'' },  // second row: date + icons
    textColor: '',               // '' = auto (theme); else hex
    dateColor: '',               // '' = auto; else hex (header date)
    titlePrefixes: 'Dr., Prof., Mr., Ms., Miss, Mrs.', // titles pulled to front of session name (comma-separated); blank = off
    inProgress: { text:'in progress...', color:'', size:0, bg:'' }, // live-session banner ('' = default)
    fonts: {                     // per-area font sizes (px)
      heading: 22, caption: 13, timeline: 16,
      roomName: 20, sessionTitle: 14, sessionDetail: 11
    },
    pin: '',                     // Settings PIN ('' = no lock)
    startFullscreen: true,
    autoStartOnBoot: false
  }
};

let mainWindow = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return {
        calendars: Array.isArray(raw.calendars) ? raw.calendars : [],
        settings: Object.assign({}, DEFAULT_CONFIG.settings, raw.settings || {})
      };
    }
  } catch (e) {
    console.error('Failed to read config, using defaults:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write config:', e.message);
    return false;
  }
}

// Fetch a URL as text using Electron's Chromium network stack. This respects
// the system PROXY, DNS and certificate store (same as a browser), which is why
// feeds that work in a browser also work here. Handles webcal://, redirects and
// gzip automatically. Bypasses browser CORS entirely (runs in main process).
const DIAG_PATH = path.join(app.getPath('userData'), 'ics-diagnostics.log');
function logDiag(line) {
  try {
    const stamp = new Date().toISOString();
    fs.appendFileSync(DIAG_PATH, stamp + '  ' + line + '\n', 'utf8');
    // keep the log small (last ~120 lines)
    const txt = fs.readFileSync(DIAG_PATH, 'utf8').split('\n');
    if (txt.length > 130) fs.writeFileSync(DIAG_PATH, txt.slice(-120).join('\n'), 'utf8');
  } catch (e) {}
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ACCEPT = 'text/calendar,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
function snippetOf(d){ return (d||'').replace(/\s+/g,' ').trim().slice(0,120); }

// Plain Node HTTP/1.1 client — minimal request, like a simple calendar client.
// Avoids the extra Chromium headers / HTTP-2 that some strict ICS servers 400 on.
// Does NOT use the system proxy (that's what the Chromium fallback is for).
function nodeFetch(target, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    let lib; try { lib = new URL(target).protocol === 'http:' ? http : https; } catch (e) { return reject(new Error('Invalid URL')); }
    const req = lib.get(target, { headers: { 'User-Agent': UA, 'Accept': ACCEPT, 'Accept-Encoding': 'identity' } }, (res) => {
      const code = res.statusCode;
      if (code >= 300 && code < 400 && res.headers.location) { res.resume(); return resolve(nodeFetch(new URL(res.headers.location, target).toString(), redirects + 1)); }
      let data = ''; res.setEncoding('utf8'); res.on('data', c => data += c);
      res.on('end', () => { if (code >= 200 && code < 300) resolve(data); else reject(new Error('HTTP ' + code + (snippetOf(data) ? ': ' + snippetOf(data) : ''))); });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Timed out (20s)')));
  });
}

// Chromium/Electron client — respects the system PROXY, DNS and cert store.
function netFetch(target) {
  return new Promise((resolve, reject) => {
    let request; try { request = net.request({ url: target, redirect: 'follow' }); } catch (e) { return reject(new Error('Bad request')); }
    request.setHeader('User-Agent', UA);
    request.setHeader('Accept', ACCEPT);
    request.setHeader('Accept-Language', 'en-US,en;q=0.9');
    const timer = setTimeout(() => { try { request.abort(); } catch (e) {} reject(new Error('Timed out (20s)')); }, 20000);
    request.on('response', (response) => {
      const code = response.statusCode; let data = '';
      response.on('data', (c) => (data += c.toString('utf8')));
      response.on('end', () => { clearTimeout(timer); if (code >= 200 && code < 300) resolve(data); else reject(new Error('HTTP ' + code + (snippetOf(data) ? ': ' + snippetOf(data) : ''))); });
      response.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    request.on('error', (e) => { clearTimeout(timer); reject(new Error(e.message || 'Network error')); });
    request.end();
  });
}

// Try the plain Node client first (matches simple clients that already work),
// then fall back to Chromium's stack (for proxy environments).
async function fetchText(url) {
  let target = (url || '').trim().replace(/^[<"'\s]+|[>"'\s]+$/g, '');
  if (/^webcal:\/\//i.test(target)) target = 'https://' + target.replace(/^webcal:\/\//i, '');
  if (!/^https?:\/\//i.test(target)) throw new Error('Invalid URL');
  try { target = new URL(target).toString(); } catch (e) { throw new Error('Invalid URL'); }
  const host = (function(){ try { return new URL(target).host; } catch(e){ return ''; } })();

  try {
    const text = await nodeFetch(target);
    logDiag('OK(node) ' + host + ' (' + text.length + ' bytes)');
    return text;
  } catch (e1) {
    logDiag('node failed ' + host + ' :: ' + e1.message + ' — trying proxy/chromium');
    try {
      const text = await netFetch(target);
      logDiag('OK(net) ' + host + ' (' + text.length + ' bytes)');
      return text;
    } catch (e2) {
      logDiag('BOTH failed ' + host + ' :: node=' + e1.message + ' | net=' + e2.message + ' :: URL=' + target);
      throw new Error(e2.message || e1.message);
    }
  }
}

function applyAutoStart(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: []
    });
  } catch (e) {
    console.error('setLoginItemSettings failed:', e.message);
  }
}

function createWindow() {
  const cfg = loadConfig();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    kiosk: !!cfg.settings.startFullscreen,
    fullscreen: !!cfg.settings.startFullscreen,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => (mainWindow = null));
}

// ---- IPC bridge ----
ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:save', (_e, cfg) => {
  const ok = saveConfig(cfg);
  if (ok && cfg.settings) applyAutoStart(cfg.settings.autoStartOnBoot);
  return ok;
});

ipcMain.handle('ics:fetch', async (_e, url) => {
  try {
    const text = await fetchText(url);
    writeCache(url, text);                 // remember last good copy on disk
    return { ok: true, text };
  } catch (e) {
    const cached = readCache(url);          // fall back to last good copy if offline
    if (cached) logDiag('using DISK CACHE for ' + url + ' :: ' + e.message);
    return { ok: false, error: e.message, cachedText: cached || undefined };
  }
});

ipcMain.handle('app:quit', () => app.quit());

ipcMain.handle('app:toggleFullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setKiosk(next);
  mainWindow.setFullScreen(next);
  return next;
});

app.whenReady().then(() => {
  const cfg = loadConfig();
  applyAutoStart(cfg.settings.autoStartOnBoot);
  createWindow();

  // Global escape hatches so a kiosk is never truly locked for an operator.
  globalShortcut.register('F10', () => mainWindow && mainWindow.webContents.send('ui:openSettings'));
  globalShortcut.register('Escape', () => {
    if (mainWindow && mainWindow.isFullScreen()) {
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
    }
  });
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Single instance so it doesn't launch twice at boot.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
