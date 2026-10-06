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

  // ---------- Outfit variants ----------
  // An item can have variants (for characters: outfits). The builder remembers which
  // one is chosen per item in slot.variant[itemId], and slot.variantLock[itemId].
  const variantsOf = (it) => (it && Array.isArray(it.variants) ? it.variants : []);

  function activeVariant(slot, it) {
    const id = slot && slot.variant ? slot.variant[it.id] : '';
    return id ? variantsOf(it).find((v) => v.id === id) || null : null;
  }

  function setVariant(slot, itemId, variantId) {
    slot.variant = slot.variant || {};
    slot.variant[itemId] = variantId || '';
  }

  // Random outfit (never "base only"; that's a manual choice). Avoids repeating when possible.
  function rollVariant(slot, it, force = false) {
    const vs = variantsOf(it);
    if (!vs.length) return;
    if (!force && slot.variantLock && slot.variantLock[it.id]) return;
    const cur = slot.variant ? slot.variant[it.id] : '';
    const pool = vs.length > 1 ? vs.filter((v) => v.id !== cur) : vs;
    setVariant(slot, it.id, pick(pool).id);
  }

  function selectedItems(b = S.builder) {
    const out = [];
    for (const c of S.settings.categories) {
      const slot = b.slots[c.id];
      if (!slot) continue;
      for (const id of slot.ids) {
        const it = S.items.get(id);
        if (it) out.push({ cat: c, item: it, variant: activeVariant(slot, it) });
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

  // Builds the prompt and also returns "segments": each piece of the positive prompt
  // tagged with where it came from, so the UI can color-code it.
  function build(b = S.builder) {
    const st = S.settings;
    const sep = st.separator || ', ';
    const rand = PV.rng(b.wcSeed || 1);
    const wc = (t) => clean(resolveWildcards(t, rand, st.resolveWildcards));
    const segs = [];
    const neg = [];
    const push = (text, kind, label) => { if (text) segs.push({ text, kind, label }); };

    const items = selectedItems(b);
    const pos = [];
    for (const { cat, item, variant } of items) {
      const t = wc(item.prompt);
      const vt = variant ? wc(variant.prompt) : '';
      if (cat.kind === 'negative') { neg.push(t, vt); continue; }
      if (t) pos.push({ text: t, kind: cat.id, label: item.name });
      if (vt) pos.push({ text: vt, kind: cat.id, label: `${item.name} · ${variant.name}`, variant: true });
      if (item.negative) neg.push(wc(item.negative));
    }
    const loras = activeLoras(b);
    const triggers = [...new Set(loras.map((l) => clean(l.item.triggers)).filter(Boolean))];
    const trigSegs = triggers.map((t) => ({ text: t, kind: 'lora', label: 'LoRA trigger words' }));

    push(wc(b.prefix), 'prefix', 'Prefix');
    if (st.triggerPos === 'start') segs.push(...trigSegs);
    segs.push(...pos);
    if (st.triggerPos === 'end') segs.push(...trigSegs);
    push(wc(b.suffix), 'suffix', 'Suffix');
    if (st.loraFormat === 'tag' && loras.length) {
      push(loras.map((l) => `<lora:${loraTagName(l.item)}:${fmtW(l.weight)}>`).join(' '), 'lora', 'LoRA tags');
    }
    const positive = segs.map((s) => s.text).join(sep);
    const negative = [...neg, wc(b.negative)].map(clean).filter(Boolean).join(sep);
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
    // a character outfit plus the generic Outfit slot = two sets of clothes in one prompt
    const worn = items.find((x) => x.variant && x.cat.kind !== 'negative');
    const outfitSlot = b.slots.outfit;
    if (worn && outfitSlot && outfitSlot.ids.some((id) => S.items.has(id))) {
      warnings.push(`${worn.item.name} is wearing "${worn.variant.name}" and the Outfit slot has an outfit too. Remove one to avoid mixed clothes.`);
    }
    const allText = [b.prefix, b.suffix, b.negative, ...items.map((x) => `${x.item.prompt} ${x.item.negative || ''} ${x.variant ? x.variant.prompt : ''}`)].join(' ');
    return { positive, negative, segments: segs, sep, loras, loraList, warnings, hasWildcards: hasWildcards(allText) };
  }

  // ---------- LoRA stack sync ----------
  // Items (e.g. a character) and their chosen outfit can link LoRAs; those get added/removed automatically.
  function syncAutoLoras(b = S.builder) {
    const want = new Map();
    for (const { item, variant } of selectedItems(b)) {
      for (const l of item.loras || []) if (!want.has(l.id)) want.set(l.id, { weight: l.weight, from: item.id });
      if (variant && variant.lora && variant.lora.id && !want.has(variant.lora.id)) {
        want.set(variant.lora.id, { weight: variant.lora.weight, from: item.id });
      }
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

  // Filter words match an item's tags or its source ("one piece").
  const matchesFilter = (i, words) => (i.tags || []).some((t) => words.includes(t)) || words.includes((i.source || '').toLowerCase());

  // Filters are "soft": if a filter would leave nothing, it's ignored for that slot.
  function candidates(catId, b = S.builder) {
    let pool = PV.itemsIn(catId);
    const soft = (fn) => { const f = pool.filter(fn); if (f.length) pool = f; };
    if (b.favOnly) soft((i) => i.fav);
    const tags = splitTags(b.filterTags);
    if (tags.length) soft((i) => matchesFilter(i, tags));
    if (b.baseModel) soft((i) => itemCompat(i, b.baseModel));
    return pool;
  }

  // Put an item in a slot (and pick an outfit for it if it has any).
  function addToSlot(slot, it) {
    if (slot.ids.includes(it.id)) return;
    slot.ids.push(it.id);
    rollVariant(slot, it, true);
  }

  function rollSlot(catId, b = S.builder, force = false) {
    const slot = b.slots[catId];
    if (!slot) return;
    if (slot.locked && !force) {
      // a locked character still gets a new outfit, unless the outfit is locked too
      for (const id of slot.ids) { const it = S.items.get(id); if (it) rollVariant(slot, it); }
      return;
    }
    if (!force && (slot.chance ?? 100) < 100 && Math.random() * 100 >= slot.chance) {
      slot.ids = [];
      return;
    }
    let pool = candidates(catId, b);
    if (pool.length > 1) pool = pool.filter((i) => !slot.ids.includes(i.id));
    if (!pool.length) return;
    slot.ids = [];
    addToSlot(slot, pick(pool));
  }

  // True when a chosen character outfit is standing in for the Outfit slot.
  function outfitCoveredByVariant(b = S.builder) {
    return selectedItems(b).some((x) => x.variant && x.cat.kind !== 'negative');
  }

  function loraCandidates(b = S.builder, type = b.randLoraType) {
    let pool = PV.loras().filter((l) => !b.loras.some((x) => x.id === l.id));
    if (type) pool = pool.filter((l) => l.loraType === type);
    if (b.favOnly) { const f = pool.filter((l) => l.fav); if (f.length) pool = f; }
    const tags = splitTags(b.filterTags);
    if (tags.length) { const f = pool.filter((l) => matchesFilter(l, tags)); if (f.length) pool = f; }
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
    // A character wearing one of their outfits replaces the generic Outfit slot,
    // so the prompt doesn't get two different outfits.
    const outfit = b.slots.outfit;
    if (outfit && !outfit.locked && outfitCoveredByVariant(b)) outfit.ids = [];
    syncAutoLoras(b);
    b.loras = b.loras.filter((l) => l.src !== 'rand' || l.locked);
    for (let i = 0; i < (b.randLoraCount || 0); i++) if (!addRandomLora(b)) break;
    b.wcSeed = PV.newSeed();
  }

  Object.assign(PV, {
    resolveWildcards, hasWildcards, build, selectedItems, activeLoras, syncAutoLoras,
    candidates, rollSlot, randomizeAll, addRandomLora, loraCandidates, loraTagName, itemCompat,
    variantsOf, activeVariant, setVariant, rollVariant, addToSlot, outfitCoveredByVariant,
  });
})(window.PV);
