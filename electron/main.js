'use strict';
// Desktop wrapper: runs the same static app in its own window.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const INDEX = path.join(__dirname, '..', 'index.html');
let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1400, height: 900 };
  }
}

function saveState() {
  if (!win) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch { /* not critical */ }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    x: s.x,
    y: s.y,
    width: s.width || 1400,
    height: s.height || 900,
    minWidth: 420,
    minHeight: 500,
    title: 'Prompt Vault',
    backgroundColor: '#0f0f14',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  if (s.maximized) win.maximize();
  win.loadFile(INDEX);
  win.once('ready-to-show', () => win.show());

  // Keep the app on its own page; web links open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.split('#')[0] === win.webContents.getURL().split('#')[0]) return;
    e.preventDefault();
    openExternal(url);
  });

  // No menu bar, but keep reload and dev tools on familiar keys.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });

  win.on('close', saveState);
  win.on('closed', () => { win = null; });
}

Menu.setApplicationMenu(null);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
