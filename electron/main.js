'use strict';
// Desktop wrapper: runs the same static app in its own window.
const { app, BrowserWindow, Menu, ipcMain, net, screen, shell } = require('electron');
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

// ---------- Quick add (downloadmost.com character lists) ----------
const QUICK_ADD_HOST = /(^|\.)downloadmost\.com$/i;
const isQuickAddUrl = (url) => { try { return QUICK_ADD_HOST.test(new URL(url).hostname); } catch { return false; } };

// Adds a "➕ Add to Prompt Vault" button to every character card on the page.
const QUICK_ADD_INJECT = `(() => {
  if (window.__pvQuickAdd || !window.pvQuickAdd) return;
  window.__pvQuickAdd = true;
  const css = document.createElement('style');
  css.textContent = '.pv-add{display:block;width:100%;margin-top:8px;padding:8px 12px;border:0;border-radius:8px;background:#8f73ff;color:#fff;font-weight:600;cursor:pointer}' +
    '.pv-add:hover{filter:brightness(1.1)}.pv-add:disabled{cursor:default;opacity:.85}.pv-add.ok{background:#1f9d63}.pv-add.dupe{background:#555}.pv-add.err{background:#d64545}' +
    '.pv-bar{position:sticky;top:0;z-index:9999;padding:8px 12px;background:#8f73ff;color:#fff;font:600 14px system-ui;text-align:center}';
  document.head.appendChild(css);
  const bar = document.createElement('div');
  bar.className = 'pv-bar';
  bar.textContent = '🎲 Prompt Vault: click ➕ on any character to add it to your library';
  document.body.prepend(bar);
  for (const card of document.querySelectorAll('.card')) {
    const nameEl = card.querySelector('.card-header .user-select-all');
    const promptEl = card.querySelector('.card-body .alert');
    if (!nameEl || !promptEl || card.querySelector('.pv-add')) continue;
    const btn = document.createElement('button');
    btn.className = 'pv-add';
    btn.textContent = '➕ Add to Prompt Vault';
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Adding…';
      const img = card.querySelector('img');
      let r = 'error';
      try {
        r = await window.pvQuickAdd.add({ name: nameEl.textContent.trim(), prompt: promptEl.textContent.trim(), image: img ? img.src : '' });
      } catch (e) {}
      btn.className = 'pv-add ' + (r === 'added' ? 'ok' : r === 'exists' ? 'dupe' : 'err');
      btn.textContent = r === 'added' ? '✓ Added to Prompt Vault' : r === 'exists' ? '✓ Already in your library' : '⚠ Could not add. Click to retry';
      btn.disabled = r !== 'error';
    };
    card.querySelector('.card-body').appendChild(btn);
  }
})();`;

async function fetchAsDataUrl(url) {
  if (!/^https?:\/\//i.test(url)) return '';
  const res = await net.fetch(url);
  const type = (res.headers.get('content-type') || '').split(';')[0];
  if (!res.ok || !type.startsWith('image/')) return '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1048576) return '';
  return `data:${type};base64,${buf.toString('base64')}`;
}

ipcMain.handle('pv-quick-add', async (e, data) => {
  // Only the Quick add window on the expected site may add characters.
  if (!isQuickAddUrl(e.senderFrame ? e.senderFrame.url : '')) return 'error';
  const str = (v, max) => String(v || '').slice(0, max);
  const payload = { name: str(data && data.name, 200), prompt: str(data && data.prompt, 4000), image: '' };
  if (!payload.name || !payload.prompt) return 'error';
  try { payload.image = await fetchAsDataUrl(str(data.image, 2000)); } catch { /* card without picture */ }
  const r = await tellPage(`PV.quickAddCharacter(${JSON.stringify(payload)})`);
  return r || 'error';
});

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
    // Quick add: the character list site, with a preload so injected buttons can talk to the app.
    if (frameName === 'pv-quick-add' && isQuickAddUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...searchWindowBounds(),
          title: 'Quick add characters',
          autoHideMenuBar: true,
          icon: path.join(__dirname, '..', 'build', 'icon.png'),
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'quickadd-preload.js') },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child, details) => {
    const quick = details.frameName === 'pv-quick-add';
    // Pop-ups from inside these windows go to the normal browser,
    // except the Quick add site's own search results, which stay in the window.
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (quick && isQuickAddUrl(url)) child.webContents.loadURL(url);
      else openExternal(url);
      return { action: 'deny' };
    });
    if (quick) {
      child.webContents.on('did-finish-load', () => {
        if (isQuickAddUrl(child.webContents.getURL())) child.webContents.executeJavaScript(QUICK_ADD_INJECT).catch(() => {});
      });
    }
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
