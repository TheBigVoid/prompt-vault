'use strict';
// Experimental "Quick add": turn a Danbooru-style character prompt into a library card.
// Desktop app: opens downloadmost.com in a side window with ➕ buttons on every character.
// Web version: a paste box (copy the tags from the site, paste here).
(function (PV) {
  const { S, esc, toast } = PV;

  const QUICK_ADD_URL = 'https://www.downloadmost.com/NoobAI-XL/danbooru-character/';
  const isDesktop = /Electron/i.test(navigator.userAgent);

  // Tags that come right after the character name but aren't a series.
  const GENERIC = /^(\d+\+?(girl|boy|other)s?|solo|male focus|female|male|multiple (girls|boys)|original|virtual youtuber|.*\b(hair|eyes|skin|ears|tail|breasts|horns|wings)\b.*)$/i;

  const unescape = (s) => String(s || '').replace(/\\([()])/g, '$1').trim();
  const titleCase = (s) => s.replace(/(^|[\s(\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());

  // Reuse an existing spelling, so "one piece" joins your "One Piece" group.
  const canonical = (s) => PV.sources().find((x) => x.toLowerCase() === s.toLowerCase()) || s;

  // "nami \(one piece\)" -> { name: "Nami", source: "One Piece" }
  // "hatsune miku" + tags "hatsune miku, vocaloid, …" -> { name: "Hatsune Miku", source: "Vocaloid" }
  function guessCharacter(rawName, prompt) {
    let name = unescape(rawName);
    let source = '';
    const m = name.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (m) {
      name = m[1];
      source = m[2];
    } else {
      const tags = String(prompt || '').split(',').map(unescape).filter(Boolean);
      const second = tags[1] || '';
      if (second && !GENERIC.test(second) && second.toLowerCase() !== name.toLowerCase()) source = second;
    }
    source = source.replace(/\s*\((series|game|franchise|anime|manga|character)\)\s*$/i, '').trim();
    return { name: titleCase(name), source: source ? canonical(titleCase(source)) : '' };
  }

  function findExisting(name, prompt) {
    const n = name.toLowerCase();
    const p = String(prompt).trim().toLowerCase();
    return PV.itemsIn('character').find((c) => c.name.toLowerCase() === n || (c.prompt || '').trim().toLowerCase() === p);
  }

  // Called by the desktop Quick add window (and the web paste box). Returns 'added' | 'exists' | 'error'.
  async function quickAddCharacter({ name, prompt, image }) {
    try {
      prompt = String(prompt || '').trim();
      if (!name || !prompt) return 'error';
      const g = guessCharacter(name, prompt);
      const existing = findExisting(g.name, prompt);
      if (existing) {
        toast(`${existing.name} is already in your library`);
        return 'exists';
      }
      let thumb = '';
      if (image) {
        try { thumb = await PV.fileToThumb(await (await fetch(image)).blob()); } catch (e) { /* no picture */ }
      }
      const it = PV.newItem('character', { name: g.name, source: g.source, prompt, image: thumb, notes: 'Quick added from downloadmost.com' });
      await PV.saveItem(it);
      PV.emit('data');
      toast(`Added ${g.name}${g.source ? ' (' + g.source + ')' : ''}`, 'ok');
      return 'added';
    } catch (e) {
      return 'error';
    }
  }

  function openQuickAdd() {
    if (isDesktop) {
      const w = window.open(QUICK_ADD_URL, 'pv-quick-add', 'popup,width=1000,height=900');
      if (w) { try { w.focus(); } catch (e) { /* ignore */ } }
      return;
    }
    // Web: the site can't be controlled from here, so copy & paste instead.
    const m = PV.openModal(`
      <h3>⚡ Quick add character</h3>
      <p class="muted small">Open the character list, click a character's <b>Prompt tags</b> box (it selects everything), copy it with Ctrl+C, then paste it here.
        The desktop app does this with one click.</p>
      <p><a class="btn" href="${esc(QUICK_ADD_URL)}" target="_blank" rel="noopener">Open character list ↗</a></p>
      <label class="lbl">Prompt tags<textarea class="input mono" rows="4" data-tags placeholder="nami \\(one piece\\), one piece, 1girl, orange hair, …"></textarea></label>
      <div class="row2">
        <label class="lbl">Name<input class="input" data-name></label>
        <label class="lbl">Source<input class="input" data-source></label>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Done</button><button class="btn primary" data-add>Add character</button></div>`);
    const $ = (s) => m.el.querySelector(s);
    let touched = false;
    $('[data-tags]').addEventListener('input', () => {
      if (touched) return;
      const first = $('[data-tags]').value.split(',')[0];
      const g = guessCharacter(first, $('[data-tags]').value);
      $('[data-name]').value = g.name;
      $('[data-source]').value = g.source;
    });
    const touch = () => { touched = true; };
    $('[data-name]').addEventListener('input', touch);
    $('[data-source]').addEventListener('input', touch);
    $('[data-add]').addEventListener('click', async () => {
      const prompt = $('[data-tags]').value.trim();
      const name = $('[data-name]').value.trim();
      if (!prompt || !name) return toast('Paste the prompt tags first', 'err');
      const existing = findExisting(name, prompt);
      if (existing) return toast(`${existing.name} is already in your library`);
      const src = $('[data-source]').value.trim();
      await PV.saveItem(PV.newItem('character', { name, source: src ? canonical(src) : '', prompt, notes: 'Quick added from downloadmost.com' }));
      PV.emit('data');
      toast(`Added ${name}`, 'ok');
      $('[data-tags]').value = $('[data-name]').value = $('[data-source]').value = '';
      touched = false;
      $('[data-tags]').focus();
    });
  }

  Object.assign(PV, { guessCharacter, quickAddCharacter, openQuickAdd });
})(window.PV);
