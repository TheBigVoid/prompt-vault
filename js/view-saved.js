'use strict';
// Presets (saved builder setups) and History (everything you copied).
(function (PV) {
  const { S, esc, toast, copyText, confirmBox, timeAgo, fmtW } = PV;
  const ic = (n, z) => PV.icon(n, z);

  // ---------- Presets ----------
  let pRoot;
  let pq = '';

  function renderPresets() {
    const q = pq.toLowerCase();
    const list = S.presets.filter((p) => !q || (p.name + ' ' + (p.positive || '')).toLowerCase().includes(q));
    pRoot.innerHTML = `
      <header class="page-head">
        <div><h1>Presets</h1><p class="sub">Saved Builder setups: slots, outfits, locks, LoRAs and text. Save one with the bookmark button in the Builder.</p></div>
        <div class="page-actions"><button class="btn grad" data-act="rand-preset" ${S.presets.length ? '' : 'disabled'}>${ic('dice', 16)} Random preset</button></div>
      </header>
      <div class="toolbar"><div class="search-field">${ic('search', 16)}<input class="input" type="search" placeholder="Search presets…" data-q value="${esc(pq)}"></div></div>
      <div class="grid presets">
        ${list.map((p) => `
          <article class="card preset" data-id="${esc(p.id)}">
            <div class="card-media">${PV.thumb({ name: p.name, image: p.image, cat: 'style' })}
              <div class="card-overlay"><div class="card-title">${esc(p.name)}</div><div class="card-source">${esc(timeAgo(p.updated))}</div></div></div>
            <div class="card-body">
              <div class="card-sub clamp3">${esc(p.positive || '')}</div>
            </div>
            <div class="preset-actions">
              <button class="btn sm grad" data-act="load">${ic('arrow', 14)} Load</button>
              <button class="btn sm" data-act="copy" title="Copy prompt">${ic('copy', 14)}</button>
              <button class="btn sm ghost" data-act="img" title="Set image">${ic('image', 14)}</button>
              <button class="btn sm ghost" data-act="rename" title="Rename">${ic('pencil', 14)}</button>
              <button class="btn sm ghost danger" data-act="del" title="Delete">${ic('trash', 14)}</button>
            </div>
          </article>`).join('') || `<div class="empty">${ic('bookmark', 28)}No presets yet. Build something you like, then save it from the Builder.</div>`}
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
      <header class="page-head">
        <div><h1>History</h1><p class="sub">Every prompt you copy is saved here (last 300).</p></div>
        <div class="page-actions"><button class="btn ghost danger" data-act="clear" ${S.history.length ? '' : 'disabled'}>${ic('trash', 16)} Clear history</button></div>
      </header>
      <div class="toolbar"><div class="search-field">${ic('search', 16)}<input class="input" type="search" placeholder="Search history…" data-q value="${esc(hq)}"></div></div>
      <div class="hist">
        ${list.map((h) => `
          <div class="hist-row" data-id="${esc(h.id)}">
            <div class="hist-meta muted small">${esc(timeAgo(h.time))}${h.loras && h.loras.length ? ' · LoRAs: ' + h.loras.map((l) => esc(l.name) + ' ' + esc(fmtW(l.weight))).join(', ') : ''}</div>
            <div class="hist-pos">${esc(h.positive)}</div>
            ${h.negative ? `<div class="hist-neg">${esc(h.negative)}</div>` : ''}
            <div class="hist-actions">
              <button class="btn sm" data-act="copy">${ic('copy', 14)} Copy</button>
              ${h.snapshot ? `<button class="btn sm" data-act="restore">${ic('wand', 14)} Open in Builder</button><button class="btn sm ghost" data-act="preset">${ic('bookmark', 14)} Save as preset</button>` : ''}
              <span class="spacer"></span>
              <button class="btn sm ghost danger" data-act="del" title="Delete">${ic('trash', 14)}</button>
            </div>
          </div>`).join('') || `<div class="empty">${ic('history', 28)}Nothing yet. Prompts you copy from the Builder show up here.</div>`}
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
