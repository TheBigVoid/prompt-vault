'use strict';
// Desktop wrapper: runs the same static app in its own window.
const { app, BrowserWindow, Menu, net, screen, shell } = require('electron');
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

// ---------- Image search window ----------
// Pinterest serves small thumbnails in its grid; ask for the 736px version instead.
const biggerPin = (url) => url.replace(/^(https:\/\/i\.pinimg\.com\/)(?:\d+x\d*(?:_RS)?)\//, '$1736x/');

function tellPage(js) {
  if (win && !win.isDestroyed()) return win.webContents.executeJavaScript(js).catch(() => {});
  return Promise.resolve();
}

// Download an image from the search window and hand it to the open editor.
async function sendImageToApp(src) {
  try {
    let dataUrl = src;
    if (!src.startsWith('data:image/')) {
      if (!/^https?:\/\//i.test(src)) throw new Error('unsupported image');
      let res = await net.fetch(biggerPin(src));
      if (!res.ok && biggerPin(src) !== src) res = await net.fetch(src);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const type = (res.headers.get('content-type') || '').split(';')[0];
      if (!type.startsWith('image/')) throw new Error('not an image');
      dataUrl = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
    }
    const ok = await tellPage(`PV.receiveSearchImage(${JSON.stringify(dataUrl)})`);
    if (ok && win) win.focus();
  } catch (e) {
    tellPage(`PV.toast(${JSON.stringify("Couldn't get that image (" + e.message + '). Try another one.')}, 'err', 4000)`);
  }
}

function searchWindowContextMenu(child, params) {
  const wc = child.webContents;
  const items = [];
  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: '📥  Use this image in Prompt Vault', click: () => sendImageToApp(params.srcURL) });
    items.push({ label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) });
    items.push({ type: 'separator' });
  }
  if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
  else if (params.selectionText) items.push({ role: 'copy' }, { type: 'separator' });
  if (params.linkURL && /^https?:/i.test(params.linkURL)) {
    items.push({ label: 'Open link in your browser', click: () => openExternal(params.linkURL) }, { type: 'separator' });
  }
  items.push(
    { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Reload', click: () => wc.reload() },
  );
  Menu.buildFromTemplate(items).popup({ window: child });
}

// Right side of the screen the app is on, so the editor stays visible.
function searchWindowBounds() {
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  const width = Math.min(1000, Math.round(wa.width * 0.5));
  return { x: wa.x + wa.width - width, y: wa.y, width, height: wa.height };
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
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Image search with auto-close: an app-owned window the page can close again.
    if (frameName === 'pv-image-search' && /^https:\/\//i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...searchWindowBounds(),
          title: 'Image search',
          autoHideMenuBar: true,
          icon: path.join(__dirname, '..', 'build', 'icon.png'),
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    // Pop-ups from inside the search window go to the normal browser.
    child.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });
    // Right-click an image -> send it to the open editor.
    child.webContents.on('context-menu', (_e, params) => searchWindowContextMenu(child, params));
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
