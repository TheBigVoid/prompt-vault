'use strict';
// Automatic library backups for the desktop app.
// Backups are plain JSON files (the same format as "Export backup") in a normal
// folder, so they survive anything that happens to the app's own database.
const { app, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const KINDS = ['auto', 'manual', 'before-update', 'before-restore'];
const configFile = () => path.join(app.getPath('userData'), 'backup-config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}
function folder() {
  const dir = readConfig().folder || path.join(app.getPath('documents'), 'Prompt Vault Backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};
const NAME_RE = /^prompt-vault-(auto|manual|before-update|before-restore)-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-\d+)?\.json$/;

// Summary sits near the start of the file, so listing only reads the first few KB.
function readSummary(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const m = buf.toString('utf8', 0, n).match(/"summary":(\{[^{}]*\})/);
    return m ? JSON.parse(m[1]) : null;
  } catch { return null; }
}

function list() {
  const dir = folder();
  return fs.readdirSync(dir)
    .map((name) => {
      const m = name.match(NAME_RE);
      if (!m) return null;
      const full = path.join(dir, name);
      const time = new Date(+m[2], m[3] - 1, +m[4], +m[5], +m[6], +m[7]).getTime();
      return { name, kind: m[1], time, size: fs.statSync(full).size, summary: readSummary(full) };
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);
}

// Keep: the 10 newest automatic backups, then one per day for 30 days.
// "before-update" and "before-restore": the 5 newest each. Manual backups: never deleted.
function prune() {
  const all = list();
  const drop = [];
  const autos = all.filter((b) => b.kind === 'auto');
  const days = new Set();
  autos.forEach((b, i) => {
    const day = new Date(b.time).toDateString();
    const ageDays = (Date.now() - b.time) / 86400000;
    if (i < 10) { days.add(day); return; }
    if (ageDays <= 30 && !days.has(day)) { days.add(day); return; }
    drop.push(b);
  });
  for (const kind of ['before-update', 'before-restore']) drop.push(...all.filter((b) => b.kind === kind).slice(5));
  for (const b of drop) { try { fs.unlinkSync(path.join(folder(), b.name)); } catch { /* ignore */ } }
}

function safePath(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new Error('bad backup name');
  return path.join(folder(), name);
}

function setup(fromApp, getWin) {
  const guard = (fn) => async (e, ...args) => { if (!fromApp(e)) throw new Error('not allowed'); return fn(...args); };

  ipcMain.handle('pv-backup-write', guard((kind, json) => {
    if (!KINDS.includes(kind) || typeof json !== 'string' || !json.startsWith('{"app":"prompt-vault"')) throw new Error('bad backup');
    let name = `prompt-vault-${kind}-${stamp()}.json`;
    for (let i = 2; fs.existsSync(path.join(folder(), name)); i++) name = `prompt-vault-${kind}-${stamp()}-${i}.json`;
    const tmp = path.join(folder(), name + '.tmp');
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, path.join(folder(), name)); // never leave a half-written backup
    prune();
    return { name, folder: folder() };
  }));
  ipcMain.handle('pv-backup-list', guard(() => ({ folder: folder(), backups: list() })));
  ipcMain.handle('pv-backup-read', guard((name) => fs.readFileSync(safePath(name), 'utf8')));
  ipcMain.handle('pv-backup-open', guard(() => shell.openPath(folder())));
  ipcMain.handle('pv-backup-choose', guard(async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Choose a folder for Prompt Vault backups', defaultPath: folder(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    writeConfig({ ...readConfig(), folder: r.filePaths[0] });
    return folder();
  }));
}

module.exports = { setup };
