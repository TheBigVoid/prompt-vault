'use strict';
// Presets (saved builder setups) and History (everything you copied).
(function (PV) {
  const { S, esc, toast, copyText, confirmBox, timeAgo, fmtW } = PV;

  // ---------- Presets ----------
  let pRoot;
  let pq = '';

  function renderPresets() {
    const q = pq.toLowerCase();
    const list = S.presets.filter((p) => !q || (p.name + ' ' + (p.positive || '')).toLowerCase().includes(q));
    pRoot.innerHTML = `
      <div class="toolbar">
        <h2 class="tb-title">Presets <small class="muted">${S.presets.length}</small></h2>
        <input class="input grow" type="search" placeholder="Search presets…" data-q value="${esc(pq)}">
        <button class="btn" data-act="rand-preset" ${S.presets.length ? '' : 'disabled'}>🎲 Random preset</button>
      </div>
      <p class="muted small">A preset saves the whole builder (slots, locks, LoRAs, extra text). Save one from the Builder with 💾.</p>
      <div class="grid presets">
        ${list.map((p) => `
          <article class="card preset" data-id="${esc(p.id)}">
            <div class="card-media">${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : '<div class="thumb ph">💾</div>'}</div>
            <div class="card-body">
              <div class="card-title">${esc(p.name)}</div>
              <div class="card-sub clamp3">${esc(p.positive || '')}</div>
              <div class="muted small">${esc(timeAgo(p.updated))}</div>
            </div>
            <div class="card-actions">
              <button class="btn sm primary" data-act="load">Load</button>
              <button class="btn sm ghost" data-act="copy">Copy</button>
              <button class="btn sm ghost" data-act="img" title="Set image">🖼</button>
              <button class="btn sm ghost" data-act="rename">Rename</button>
              <button class="btn sm ghost danger" data-act="del">Delete</button>
            </div>
          </article>`).join('') || '<div class="empty">No presets yet.</div>'}
      </div>
      <input type="file" accept="image/*" hidden data-imgfile>`;
  }

  let imgTarget = null;
  async function onPresetClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rand-preset') {
      const p = PV.pick(S.presets);
      PV.builderView.loadSnapshot(p.builder);
      toast(`Loaded "${p.name}"`, 'ok');
      location.hash = '#builder';
      return;
    }
    const cardEl = e.target.closest('.card');
    if (!cardEl || !act) return;
    const p = S.presets.find((x) => x.id === cardEl.dataset.id);
    if (act === 'load') {
      PV.builderView.loadSnapshot(p.builder);
      toast(`Loaded "${p.name}"`, 'ok');
      location.hash = '#builder';
    } else if (act === 'copy') {
      const r = PV.build(PV.ensureSlots({ ...PV.defaultBuilder(), ...structuredClone(p.builder) }));
      copyText(r.positive, 'Preset prompt copied');
    } else if (act === 'rename') {
      const name = await PV.promptBox('Rename preset', p.name);
      if (name) { p.name = name; await PV.savePreset(p); renderPresets(); }
    } else if (act === 'img') {
      imgTarget = p;
      pRoot.querySelector('[data-imgfile]').click();
    } else if (act === 'del') {
      if (await confirmBox(`Delete preset "${p.name}"?`)) { await PV.deletePreset(p.id); renderPresets(); }
    }
  }

  function mountPresets(el) {
    pRoot = el;
    el.addEventListener('click', onPresetClick);
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-q]')) return;
      pq = e.target.value;
      renderPresets();
      const q = el.querySelector('[data-q]');
      q.focus();
      q.setSelectionRange(pq.length, pq.length);
    });
    el.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-imgfile]') || !imgTarget) return;
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      imgTarget.image = await PV.fileToThumb(f);
      await PV.savePreset(imgTarget);
      imgTarget = null;
      renderPresets();
    });
    renderPresets();
  }

  // ---------- History ----------
  let hRoot;
  let hq = '';

  function renderHistory() {
    const q = hq.toLowerCase();
    const list = S.history.filter((h) => !q || (h.positive + ' ' + h.negative).toLowerCase().includes(q)).slice(0, 150);
    hRoot.innerHTML = `
      <div class="toolbar">
        <h2 class="tb-title">History <small class="muted">${S.history.length}</small></h2>
        <input class="input grow" type="search" placeholder="Search history…" data-q value="${esc(hq)}">
        <button class="btn ghost danger" data-act="clear" ${S.history.length ? '' : 'disabled'}>Clear history</button>
      </div>
      <p class="muted small">Every time you copy a prompt from the Builder it's logged here (last 300).</p>
      <div class="hist">
        ${list.map((h) => `
          <div class="hist-row" data-id="${esc(h.id)}">
            <div class="hist-meta muted small">${esc(timeAgo(h.time))}${h.loras && h.loras.length ? ' · 🧩 ' + h.loras.map((l) => esc(l.name) + ' ' + esc(fmtW(l.weight))).join(', ') : ''}</div>
            <div class="hist-pos">${esc(h.positive)}</div>
            ${h.negative ? `<div class="hist-neg">${esc(h.negative)}</div>` : ''}
            <div class="hist-actions">
              <button class="btn sm" data-act="copy">Copy</button>
              ${h.snapshot ? '<button class="btn sm" data-act="restore">Open in Builder</button><button class="btn sm ghost" data-act="preset">Save as preset</button>' : ''}
              <button class="btn sm ghost danger" data-act="del">✕</button>
            </div>
          </div>`).join('') || '<div class="empty">Nothing yet.</div>'}
      </div>`;
  }

  async function onHistClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'clear') {
      if (await confirmBox('Clear all history?', 'Clear')) { await PV.clearHistory(); renderHistory(); }
      return;
    }
    const row = e.target.closest('.hist-row');
    if (!row || !act) return;
    const h = S.history.find((x) => x.id === row.dataset.id);
    if (act === 'copy') copyText(h.positive + (h.negative ? '\n\nNegative:\n' + h.negative : ''));
    else if (act === 'restore') { PV.builderView.loadSnapshot(h.snapshot); location.hash = '#builder'; }
    else if (act === 'preset') {
      const name = await PV.promptBox('Save as preset', 'From history');
      if (name) { await PV.savePreset({ id: PV.uid(), name, builder: h.snapshot, positive: h.positive, image: '' }); toast('Preset saved', 'ok'); }
    } else if (act === 'del') { await PV.deleteHistory(h.id); renderHistory(); }
  }

  function mountHistory(el) {
    hRoot = el;
    el.addEventListener('click', onHistClick);
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-q]')) return;
      hq = e.target.value;
      renderHistory();
      const q = el.querySelector('[data-q]');
      q.focus();
      q.setSelectionRange(hq.length, hq.length);
    });
    renderHistory();
  }

  PV.presetsView = { mount: mountPresets, render: renderPresets };
  PV.historyView = { mount: mountHistory, render: renderHistory };
})(window.PV);
