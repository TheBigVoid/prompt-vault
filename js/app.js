'use strict';
(function (PV) {
  const { $, $$, S } = PV;

  const VIEWS = {
    builder: () => PV.builderView,
    library: () => PV.libraryView,
    presets: () => PV.presetsView,
    history: () => PV.historyView,
    import: () => PV.importView,
    settings: () => PV.settingsView,
  };
  const mounted = {};
  let current = null;

  function route() {
    const name = (location.hash || '#builder').slice(1).split('?')[0];
    const key = VIEWS[name] ? name : 'builder';
    current = key;
    $('#modal-root').innerHTML = '';
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + key; });
    $$('.nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + key));
    const view = VIEWS[key]();
    const el = $('#view-' + key);
    if (!mounted[key]) { view.mount(el); mounted[key] = true; } else view.render();
    window.scrollTo(0, 0);
  }

  function applyTheme() {
    const t = S.settings.theme || 'system';
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  PV.applyTheme = applyTheme;

  // Re-render the visible view whenever data changes.
  PV.on('data', () => { if (current) VIEWS[current]().render(); });

  function isTyping(e) {
    const t = e.target;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  async function init() {
    try {
      await PV.load();
    } catch (e) {
      document.body.innerHTML = `<div class="fatal"><h2>Couldn't open the browser database</h2><p>${PV.esc(e.message || e)}</p>
        <p>Private/incognito windows and some strict privacy settings block local storage. Try a normal window.</p></div>`;
      return;
    }
    applyTheme();
    window.addEventListener('hashchange', route);
    route();

    document.addEventListener('keydown', (e) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      if ((e.key === 'r' || e.key === 'R') && current === 'builder') { e.preventDefault(); PV.builderView.randomize(); }
    });

    // Drop a ComfyUI PNG anywhere -> read its prompt on the Import tab.
    let dragDepth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      if (document.querySelector('.modal-backdrop')) return;
      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      if (current !== 'import') { location.hash = '#import'; route(); }
      PV.importView.onImages(files);
    });

    $('#theme-toggle').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      S.settings.theme = dark ? 'light' : 'dark';
      PV.saveSettings();
      applyTheme();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.PV);
