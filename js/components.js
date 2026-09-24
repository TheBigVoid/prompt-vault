'use strict';
// Shared UI pieces: thumbnails, item cards, the item editor and the item picker.
(function (PV) {
  const { S, esc, uid, splitTags, fmtW, openModal, confirmBox, toast, fileToThumb, compatLevel } = PV;

  function iconFor(it) {
    if (it.cat === 'lora') return '🧩';
    const c = PV.cat(it.cat);
    return c ? c.icon : '•';
  }

  function thumb(it, cls = 'thumb') {
    if (it && it.image) return `<img class="${cls}" src="${esc(it.image)}" alt="" loading="lazy" draggable="false">`;
    return `<div class="${cls} ph" aria-hidden="true">${esc(iconFor(it || {}))}</div>`;
  }

  function baseBadge(l, target) {
    if (!l.baseModel) return '';
    const lv = compatLevel(l.baseModel, target);
    const cls = lv === 0 ? 'bad' : lv === 1 ? 'warn' : '';
    const tip = lv === 0 ? 'Not compatible with ' + target : lv === 1 ? 'Same family as ' + target + ' — may work' : '';
    return `<span class="badge base ${cls}" title="${esc(tip)}">${esc(l.baseModel)}</span>`;
  }

  function card(it, { compact = false, picked = false } = {}) {
    const sub = it.cat === 'lora' ? (it.triggers || it.file || '') : it.prompt || '';
    const tags = (it.tags || []).slice(0, compact ? 2 : 4).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
    const linked = (it.loras || []).length ? `<span class="badge accent" title="Linked LoRAs">🧩 ${it.loras.length}</span>` : '';
    return `<article class="card ${compact ? 'compact' : ''} ${picked ? 'picked' : ''}" data-id="${esc(it.id)}" tabindex="0">
      <div class="card-media">${thumb(it)}
        <button class="fav-btn ${it.fav ? 'on' : ''}" data-act="fav" title="Favorite" aria-label="Favorite">★</button>
      </div>
      <div class="card-body">
        <div class="card-title" title="${esc(it.name)}">${esc(it.name)}</div>
        ${it.source ? `<div class="card-source" title="Source">${esc(it.source)}</div>` : ''}
        <div class="card-sub" title="${esc(sub)}">${esc(sub)}</div>
        <div class="card-tags">${it.cat === 'lora' ? baseBadge(it, S.builder.baseModel) : ''}${linked}${tags}</div>
      </div>
      ${compact ? '' : `<div class="card-actions">
        <button class="btn sm" data-act="to-builder" title="Add to the builder">＋ Builder</button>
        <button class="btn sm ghost" data-act="copy" title="Copy prompt">Copy</button>
      </div>`}
    </article>`;
  }

  // Reuse the existing spelling so "one piece" and "One Piece" group together.
  function canonicalSource(s) {
    if (!s) return '';
    return PV.sources().find((x) => x.toLowerCase() === s.toLowerCase()) || s;
  }

  // ---------- Item editor ----------
  function editItem(orig, { isNew = false, onSaved } = {}) {
    const it = structuredClone(orig);
    it.loras = it.loras || [];
    it.tags = it.tags || [];
    const isLora = it.cat === 'lora';
    const cats = S.settings.categories;
    const catName = isLora ? 'LoRA' : (PV.cat(it.cat) || { name: 'Item' }).name.replace(/s$/, '');
    const baseOpts = ['', ...S.settings.baseModels]
      .map((b) => `<option value="${esc(b)}" ${b === (it.baseModel || '') ? 'selected' : ''}>${b ? esc(b) : '— unknown —'}</option>`).join('');
    const typeOpts = PV.LORA_TYPES
      .map((t) => `<option value="${t}" ${t === (it.loraType || 'other') ? 'selected' : ''}>${t}</option>`).join('');

    const html = `
      <form class="editor" autocomplete="off">
        <div class="ed-head">
          <h3>${isNew ? 'New' : 'Edit'} ${esc(catName)}</h3>
          <button type="button" class="fav-btn inline ${it.fav ? 'on' : ''}" data-fav title="Favorite">★</button>
        </div>
        <div class="ed-grid">
          <div class="ed-img">
            <div class="drop" data-drop tabindex="0" title="Click, drop or paste an image">
              ${it.image ? `<img src="${esc(it.image)}" alt="">` : '<span>Drop, paste (Ctrl+V)<br>or click to add image</span>'}
            </div>
            <input type="file" accept="image/*" data-file hidden>
            <button type="button" class="btn sm ghost" data-rmimg ${it.image ? '' : 'hidden'}>Remove image</button>
          </div>
          <div class="ed-fields">
            <div class="row2">
              <label>Name<input class="input" name="name" value="${esc(it.name)}" required></label>
              <label title="Series, game or franchise. Used for sorting and filtering.">Source
                <input class="input" name="source" value="${esc(it.source || '')}" list="pv-sources" placeholder="Series / game, e.g. One Piece">
                <datalist id="pv-sources">${PV.sources().map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
            </div>
            ${isLora ? `
              <label>File name <small>(as ComfyUI lists it, e.g. <code>chars\\myChar_v2.safetensors</code>)</small>
                <input class="input mono" name="file" value="${esc(it.file || '')}"></label>
              <label>Trigger words<textarea class="input" name="triggers" rows="2">${esc(it.triggers || '')}</textarea></label>
              <div class="row3">
                <label>Default weight<input class="input" type="number" step="0.05" name="weight" value="${esc(fmtW(it.weight ?? 1))}"></label>
                <label>Base model<select class="input" name="baseModel">${baseOpts}</select></label>
                <label>Type<select class="input" name="loraType">${typeOpts}</select></label>
              </div>
              <label>Source URL<input class="input" name="url" value="${esc(it.url || '')}" placeholder="https://civitai.com/models/…"></label>
            ` : `
              <label>Category<select class="input" name="cat">${cats.map((c) => `<option value="${esc(c.id)}" ${c.id === it.cat ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
              <label>Prompt<textarea class="input" name="prompt" rows="4">${esc(it.prompt || '')}</textarea>
                <small class="hint"><code>{red|blue|green}</code> picks one at random · <code>__pose__</code> inserts a random item from a category</small></label>
              <label>Negative <small>(optional, added to the negative prompt)</small><textarea class="input" name="negative" rows="2">${esc(it.negative || '')}</textarea></label>
              <div class="linked">
                <div class="linked-head"><span>Linked LoRAs</span><small>auto-added to the builder with this item</small></div>
                <div data-links></div>
                <select class="input" data-addlink><option value="">＋ Link a LoRA…</option>${PV.loras().map((l) => `<option value="${esc(l.id)}">${esc(l.name)}${l.baseModel ? ' · ' + esc(l.baseModel) : ''}</option>`).join('')}</select>
              </div>
            `}
            <label>Tags<input class="input" name="tags" value="${esc(it.tags.join(', '))}" placeholder="comma, separated"></label>
            <label>Notes<textarea class="input" name="notes" rows="2">${esc(it.notes || '')}</textarea></label>
          </div>
        </div>
        <div class="modal-actions">
          ${isNew ? '' : '<button type="button" class="btn danger ghost" data-del>Delete</button><button type="button" class="btn ghost" data-dup>Duplicate</button>'}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>`;

    const m = openModal(html, { wide: true, dismissable: false });
    const el = m.el;
    const form = el.querySelector('form');
    const drop = el.querySelector('[data-drop]');
    const fileIn = el.querySelector('[data-file]');
    const rm = el.querySelector('[data-rmimg]');

    async function setImage(file) {
      if (!file || !PV.isImageFile(file)) return;
      try {
        it.image = await fileToThumb(file);
        drop.innerHTML = `<img src="${esc(it.image)}" alt="">`;
        rm.hidden = false;
      } catch (e) { toast('Could not read that image', 'err'); }
    }
    drop.addEventListener('click', () => fileIn.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    fileIn.addEventListener('change', () => setImage(fileIn.files[0]));
    drop.addEventListener('dragover', (e) => {
      if (!PV.dragHasImage(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('over');
      setImage(await PV.imageFromDrop(e.dataTransfer));
    });
    el.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData?.files || [])].find(PV.isImageFile);
      if (f) { e.preventDefault(); setImage(f); }
    });
    rm.addEventListener('click', () => { it.image = ''; drop.innerHTML = '<span>Drop, paste (Ctrl+V)<br>or click to add image</span>'; rm.hidden = true; });
    el.querySelector('[data-fav]').addEventListener('click', (e) => { it.fav = !it.fav; e.currentTarget.classList.toggle('on', it.fav); });

    const links = el.querySelector('[data-links]');
    function renderLinks() {
      if (!links) return;
      links.innerHTML = it.loras.map((l, i) => {
        const li = S.items.get(l.id);
        if (!li) return '';
        return `<div class="link-row">${thumb(li, 'mini')}<span class="grow">${esc(li.name)}</span>
          <input class="input w" type="number" step="0.05" value="${esc(fmtW(l.weight))}" data-lw="${i}" title="Weight">
          <button type="button" class="icon-btn" data-lrm="${i}" title="Unlink">✕</button></div>`;
      }).join('') || '<div class="muted small">None yet. Link a character LoRA here so it loads whenever you pick this item.</div>';
    }
    if (links) {
      renderLinks();
      links.addEventListener('input', (e) => { const i = e.target.dataset.lw; if (i != null) it.loras[i].weight = Number(e.target.value); });
      links.addEventListener('click', (e) => { const i = e.target.dataset.lrm; if (i != null) { it.loras.splice(i, 1); renderLinks(); } });
      el.querySelector('[data-addlink]').addEventListener('change', (e) => {
        const id = e.target.value;
        e.target.value = '';
        if (!id || it.loras.some((l) => l.id === id)) return;
        it.loras.push({ id, weight: S.items.get(id).weight ?? 1 });
        renderLinks();
      });
    }

    function readForm() {
      const fd = new FormData(form);
      it.name = String(fd.get('name') || '').trim();
      it.source = canonicalSource(String(fd.get('source') || '').trim());
      it.tags = splitTags(fd.get('tags'));
      it.notes = String(fd.get('notes') || '');
      if (isLora) {
        it.file = String(fd.get('file') || '').trim();
        it.triggers = String(fd.get('triggers') || '').trim();
        it.weight = Number(fd.get('weight')) || 1;
        it.baseModel = String(fd.get('baseModel') || '');
        it.loraType = String(fd.get('loraType') || 'other');
        it.url = String(fd.get('url') || '').trim();
      } else {
        it.cat = String(fd.get('cat'));
        it.prompt = String(fd.get('prompt') || '');
        it.negative = String(fd.get('negative') || '');
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      readForm();
      if (!it.name) { toast('Give it a name', 'err'); return; }
      await PV.saveItem(it);
      m.close();
      toast('Saved', 'ok');
      PV.emit('data');
      if (onSaved) onSaved(it);
    });
    const del = el.querySelector('[data-del]');
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmBox(`Delete "${it.name}"? This can't be undone.`))) return;
      await PV.deleteItem(it.id);
      m.close();
      toast('Deleted');
      PV.emit('data');
    });
    const dup = el.querySelector('[data-dup]');
    if (dup) dup.addEventListener('click', async () => {
      readForm();
      const copy = { ...structuredClone(it), id: uid(), name: it.name + ' (copy)', created: 0 };
      await PV.saveItem(copy);
      m.close();
      PV.emit('data');
      editItem(copy);
    });
  }

  function newItem(catId, extra = {}) {
    const base = { id: uid(), cat: catId, name: '', prompt: '', negative: '', tags: [], notes: '', image: '', fav: false, loras: [] };
    if (catId === 'lora') Object.assign(base, { file: '', triggers: '', weight: 1, baseModel: S.builder.baseModel || '', loraType: 'other', url: '' });
    return { ...base, ...extra };
  }

  // ---------- Picker ----------
  function openPicker(catId, { onPick, exclude = [], title } = {}) {
    const isLora = catId === 'lora';
    const c = PV.cat(catId);
    let q = '';
    let base = isLora ? S.builder.baseModel || '' : '';
    let favOnly = false;
    let source = '';
    const srcList = PV.sources(catId);
    const picked = new Set();
    const m = openModal(`
      <div class="picker">
        <div class="picker-head">
          <h3>${esc(title || (isLora ? '🧩 Add LoRA' : `${c.icon} Pick ${c.name}`))}</h3>
          <input class="input" type="search" placeholder="Search name, prompt, tags…" data-q>
          ${isLora ? `<select class="input" data-base><option value="">All base models</option>${S.settings.baseModels.map((b) => `<option ${b === base ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>` : ''}
          ${srcList.length ? `<select class="input" data-src><option value="">All sources</option>${srcList.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>` : ''}
          <label class="check"><input type="checkbox" data-fav> ★ only</label>
          <button class="btn" data-rand title="Pick a random one">🎲 Random</button>
          <button class="btn" data-new>＋ New</button>
        </div>
        <p class="muted small">Click to add · Shift+click to add several</p>
        <div class="grid picker-grid" data-grid></div>
        <div class="modal-actions"><button class="btn" data-close>Done</button></div>
      </div>`, { wide: true });
    const grid = m.el.querySelector('[data-grid]');

    function list() {
      const ql = q.toLowerCase();
      return PV.itemsIn(catId).filter((i) => {
        if (exclude.includes(i.id)) return false;
        if (favOnly && !i.fav) return false;
        if (source && (i.source || '') !== source) return false;
        if (base && i.baseModel && PV.compatLevel(i.baseModel, base) === 0) return false;
        if (!ql) return true;
        return [i.name, i.source, i.prompt, i.triggers, i.file, ...(i.tags || [])].join(' ').toLowerCase().includes(ql);
      }).sort((a, b) => (!a.source - !b.source) || (a.source || '').localeCompare(b.source || '') || a.name.localeCompare(b.name));
    }
    function render() {
      const arr = list();
      grid.innerHTML = arr.map((i) => card(i, { compact: true, picked: picked.has(i.id) })).join('') ||
        `<div class="empty small">Nothing here yet. ${isLora ? 'Scan your LoRA folder on the Import tab, or click ＋ New.' : 'Click ＋ New to add one.'}</div>`;
    }
    function choose(id, keepOpen) {
      if (picked.has(id)) return;
      picked.add(id);
      onPick(S.items.get(id));
      if (keepOpen) render();
      else m.close();
    }
    m.el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; render(); });
    const bs = m.el.querySelector('[data-base]');
    if (bs) bs.addEventListener('change', (e) => { base = e.target.value; render(); });
    m.el.querySelector('[data-fav]').addEventListener('change', (e) => { favOnly = e.target.checked; render(); });
    const ss = m.el.querySelector('[data-src]');
    if (ss) ss.addEventListener('change', (e) => { source = e.target.value; render(); });
    m.el.querySelector('[data-rand]').addEventListener('click', () => {
      const arr = list().filter((i) => !picked.has(i.id));
      if (!arr.length) return toast('Nothing to pick from');
      choose(PV.pick(arr).id, false);
    });
    m.el.querySelector('[data-new]').addEventListener('click', () => {
      m.close();
      editItem(newItem(catId), { isNew: true, onSaved: (it) => onPick(it) });
    });
    grid.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.card');
      if (!cardEl) return;
      if (e.target.closest('[data-act="fav"]')) {
        const it = S.items.get(cardEl.dataset.id);
        it.fav = !it.fav;
        PV.saveItem(it);
        render();
        return;
      }
      choose(cardEl.dataset.id, e.shiftKey || e.ctrlKey);
    });
    grid.addEventListener('keydown', (e) => {
      const cardEl = e.target.closest('.card');
      if (cardEl && e.key === 'Enter') choose(cardEl.dataset.id, e.shiftKey);
    });
    render();
  }

  Object.assign(PV, { thumb, card, baseBadge, editItem, newItem, openPicker, iconFor });
})(window.PV);
