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
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); PV.randomCharacter(); }
    });

    // Drop zones (image pickers, library cards, Import box) handle their own drops.
    // Anything dropped elsewhere is ignored instead of the page opening the file.
    window.addEventListener('dragover', (e) => {
      if (!PV.dragHasImage(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    });
    window.addEventListener('drop', (e) => { if (PV.dragHasImage(e)) e.preventDefault(); });

    $('#rand-char').addEventListener('click', () => PV.randomCharacter());

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
