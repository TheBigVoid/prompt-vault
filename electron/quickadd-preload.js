'use strict';
// Preload for the Quick add window only: lets the injected "Add" buttons
// hand a character (name, prompt tags, preview image URL) to the app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pvQuickAdd', {
  add: (data) => ipcRenderer.invoke('pv-quick-add', data),
});
