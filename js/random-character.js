'use strict';
// One-click "give me a random character + their prompt" popup.
(function (PV) {
  const { S, esc, fmtW, toast, copyText } = PV;

  const LS_KEY = 'pv.randchar';
  let prefs = { source: '', fav: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  const remember = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  let lastId = null;

  function pool() {
    let arr = PV.itemsIn('character');
    if (prefs.source) arr = arr.filter((c) => (c.source || '') === prefs.source);
    if (prefs.fav) arr = arr.filter((c) => c.fav);
    return arr;
  }

  // Character prompt + its linked LoRAs' trigger words (and <lora:> tags if that format is on).
  function promptFor(ch) {
    const sep = S.settings.separator || ', ';
    const loras = (ch.loras || []).map((l) => ({ ...l, item: S.items.get(l.id) })).filter((l) => l.item);
    const text = PV.resolveWildcards(ch.prompt, Math.random, S.settings.resolveWildcards);
    const triggers = S.settings.triggerPos === 'none' ? [] : loras.map((l) => l.item.triggers).filter(Boolean);
    const parts = S.settings.triggerPos === 'end' ? [text, ...triggers] : [...triggers, text];
    let positive = parts.map((p) => String(p).trim().replace(/^[,\s]+|[,\s]+$/g, '')).filter(Boolean).join(sep);
    if (S.settings.loraFormat === 'tag' && loras.length) {
      positive += sep + loras.map((l) => `<lora:${PV.loraTagName(l.item)}:${fmtW(l.weight)}>`).join(' ');
    }
    const loraList = loras.map((l) => `${l.item.file || l.item.name} : ${fmtW(l.weight)}`).join('\n');
    return { positive, loras, loraList };
  }

  function randomCharacter() {
    if (document.querySelector('.rc')) return; // already open
    if (!PV.itemsIn('character').length) {
      toast('No characters yet — add some in the Library first');
      location.hash = '#library';
      PV.libraryView.showCat('character');
      return;
    }
    const sources = PV.sources('character');
    if (prefs.source && !sources.includes(prefs.source)) prefs.source = '';

    const m = PV.openModal(`
      <div class="rc">
        <div class="rc-head">
          <h3>🎲 Random character</h3>
          ${sources.length ? `<select class="input" data-src aria-label="Source"><option value="">All sources</option>${sources.map((s) => `<option value="${esc(s)}" ${s === prefs.source ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
          <label class="check"><input type="checkbox" data-fav ${prefs.fav ? 'checked' : ''}> ★ only</label>
        </div>
        <div data-body></div>
        <div class="modal-actions">
          <button class="btn" data-act="builder">Use in Builder</button>
          <span class="spacer"></span>
          <button class="btn" data-act="roll" title="Space">🎲 Another one</button>
          <button class="btn primary" data-act="copy" title="Enter">Copy prompt</button>
        </div>
      </div>`, { wide: true });

    const body = m.el.querySelector('[data-body]');
    let cur = null;
    let out = null;

    function roll() {
      const arr = pool();
      if (!arr.length) {
        cur = null;
        body.innerHTML = '<div class="empty">No characters match. Try another source or turn off ★ only.</div>';
        return;
      }
      const choices = arr.length > 1 ? arr.filter((c) => c.id !== lastId) : arr;
      cur = PV.pick(choices);
      lastId = cur.id;
      out = promptFor(cur);
      body.innerHTML = `
        <div class="rc-body">
          <div class="rc-img">${PV.thumb(cur, 'thumb')}</div>
          <div class="rc-info">
            <div class="rc-name">${esc(cur.name)}</div>
            ${cur.source ? `<div class="rc-source">${esc(cur.source)}</div>` : ''}
            <textarea class="input out-text" readonly rows="5" aria-label="Prompt">${esc(out.positive)}</textarea>
            ${out.loras.length && S.settings.loraFormat !== 'tag' ? `<div class="small muted">🧩 LoRAs</div><pre class="lora-out mono">${esc(out.loraList)}</pre>` : ''}
            ${cur.negative ? `<div class="small muted">Negative: <span class="mono">${esc(cur.negative)}</span></div>` : ''}
            ${pool().length > 1 ? '' : '<div class="small muted">This is the only character that matches.</div>'}
          </div>
        </div>`;
    }

    function copy() {
      if (!cur) return;
      let txt = out.positive;
      if (out.loras.length && S.settings.loraFormat !== 'tag') txt += `\n\nLoRAs:\n${out.loraList}`;
      copyText(txt, `${cur.name}'s prompt copied`);
      cur.used = (cur.used || 0) + 1;
      cur.lastUsed = Date.now();
      PV.saveItem(cur);
      PV.addHistory({
        positive: out.positive,
        negative: cur.negative || '',
        loras: out.loras.map((l) => ({ name: l.item.name, file: l.item.file, weight: l.weight })),
      });
    }

    m.el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'roll') roll();
      else if (act === 'copy') copy();
      else if (act === 'builder' && cur && S.builder.slots.character) {
        S.builder.slots.character.ids = [cur.id];
        PV.syncAutoLoras();
        PV.saveBuilderNow();
        m.close();
        if (location.hash === '#builder') PV.builderView.render();
        else location.hash = '#builder';
        toast(`${cur.name} is in the Builder`, 'ok');
      }
    });
    m.el.addEventListener('change', (e) => {
      if (e.target.matches('[data-src]')) prefs.source = e.target.value;
      else if (e.target.matches('[data-fav]')) prefs.fav = e.target.checked;
      else return;
      remember();
      roll();
    });
    m.el.addEventListener('keydown', (e) => {
      if (/^(SELECT|INPUT)$/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); roll(); }
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); copy(); }
    });
    roll();
    // after openModal's own autofocus, so Space rolls right away
    setTimeout(() => m.el.querySelector('[data-act="roll"]').focus(), 60);
  }

  PV.randomCharacter = randomCharacter;
})(window.PV);
