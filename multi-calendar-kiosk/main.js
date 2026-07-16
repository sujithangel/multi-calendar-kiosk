// Multi Calendar Kiosk - Electron main process
// - Opens a fullscreen kiosk window
// - Fetches ICS feeds server-side (no browser CORS limits)
// - Reads/writes a JSON config (calendars, rotation, settings)
// - Can register itself to auto-start on Windows boot

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

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
    refreshMinutes: 5,           // one of: 5,15,30,60,240,360,480,720,1440
    dayStart: '08:00',           // timeline start hour
    dayEnd: '18:00',             // timeline end hour
    hiddenRooms: [],             // names of rooms hidden from the board
    viewSize: 'normal',          // 'compact' | 'normal' | 'large'
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

// Fetch a URL as text, following a few redirects. Works for http/https and
// webcal:// (rewritten to https). Bypasses browser CORS entirely.
function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    let target = url.trim();
    if (target.startsWith('webcal://')) target = 'https://' + target.slice('webcal://'.length);
    let lib;
    try {
      lib = new URL(target).protocol === 'http:' ? http : https;
    } catch (e) {
      return reject(new Error('Invalid URL: ' + url));
    }
    const req = lib.get(target, { headers: { 'User-Agent': 'MultiCalendarKiosk/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, target).toString();
        return resolve(fetchText(next, redirects + 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + target));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Request timed out: ' + target)));
  });
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
      nodeIntegration: false
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
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
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
