'use strict';
(function (PV) {
  const { S, esc, fmtW, toast, copyText, thumb, baseBadge, compatLevel } = PV;
  const ic = (n, s) => PV.icon(n, s);

  const CHANCES = [100, 75, 50, 25];
  const HERO = 'character'; // this category gets the big card
  let root;
  let plainView = false; // show the prompt as plain text instead of color-coded parts

  function changed({ full = true } = {}) {
    PV.saveBuilder();
    if (full) render(); else renderOutput();
  }

  // ---------- pieces ----------
  function slotButtons(slot) {
    return `<span class="slot-btns">
      <button class="icon-btn chance ${slot.chance < 100 ? 'on' : ''}" data-act="slot-chance" title="Chance this gets filled on Randomize all">${slot.chance ?? 100}%</button>
      <button class="icon-btn" data-act="slot-roll" title="Roll just this">${ic('dice', 16)}</button>
      <button class="icon-btn ${slot.locked ? 'on' : ''}" data-act="slot-lock" title="${slot.locked ? 'Locked: Randomize all keeps this' : 'Lock (keep on Randomize all)'}">${ic(slot.locked ? 'lock' : 'unlock', 16)}</button>
    </span>`;
  }

  function outfitChips(slot, it) {
    const vs = PV.variantsOf(it);
    if (!vs.length) return '';
    const cur = slot.variant ? slot.variant[it.id] || '' : '';
    const locked = slot.variantLock && slot.variantLock[it.id];
    const chip = (v) => `<button class="chip-btn ${v.image ? '' : 'noimg'} ${cur === v.id ? 'on' : ''}" data-act="variant" data-item="${esc(it.id)}" data-v="${esc(v.id)}" title="${esc(v.prompt)}">
      ${v.image ? `<img src="${esc(v.image)}" alt="">` : ''}${esc(v.name)}</button>`;
    return `<div class="outfits">
      <div class="outfits-head">${ic('shirt', 14)} Outfit
        <button class="icon-btn" data-act="variant-roll" data-item="${esc(it.id)}" title="Random outfit">${ic('dice', 14)}</button>
        <button class="icon-btn ${locked ? 'on' : ''}" data-act="variant-lock" data-item="${esc(it.id)}" title="${locked ? 'Outfit locked' : 'Lock outfit (keep it on Randomize all)'}">${ic(locked ? 'lock' : 'unlock', 14)}</button></div>
      <div class="outfit-chips">${vs.map(chip).join('')}
        <button class="chip-btn noimg ${cur ? '' : 'on'}" data-act="variant" data-item="${esc(it.id)}" data-v="" title="No outfit, just the character prompt">None</button></div>
    </div>`;
  }

  function heroCard(c) {
    const slot = S.builder.slots[c.id];
    const items = slot.ids.map((id) => S.items.get(id)).filter(Boolean);
    const count = PV.itemsIn(c.id).length;
    const rows = items.map((it) => `
      <div class="hero-row" data-id="${esc(it.id)}">
        <div class="hero-img" data-act="edit" data-id="${esc(it.id)}" title="Edit">${thumb(it)}</div>
        <div class="hero-info">
          <div class="hero-name-row">
            <div><div class="hero-name" data-act="edit" data-id="${esc(it.id)}">${esc(it.name)}</div>
              ${it.source ? `<span class="pill" style="margin-top:6px">${esc(it.source)}</span>` : ''}</div>
            <button class="icon-btn" data-act="slot-remove" data-id="${esc(it.id)}" title="Remove">${ic('x', 18)}</button>
          </div>
          <div class="hero-prompt" title="${esc(it.prompt)}">${esc(it.prompt)}</div>
          ${outfitChips(slot, it)}
        </div>
      </div>`).join('');
    return `
      <section class="hero ${slot.locked ? 'locked' : ''}" data-cat="${esc(c.id)}" style="--c:${PV.catColor(c.id)}">
        <div class="hero-head">
          <span class="hero-title"><span class="dot"></span>${esc(c.name)} <span class="muted">${count}</span></span>
          <span class="slot-btns">${items.length ? `<button class="icon-btn" data-act="slot-add" title="Add another">${ic('plus', 16)}</button>` : ''}${slotButtons(slot)}</span>
        </div>
        ${rows || `<div class="hero-empty">
          <div class="ph-big">${ic('user', 28)}</div>
          <div class="grow"><b style="color:var(--text)">No ${esc(c.name.toLowerCase().replace(/s$/, ''))} yet</b><br><span class="small">Pick one, or roll a random one.</span></div>
          <button class="btn" data-act="slot-add">${ic('plus', 16)} Pick</button>
          <button class="btn grad" data-act="slot-roll">${ic('dice', 16)} Random</button>
        </div>`}
      </section>`;
  }

  function slotCard(c) {
    const b = S.builder;
    const slot = b.slots[c.id];
    const items = slot.ids.map((id) => S.items.get(id)).filter(Boolean);
    const count = PV.itemsIn(c.id).length;
    const rows = items.map((it) => `
      <div class="slot-item">
        ${thumb(it, 'mini')}
        <button class="slot-item-name" data-act="edit" data-id="${esc(it.id)}" title="${esc(it.prompt)}"><span>${esc(it.name)}</span><small>${esc(it.source || it.prompt)}</small></button>
        <button class="icon-btn" data-act="slot-remove" data-id="${esc(it.id)}" aria-label="Remove">${ic('x', 15)}</button>
      </div>`).join('');
    let note = '';
    if (c.id === 'outfit' && !items.length && PV.outfitCoveredByVariant(b)) {
      const w = PV.selectedItems(b).find((x) => x.variant);
      note = `<div class="slot-note">${ic('shirt', 14)} ${esc(w.item.name)} is wearing <b>${esc(w.variant.name)}</b></div>`;
    }
    return `
      <div class="slot ${slot.locked ? 'locked' : ''} ${c.kind === 'negative' ? 'neg' : ''}" data-cat="${esc(c.id)}" style="--c:${PV.catColor(c.id)}">
        <div class="slot-head">
          <span class="slot-title"><span class="dot"></span>${esc(c.name)} <small class="muted">${count}</small></span>
          ${slotButtons(slot)}
        </div>
        <div class="slot-body">${rows}${note}
          <button class="slot-add ${items.length ? 'sm' : ''}" data-act="slot-add">${ic('plus', 15)}${items.length ? '' : ' Add'}</button></div>
      </div>`;
  }

  function loraRow(l, i) {
    const it = S.items.get(l.id);
    if (!it) return '';
    const lv = compatLevel(it.baseModel, S.builder.baseModel);
    const src = l.src === 'auto' ? `<span class="badge accent" title="Linked from ${esc(S.items.get(l.from)?.name || 'an item')}">linked</span>`
      : l.src === 'rand' ? '<span class="badge">random</span>' : '';
    return `
      <div class="lora-row ${l.on === false ? 'off' : ''} ${lv === 0 ? 'bad' : ''}" data-i="${i}">
        <label class="switch" title="On/off"><input type="checkbox" data-act="lora-on" ${l.on !== false ? 'checked' : ''}><span></span></label>
        ${thumb(it, 'mini')}
        <div class="lr-name"><button class="link" data-act="edit" data-id="${esc(it.id)}">${esc(it.name)}</button>
          <div class="lr-meta">${baseBadge(it, S.builder.baseModel)}${src}<span class="muted mono" title="${esc(it.triggers || '')}">${esc(it.triggers || 'no trigger words')}</span></div></div>
        <input type="range" min="-1" max="2" step="0.05" value="${esc(fmtW(l.weight))}" data-act="lora-w" aria-label="Weight">
        <input class="input w" type="number" step="0.05" value="${esc(fmtW(l.weight))}" data-act="lora-wn" aria-label="Weight">
        <button class="icon-btn ${l.locked ? 'on' : ''}" data-act="lora-lock" title="Keep when randomizing">${ic(l.locked ? 'lock' : 'unlock', 16)}</button>
        <button class="icon-btn" data-act="lora-rm" aria-label="Remove">${ic('x', 16)}</button>
      </div>`;
  }

  // ---------- render ----------
  function render() {
    const b = S.builder;
    const st = S.settings;
    PV.ensureSlots(b);
    const baseOpts = ['', ...st.baseModels].map((m) => `<option value="${esc(m)}" ${m === b.baseModel ? 'selected' : ''}>${m ? esc(m) : 'Any model'}</option>`).join('');
    const typeOpts = ['', ...PV.LORA_TYPES].map((t) => `<option value="${t}" ${t === b.randLoraType ? 'selected' : ''}>${t || 'any type'}</option>`).join('');
    const hero = st.categories.find((c) => c.id === HERO);
    const others = st.categories.filter((c) => c !== hero);
    root.innerHTML = `
      <header class="page-head">
        <div><h1>Builder</h1><p class="sub">Pick or roll each part. Locked parts stay when you randomize.</p></div>
        <div class="page-actions">
          <button class="btn ghost" data-act="clear" title="Empty everything that isn't locked">${ic('refresh', 16)} Clear</button>
          <button class="btn grad big" data-act="randomize" title="Randomize all (R)">${ic('dice', 20)} Randomize <kbd>R</kbd></button>
        </div>
      </header>

      <div class="b-controls">
        <label class="tb-field">Base model<select class="input" data-f="baseModel">${baseOpts}</select></label>
        <label class="tb-field grow" title="Randomize only picks items whose tags or source match (comma separated)">Random filter
          <span class="search-field">${ic('filter', 15)}<input class="input" data-f="filterTags" value="${esc(b.filterTags)}" placeholder="tags or source, e.g. one piece, night"></span></label>
        <button class="chip-toggle ${b.favOnly ? 'on' : ''}" data-act="fav-only" title="Only roll favorites">${ic('star', 15)} Favorites</button>
        <label class="tb-field">Random LoRAs
          <span class="inline"><select class="input" data-f="randLoraCount">${[0, 1, 2, 3].map((n) => `<option ${n === (b.randLoraCount || 0) ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select class="input" data-f="randLoraType">${typeOpts}</select></span></label>
      </div>

      <div class="b-cols">
        <div class="b-left">
          ${hero ? heroCard(hero) : ''}
          <div class="slots">${others.map(slotCard).join('')}</div>

          <section class="panel">
            <div class="panel-head"><h3>${ic('puzzle', 17)} LoRA stack <span class="muted small">${b.loras.length || ''}</span></h3>
              <span class="slot-btns"><button class="btn sm" data-act="lora-rand">${ic('dice', 14)} Random</button><button class="btn sm" data-act="lora-add">${ic('plus', 14)} Add LoRA</button></span></div>
            <div class="lora-list">${b.loras.map(loraRow).join('') || `<div class="empty small">${ic('puzzle', 22)}No LoRAs yet. Add one, or link LoRAs to a character so they load automatically.</div>`}</div>
          </section>

          <details class="panel" ${b.prefix || b.suffix ? 'open' : ''}>
            <summary>${ic('pencil', 17)} Extra text <span class="muted small">quality tags, suffix, negative</span>${PV.icon('chevron', 18, 'chev')}</summary>
            <label class="lbl">Prefix <small>goes first, e.g. quality tags</small><textarea class="input mono" rows="2" data-f="prefix">${esc(b.prefix)}</textarea></label>
            <label class="lbl">Suffix <small>goes last</small><textarea class="input mono" rows="2" data-f="suffix">${esc(b.suffix)}</textarea></label>
            <label class="lbl">Negative<textarea class="input mono" rows="2" data-f="negative">${esc(b.negative)}</textarea></label>
          </details>
        </div>

        <aside class="b-right"><div class="out" data-out></div></aside>
      </div>`;
    renderOutput();
  }

  const tokenEstimate = (t) => Math.round((String(t).match(/[a-z0-9]+|[^\sa-z0-9]/gi) || []).length * 1.05);

  function promptHtml(r) {
    if (!r.segments.length) return '<div class="prompt-view empty-prompt">Your prompt appears here. Pick a character or press Randomize.</div>';
    const sep = `<span class="seg-sep">${esc(r.sep)}</span>`;
    return `<div class="prompt-view">${r.segments.map((s) => {
      const plain = s.kind === 'prefix' || s.kind === 'suffix';
      return `<span class="seg-part ${plain ? 'plain' : ''}" style="--c:${PV.catColor(s.kind)}" title="${esc(s.label)}">${esc(s.text)}</span>`;
    }).join(sep)}</div>`;
  }

  function legendHtml(r) {
    const kinds = [...new Set(r.segments.map((s) => s.kind))].filter((k) => k !== 'prefix' && k !== 'suffix');
    if (!kinds.length) return '';
    const name = (k) => (k === 'lora' ? 'LoRA' : (PV.cat(k) || { name: k }).name);
    return `<div class="legend">${kinds.map((k) => `<span><span class="dot" style="--c:${PV.catColor(k)}"></span>${esc(name(k))}</span>`).join('')}</div>`;
  }

  function renderOutput() {
    const out = root.querySelector('[data-out]');
    if (!out) return;
    const r = PV.build();
    const fmt = S.settings.loraFormat;
    const imgs = [];
    for (const x of PV.selectedItems()) {
      if (x.item.image) imgs.push({ src: x.item.image, t: x.item.name });
      if (x.variant && x.variant.image) imgs.push({ src: x.variant.image, t: `${x.item.name} · ${x.variant.name}` });
    }
    out.innerHTML = `
      ${imgs.length ? `<div class="ref-strip">${imgs.slice(0, 8).map((x) => `<img src="${esc(x.src)}" title="${esc(x.t)}" alt="">`).join('')}</div>` : ''}
      <div class="out-block">
        <div class="out-head"><h3>${ic('sparkles', 15)} Prompt <span class="tokens">~${tokenEstimate(r.positive)} tokens</span></h3>
          <span class="actions">
            <button class="icon-btn ${plainView ? 'on' : ''}" data-act="plain" title="${plainView ? 'Show color-coded' : 'Show as plain text'}">${ic(plainView ? 'eye' : 'eyeoff', 16)}</button>
            <button class="btn sm" data-act="copy-pos">${ic('copy', 14)} Copy</button></span></div>
        ${plainView ? `<textarea class="input out-text" readonly rows="8">${esc(r.positive)}</textarea>` : promptHtml(r) + legendHtml(r)}
      </div>
      <div class="out-block">
        <div class="out-head"><h3>Negative</h3><button class="btn sm" data-act="copy-neg">${ic('copy', 14)} Copy</button></div>
        <textarea class="input out-text neg" readonly rows="3">${esc(r.negative)}</textarea>
      </div>
      <div class="out-block">
        <div class="out-head"><h3>${ic('puzzle', 15)} LoRAs <span class="muted">${r.loras.length}</span></h3>
          <div class="seg" role="group" aria-label="LoRA format">
            <button class="${fmt === 'comfy' ? 'on' : ''}" data-act="fmt" data-v="comfy" title="List for LoRA Loader nodes">Loader nodes</button>
            <button class="${fmt === 'tag' ? 'on' : ''}" data-act="fmt" data-v="tag" title="&lt;lora:name:weight&gt; in the prompt (Lora Tag Loader, Impact Pack, A1111)">&lt;lora:&gt; tags</button>
          </div></div>
        ${r.loras.length ? `<pre class="lora-out mono">${esc(r.loraList)}</pre>
          ${fmt === 'comfy' ? `<button class="btn sm ghost" data-act="copy-loras">${ic('copy', 14)} Copy LoRA list</button>` : '<p class="muted small">Tags are added to the end of the prompt.</p>'}` : '<p class="muted small">No LoRAs active.</p>'}
      </div>
      ${r.warnings.length ? `<div class="warnings">${r.warnings.map((w) => `<div>${ic('alert', 15)}<span>${esc(w)}</span></div>`).join('')}</div>` : ''}
      <div class="out-actions">
        <button class="btn grad" data-act="copy-all">${ic('copy', 16)} Copy all</button>
        ${r.hasWildcards ? `<button class="btn" data-act="reroll-wc" title="New random picks for {a|b} and __category__">${ic('shuffle', 16)}</button>` : ''}
        <button class="btn" data-act="save-preset" title="Save as preset">${ic('bookmark', 16)}</button>
      </div>`;
  }

  // Flash the cards whose contents changed after a randomize.
  function snapshot() {
    const m = {};
    for (const [k, s] of Object.entries(S.builder.slots)) m[k] = JSON.stringify([s.ids, s.variant || {}]);
    return m;
  }
  function flashChanged(before) {
    for (const [k, s] of Object.entries(S.builder.slots)) {
      if (before[k] === JSON.stringify([s.ids, s.variant || {}])) continue;
      const el = root.querySelector(`[data-cat="${CSS.escape(k)}"]`);
      if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    }
    const dice = root.querySelector('[data-act="randomize"] .ico');
    if (dice) dice.classList.add('spin');
  }
  function randomize() {
    const before = snapshot();
    PV.randomizeAll();
    changed();
    flashChanged(before);
  }

  function logHistory(r) {
    PV.addHistory({
      positive: r.positive,
      negative: r.negative,
      loras: r.loras.map((l) => ({ name: l.item.name, file: l.item.file, weight: l.weight })),
      snapshot: structuredClone(S.builder),
    });
    const now = Date.now();
    const used = PV.selectedItems().map((x) => x.item).concat(r.loras.map((l) => l.item));
    used.forEach((it) => { it.used = (it.used || 0) + 1; it.lastUsed = now; });
    if (used.length) PV.saveItems(used);
  }

  async function savePreset() {
    const r = PV.build();
    const sel = PV.selectedItems();
    const img = sel.find((x) => x.item.image);
    const name = await PV.promptBox('Save preset as…', sel.map((x) => x.variant ? `${x.item.name} (${x.variant.name})` : x.item.name).slice(0, 3).join(' · ') || 'My preset');
    if (!name) return;
    await PV.savePreset({ id: PV.uid(), name, builder: structuredClone(S.builder), positive: r.positive, image: img ? img.item.image : '' });
    toast('Preset saved', 'ok');
  }

  function addToSlot(catId, it) {
    const slot = S.builder.slots[catId];
    if (!slot) return;
    PV.addToSlot(slot, it);
    PV.syncAutoLoras();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const b = S.builder;
    const slotEl = btn.closest('[data-cat]');
    const catId = slotEl && slotEl.dataset.cat;
    const rowEl = btn.closest('.lora-row');
    const li = rowEl ? Number(rowEl.dataset.i) : -1;
    switch (act) {
      case 'randomize': randomize(); break;
      case 'clear':
        for (const s of Object.values(b.slots)) if (!s.locked) s.ids = [];
        b.loras = b.loras.filter((l) => l.locked || l.src === 'manual' || !l.src);
        PV.syncAutoLoras();
        changed();
        break;
      case 'fav-only': b.favOnly = !b.favOnly; changed(); break;
      case 'slot-add':
        PV.openPicker(catId, { exclude: b.slots[catId].ids, onPick: (it) => { addToSlot(it.cat, it); changed(); } });
        break;
      case 'slot-roll': {
        const before = snapshot();
        PV.rollSlot(catId, b, true);
        PV.syncAutoLoras();
        b.wcSeed = PV.newSeed();
        changed();
        flashChanged(before);
        break;
      }
      case 'slot-lock': b.slots[catId].locked = !b.slots[catId].locked; changed(); break;
      case 'slot-chance': {
        const s = b.slots[catId];
        s.chance = CHANCES[(CHANCES.indexOf(s.chance ?? 100) + 1) % CHANCES.length];
        changed();
        break;
      }
      case 'slot-remove':
        b.slots[catId].ids = b.slots[catId].ids.filter((x) => x !== btn.dataset.id);
        PV.syncAutoLoras();
        changed();
        break;
      case 'variant': {
        PV.setVariant(b.slots[catId], btn.dataset.item, btn.dataset.v);
        PV.syncAutoLoras();
        changed();
        break;
      }
      case 'variant-roll': {
        const it = S.items.get(btn.dataset.item);
        PV.rollVariant(b.slots[catId], it, true);
        PV.syncAutoLoras();
        changed();
        break;
      }
      case 'variant-lock': {
        const s = b.slots[catId];
        s.variantLock = s.variantLock || {};
        s.variantLock[btn.dataset.item] = !s.variantLock[btn.dataset.item];
        changed();
        break;
      }
      case 'edit': PV.editItem(S.items.get(btn.dataset.id)); break;
      case 'lora-add':
        PV.openPicker('lora', {
          exclude: b.loras.map((l) => l.id),
          onPick: (it) => { b.loras.push({ id: it.id, weight: it.weight ?? 1, src: 'manual', on: true }); changed(); },
        });
        break;
      case 'lora-rand':
        if (!PV.addRandomLora(b, b.randLoraType)) toast(PV.loras().length ? 'No more matching LoRAs' : 'No LoRAs in your library yet. Scan your folder on the Import page');
        changed();
        break;
      case 'lora-rm': b.loras.splice(li, 1); changed(); break;
      case 'lora-lock': b.loras[li].locked = !b.loras[li].locked; changed(); break;
      case 'fmt': S.settings.loraFormat = btn.dataset.v; PV.saveSettings(); renderOutput(); break;
      case 'plain': plainView = !plainView; renderOutput(); break;
      case 'reroll-wc': b.wcSeed = PV.newSeed(); changed({ full: false }); break;
      case 'save-preset': savePreset(); break;
      case 'copy-pos': { const r = PV.build(); copyText(r.positive, 'Prompt copied'); logHistory(r); break; }
      case 'copy-neg': copyText(PV.build().negative, 'Negative prompt copied'); break;
      case 'copy-loras': copyText(PV.build().loraList, 'LoRA list copied'); break;
      case 'copy-all': {
        const r = PV.build();
        let txt = `Positive:\n${r.positive}\n\nNegative:\n${r.negative}`;
        if (r.loras.length && S.settings.loraFormat === 'comfy') txt += `\n\nLoRAs:\n${r.loraList}`;
        copyText(txt, 'Everything copied');
        logHistory(r);
        break;
      }
    }
  }

  function onInput(e) {
    const b = S.builder;
    const f = e.target.dataset.f;
    if (f) {
      if (e.target.type === 'checkbox') b[f] = e.target.checked;
      else if (f === 'randLoraCount') b[f] = Number(e.target.value);
      else b[f] = e.target.value;
      // selects that change badges need a full redraw; typing only needs the output
      changed({ full: f === 'baseModel' });
      return;
    }
    const act = e.target.dataset.act;
    const rowEl = e.target.closest('.lora-row');
    if (!rowEl) return;
    const l = b.loras[Number(rowEl.dataset.i)];
    if (act === 'lora-w' || act === 'lora-wn') {
      l.weight = Number(e.target.value) || 0;
      const other = rowEl.querySelector(act === 'lora-w' ? '[data-act="lora-wn"]' : '[data-act="lora-w"]');
      other.value = fmtW(l.weight);
      changed({ full: false });
    } else if (act === 'lora-on') {
      l.on = e.target.checked;
      rowEl.classList.toggle('off', !l.on);
      changed({ full: false });
    }
  }

  function mount(el) {
    root = el;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    render();
  }

  // Public helpers used by other views
  function addItemToBuilder(it) {
    if (it.cat === 'lora') {
      if (!S.builder.loras.some((l) => l.id === it.id)) S.builder.loras.push({ id: it.id, weight: it.weight ?? 1, src: 'manual', on: true });
    } else addToSlot(it.cat, it);
    PV.saveBuilder();
    toast(`Added "${it.name}" to the Builder`, 'ok');
  }

  function loadSnapshot(snap) {
    S.builder = PV.ensureSlots({ ...PV.defaultBuilder(), ...structuredClone(snap), id: 'builder' });
    PV.saveBuilderNow();
  }

  PV.builderView = { mount, render, addItemToBuilder, loadSnapshot, randomize: () => { if (root) randomize(); } };
})(window.PV);
