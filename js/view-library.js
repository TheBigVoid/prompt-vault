'use strict';
(function (PV) {
  const { S, esc, toast, copyText, card } = PV;

  const LS_KEY = 'pv.library';
  let st = { cat: 'character', q: '', tag: '', sort: 'name', base: '', source: '' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  const remember = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ cat: st.cat, sort: st.sort })); } catch (e) { /* ignore */ } };

  let root;

  function pool() {
    const all = [...S.items.values()];
    if (st.cat === '__all') return all;
    if (st.cat === '__fav') return all.filter((i) => i.fav);
    return all.filter((i) => i.cat === st.cat);
  }

  function filtered() {
    const q = st.q.toLowerCase();
    let arr = pool().filter((i) => {
      if (st.tag && !(i.tags || []).includes(st.tag)) return false;
      if (st.base && i.cat === 'lora' && i.baseModel !== st.base) return false;
      if (st.source && (i.source || '') !== st.source) return false;
      if (!q) return true;
      return [i.name, i.source, i.prompt, i.triggers, i.file, i.notes, ...(i.tags || [])].join(' ').toLowerCase().includes(q);
    });
    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name),
      // items without a source go last
      source: (a, b) => (!a.source - !b.source) || (a.source || '').localeCompare(b.source || '') || a.name.localeCompare(b.name),
      newest: (a, b) => (b.created || 0) - (a.created || 0),
      used: (a, b) => (b.used || 0) - (a.used || 0) || a.name.localeCompare(b.name),
      recent: (a, b) => (b.lastUsed || 0) - (a.lastUsed || 0),
    };
    return arr.sort(sorters[st.sort] || sorters.name);
  }

  // "By source" sort shows a header above each group.
  function renderCards(list) {
    if (st.sort !== 'source') return list.map((i) => card(i)).join('');
    let last = null;
    let out = '';
    for (const i of list) {
      const src = i.source || '';
      if (src !== last) {
        const n = list.filter((x) => (x.source || '') === src).length;
        out += `<h3 class="group-head">${src ? esc(src) : '<span class="muted">No source</span>'} <small class="muted">${n}</small></h3>`;
        last = src;
      }
      out += card(i);
    }
    return out;
  }

  function sideBtn(id, icon, name, count) {
    return `<button class="side-btn ${st.cat === id ? 'on' : ''}" data-cat="${esc(id)}"><span>${esc(icon)} ${esc(name)}</span><small>${count}</small></button>`;
  }

  function render() {
    if (st.cat !== '__all' && st.cat !== '__fav' && st.cat !== 'lora' && !PV.cat(st.cat)) st.cat = S.settings.categories[0]?.id || 'lora';
    const all = [...S.items.values()];
    const cnt = (id) => all.filter((i) => i.cat === id).length;
    const tagCounts = {};
    pool().forEach((i) => (i.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 40);
    const list = filtered();
    const srcList = PV.sources(st.cat.startsWith('__') ? '' : st.cat);
    if (st.source && !srcList.includes(st.source)) st.source = '';
    const isLoraCat = st.cat === 'lora';
    const canAdd = st.cat !== '__all' && st.cat !== '__fav';
    const title = st.cat === '__all' ? 'Everything' : st.cat === '__fav' ? 'Favorites' : isLoraCat ? 'LoRAs' : PV.cat(st.cat).name;

    root.innerHTML = `
      <div class="lib">
        <nav class="lib-side" aria-label="Categories">
          ${sideBtn('__all', '📚', 'Everything', all.length)}
          ${sideBtn('__fav', '★', 'Favorites', all.filter((i) => i.fav).length)}
          <div class="side-sep"></div>
          ${sideBtn('lora', '🧩', 'LoRAs', cnt('lora'))}
          ${S.settings.categories.map((c) => sideBtn(c.id, c.icon, c.name, cnt(c.id))).join('')}
        </nav>
        <div class="lib-main">
          <div class="toolbar">
            <h2 class="tb-title">${esc(title)} <small class="muted">${list.length}</small></h2>
            <input class="input grow" type="search" placeholder="Search…" data-q value="${esc(st.q)}">
            ${isLoraCat ? `<select class="input" data-base><option value="">All base models</option>${S.settings.baseModels.map((b) => `<option ${b === st.base ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>` : ''}
            ${srcList.length ? `<select class="input" data-source><option value="">All sources</option>${srcList.map((s) => `<option value="${esc(s)}" ${s === st.source ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
            <select class="input" data-sort>
              ${[['name', 'A → Z'], ['source', 'By source'], ['newest', 'Newest'], ['used', 'Most used'], ['recent', 'Recently used']].map(([v, l]) => `<option value="${v}" ${v === st.sort ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            ${canAdd ? `<button class="btn primary" data-act="new">＋ New ${isLoraCat ? 'LoRA' : ''}</button>` : ''}
          </div>
          ${tags.length ? `<div class="tag-bar">${tags.map(([t, n]) => `<button class="tag ${st.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)} <small>${n}</small></button>`).join('')}</div>` : ''}
          <div class="grid" data-grid>
            ${renderCards(list) || `<div class="empty">
              ${st.q || st.tag || st.source ? 'No matches.' : isLoraCat
                ? 'No LoRAs yet. Go to <a href="#import">Import</a> and scan your Stability Matrix LoRA folder, or add one by hand.'
                : 'Empty. Click ＋ New to add your first one.'}</div>`}
          </div>
        </div>
      </div>`;
  }

  function onClick(e) {
    const side = e.target.closest('[data-cat]');
    if (side && side.classList.contains('side-btn')) {
      st.cat = side.dataset.cat;
      st.tag = '';
      st.base = '';
      st.source = '';
      remember();
      render();
      return;
    }
    const tag = e.target.closest('[data-tag]');
    if (tag) { st.tag = st.tag === tag.dataset.tag ? '' : tag.dataset.tag; render(); return; }
    if (e.target.closest('[data-act="new"]')) {
      PV.editItem(PV.newItem(st.cat), { isNew: true });
      return;
    }
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    const it = S.items.get(cardEl.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'imgsearch') {
      PV.openImageSearch(it.name, it.source);
    } else if (act === 'fav') {
      it.fav = !it.fav;
      PV.saveItem(it);
      render();
    } else if (act === 'to-builder') {
      PV.builderView.addItemToBuilder(it);
    } else if (act === 'copy') {
      copyText(it.cat === 'lora' ? (it.triggers || it.file || it.name) : it.prompt);
    } else {
      PV.editItem(it);
    }
  }

  // ---------- Drag images in (e.g. from Pinterest) ----------
  // Onto a card: sets its picture. Onto empty space: new item in this category.
  let highlighted = null;
  function highlight(el) {
    if (highlighted === el) return;
    if (highlighted) highlighted.classList.remove('drop-target');
    highlighted = el;
    if (el) el.classList.add('drop-target');
  }
  const dropTarget = (e) => e.target.closest('.card') || e.target.closest('.lib-main');

  function onDragOver(e) {
    if (!PV.dragHasImage(e) || !dropTarget(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    const t = dropTarget(e);
    highlight(t.classList.contains('card') ? t : root.querySelector('[data-grid]'));
  }

  async function onDrop(e) {
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    highlight(null);
    const blob = await PV.imageFromDrop(e.dataTransfer);
    if (!blob) return;
    let image;
    try { image = await PV.fileToThumb(blob); } catch (err) { toast('Could not read that image', 'err'); return; }
    if (t.classList.contains('card')) {
      const it = S.items.get(t.dataset.id);
      it.image = image;
      await PV.saveItem(it);
      toast(`Picture set for "${it.name}"`, 'ok');
      render();
    } else {
      const catId = st.cat.startsWith('__') ? S.settings.categories[0]?.id || 'character' : st.cat;
      PV.editItem(PV.newItem(catId, { image, source: st.source || '' }), { isNew: true });
    }
  }

  function mount(el) {
    root = el;
    root.addEventListener('click', onClick);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) highlight(null); });
    root.addEventListener('drop', onDrop);
    root.addEventListener('keydown', (e) => {
      const c = e.target.closest('.card');
      if (c && e.key === 'Enter' && e.target === c) PV.editItem(S.items.get(c.dataset.id));
    });
    root.addEventListener('input', (e) => {
      if (e.target.matches('[data-q]')) {
        st.q = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const q = root.querySelector('[data-q]');
        q.focus();
        q.setSelectionRange(pos, pos);
      } else if (e.target.matches('[data-sort]')) { st.sort = e.target.value; remember(); render(); }
      else if (e.target.matches('[data-base]')) { st.base = e.target.value; render(); }
      else if (e.target.matches('[data-source]')) { st.source = e.target.value; render(); }
    });
    render();
  }

  PV.libraryView = { mount, render, showCat: (c) => { st.cat = c; st.tag = ''; remember(); } };
})(window.PV);
