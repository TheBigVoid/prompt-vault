'use strict';
(function (PV) {
  const { S, splitTags, fmtW, stem, compatLevel, pick } = PV;

  const hasWildcards = (t) => /\{[^{}]*\|[^{}]*\}|__[a-z0-9_-]+__/i.test(t || '');

  // {a|b|c} -> one option (nested ok). __category__ -> random item prompt from that category.
  function resolveWildcards(text, rand, resolveBraces, depth = 0) {
    if (!text) return '';
    const choose = (arr) => arr[Math.floor(rand() * arr.length)];
    text = text.replace(/__([a-z0-9_-]+)__/gi, (m, c) => {
      const pool = PV.itemsIn(c.toLowerCase());
      if (!pool.length || depth > 4) return m;
      return resolveWildcards(choose(pool).prompt, rand, resolveBraces, depth + 1);
    });
    if (!resolveBraces) return text;
    const re = /\{([^{}]*)\}/;
    let guard = 0;
    let m;
    while (guard++ < 500 && (m = text.match(re))) {
      const inner = m[1];
      const rep = inner.includes('|') ? choose(inner.split('|')).trim() : '\u0000' + inner + '\u0001';
      text = text.slice(0, m.index) + rep + text.slice(m.index + m[0].length);
    }
    return text.replace(/\u0000/g, '{').replace(/\u0001/g, '}');
  }

  const clean = (p) => String(p || '').trim().replace(/^[,\s]+|[,\s]+$/g, '');
  const join = (parts, sep) => parts.map(clean).filter(Boolean).join(sep);

  function selectedItems(b = S.builder) {
    const out = [];
    for (const c of S.settings.categories) {
      const slot = b.slots[c.id];
      if (!slot) continue;
      for (const id of slot.ids) {
        const it = S.items.get(id);
        if (it) out.push({ cat: c, item: it });
      }
    }
    return out;
  }

  function activeLoras(b = S.builder) {
    return b.loras
      .filter((l) => l.on !== false)
      .map((l) => ({ ...l, item: S.items.get(l.id) }))
      .filter((l) => l.item);
  }

  const loraTagName = (it) => stem(it.file || it.name);

  function build(b = S.builder) {
    const st = S.settings;
    const sep = st.separator || ', ';
    const rand = PV.rng(b.wcSeed || 1);
    const wc = (t) => resolveWildcards(t, rand, st.resolveWildcards);
    const pos = [];
    const neg = [];
    for (const { cat, item } of selectedItems(b)) {
      const t = wc(item.prompt);
      if (cat.kind === 'negative') neg.push(t);
      else pos.push(t);
      if (item.negative) neg.push(wc(item.negative));
    }
    const loras = activeLoras(b);
    const triggers = [...new Set(loras.map((l) => clean(l.item.triggers)).filter(Boolean))];
    const parts = [wc(b.prefix)];
    if (st.triggerPos === 'start') parts.push(...triggers);
    parts.push(...pos);
    if (st.triggerPos === 'end') parts.push(...triggers);
    parts.push(wc(b.suffix));
    let positive = join(parts, sep);
    if (st.loraFormat === 'tag' && loras.length) {
      positive += (positive ? sep : '') + loras.map((l) => `<lora:${loraTagName(l.item)}:${fmtW(l.weight)}>`).join(' ');
    }
    const negative = join([...neg, wc(b.negative)], sep);
    const loraList = loras.map((l) => `${l.item.file || l.item.name} : ${fmtW(l.weight)}`).join('\n');

    const warnings = [];
    if (b.baseModel) {
      for (const l of loras) {
        const lv = compatLevel(l.item.baseModel, b.baseModel);
        if (lv === 0) warnings.push(`"${l.item.name}" is a ${l.item.baseModel} LoRA — won't work well on ${b.baseModel}.`);
      }
    }
    for (const l of loras) {
      if (!l.item.file) warnings.push(`"${l.item.name}" has no file name set — ComfyUI needs the .safetensors name.`);
    }
    const allText = [b.prefix, b.suffix, b.negative, ...selectedItems(b).map((x) => x.item.prompt + ' ' + (x.item.negative || ''))].join(' ');
    return { positive, negative, loras, loraList, warnings, hasWildcards: hasWildcards(allText) };
  }

  // ---------- LoRA stack sync ----------
  // Items (e.g. a character) can link LoRAs; those get added/removed automatically.
  function syncAutoLoras(b = S.builder) {
    const want = new Map();
    for (const { item } of selectedItems(b)) {
      for (const l of item.loras || []) if (!want.has(l.id)) want.set(l.id, { weight: l.weight, from: item.id });
    }
    b.loras = b.loras.filter((l) => l.src !== 'auto' || want.has(l.id));
    for (const [id, v] of want) {
      if (!b.loras.some((l) => l.id === id) && S.items.has(id)) {
        b.loras.push({ id, weight: v.weight ?? S.items.get(id).weight ?? 1, src: 'auto', from: v.from, on: true });
      }
    }
  }

  // ---------- Randomizer ----------
  function itemCompat(it, base) {
    if (!base || !it.loras || !it.loras.length) return true;
    return it.loras.every((l) => { const li = S.items.get(l.id); return !li || compatLevel(li.baseModel, base) > 0; });
  }

  // Filters are "soft": if a filter would leave nothing, it's ignored for that slot.
  function candidates(catId, b = S.builder) {
    let pool = PV.itemsIn(catId);
    const soft = (fn) => { const f = pool.filter(fn); if (f.length) pool = f; };
    if (b.favOnly) soft((i) => i.fav);
    const tags = splitTags(b.filterTags);
    if (tags.length) soft((i) => (i.tags || []).some((t) => tags.includes(t)));
    if (b.baseModel) soft((i) => itemCompat(i, b.baseModel));
    return pool;
  }

  function rollSlot(catId, b = S.builder, force = false) {
    const slot = b.slots[catId];
    if (!slot) return;
    if (slot.locked && !force) return;
    if (!force && (slot.chance ?? 100) < 100 && Math.random() * 100 >= slot.chance) {
      slot.ids = [];
      return;
    }
    let pool = candidates(catId, b);
    if (pool.length > 1) pool = pool.filter((i) => !slot.ids.includes(i.id));
    if (!pool.length) return;
    slot.ids = [pick(pool).id];
  }

  function loraCandidates(b = S.builder, type = b.randLoraType) {
    let pool = PV.loras().filter((l) => !b.loras.some((x) => x.id === l.id));
    if (type) pool = pool.filter((l) => l.loraType === type);
    if (b.favOnly) { const f = pool.filter((l) => l.fav); if (f.length) pool = f; }
    const tags = splitTags(b.filterTags);
    if (tags.length) { const f = pool.filter((l) => (l.tags || []).some((t) => tags.includes(t))); if (f.length) pool = f; }
    if (b.baseModel) {
      const exact = pool.filter((l) => compatLevel(l.baseModel, b.baseModel) === 2);
      pool = exact.length ? exact : pool.filter((l) => compatLevel(l.baseModel, b.baseModel) === 1);
    }
    return pool;
  }

  function addRandomLora(b = S.builder, type) {
    const pool = loraCandidates(b, type);
    if (!pool.length) return false;
    const l = pick(pool);
    b.loras.push({ id: l.id, weight: l.weight ?? 1, src: 'rand', on: true });
    return true;
  }

  function randomizeAll(b = S.builder) {
    for (const c of S.settings.categories) rollSlot(c.id, b);
    syncAutoLoras(b);
    b.loras = b.loras.filter((l) => l.src !== 'rand' || l.locked);
    for (let i = 0; i < (b.randLoraCount || 0); i++) if (!addRandomLora(b)) break;
    b.wcSeed = PV.newSeed();
  }

  Object.assign(PV, {
    resolveWildcards, hasWildcards, build, selectedItems, activeLoras, syncAutoLoras,
    candidates, rollSlot, randomizeAll, addRandomLora, loraCandidates, loraTagName, itemCompat,
  });
})(window.PV);
