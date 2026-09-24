'use strict';
(function (PV) {
  const { debounce, uid } = PV;

  // ---------- IndexedDB ----------
  const DB = (() => {
    const NAME = 'prompt-vault';
    const VER = 1;
    let dbp;
    function open() {
      if (!dbp) {
        dbp = new Promise((res, rej) => {
          const r = indexedDB.open(NAME, VER);
          r.onupgradeneeded = () => {
            const d = r.result;
            for (const s of ['items', 'presets', 'history', 'meta']) {
              if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
            }
          };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      }
      return dbp;
    }
    async function tx(store, mode, fn) {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let out;
        if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    }
    return {
      all: (s) => tx(s, 'readonly', (st) => st.getAll()),
      put: (s, v) => tx(s, 'readwrite', (st) => st.put(v)),
      del: (s, id) => tx(s, 'readwrite', (st) => st.delete(id)),
      clear: (s) => tx(s, 'readwrite', (st) => st.clear()),
      putMany: (s, arr) => tx(s, 'readwrite', (st) => { arr.forEach((v) => st.put(v)); }),
    };
  })();

  // ---------- Defaults ----------
  const DEFAULT_CATEGORIES = [
    { id: 'character', name: 'Characters', icon: '👤', kind: 'positive' },
    { id: 'outfit', name: 'Outfits', icon: '👗', kind: 'positive' },
    { id: 'pose', name: 'Poses', icon: '🤸', kind: 'positive' },
    { id: 'expression', name: 'Expressions', icon: '😊', kind: 'positive' },
    { id: 'scene', name: 'Scenes', icon: '🏞️', kind: 'positive' },
    { id: 'camera', name: 'Camera', icon: '🎥', kind: 'positive' },
    { id: 'lighting', name: 'Lighting', icon: '💡', kind: 'positive' },
    { id: 'style', name: 'Styles', icon: '🎨', kind: 'positive' },
    { id: 'negative', name: 'Negatives', icon: '⛔', kind: 'negative' },
  ];
  const BASE_MODELS = ['SD1.5', 'SDXL', 'Pony', 'Illustrious', 'NoobAI', 'Flux', 'SD3.5', 'Qwen', 'Wan', 'Other'];
  const LORA_TYPES = ['character', 'style', 'pose', 'clothing', 'concept', 'detail', 'other'];

  const DEFAULT_SETTINGS = {
    id: 'settings',
    categories: DEFAULT_CATEGORIES,
    baseModels: BASE_MODELS,
    loraFormat: 'comfy', // 'comfy' = LoRA list for loader nodes, 'tag' = <lora:name:w> in prompt
    triggerPos: 'start',
    resolveWildcards: true,
    separator: ', ',
    defaultPrefix: 'masterpiece, best quality, amazing quality',
    defaultNegative: 'lowres, worst quality, low quality, bad anatomy, bad hands, extra fingers, watermark, signature, text',
    theme: 'system',
  };

  const S = { items: new Map(), presets: [], history: [], settings: null, builder: null };

  function defaultBuilder() {
    return {
      id: 'builder',
      slots: {},
      loras: [],
      prefix: S.settings.defaultPrefix,
      suffix: '',
      negative: S.settings.defaultNegative,
      baseModel: '',
      filterTags: '',
      favOnly: false,
      randLoraCount: 0,
      randLoraType: '',
      wcSeed: PV.newSeed(),
    };
  }

  function ensureSlots(b) {
    b.slots = b.slots || {};
    for (const c of S.settings.categories) {
      if (!b.slots[c.id]) b.slots[c.id] = { ids: [], locked: c.kind === 'negative', chance: 100 };
    }
    for (const k of Object.keys(b.slots)) {
      if (!S.settings.categories.some((c) => c.id === k)) delete b.slots[k];
    }
    return b;
  }

  async function load() {
    const [items, presets, history, meta] = await Promise.all([
      DB.all('items'), DB.all('presets'), DB.all('history'), DB.all('meta'),
    ]);
    items.forEach((i) => S.items.set(i.id, i));
    S.presets = presets.sort((a, b) => b.updated - a.updated);
    S.history = history.sort((a, b) => b.time - a.time);
    const m = Object.fromEntries(meta.map((x) => [x.id, x]));
    S.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(m.settings || {}) };
    S.builder = ensureSlots({ ...defaultBuilder(), ...(m.builder || {}) });
    if (!m.seeded) {
      await seedStarter();
      await DB.put('meta', { id: 'seeded', time: Date.now() });
    }
  }

  // ---------- Queries ----------
  const cat = (id) => S.settings.categories.find((c) => c.id === id);
  const itemsIn = (catId) =>
    [...S.items.values()].filter((i) => i.cat === catId).sort((a, b) => a.name.localeCompare(b.name));
  const loras = () => itemsIn('lora');
  // Unique sources (series / franchise), optionally within one category
  const sources = (catId) => {
    const m = new Map();
    for (const i of S.items.values()) {
      if (!i.source || (catId && i.cat !== catId)) continue;
      const k = i.source.toLowerCase();
      if (!m.has(k)) m.set(k, i.source);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  };

  // ---------- Mutations ----------
  async function saveItem(it) {
    it.updated = Date.now();
    if (!it.created) it.created = it.updated;
    S.items.set(it.id, it);
    await DB.put('items', it);
    requestPersist();
  }
  async function saveItems(arr) {
    const now = Date.now();
    arr.forEach((it) => { it.updated = now; if (!it.created) it.created = now; S.items.set(it.id, it); });
    await DB.putMany('items', arr);
    requestPersist();
  }
  async function deleteItem(id) {
    S.items.delete(id);
    await DB.del('items', id);
    const b = S.builder;
    for (const s of Object.values(b.slots)) s.ids = s.ids.filter((x) => x !== id);
    b.loras = b.loras.filter((l) => l.id !== id && l.from !== id);
    // unlink from items that referenced this LoRA
    const touched = [];
    for (const it of S.items.values()) {
      if (it.loras && it.loras.some((l) => l.id === id)) {
        it.loras = it.loras.filter((l) => l.id !== id);
        touched.push(it);
      }
    }
    if (touched.length) await saveItems(touched);
    saveBuilder();
  }

  const saveSettings = () => DB.put('meta', S.settings);
  const saveBuilderNow = () => DB.put('meta', S.builder);
  const saveBuilder = debounce(saveBuilderNow, 300);

  async function savePreset(p) {
    p.updated = Date.now();
    if (!p.created) p.created = p.updated;
    S.presets = [p, ...S.presets.filter((x) => x.id !== p.id)];
    await DB.put('presets', p);
  }
  async function deletePreset(id) {
    S.presets = S.presets.filter((x) => x.id !== id);
    await DB.del('presets', id);
  }

  async function addHistory(entry) {
    const last = S.history[0];
    if (last && last.positive === entry.positive && last.negative === entry.negative) return;
    entry.id = uid();
    entry.time = Date.now();
    S.history.unshift(entry);
    await DB.put('history', entry);
    while (S.history.length > 300) {
      const old = S.history.pop();
      await DB.del('history', old.id);
    }
  }
  async function deleteHistory(id) {
    S.history = S.history.filter((h) => h.id !== id);
    await DB.del('history', id);
  }
  async function clearHistory() {
    S.history = [];
    await DB.clear('history');
  }

  let persistAsked = false;
  function requestPersist() {
    if (persistAsked) return;
    persistAsked = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  // ---------- Backup ----------
  function exportAll() {
    return JSON.stringify({
      app: 'prompt-vault',
      version: 1,
      exported: new Date().toISOString(),
      settings: S.settings,
      builder: S.builder,
      items: [...S.items.values()],
      presets: S.presets,
      history: S.history,
    });
  }

  async function importAll(data, mode = 'merge') {
    if (!data || data.app !== 'prompt-vault') throw new Error('Not a Prompt Vault backup file');
    if (mode === 'replace') {
      await Promise.all(['items', 'presets', 'history'].map((s) => DB.clear(s)));
      S.items.clear();
      S.presets = [];
      S.history = [];
    }
    if (data.settings && (mode === 'replace' || !S.settings)) {
      S.settings = { ...structuredClone(DEFAULT_SETTINGS), ...data.settings, id: 'settings' };
    } else if (data.settings) {
      // merge: add any categories we don't have yet
      for (const c of data.settings.categories || []) {
        if (!cat(c.id)) S.settings.categories.push(c);
      }
      for (const bm of data.settings.baseModels || []) {
        if (!S.settings.baseModels.includes(bm)) S.settings.baseModels.push(bm);
      }
    }
    await saveSettings();
    const items = data.items || [];
    items.forEach((i) => S.items.set(i.id, i));
    await DB.putMany('items', items);
    const presets = data.presets || [];
    await DB.putMany('presets', presets);
    S.presets = [...presets, ...S.presets.filter((p) => !presets.some((x) => x.id === p.id))].sort((a, b) => b.updated - a.updated);
    const hist = data.history || [];
    await DB.putMany('history', hist);
    S.history = [...hist, ...S.history.filter((h) => !hist.some((x) => x.id === h.id))].sort((a, b) => b.time - a.time);
    if (mode === 'replace' && data.builder) S.builder = { ...defaultBuilder(), ...data.builder };
    ensureSlots(S.builder);
    await saveBuilderNow();
    return { items: items.length, presets: presets.length, history: hist.length };
  }

  async function wipeAll() {
    await Promise.all(['items', 'presets', 'history', 'meta'].map((s) => DB.clear(s)));
    await DB.put('meta', { id: 'seeded', time: Date.now() });
    S.items.clear();
    S.presets = [];
    S.history = [];
    S.settings = structuredClone(DEFAULT_SETTINGS);
    S.builder = ensureSlots(defaultBuilder());
  }

  // ---------- Starter pack ----------
  const STARTER = {
    character: [
      ['Example: Silver Knight', '1girl, solo, long silver hair, red eyes, silver plate armor, cape', 'fantasy, example', 'Original'],
    ],
    outfit: [
      ['Casual (random)', '{hoodie|oversized sweater|crop top|t-shirt}, {jeans|pleated skirt|shorts|cargo pants}, sneakers', 'casual, wildcard'],
      ['School uniform', 'school uniform, serafuku, pleated skirt, knee socks, loafers', 'uniform'],
      ['Evening gown', 'elegant evening gown, {red|black|emerald|midnight blue} dress, jewelry, high heels', 'formal, wildcard'],
      ['Fantasy adventurer', 'leather armor, belt pouches, hooded cloak, boots, gloves', 'fantasy'],
      ['Cyberpunk jacket', 'cyberpunk, techwear, glowing jacket, fingerless gloves, choker', 'scifi'],
    ],
    pose: [
      ['Standing (contrapposto)', 'standing, contrapposto, hand on hip', 'standing'],
      ['Looking back', 'looking back, from behind, looking over shoulder', 'dynamic'],
      ['Arms crossed', 'arms crossed, standing, confident', 'standing'],
      ['Sitting cross-legged', 'sitting, crossed legs, hands on lap', 'sitting'],
      ['Sitting on chair', 'sitting on chair, leaning forward, elbows on knees', 'sitting'],
      ['Jumping', 'jumping, midair, dynamic pose, motion blur', 'dynamic, action'],
      ['Running', 'running, dynamic pose, hair flowing', 'dynamic, action'],
      ['Lying on back', 'lying, on back, arms above head, on bed', 'lying'],
      ['Kneeling', 'kneeling, hands on thighs', 'kneeling'],
      ['Peace sign', 'v, peace sign, one eye closed, smile', 'cute'],
      ['Reaching toward viewer', 'reaching towards viewer, outstretched hand, foreshortening', 'dynamic'],
      ['Fighting stance', 'fighting stance, holding sword, battle ready', 'action'],
    ],
    expression: [
      ['Smile', 'smile, happy, open mouth', 'happy'],
      ['Smug', 'smug, half-closed eyes, smirk', ''],
      ['Angry', 'angry, frown, clenched teeth', ''],
      ['Surprised', 'surprised, wide-eyed, open mouth', ''],
      ['Blushing', 'blush, embarrassed, looking away', 'cute'],
      ['Crying', 'crying, tears, sad', 'sad'],
      ['Determined', 'determined, serious, furrowed brow', ''],
    ],
    scene: [
      ['City street at night', 'city street, night, neon signs, wet pavement, reflections', 'urban, night'],
      ['Forest clearing', 'forest clearing, sunbeams, trees, grass, flowers', 'nature'],
      ['Beach at sunset', 'beach, ocean, sunset, waves, sand', 'nature'],
      ['Cozy bedroom', 'indoors, bedroom, bed, window, plants, warm', 'indoors'],
      ['Castle interior (random)', '{throne room|grand ballroom|castle library|castle hallway}, indoors, fantasy', 'fantasy, wildcard'],
      ['Simple background', 'simple background, white background', 'studio'],
    ],
    camera: [
      ['Close-up portrait', 'close-up, portrait, face focus', ''],
      ['Upper body', 'upper body', ''],
      ['Cowboy shot', 'cowboy shot', ''],
      ['Full body', 'full body', ''],
      ['From above', 'from above, high angle', 'angle'],
      ['From below', 'from below, low angle', 'angle'],
      ['Dutch angle', 'dutch angle', 'angle'],
      ['Wide shot', 'wide shot, scenery, very wide shot', ''],
    ],
    lighting: [
      ['Golden hour', 'golden hour, warm lighting, sunlight', ''],
      ['Rim lighting', 'rim lighting, backlighting', ''],
      ['Neon glow', 'neon lights, colorful lighting, glow', 'night'],
      ['Dramatic chiaroscuro', 'dramatic lighting, chiaroscuro, high contrast, shadows', ''],
      ['Soft studio', 'soft lighting, studio lighting', ''],
    ],
    style: [
      ['Anime screencap', 'anime screencap, anime coloring, cel shading', 'anime'],
      ['Watercolor', 'watercolor (medium), traditional media, soft colors', 'painterly'],
      ['Oil painting', 'oil painting (medium), impasto, painterly', 'painterly'],
      ['Semi-realistic', 'semi-realistic, detailed skin, soft shading', ''],
      ['3D render', '3d, blender (medium), octane render', ''],
    ],
    negative: [
      ['Extra anatomy fixes', 'bad feet, missing fingers, fused fingers, extra limbs, deformed', 'anatomy'],
      ['No text / logos', 'text, logo, username, artist name, speech bubble', ''],
      ['No NSFW', 'nsfw, nude', 'safety'],
    ],
  };

  async function seedStarter() {
    const arr = [];
    for (const [catId, rows] of Object.entries(STARTER)) {
      for (const [name, prompt, tags, source = ''] of rows) {
        arr.push({ id: uid(), cat: catId, name, source, prompt, negative: '', tags: PV.splitTags(tags), notes: '', image: '', fav: false, loras: [] });
      }
    }
    await saveItems(arr);
  }

  Object.assign(PV, {
    DB, S, DEFAULT_SETTINGS, LORA_TYPES, defaultBuilder, ensureSlots, load, cat, itemsIn, loras, sources,
    saveItem, saveItems, deleteItem, saveSettings, saveBuilder, saveBuilderNow, savePreset, deletePreset,
    addHistory, deleteHistory, clearHistory, exportAll, importAll, wipeAll, seedStarter,
  });
})(window.PV);
