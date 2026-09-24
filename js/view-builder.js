'use strict';
(function (PV) {
  const { S, esc, fmtW, toast, copyText, thumb, baseBadge, compatLevel } = PV;

  const CHANCES = [100, 75, 50, 25];
  let root;

  function changed({ full = true } = {}) {
    PV.saveBuilder();
    if (full) render(); else renderOutput();
  }

  function slotCard(c) {
    const slot = S.builder.slots[c.id];
    const items = slot.ids.map((id) => S.items.get(id)).filter(Boolean);
    const count = PV.itemsIn(c.id).length;
    const chips = items.map((it) => `
      <span class="chip" data-id="${esc(it.id)}">
        ${thumb(it, 'mini')}<button class="chip-name" data-act="edit" data-id="${esc(it.id)}" title="${esc((it.source ? it.source + ' · ' : '') + it.prompt)}">${esc(it.name)}</button>
        <button class="chip-x" data-act="slot-remove" data-id="${esc(it.id)}" aria-label="Remove">✕</button>
      </span>`).join('');
    return `
      <div class="slot ${slot.locked ? 'locked' : ''} ${c.kind === 'negative' ? 'neg' : ''}" data-cat="${esc(c.id)}">
        <div class="slot-head">
          <span class="slot-title">${esc(c.icon)} ${esc(c.name)} <small class="muted">${count}</small></span>
          <span class="slot-btns">
            <button class="icon-btn chance ${slot.chance < 100 ? 'on' : ''}" data-act="slot-chance" title="Chance this slot gets filled on Randomize all">${slot.chance ?? 100}%</button>
            <button class="icon-btn" data-act="slot-roll" title="Roll this slot">🎲</button>
            <button class="icon-btn ${slot.locked ? 'on' : ''}" data-act="slot-lock" title="${slot.locked ? 'Locked: Randomize all skips this' : 'Lock this slot'}">${slot.locked ? '🔒' : '🔓'}</button>
          </span>
        </div>
        <div class="slot-body">${chips}<button class="chip add" data-act="slot-add">＋ ${items.length ? '' : 'Add'}</button></div>
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
          <div class="lr-meta">${baseBadge(it, S.builder.baseModel)}${src}<span class="muted mono small" title="${esc(it.triggers || '')}">${esc(it.triggers || 'no trigger words')}</span></div></div>
        <input type="range" min="-1" max="2" step="0.05" value="${esc(fmtW(l.weight))}" data-act="lora-w" aria-label="Weight">
        <input class="input w" type="number" step="0.05" value="${esc(fmtW(l.weight))}" data-act="lora-wn" aria-label="Weight">
        <button class="icon-btn ${l.locked ? 'on' : ''}" data-act="lora-lock" title="Keep when randomizing">${l.locked ? '🔒' : '🔓'}</button>
        <button class="icon-btn" data-act="lora-rm" aria-label="Remove">✕</button>
      </div>`;
  }

  function render() {
    const b = S.builder;
    const st = S.settings;
    PV.ensureSlots(b);
    const baseOpts = ['', ...st.baseModels].map((m) => `<option value="${esc(m)}" ${m === b.baseModel ? 'selected' : ''}>${m ? esc(m) : 'Any model'}</option>`).join('');
    const typeOpts = ['', ...PV.LORA_TYPES].map((t) => `<option value="${t}" ${t === b.randLoraType ? 'selected' : ''}>${t || 'any type'}</option>`).join('');
    root.innerHTML = `
      <div class="toolbar">
        <label class="tb-field">Base model<select class="input" data-f="baseModel">${baseOpts}</select></label>
        <label class="tb-field grow" title="Randomize only picks items whose tags or source match (comma separated)">Random filter (tags or source)<input class="input" data-f="filterTags" value="${esc(b.filterTags)}" placeholder="e.g. one piece, fantasy, night"></label>
        <label class="check"><input type="checkbox" data-f="favOnly" ${b.favOnly ? 'checked' : ''}> ★ favorites only</label>
        <label class="tb-field">+ random LoRAs
          <span class="inline"><select class="input" data-f="randLoraCount">${[0, 1, 2, 3].map((n) => `<option ${n === (b.randLoraCount || 0) ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select class="input" data-f="randLoraType">${typeOpts}</select></span></label>
        <span class="spacer"></span>
        <button class="btn ghost" data-act="clear" title="Empty all unlocked slots">Clear</button>
        <button class="btn primary big" data-act="randomize" title="Shortcut: R">🎲 Randomize all</button>
      </div>

      <div class="b-cols">
        <div class="b-left">
          <div class="slots">${st.categories.map(slotCard).join('')}</div>

          <section class="panel">
            <div class="panel-head"><h3>🧩 LoRA stack</h3>
              <span class="slot-btns"><button class="btn sm" data-act="lora-rand">🎲 Random LoRA</button><button class="btn sm" data-act="lora-add">＋ Add LoRA</button></span></div>
            <div class="lora-list">${b.loras.map(loraRow).join('') || '<div class="empty small">No LoRAs. Add one, or link LoRAs to a character so they load automatically.</div>'}</div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>✏️ Extra text</h3></div>
            <label class="lbl">Prefix <small>(quality tags, goes first)</small><textarea class="input" rows="2" data-f="prefix">${esc(b.prefix)}</textarea></label>
            <label class="lbl">Suffix <small>(goes last)</small><textarea class="input" rows="2" data-f="suffix">${esc(b.suffix)}</textarea></label>
            <label class="lbl">Negative<textarea class="input" rows="2" data-f="negative">${esc(b.negative)}</textarea></label>
          </section>
        </div>

        <aside class="b-right"><div class="out" data-out></div></aside>
      </div>`;
    renderOutput();
  }

  function renderOutput() {
    const out = root.querySelector('[data-out]');
    if (!out) return;
    const r = PV.build();
    const fmt = S.settings.loraFormat;
    const imgs = PV.selectedItems().filter((x) => x.item.image).slice(0, 8);
    out.innerHTML = `
      ${imgs.length ? `<div class="ref-strip">${imgs.map((x) => `<img src="${esc(x.item.image)}" title="${esc(x.item.name)}" alt="">`).join('')}</div>` : ''}
      <div class="out-block">
        <div class="out-head"><h3>Positive</h3><button class="btn sm" data-act="copy-pos">Copy</button></div>
        <textarea class="input out-text" readonly rows="7">${esc(r.positive)}</textarea>
      </div>
      <div class="out-block">
        <div class="out-head"><h3>Negative</h3><button class="btn sm" data-act="copy-neg">Copy</button></div>
        <textarea class="input out-text neg" readonly rows="3">${esc(r.negative)}</textarea>
      </div>
      <div class="out-block">
        <div class="out-head"><h3>LoRAs <small class="muted">${r.loras.length}</small></h3>
          <div class="seg" role="group" aria-label="LoRA format">
            <button class="${fmt === 'comfy' ? 'on' : ''}" data-act="fmt" data-v="comfy" title="List for LoRA Loader nodes">Loader nodes</button>
            <button class="${fmt === 'tag' ? 'on' : ''}" data-act="fmt" data-v="tag" title="&lt;lora:name:weight&gt; in the prompt (Lora Tag Loader, Impact Pack, A1111)">&lt;lora:&gt; tags</button>
          </div></div>
        ${r.loras.length ? `<pre class="lora-out mono">${esc(r.loraList)}</pre>
          ${fmt === 'comfy' ? '<button class="btn sm ghost" data-act="copy-loras">Copy LoRA list</button>' : '<p class="muted small">Tags are appended to the positive prompt.</p>'}` : '<p class="muted small">No LoRAs active.</p>'}
      </div>
      ${r.warnings.length ? `<div class="warnings">${r.warnings.map((w) => `<div>⚠️ ${esc(w)}</div>`).join('')}</div>` : ''}
      <div class="out-actions">
        <button class="btn primary" data-act="copy-all">Copy all</button>
        ${r.hasWildcards ? '<button class="btn" data-act="reroll-wc" title="New random picks for {a|b} and __category__">🔀 Re-roll wildcards</button>' : ''}
        <button class="btn" data-act="save-preset">💾 Save preset</button>
      </div>`;
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
    const firstChar = PV.selectedItems().find((x) => x.item.image);
    const name = await PV.promptBox('Save preset as…', PV.selectedItems().map((x) => x.item.name).slice(0, 3).join(' · ') || 'My preset');
    if (!name) return;
    await PV.savePreset({ id: PV.uid(), name, builder: structuredClone(S.builder), positive: r.positive, image: firstChar ? firstChar.item.image : '' });
    toast('Preset saved', 'ok');
  }

  function addToSlot(catId, it) {
    const slot = S.builder.slots[catId];
    if (!slot || slot.ids.includes(it.id)) return;
    slot.ids.push(it.id);
    PV.syncAutoLoras();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const b = S.builder;
    const slotEl = btn.closest('.slot');
    const catId = slotEl && slotEl.dataset.cat;
    const rowEl = btn.closest('.lora-row');
    const li = rowEl ? Number(rowEl.dataset.i) : -1;
    switch (act) {
      case 'randomize': PV.randomizeAll(); changed(); break;
      case 'clear':
        for (const s of Object.values(b.slots)) if (!s.locked) s.ids = [];
        b.loras = b.loras.filter((l) => l.locked || l.src === 'manual' || !l.src);
        PV.syncAutoLoras();
        changed();
        break;
      case 'slot-add':
        PV.openPicker(catId, { exclude: b.slots[catId].ids, onPick: (it) => { addToSlot(it.cat, it); changed(); } });
        break;
      case 'slot-roll': PV.rollSlot(catId, b, true); PV.syncAutoLoras(); b.wcSeed = PV.newSeed(); changed(); break;
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
      case 'edit': PV.editItem(S.items.get(btn.dataset.id)); break;
      case 'lora-add':
        PV.openPicker('lora', {
          exclude: b.loras.map((l) => l.id),
          onPick: (it) => { b.loras.push({ id: it.id, weight: it.weight ?? 1, src: 'manual', on: true }); changed(); },
        });
        break;
      case 'lora-rand':
        if (!PV.addRandomLora(b, b.randLoraType)) toast(PV.loras().length ? 'No more matching LoRAs' : 'No LoRAs in your library yet — scan your folder on the Import tab');
        changed();
        break;
      case 'lora-rm': b.loras.splice(li, 1); changed(); break;
      case 'lora-lock': b.loras[li].locked = !b.loras[li].locked; changed(); break;
      case 'fmt': S.settings.loraFormat = btn.dataset.v; PV.saveSettings(); renderOutput(); break;
      case 'reroll-wc': b.wcSeed = PV.newSeed(); changed({ full: false }); break;
      case 'save-preset': savePreset(); break;
      case 'copy-pos': { const r = PV.build(); copyText(r.positive, 'Positive prompt copied'); logHistory(r); break; }
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
    toast(`Added "${it.name}" to the builder`, 'ok');
  }

  function loadSnapshot(snap) {
    S.builder = PV.ensureSlots({ ...PV.defaultBuilder(), ...structuredClone(snap), id: 'builder' });
    PV.saveBuilderNow();
  }

  PV.builderView = { mount, render, addItemToBuilder, loadSnapshot, randomize: () => { PV.randomizeAll(); changed(); } };
})(window.PV);
