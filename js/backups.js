'use strict';
// Automatic backups. Desktop: JSON files in a normal folder (Documents\Prompt Vault Backups
// by default), made on start, every 2 hours if something changed, and before updates.
// Web: a reminder to export, since browsers can't save files on their own.
(function (PV) {
  const { S, esc, toast, timeAgo } = PV;
  const ic = (n, z) => PV.icon(n, z);
  const desk = window.pvDesktop && window.pvDesktop.backup ? window.pvDesktop.backup : null;

  const HOUR = 3600000;
  const B = { folder: '', list: [], lastTime: 0, lastPrint: null, paused: false, busy: false };

  // Changes whenever an item or preset is added, removed or edited.
  function fingerprint() {
    let m = 0;
    for (const i of S.items.values()) m = Math.max(m, i.updated || 0);
    for (const p of S.presets) m = Math.max(m, p.updated || 0);
    return `${S.items.size}|${S.presets.length}|${m}`;
  }

  async function refreshList() {
    if (!desk) return;
    try {
      const r = await desk.list();
      B.folder = r.folder;
      B.list = r.backups;
    } catch (e) { /* folder unavailable; shown in the panel */ }
    renderPanel();
  }

  async function backupNow(kind = 'auto') {
    if (!desk || B.busy) return null;
    B.busy = true;
    try {
      const r = await desk.write(kind, PV.exportAll());
      B.lastTime = Date.now();
      B.lastPrint = fingerprint();
      await refreshList();
      return r;
    } catch (e) {
      toast(`Backup failed: ${e.message}`, 'err', 6000);
      return null;
    } finally {
      B.busy = false;
    }
  }

  // ---------- Restore ----------
  async function restore(name) {
    const b = B.list.find((x) => x.name === name);
    const what = b && b.summary ? `${b.summary.characters} characters, ${b.summary.items} items` : 'this backup';
    const ok = await PV.confirmBox(`Replace your current library with the backup from ${b ? new Date(b.time).toLocaleString() : name} (${what})? Your current library is backed up first, so you can undo this.`, 'Restore', false);
    if (!ok) return false;
    await backupNow('before-restore');
    try {
      const data = JSON.parse(await desk.read(name));
      await PV.importAll(data, 'replace');
      PV.applyTheme();
      PV.emit('data');
      B.paused = false;
      B.lastPrint = fingerprint();
      toast('Library restored', 'ok', 4000);
      return true;
    } catch (e) {
      toast(`Restore failed: ${e.message}`, 'err', 6000);
      return false;
    }
  }

  // ---------- Safety net ----------
  // If the library is suddenly much smaller than the newest backup, something went wrong:
  // don't back up the damaged state, offer to restore instead.
  function looksShrunk(sum) {
    if (!sum) return false;
    const chars = [...S.items.values()].filter((i) => i.cat === 'character').length;
    return (sum.items >= 10 && S.items.size < sum.items * 0.5) || (sum.characters >= 5 && chars < sum.characters * 0.5);
  }

  function askRestore(b) {
    const chars = [...S.items.values()].filter((i) => i.cat === 'character').length;
    const m = PV.openModal(`
      <h3>${ic('alert', 20)} Your library looks smaller than your last backup</h3>
      <p class="muted">Now: <b>${chars} characters, ${S.items.size} items</b>.<br>
        Backup from ${esc(new Date(b.time).toLocaleString())}: <b>${b.summary.characters} characters, ${b.summary.items} items</b>.</p>
      <p class="muted small" style="margin-top:8px">If you deleted things on purpose, keep your current library. Otherwise restore the backup.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-keep>Keep current library</button>
        <button class="btn grad" data-restore>${ic('refresh', 16)} Restore backup</button>
      </div>`, { dismissable: false });
    m.el.querySelector('[data-keep]').onclick = () => { m.close(); B.paused = false; backupNow('auto'); };
    m.el.querySelector('[data-restore]').onclick = async () => { m.close(); if (!(await restore(b.name))) askRestore(b); };
  }

  // ---------- Schedule ----------
  async function start() {
    if (!desk) { webReminder(); return; }
    await refreshList();
    const newest = B.list.find((b) => b.summary);
    if (newest && looksShrunk(newest.summary)) {
      B.paused = true;
      askRestore(newest);
    } else {
      const lastAuto = B.list.find((b) => b.kind === 'auto');
      B.lastTime = lastAuto ? lastAuto.time : 0;
      if (!lastAuto || Date.now() - lastAuto.time > HOUR) await backupNow('auto');
    }
    setInterval(() => {
      if (B.paused || B.busy) return;
      if (fingerprint() !== B.lastPrint && Date.now() - B.lastTime >= 2 * HOUR) backupNow('auto');
    }, 10 * 60 * 1000);
  }

  // Called by the updater before installing.
  const beforeUpdate = () => (B.paused ? Promise.resolve(null) : backupNow('before-update'));

  // ---------- Web version ----------
  const LAST_EXPORT = 'pv.lastExport';
  function exportDownload() {
    PV.download(`prompt-vault-backup-${new Date().toISOString().slice(0, 10)}.json`, PV.exportAll());
    try { localStorage.setItem(LAST_EXPORT, String(Date.now())); } catch (e) { /* ignore */ }
    if (desk) backupNow('manual');
  }
  function webReminder() {
    let last = 0;
    try { last = Number(localStorage.getItem(LAST_EXPORT)) || 0; } catch (e) { /* ignore */ }
    if (S.items.size > 20 && Date.now() - last > 7 * 24 * HOUR) {
      setTimeout(() => toast(`Tip: export a backup (Import → Export backup). Last one: ${last ? timeAgo(last) : 'never'}`, 'info', 7000), 2500);
    }
  }

  // ---------- Settings panel ----------
  const KIND_LABEL = { auto: 'Automatic', manual: 'Manual', 'before-update': 'Before update', 'before-restore': 'Before restore' };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const mb = (n) => (n / 1048576 >= 0.1 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  function renderPanel(el = document.querySelector('#view-settings [data-backups]')) {
    if (!el) return;
    if (!desk) {
      el.innerHTML = `<p class="muted">The browser version can't save backup files by itself, so export one now and then. The desktop app backs up automatically.</p>
        <div class="row" style="margin-top:10px"><button class="btn grad" data-bk-export>${ic('download', 16)} Export backup</button></div>`;
      return;
    }
    const rows = B.list.slice(0, 15).map((b) => `
      <div class="bk-row">
        <span class="bk-kind ${b.kind}">${esc(KIND_LABEL[b.kind] || b.kind)}</span>
        <span class="grow"><b>${esc(new Date(b.time).toLocaleString())}</b> <span class="muted small">${esc(timeAgo(b.time))}</span><br>
          <span class="muted small">${b.summary ? `${plural(b.summary.characters, 'character')} · ${plural(b.summary.items, 'item')} · ${plural(b.summary.presets, 'preset')} · ` : ''}${mb(b.size)}</span></span>
        <button class="btn sm" data-bk-restore="${esc(b.name)}">${ic('refresh', 14)} Restore</button>
      </div>`).join('');
    el.innerHTML = `
      <p class="muted">Your whole library is saved to a file when the app starts, every 2 hours while you work, and before every update.
        Recent backups are kept, plus one per day for a month. Manual backups are never deleted.</p>
      <div class="bk-folder"><span class="muted small">Folder</span><code title="${esc(B.folder)}">${esc(B.folder || '…')}</code></div>
      <div class="row">
        <button class="btn grad" data-bk-now ${B.busy ? 'disabled' : ''}>${ic('save', 16)} Back up now</button>
        <button class="btn" data-bk-open>${ic('folder', 16)} Open folder</button>
        <button class="btn ghost" data-bk-choose>${ic('pencil', 16)} Change folder…</button>
      </div>
      <div class="bk-list">${rows || '<div class="empty small">No backups yet.</div>'}</div>
      ${B.list.length > 15 ? `<p class="muted small">…and ${B.list.length - 15} older backups in the folder.</p>` : ''}`;
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-bk-now],[data-bk-open],[data-bk-choose],[data-bk-restore],[data-bk-export]');
    if (!t) return;
    if (t.matches('[data-bk-export]')) exportDownload();
    else if (t.matches('[data-bk-now]')) { if (await backupNow('manual')) toast('Backup saved', 'ok'); }
    else if (t.matches('[data-bk-open]')) desk.openFolder();
    else if (t.matches('[data-bk-choose]')) { const f = await desk.chooseFolder(); if (f) { toast('Backups will be saved there from now on', 'ok'); await backupNow('manual'); } }
    else if (t.matches('[data-bk-restore]')) restore(t.dataset.bkRestore);
  });

  PV.backups = { start, backupNow, beforeUpdate, exportDownload, renderPanel, restore, state: B, desktop: !!desk };
})(window.PV);
