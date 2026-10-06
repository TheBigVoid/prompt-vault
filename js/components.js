'use strict';
// Shared UI pieces: thumbnails, item cards, the item editor and the item picker.
(function (PV) {
  const { S, esc, uid, splitTags, fmtW, openModal, confirmBox, toast, fileToThumb, compatLevel } = PV;
  const ic = (n, s) => PV.icon(n, s);

  function iconFor(it) {
    if (it.cat === 'lora') return '🧩';
    const c = PV.cat(it.cat);
    return c ? c.icon : '•';
  }
  const colorOf = (it) => PV.catColor(it && it.cat);
  const isPortrait = (it) => it && it.cat === 'character';

  // Image, or a colored placeholder with the item's initials.
  function thumb(it, cls = 'thumb') {
    if (it && it.image) return `<img class="${cls}" src="${esc(it.image)}" alt="" loading="lazy" draggable="false">`;
    return `<div class="${cls} ph" style="--c:${colorOf(it)}" aria-hidden="true"><span class="ph-init">${esc(PV.initials(it && it.name))}</span></div>`;
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
    const tags = (it.tags || []).slice(0, compact ? 1 : 3).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
    const nOut = PV.variantsOf(it).length;
    const pills = [
      nOut ? `<span class="glass-pill" title="${nOut} outfits">${ic('shirt', 12)} ${nOut}</span>` : '',
      (it.loras || []).length ? `<span class="glass-pill" title="Linked LoRAs">${ic('puzzle', 12)} ${it.loras.length}</span>` : '',
    ].join('');
    const search = !compact && S.settings.imageSearch && it.cat !== 'lora'
      ? `<button class="glass-btn" data-act="imgsearch" title="Search for images" aria-label="Image search">${ic('search', 16)}</button>` : '';
    return `<article class="card ${compact ? 'compact' : ''} ${isPortrait(it) ? 'portrait' : ''} ${picked ? 'picked' : ''}" data-id="${esc(it.id)}" tabindex="0">
      <div class="card-media">${thumb(it)}
        <div class="card-top"><span class="tl">${pills}</span>${search}
          <button class="glass-btn ${it.fav ? 'on' : ''}" data-act="fav" title="Favorite" aria-label="Favorite">${ic('star', 16)}</button></div>
        <div class="card-overlay">
          <div class="card-title" title="${esc(it.name)}">${esc(it.name)}</div>
          ${it.source ? `<div class="card-source">${esc(it.source)}</div>` : ''}
        </div>
        ${compact ? '' : `<div class="hover-actions">
          <button class="btn sm grad" data-act="to-builder" title="Add to the Builder">${ic('plus', 14)} Builder</button>
          <button class="btn sm" data-act="copy" title="Copy prompt">${ic('copy', 14)}</button>
        </div>`}
      </div>
      <div class="card-body">
        <div class="card-sub" title="${esc(sub)}">${esc(sub) || '&nbsp;'}</div>
        <div class="card-tags">${it.cat === 'lora' ? baseBadge(it, S.builder.baseModel) : ''}${tags}</div>
      </div>
    </article>`;
  }

  // Reuse the existing spelling so "one piece" and "One Piece" group together.
  function canonicalSource(s) {
    if (!s) return '';
    return PV.sources().find((x) => x.toLowerCase() === s.toLowerCase()) || s;
  }

  // Wire click / drop / paste on an image box. onImage(blob) is called with the image.
  function wireImageDrop(box, fileIn, onImage) {
    box.addEventListener('click', () => fileIn.click());
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    fileIn.addEventListener('change', () => { if (fileIn.files[0]) onImage(fileIn.files[0]); fileIn.value = ''; });
    box.addEventListener('dragover', (e) => {
      if (!PV.dragHasImage(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      box.classList.add('over');
    });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.remove('over');
      const blob = await PV.imageFromDrop(e.dataTransfer);
      if (blob) onImage(blob);
    });
  }

  const EMPTY_IMG = (small) => small
    ? `${ic('imageplus', 18)}<span>Image</span>`
    : `${ic('imageplus', 28)}<span>Drop, paste (Ctrl+V)<br>or click to add an image</span>`;

  // ---------- Item editor ----------
  function editItem(orig, { isNew = false, onSaved } = {}) {
    const it = structuredClone(orig);
    it.loras = it.loras || [];
    it.tags = it.tags || [];
    it.variants = PV.variantsOf(it).map((v) => ({ ...v }));
    const isLora = it.cat === 'lora';
    const hasOutfits = it.cat === 'character';
    const cats = S.settings.categories;
    const catName = isLora ? 'LoRA' : (PV.cat(it.cat) || { name: 'Item' }).name.replace(/s$/, '');
    const baseOpts = ['', ...S.settings.baseModels]
      .map((b) => `<option value="${esc(b)}" ${b === (it.baseModel || '') ? 'selected' : ''}>${b ? esc(b) : '— unknown —'}</option>`).join('');
    const typeOpts = PV.LORA_TYPES
      .map((t) => `<option value="${t}" ${t === (it.loraType || 'other') ? 'selected' : ''}>${t}</option>`).join('');
    const loraOpts = (sel) => `<option value="">No LoRA</option>${PV.loras().map((l) => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}${l.baseModel ? ' · ' + esc(l.baseModel) : ''}</option>`).join('')}`;
    const searchSite = (PV.IMAGE_SEARCH_SITES[S.settings.imageSearchSite] || PV.IMAGE_SEARCH_SITES.pinterest).label;

    const html = `
      <form class="editor" autocomplete="off">
        <div class="ed-head">
          <span class="dot" style="--c:${colorOf(it)}"></span>
          <h3>${isNew ? 'New' : 'Edit'} ${esc(catName.toLowerCase())}</h3>
          <button type="button" class="fav-toggle ${it.fav ? 'on' : ''}" data-fav title="Favorite">${ic('star', 18)}</button>
          <button type="button" class="icon-btn" data-close title="Close (Esc)">${ic('x', 18)}</button>
        </div>
        <div class="ed-grid">
          <div class="ed-img">
            <div class="drop" data-drop tabindex="0" title="Click, drop or paste an image">
              ${it.image ? `<img src="${esc(it.image)}" alt="">` : EMPTY_IMG()}
            </div>
            <input type="file" accept="image/*" data-file hidden>
            <div class="ed-img-actions">
              ${S.settings.imageSearch && !isLora ? `<button type="button" class="btn sm" data-imgsearch title="Search ${esc(searchSite)} for images">${ic('search', 14)} ${esc(searchSite)}</button>` : ''}
              <button type="button" class="btn sm ghost" data-rmimg ${it.image ? '' : 'hidden'}>${ic('trash', 14)} Remove</button>
            </div>
          </div>
          <div class="ed-fields">
            <div class="ed-section">
              <div class="row2">
                <label>Name<span class="input-wrap"><input class="input" name="name" value="${esc(it.name)}" required placeholder="${hasOutfits ? 'e.g. Nami' : ''}">
                  ${S.settings.imageSearch && !isLora ? `<button type="button" class="in-btn" data-imgsearch title="Search ${esc(searchSite)} for images of this">${ic('search', 16)}</button>` : ''}</span></label>
                <label title="Series, game or franchise. Used for sorting and filtering.">Source
                  <input class="input" name="source" value="${esc(it.source || '')}" list="pv-sources" placeholder="Series / game, e.g. One Piece">
                  <datalist id="pv-sources">${PV.sources().map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
              </div>
              ${isLora ? `
                <label>File name <small>as ComfyUI lists it, e.g. <code>chars\\myChar_v2.safetensors</code></small>
                  <input class="input mono" name="file" value="${esc(it.file || '')}"></label>
                <label>Trigger words<textarea class="input" name="triggers" rows="2">${esc(it.triggers || '')}</textarea></label>
                <div class="row3">
                  <label>Default weight<input class="input" type="number" step="0.05" name="weight" value="${esc(fmtW(it.weight ?? 1))}"></label>
                  <label>Base model<select class="input" name="baseModel">${baseOpts}</select></label>
                  <label>Type<select class="input" name="loraType">${typeOpts}</select></label>
                </div>
                <label>Source URL<input class="input" name="url" value="${esc(it.url || '')}" placeholder="https://civitai.com/models/…"></label>
              ` : `
                <label>Category<select class="input" name="cat" style="width:100%">${cats.map((c) => `<option value="${esc(c.id)}" ${c.id === it.cat ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
                <label>Prompt ${hasOutfits ? '<small>who they are: hair, eyes, body. Put clothes in Outfits below.</small>' : ''}
                  <textarea class="input mono" name="prompt" rows="4">${esc(it.prompt || '')}</textarea>
                  <small class="hint"><code>{red|blue|green}</code> picks one at random · <code>__pose__</code> inserts a random item from a category</small></label>
                <label>Negative <small>optional, added to the negative prompt</small><textarea class="input mono" name="negative" rows="2">${esc(it.negative || '')}</textarea></label>
              `}
            </div>
            ${hasOutfits ? `
            <div class="ed-section">
              <div class="ed-section-head">${ic('shirt', 16)} Outfits <small>picked at random in the Builder, or choose one</small></div>
              <div class="variant-list" data-variants></div>
              <button type="button" class="slot-add" data-addvariant style="margin-top:10px">${ic('plus', 16)} Add outfit</button>
            </div>` : ''}
            ${isLora ? '' : `
            <div class="ed-section">
              <div class="ed-section-head">${ic('puzzle', 16)} Linked LoRAs <small>loaded automatically with this ${esc(catName.toLowerCase())}</small></div>
              <div class="linked"><div class="linked" data-links></div>
                <select class="input" data-addlink><option value="">＋ Link a LoRA…</option>${PV.loras().map((l) => `<option value="${esc(l.id)}">${esc(l.name)}${l.baseModel ? ' · ' + esc(l.baseModel) : ''}</option>`).join('')}</select></div>
            </div>`}
            <div class="ed-section">
              <label>Tags<input class="input" name="tags" value="${esc(it.tags.join(', '))}" placeholder="comma, separated"></label>
              <label>Notes<textarea class="input" name="notes" rows="2">${esc(it.notes || '')}</textarea></label>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          ${isNew ? '' : `<button type="button" class="btn ghost danger" data-del>${ic('trash', 15)} Delete</button><button type="button" class="btn ghost" data-dup>${ic('copy', 15)} Duplicate</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn primary">${ic('check', 16)} Save</button>
        </div>
      </form>`;

    let searchWin = null; // image search window to close with the editor (auto-close setting)
    const m = openModal(html, {
      wide: true,
      dismissable: false,
      onClose: () => {
        if (PV.searchImageTarget === useSearchImage) PV.searchImageTarget = null;
        try { if (searchWin && !searchWin.closed) searchWin.close(); } catch (e) { /* already gone */ }
      },
    });
    const el = m.el;
    const form = el.querySelector('form');
    // Images picked in the desktop search window land here while this editor is open.
    const useSearchImage = async (blob) => { await setImage(blob); toast('Image added. Remember to Save', 'ok'); };
    PV.searchImageTarget = useSearchImage;
    const drop = el.querySelector('[data-drop]');
    const rm = el.querySelector('[data-rmimg]');

    async function setImage(file) {
      if (!file || !PV.isImageFile(file)) return;
      try {
        it.image = await fileToThumb(file);
        drop.innerHTML = `<img src="${esc(it.image)}" alt="">`;
        rm.hidden = false;
      } catch (e) { toast('Could not read that image', 'err'); }
    }
    wireImageDrop(drop, el.querySelector('[data-file]'), setImage);
    el.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData?.files || [])].find(PV.isImageFile);
      if (f) { e.preventDefault(); setImage(f); }
    });
    rm.addEventListener('click', () => { it.image = ''; drop.innerHTML = EMPTY_IMG(); rm.hidden = true; });
    el.querySelector('[data-fav]').addEventListener('click', (e) => { it.fav = !it.fav; e.currentTarget.classList.toggle('on', it.fav); });
    el.querySelectorAll('[data-imgsearch]').forEach((b) => b.addEventListener('click', () => {
      const w = PV.openImageSearch(form.elements.name.value, form.elements.source.value);
      if (w) searchWin = w;
    }));

    // ----- Linked LoRAs -----
    const links = el.querySelector('[data-links]');
    function renderLinks() {
      links.innerHTML = it.loras.map((l, i) => {
        const li = S.items.get(l.id);
        if (!li) return '';
        return `<div class="link-row">${thumb(li, 'mini')}<span class="grow">${esc(li.name)}</span>
          <input class="input w" type="number" step="0.05" value="${esc(fmtW(l.weight))}" data-lw="${i}" title="Weight">
          <button type="button" class="icon-btn" data-lrm="${i}" title="Unlink">${ic('x', 16)}</button></div>`;
      }).join('') || '<div class="muted small">None yet. Link a character LoRA so it loads whenever you pick this.</div>';
    }
    if (links) {
      renderLinks();
      links.addEventListener('input', (e) => { const i = e.target.dataset.lw; if (i != null) it.loras[i].weight = Number(e.target.value); });
      links.addEventListener('click', (e) => { const b = e.target.closest('[data-lrm]'); if (b) { it.loras.splice(b.dataset.lrm, 1); renderLinks(); } });
      el.querySelector('[data-addlink]').addEventListener('change', (e) => {
        const id = e.target.value;
        e.target.value = '';
        if (!id || it.loras.some((l) => l.id === id)) return;
        it.loras.push({ id, weight: S.items.get(id).weight ?? 1 });
        renderLinks();
      });
    }

    // ----- Outfits (variants) -----
    const vList = el.querySelector('[data-variants]');
    function renderVariants() {
      vList.innerHTML = it.variants.map((v, i) => `
        <div class="variant-row" data-vi="${i}">
          <div class="drop" data-vdrop tabindex="0" title="Outfit picture (optional)">${v.image ? `<img src="${esc(v.image)}" alt="">` : EMPTY_IMG(true)}</div>
          <input type="file" accept="image/*" data-vfile hidden>
          <div class="variant-fields">
            <input class="input" data-vk="name" value="${esc(v.name)}" placeholder="Outfit name, e.g. Film Red">
            <textarea class="input mono" data-vk="prompt" rows="2" placeholder="clothing tags, e.g. red jacket, white shorts">${esc(v.prompt)}</textarea>
            <div class="variant-lora"><select class="input" data-vlora title="Outfit LoRA (optional)">${loraOpts(v.lora && v.lora.id)}</select>
              <input class="input w" type="number" step="0.05" data-vw value="${esc(fmtW(v.lora ? v.lora.weight : 0.8))}" title="LoRA weight" ${v.lora && v.lora.id ? '' : 'hidden'}></div>
          </div>
          <button type="button" class="icon-btn" data-vrm title="Remove outfit">${ic('trash', 16)}</button>
        </div>`).join('') || '<div class="muted small">No outfits yet. Add the looks this character has, e.g. <i>Classic</i>, <i>Swimsuit</i>, <i>Winter</i>.</div>';
      vList.querySelectorAll('.variant-row').forEach((row) => {
        const v = it.variants[row.dataset.vi];
        const box = row.querySelector('[data-vdrop]');
        wireImageDrop(box, row.querySelector('[data-vfile]'), async (blob) => {
          try { v.image = await fileToThumb(blob, 384); box.innerHTML = `<img src="${esc(v.image)}" alt="">`; } catch (e) { toast('Could not read that image', 'err'); }
        });
      });
    }
    if (vList) {
      renderVariants();
      vList.addEventListener('input', (e) => {
        const row = e.target.closest('.variant-row');
        if (!row) return;
        const v = it.variants[row.dataset.vi];
        if (e.target.dataset.vk) v[e.target.dataset.vk] = e.target.value;
        else if (e.target.matches('[data-vw]') && v.lora) v.lora.weight = Number(e.target.value) || 0;
      });
      vList.addEventListener('change', (e) => {
        if (!e.target.matches('[data-vlora]')) return;
        const row = e.target.closest('.variant-row');
        const v = it.variants[row.dataset.vi];
        const id = e.target.value;
        v.lora = id ? { id, weight: S.items.get(id).weight ?? 0.8 } : null;
        const w = row.querySelector('[data-vw]');
        w.hidden = !id;
        if (id) w.value = fmtW(v.lora.weight);
      });
      vList.addEventListener('click', (e) => {
        const b = e.target.closest('[data-vrm]');
        if (!b) return;
        it.variants.splice(b.closest('.variant-row').dataset.vi, 1);
        renderVariants();
      });
      el.querySelector('[data-addvariant]').addEventListener('click', () => {
        it.variants.push({ id: uid(), name: '', prompt: '', image: '', lora: null });
        renderVariants();
        vList.querySelector('.variant-row:last-child [data-vk="name"]').focus();
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
      // keep outfits that have something in them; unnamed ones get a number
      it.variants = it.variants
        .filter((v) => v.name.trim() || v.prompt.trim() || v.image)
        .map((v, i) => ({ ...v, name: v.name.trim() || `Outfit ${i + 1}`, prompt: v.prompt.trim() }));
      if (!it.variants.length) delete it.variants;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      readForm();
      if (!it.name) { toast('Give it a name', 'err'); return; }
      await PV.saveItem(it);
      // drop outfit choices in the builder that no longer exist
      for (const slot of Object.values(S.builder.slots)) {
        if (slot.variant && slot.variant[it.id] && !PV.variantsOf(it).some((v) => v.id === slot.variant[it.id])) {
          slot.variant[it.id] = '';
          PV.rollVariant(slot, it, true);
        }
      }
      PV.syncAutoLoras();
      PV.saveBuilder();
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
      if (copy.variants) copy.variants = copy.variants.map((v) => ({ ...v, id: uid() }));
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
          <h3><span class="dot" style="--c:${PV.catColor(catId)}"></span>${esc(title || (isLora ? 'Add a LoRA' : `Pick ${c.name.toLowerCase()}`))}</h3>
          <div class="search-field">${ic('search', 16)}<input class="input" type="search" placeholder="Search name, source, prompt, tags…" data-q></div>
          ${isLora ? `<select class="input" data-base><option value="">All base models</option>${S.settings.baseModels.map((b) => `<option ${b === base ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>` : ''}
          ${srcList.length ? `<select class="input" data-src><option value="">All sources</option>${srcList.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>` : ''}
          <button class="chip-toggle" data-fav>${ic('star', 14)} Favorites</button>
          <button class="btn" data-rand title="Pick a random one">${ic('dice', 16)} Random</button>
          <button class="btn" data-new>${ic('plus', 16)} New</button>
          <button class="icon-btn" data-close title="Close (Esc)">${ic('x', 18)}</button>
        </div>
        <p class="muted small picker-hint">Click to add · Shift+click to add several</p>
        <div class="grid picker-grid" data-grid></div>
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
        return [i.name, i.source, i.prompt, i.triggers, i.file, ...(i.tags || []), ...PV.variantsOf(i).map((v) => v.name)].join(' ').toLowerCase().includes(ql);
      }).sort((a, b) => (!a.source - !b.source) || (a.source || '').localeCompare(b.source || '') || a.name.localeCompare(b.name));
    }
    function render() {
      const arr = list();
      grid.innerHTML = arr.map((i) => card(i, { compact: true, picked: picked.has(i.id) })).join('') ||
        `<div class="empty small">${ic('search', 22)}Nothing here yet. ${isLora ? 'Scan your LoRA folder on the Import page, or click New.' : 'Click New to add one.'}</div>`;
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
    m.el.querySelector('[data-fav]').addEventListener('click', (e) => { favOnly = !favOnly; e.currentTarget.classList.toggle('on', favOnly); render(); });
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

  Object.assign(PV, { thumb, card, baseBadge, editItem, newItem, openPicker, iconFor, wireImageDrop });
})(window.PV);
