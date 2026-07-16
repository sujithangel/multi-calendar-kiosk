// Secure bridge between the renderer (UI) and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  fetchIcs: (url) => ipcRenderer.invoke('ics:fetch', url),
  quit: () => ipcRenderer.invoke('app:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggleFullscreen'),
  onOpenSettings: (cb) => ipcRenderer.on('ui:openSettings', cb)
});
