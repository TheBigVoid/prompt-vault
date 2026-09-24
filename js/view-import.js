'use strict';
(function (PV) {
  const { S, esc, toast, stem, fmtW, confirmBox } = PV;

  let root;
  let scan = null; // { rows: [...], urls: [] }
  let parsed = []; // image metadata results

  function existingLora(info) {
    const s = stem(info.file).toLowerCase();
    return PV.loras().find((l) => stem(l.file || l.name).toLowerCase() === s) || null;
  }

  function render() {
    const cats = S.settings.categories;
    root.innerHTML = `
      <div class="import">
        <section class="panel">
          <div class="panel-head"><h3>🧩 Scan your LoRA folder</h3></div>
          <p class="muted">Pick the folder with your LoRAs. Only file names and the small info/preview files next to them are read. Your models stay where they are and aren't uploaded anywhere.
            Trigger words, base model and preview images come from Stability Matrix (<code>.cm-info.json</code>), CivitAI Helper (<code>.civitai.info</code>) or A1111 (<code>.json</code>) sidecar files.</p>
          <p class="muted small">Stability Matrix's folder is usually <code>StabilityMatrix\\Data\\Models\\Lora</code> (or <code>%APPDATA%\\StabilityMatrix\\Models\\Lora</code>). If the browser asks to "upload" the files, that just means letting this page read them.</p>
          <label class="btn primary file-btn">📂 Choose LoRA folder…<input type="file" webkitdirectory directory multiple hidden data-lorafolder></label>
          <div data-scan>${renderScan()}</div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>🖼 Read prompts from ComfyUI images</h3></div>
          <p class="muted">Drop PNGs saved by ComfyUI (or A1111/Forge) to pull out the prompt, negative and LoRAs used. You can drop them anywhere in the app.</p>
          <div class="drop big" data-imgdrop tabindex="0">Drop images here or click to choose</div>
          <input type="file" accept="image/png" multiple hidden data-imgfiles>
          <div data-parsed>${renderParsed()}</div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>⚡ Quick add (bulk)</h3></div>
          <p class="muted">One per line. Use <code>Name: prompt text</code>, or just the prompt text.</p>
          <div class="row">
            <select class="input" data-qcat>${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
            <input class="input grow" data-qtags placeholder="tags for all (optional)">
          </div>
          <textarea class="input mono" rows="6" data-qtext placeholder="Hands on hips: standing, hands on hips, confident&#10;Sitting on stairs: sitting on stairs, looking at viewer&#10;dynamic pose, jumping, from below"></textarea>
          <button class="btn primary" data-act="quick">Add items</button>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>💾 Backup & restore</h3></div>
          <p class="muted">Your library lives in this browser only. Export a backup now and then, and use it to move your library to another browser or PC.
            The local file and the GitHub Pages site have <b>separate</b> libraries, so use export/import to move between them.</p>
          <div class="row">
            <button class="btn primary" data-act="export">⬇ Export backup (.json)</button>
            <label class="btn file-btn">⬆ Import backup…<input type="file" accept=".json,application/json" hidden data-backup></label>
            <label class="check"><input type="checkbox" data-replace> Replace everything (instead of merging)</label>
          </div>
        </section>
      </div>`;
  }

  function renderScan() {
    if (!scan) return '';
    if (!scan.rows.length) return '<div class="empty small">No .safetensors / .ckpt / .pt files found in that folder.</div>';
    const nNew = scan.rows.filter((r) => !r.existing).length;
    return `
      <div class="scan-head">
        <b>${scan.rows.length}</b> LoRAs found · <b>${nNew}</b> new
        <label class="check"><input type="checkbox" data-update checked> Fill in missing info on LoRAs I already have</label>
        <label class="check"><input type="checkbox" data-selall checked> Select all</label>
        <button class="btn primary" data-act="do-import">Import selected</button>
      </div>
      <div class="scan-list">
        ${scan.rows.map((r, i) => `
          <label class="scan-row ${r.existing ? 'exists' : ''}">
            <input type="checkbox" data-row="${i}" ${r.sel ? 'checked' : ''}>
            ${r.preview ? `<img class="mini" src="${r.preview}" alt="">` : '<div class="mini ph">🧩</div>'}
            <span class="grow"><b>${esc(r.name)}</b> ${r.baseModel ? `<span class="badge base">${esc(r.baseModel)}</span>` : ''} ${r.existing ? '<span class="badge">in library</span>' : '<span class="badge accent">new</span>'}
              <br><span class="muted small mono">${esc(r.file)}</span>
              ${r.triggers ? `<br><span class="small">🔑 ${esc(r.triggers)}</span>` : ''}</span>
          </label>`).join('')}
      </div>`;
  }

  function renderParsed() {
    return parsed.map((p, i) => {
      if (p.error) return `<div class="parsed err"><b>${esc(p.fileName)}</b>: ${esc(p.error)}</div>`;
      return `
        <div class="parsed" data-i="${i}">
          <img src="${p.url}" alt="">
          <div class="grow">
            <div class="muted small">${esc(p.fileName)} · ${esc(p.source)}${p.checkpoint ? ' · ' + esc(p.checkpoint) : ''}</div>
            <div class="hist-pos">${esc(p.positive) || '<i class="muted">no positive prompt found</i>'}</div>
            ${p.negative ? `<div class="hist-neg">${esc(p.negative)}</div>` : ''}
            ${p.loras.length ? `<div class="small">🧩 ${p.loras.map((l) => {
              const m = PV.matchLora(l.file);
              return `<span class="badge ${m ? 'accent' : ''}" title="${m ? 'In your library' : 'Not in your library'}">${esc(stem(l.file))} ${esc(fmtW(l.weight))}${m ? ' ✓' : ''}</span>`;
            }).join(' ')}</div>` : ''}
            <div class="hist-actions">
              <button class="btn sm primary" data-act="p-builder">Open in Builder</button>
              <button class="btn sm" data-act="p-item">Save as library item…</button>
              ${p.loras.some((l) => !PV.matchLora(l.file)) ? '<button class="btn sm" data-act="p-loras">Add missing LoRAs</button>' : ''}
              <button class="btn sm ghost" data-act="p-copy">Copy prompt</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  async function onFolder(files) {
    if (scan) scan.urls.forEach((u) => URL.revokeObjectURL(u));
    toast('Scanning…');
    const rows = await PV.scanLoraFolder(files);
    const urls = [];
    rows.forEach((r) => {
      r.existing = existingLora(r);
      r.sel = true;
      if (r.imageFile) { r.preview = URL.createObjectURL(r.imageFile); urls.push(r.preview); }
    });
    scan = { rows, urls };
    root.querySelector('[data-scan]').innerHTML = renderScan();
  }

  async function doImport() {
    const update = root.querySelector('[data-update]')?.checked;
    const out = [];
    let added = 0;
    let updated = 0;
    for (const r of scan.rows) {
      if (!r.sel) continue;
      let image = '';
      const needImage = !r.existing || (update && !r.existing.image);
      if (r.imageFile && needImage) { try { image = await PV.fileToThumb(r.imageFile, 384); } catch (e) { /* skip */ } }
      if (r.existing) {
        if (!update) continue;
        const it = r.existing;
        if (!it.file) it.file = r.file;
        if (!it.triggers && r.triggers) it.triggers = r.triggers;
        if (!it.baseModel && r.baseModel) it.baseModel = r.baseModel;
        if (!it.url && r.url) it.url = r.url;
        if (!it.image && image) it.image = image;
        it.tags = [...new Set([...(it.tags || []), ...r.tags])];
        out.push(it);
        updated++;
      } else {
        out.push(PV.newItem('lora', {
          name: r.name, file: r.file, triggers: r.triggers, baseModel: r.baseModel, weight: r.weight,
          url: r.url || '', tags: r.tags, image, loraType: guessType(r),
        }));
        added++;
      }
    }
    await PV.saveItems(out);
    for (const bm of new Set(out.map((l) => l.baseModel).filter(Boolean))) {
      if (!S.settings.baseModels.includes(bm)) S.settings.baseModels.splice(S.settings.baseModels.length - 1, 0, bm);
    }
    PV.saveSettings();
    scan.urls.forEach((u) => URL.revokeObjectURL(u));
    scan = null;
    render();
    toast(`${added} LoRAs added, ${updated} updated`, 'ok', 4000);
    PV.emit('data');
  }

  function guessType(r) {
    const s = (r.file + ' ' + r.tags.join(' ')).toLowerCase();
    if (/char|person|oc\b|waifu/.test(s)) return 'character';
    if (/style|artist/.test(s)) return 'style';
    if (/pose|position/.test(s)) return 'pose';
    if (/cloth|outfit|dress|costume/.test(s)) return 'clothing';
    if (/detail|slider|tweak|enhanc/.test(s)) return 'detail';
    if (/concept/.test(s)) return 'concept';
    return 'other';
  }

  async function onImages(files) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    for (const f of arr) {
      let res;
      try { res = await PV.parseImage(f); } catch (e) { res = { error: 'Could not read: ' + e.message }; }
      res.fileName = f.name;
      res.file = f;
      if (!res.error) res.url = URL.createObjectURL(f);
      parsed.unshift(res);
    }
    parsed = parsed.slice(0, 20);
    const el = root.querySelector('[data-parsed]');
    if (el) el.innerHTML = renderParsed();
  }

  async function onParsedAction(act, p) {
    if (act === 'p-copy') return PV.copyText(p.positive + (p.negative ? '\n\nNegative:\n' + p.negative : ''));
    if (act === 'p-loras') {
      const missing = p.loras.filter((l) => !PV.matchLora(l.file));
      await PV.saveItems(missing.map((l) => PV.newItem('lora', { name: stem(l.file), file: l.file, weight: l.weight })));
      toast(`${missing.length} LoRAs added — open them in the Library to add trigger words`, 'ok', 4000);
      root.querySelector('[data-parsed]').innerHTML = renderParsed();
      return PV.emit('data');
    }
    const matched = p.loras.map((l) => ({ l, it: PV.matchLora(l.file) })).filter((x) => x.it);
    if (act === 'p-builder') {
      const b = S.builder;
      for (const s of Object.values(b.slots)) if (!s.locked) s.ids = [];
      b.prefix = p.positive;
      b.suffix = '';
      b.negative = p.negative;
      b.loras = matched.map(({ l, it }) => ({ id: it.id, weight: l.weight, src: 'manual', on: true }));
      PV.saveBuilderNow();
      location.hash = '#builder';
      toast('Loaded into the Builder (prompt is in Prefix)', 'ok');
    } else if (act === 'p-item') {
      let image = '';
      try { image = await PV.fileToThumb(p.file); } catch (e) { /* ignore */ }
      PV.editItem(PV.newItem(S.settings.categories[0].id, {
        name: p.fileName.replace(/\.\w+$/, ''), prompt: p.positive, negative: p.negative, image,
        loras: matched.map(({ l, it }) => ({ id: it.id, weight: l.weight })),
      }), { isNew: true });
    }
  }

  async function quickAdd() {
    const catId = root.querySelector('[data-qcat]').value;
    const tags = PV.splitTags(root.querySelector('[data-qtags]').value);
    const lines = root.querySelector('[data-qtext]').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return toast('Nothing to add');
    const items = lines.map((line) => {
      const m = line.match(/^([^:]{1,60}):\s*(.+)$/);
      const name = m ? m[1].trim() : line.slice(0, 40) + (line.length > 40 ? '…' : '');
      return PV.newItem(catId, { name, prompt: m ? m[2] : line, tags });
    });
    await PV.saveItems(items);
    root.querySelector('[data-qtext]').value = '';
    toast(`${items.length} items added to ${PV.cat(catId).name}`, 'ok');
    PV.emit('data');
  }

  async function onBackupFile(f) {
    const replace = root.querySelector('[data-replace]').checked;
    if (replace && !(await confirmBox('Replace your whole library with this backup? Anything not in the backup is lost.', 'Replace'))) return;
    try {
      const data = JSON.parse(await f.text());
      const r = await PV.importAll(data, replace ? 'replace' : 'merge');
      toast(`Imported ${r.items} items, ${r.presets} presets`, 'ok', 4000);
      PV.emit('data');
    } catch (e) {
      toast('Import failed: ' + e.message, 'err', 5000);
    }
  }

  function mount(el) {
    root = el;
    render();
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-lorafolder]')) { if (t.files.length) onFolder(t.files); t.value = ''; }
      else if (t.matches('[data-imgfiles]')) { onImages(t.files); t.value = ''; }
      else if (t.matches('[data-backup]')) { if (t.files[0]) onBackupFile(t.files[0]); t.value = ''; }
      else if (t.matches('[data-row]')) scan.rows[t.dataset.row].sel = t.checked;
      else if (t.matches('[data-selall]')) {
        scan.rows.forEach((r) => { r.sel = t.checked; });
        el.querySelectorAll('[data-row]').forEach((c) => { c.checked = t.checked; });
      }
    });
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (e.target.closest('[data-imgdrop]')) return el.querySelector('[data-imgfiles]').click();
      if (!act) return;
      if (act === 'export') {
        PV.download(`prompt-vault-backup-${new Date().toISOString().slice(0, 10)}.json`, PV.exportAll());
      } else if (act === 'do-import') doImport();
      else if (act === 'quick') quickAdd();
      else if (act.startsWith('p-')) {
        const i = e.target.closest('.parsed').dataset.i;
        onParsedAction(act, parsed[i]);
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-imgdrop]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.querySelector('[data-imgfiles]').click(); }
    });
  }

  PV.importView = { mount, render, onImages };
})(window.PV);
