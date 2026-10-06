'use strict';
// Auto-update UI for the desktop app (the web version is always up to date).
(function (PV) {
  const { esc } = PV;
  const desk = window.pvDesktop || null;
  const U = { desktop: !!desk, version: '', state: 'idle', newVersion: '', percent: 0, message: '' };

  function statusText() {
    switch (U.state) {
      case 'checking': return 'Checking for updates…';
      case 'latest': return 'You have the latest version.';
      case 'downloading': return `Downloading version ${U.newVersion}… ${U.percent}%`;
      case 'ready': return `Version ${U.newVersion} is ready. Restart to install it.`;
      case 'error': return `Couldn't check for updates (${U.message}). It will try again later.`;
      case 'dev': return 'Running from source, so updates are off.';
      default: return 'Updates are checked automatically when the app starts.';
    }
  }

  // Card at the bottom of the sidebar while downloading / when ready.
  function renderBanner() {
    const el = document.getElementById('update-banner');
    if (!el) return;
    if (U.state === 'downloading') {
      el.hidden = false;
      el.className = 'update-banner';
      el.innerHTML = `<div class="ub-row">${PV.icon('download', 16)}<span class="ub-text">Downloading update ${esc(U.newVersion)}</span><b>${U.percent}%</b></div>
        <div class="ub-bar"><span style="width:${U.percent}%"></span></div>`;
    } else if (U.state === 'ready') {
      el.hidden = false;
      el.className = 'update-banner ready';
      el.innerHTML = `<div class="ub-row">${PV.icon('sparkles', 16)}<span class="ub-text">Version ${esc(U.newVersion)} is ready</span></div>
        <button class="btn grad block sm" data-update-install title="Restart Prompt Vault to install version ${esc(U.newVersion)}">${PV.icon('refresh', 14)}<span class="ub-text">Restart to update</span></button>`;
    } else {
      el.hidden = true;
    }
  }

  // "About & updates" box in Settings.
  function renderAbout(el) {
    if (!el) return;
    if (!U.desktop) {
      el.innerHTML = `<p class="muted">You're using the web version, which is always the newest. The desktop app updates itself automatically.</p>`;
      return;
    }
    const busy = U.state === 'checking' || U.state === 'downloading';
    el.innerHTML = `
      <div class="about-row">
        <img src="build/icon.png" alt="" class="about-logo">
        <div class="grow"><b>Prompt Vault ${esc(U.version)}</b><div class="muted small" data-update-status>${esc(statusText())}</div></div>
        ${U.state === 'ready'
          ? `<button class="btn grad" data-update-install>${PV.icon('refresh', 16)} Restart to update</button>`
          : `<button class="btn" data-update-check ${busy || U.state === 'dev' ? 'disabled' : ''}>${PV.icon('refresh', 16)} Check for updates</button>`}
      </div>
      ${U.state === 'downloading' ? `<div class="ub-bar big"><span style="width:${U.percent}%"></span></div>` : ''}
      <p class="muted small" style="margin-top:10px">New versions download in the background and install when you restart or close the app. Your library isn't touched by updates.
        <a href="https://github.com/TheBigVoid/prompt-vault/releases" target="_blank" rel="noopener">See what's new</a></p>`;
  }

  function refresh() {
    renderBanner();
    renderAbout(document.querySelector('#view-settings [data-about]'));
  }

  function onUpdate(msg) {
    const prev = U.state;
    U.state = msg.state || 'idle';
    if (msg.version) U.newVersion = msg.version;
    if (typeof msg.percent === 'number') U.percent = msg.percent;
    U.message = msg.message || '';
    if (U.state === 'ready' && prev !== 'ready') PV.toast(`Update ${U.newVersion} downloaded. Restart when you're ready`, 'ok', 6000);
    refresh();
  }

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-update-install]')) {
      PV.toast('Restarting to install the update…');
      await desk.installUpdate();
    } else if (e.target.closest('[data-update-check]')) {
      U.state = 'checking';
      refresh();
      const r = await desk.checkForUpdates();
      if (r) onUpdate(r);
    }
  });

  async function init() {
    if (!desk) return;
    U.version = (await desk.version()) || '';
    desk.onUpdate(onUpdate);
    refresh();
  }

  PV.updates = { init, renderAbout, state: U };
})(window.PV);
