'use strict';
// Preload for the main app window: version info and auto-update controls.
// Only exposed to the app's own page (file://), never to websites.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('pvDesktop', {
    version: () => ipcRenderer.invoke('pv-version'),
    checkForUpdates: () => ipcRenderer.invoke('pv-update-check'),
    installUpdate: () => ipcRenderer.invoke('pv-update-install'),
    onUpdate: (cb) => ipcRenderer.on('pv-update', (_e, msg) => cb(msg)),
  });
}
