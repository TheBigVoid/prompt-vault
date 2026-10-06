'use strict';
// Ctrl+K quick search: jump anywhere, find any item, run any action.
(function (PV) {
  const { S, esc } = PV;
  const ic = (n, z) => PV.icon(n, z);

  function actions() {
    const go = (hash) => () => { location.hash = hash; };
    return [
      { icon: 'dice', title: 'Randomize all', sub: 'Builder', run: () => { location.hash = '#builder'; setTimeout(() => PV.builderView.randomize(), 50); } },
      { icon: 'user', title: 'Random character', sub: 'Pick a random character + outfit', run: () => setTimeout(PV.randomCharacter, 30) },
      { icon: 'plus', title: 'New character', sub: 'Library', run: () => PV.editItem(PV.newItem('character'), { isNew: true }) },
      { icon: 'wand', title: 'Go to Builder', run: go('#builder') },
      { icon: 'library', title: 'Go to Library', run: go('#library') },
      { icon: 'bookmark', title: 'Go to Presets', run: go('#presets') },
      { icon: 'history', title: 'Go to History', run: go('#history') },
      { icon: 'download', title: 'Go to Import', sub: 'LoRA folder, images, backups', run: go('#import') },
      { icon: 'settings', title: 'Go to Settings', run: go('#settings') },
      { icon: 'moon', title: 'Toggle light / dark', run: () => document.getElementById('theme-toggle').click() },
      { icon: 'save', title: 'Export backup', sub: 'Download your whole library as .json', run: () => PV.download(`prompt-vault-backup-${new Date().toISOString().slice(0, 10)}.json`, PV.exportAll()) },
    ];
  }

  const catName = (it) => (it.cat === 'lora' ? 'LoRA' : (PV.cat(it.cat) || { name: '' }).name.replace(/s$/, ''));

  function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (hay) => words.every((w) => hay.includes(w));
    const score = (name) => (name.toLowerCase().startsWith(words[0] || '') ? 0 : 1);
    // actions match from the start of a word ("ran" -> Randomize), so short queries don't flood the list
    const wordHit = (hay) => words.every((w) => hay.split(/[\s/+]+/).some((x) => x.startsWith(w)));
    const acts = actions().filter((a) => !words.length || wordHit(`${a.title} ${a.sub || ''}`.toLowerCase()));
    let items = [...S.items.values()];
    if (words.length) {
      items = items.filter((i) => hit([i.name, i.source, catName(i), i.prompt, i.triggers, ...(i.tags || []), ...PV.variantsOf(i).map((v) => v.name)].join(' ').toLowerCase()))
        .sort((a, b) => score(a.name) - score(b.name) || (b.fav - a.fav) || a.name.localeCompare(b.name));
    } else {
      items = items.filter((i) => i.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed);
    }
    const presets = S.presets.filter((p) => words.length && hit(`${p.name} ${p.positive || ''}`.toLowerCase()));
    const actGroup = { group: words.length ? 'Actions' : 'Quick actions', rows: (words.length ? acts : acts.slice(0, 5)).map((a) => ({ type: 'action', a })) };
    const itemGroup = { group: words.length ? 'Library' : 'Recently used', rows: items.slice(0, 30).map((it) => ({ type: 'item', it })) };
    const presetGroup = { group: 'Presets', rows: presets.slice(0, 8).map((p) => ({ type: 'preset', p })) };
    // while typing, your stuff comes first
    return (words.length ? [itemGroup, presetGroup, actGroup] : [actGroup, itemGroup]).filter((g) => g.rows.length);
  }

  function rowHtml(r, i) {
    if (r.type === 'action') {
      return `<div class="palette-item" data-i="${i}"><span class="pi-icon">${ic(r.a.icon, 17)}</span>
        <span class="pi-text"><b>${esc(r.a.title)}</b>${r.a.sub ? `<small>${esc(r.a.sub)}</small>` : ''}</span><span class="pi-hint">Run ${ic('arrow', 13)}</span></div>`;
    }
    if (r.type === 'preset') {
      return `<div class="palette-item" data-i="${i}"><span class="pi-icon">${ic('bookmark', 17)}</span>
        <span class="pi-text"><b>${esc(r.p.name)}</b><small>${esc(r.p.positive || '')}</small></span><span class="pi-hint">Load ${ic('arrow', 13)}</span></div>`;
    }
    const it = r.it;
    const sub = [catName(it), it.source, PV.variantsOf(it).length ? `${PV.variantsOf(it).length} outfits` : ''].filter(Boolean).join(' · ');
    return `<div class="palette-item" data-i="${i}">${PV.thumb(it, 'mini')}
      <span class="pi-text"><b>${esc(it.name)}</b><small>${esc(sub)}</small></span>
      <span class="pi-hint">Add to Builder <kbd>↵</kbd> · Edit <kbd>Shift ↵</kbd></span></div>`;
  }

  function openPalette() {
    if (document.querySelector('.palette')) return;
    const m = PV.openModal(`
      <div class="palette-search">${ic('search', 20)}<input data-q placeholder="Search characters, outfits, LoRAs, presets, actions…" autocomplete="off"><kbd>Esc</kbd></div>
      <div class="palette-list" data-list></div>
      <div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open / add</span><span><kbd>Shift ↵</kbd> edit</span></div>`);
    m.el.classList.add('palette');
    m.el.parentElement.classList.add('palette-backdrop');
    const input = m.el.querySelector('[data-q]');
    const listEl = m.el.querySelector('[data-list]');
    let flat = [];
    let sel = 0;

    function render() {
      const groups = search(input.value.trim());
      flat = [];
      listEl.innerHTML = groups.map((g) => `<div class="palette-group">${esc(g.group)}</div>${g.rows.map((r) => { flat.push(r); return rowHtml(r, flat.length - 1); }).join('')}`).join('')
        || `<div class="palette-empty">Nothing found for “${esc(input.value)}”.</div>`;
      sel = Math.min(sel, Math.max(0, flat.length - 1));
      highlight();
    }
    function highlight() {
      listEl.querySelectorAll('.palette-item').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === sel));
      const on = listEl.querySelector('.palette-item.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function run(i, edit) {
      const r = flat[i];
      if (!r) return;
      m.close();
      if (r.type === 'action') r.a.run();
      else if (r.type === 'preset') {
        PV.builderView.loadSnapshot(r.p.builder);
        if (location.hash === '#builder') PV.builderView.render(); else location.hash = '#builder';
        PV.toast(`Loaded "${r.p.name}"`, 'ok');
      } else if (edit) PV.editItem(r.it);
      else {
        PV.builderView.addItemToBuilder(r.it);
        if (location.hash === '#builder') PV.builderView.render();
      }
    }

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(flat.length - 1, sel + 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel, e.shiftKey); }
    });
    listEl.addEventListener('mousemove', (e) => {
      const row = e.target.closest('.palette-item');
      if (row && Number(row.dataset.i) !== sel) { sel = Number(row.dataset.i); highlight(); }
    });
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('.palette-item');
      if (row) run(Number(row.dataset.i), e.shiftKey);
    });
    render();
    setTimeout(() => input.focus(), 40);
  }

  PV.openPalette = openPalette;
})(window.PV);
