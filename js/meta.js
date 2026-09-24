'use strict';
// Reading generation metadata from images, and LoRA info from a model folder.
(function (PV) {
  const { stem, normBase } = PV;

  // ---------- PNG text chunks (ComfyUI "prompt"/"workflow", A1111 "parameters") ----------
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readPngText(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!sig.every((v, i) => buf[i] === v)) return null;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const latin1 = new TextDecoder('latin1');
    const utf8 = new TextDecoder('utf-8');
    const out = {};
    let p = 8;
    while (p + 8 <= buf.length) {
      const len = dv.getUint32(p);
      const type = latin1.decode(buf.subarray(p + 4, p + 8));
      const data = buf.subarray(p + 8, p + 8 + len);
      try {
        if (type === 'tEXt') {
          const z = data.indexOf(0);
          // ComfyUI writes UTF-8 JSON here even though PNG spec says latin1
          out[latin1.decode(data.subarray(0, z))] = utf8.decode(data.subarray(z + 1));
        } else if (type === 'zTXt') {
          const z = data.indexOf(0);
          out[latin1.decode(data.subarray(0, z))] = utf8.decode(await inflate(data.subarray(z + 2)));
        } else if (type === 'iTXt') {
          const z = data.indexOf(0);
          const key = latin1.decode(data.subarray(0, z));
          const compressed = data[z + 1] === 1;
          let q = z + 3;
          q = data.indexOf(0, q) + 1; // language tag
          q = data.indexOf(0, q) + 1; // translated keyword
          const body = data.subarray(q);
          out[key] = utf8.decode(compressed ? await inflate(body) : body);
        } else if (type === 'IEND') break;
      } catch (e) { /* skip unreadable chunk */ }
      p += 12 + len;
    }
    return out;
  }

  // ComfyUI API-format graph -> positive / negative / loras / checkpoint
  function parseComfyPrompt(json) {
    const g = typeof json === 'string' ? JSON.parse(json) : json;
    const textKeys = ['populated_text', 'text', 'text_g', 'string', 'prompt', 'value', 'wildcard_text', 'text_positive'];
    const seen = new Set();
    function resolveText(ref, depth = 0) {
      if (typeof ref === 'string') return ref;
      if (!Array.isArray(ref) || depth > 12) return '';
      const n = g[ref[0]];
      if (!n || !n.inputs) return '';
      const key = ref[0] + ':' + depth;
      if (seen.has(key)) return '';
      seen.add(key);
      const inp = n.inputs;
      for (const k of textKeys) {
        if (k in inp) { const t = resolveText(inp[k], depth + 1); if (t && t.trim()) return t; }
      }
      const parts = [];
      for (const [k, v] of Object.entries(inp)) {
        if (Array.isArray(v) && /cond|positive|clip_?text|guidance|conditioning/i.test(k)) {
          const t = resolveText(v, depth + 1);
          if (t) parts.push(t);
        }
      }
      return parts.join(', ');
    }

    let positive = '';
    let negative = '';
    for (const n of Object.values(g)) {
      const inp = n && n.inputs;
      if (inp && Array.isArray(inp.positive)) {
        seen.clear();
        positive = resolveText(inp.positive);
        seen.clear();
        negative = Array.isArray(inp.negative) ? resolveText(inp.negative) : '';
        if (positive) break;
      }
    }
    if (!positive) {
      // Flux / guider-style graphs: fall back to the text encoders in order.
      const texts = Object.values(g)
        .filter((n) => n && n.inputs && /TextEncode|Prompt/i.test(n.class_type || '') && typeof n.inputs.text === 'string')
        .map((n) => n.inputs.text);
      positive = texts[0] || '';
      negative = texts[1] || '';
    }

    const loras = [];
    let checkpoint = '';
    for (const n of Object.values(g)) {
      const inp = (n && n.inputs) || {};
      if (typeof inp.lora_name === 'string') {
        loras.push({ file: inp.lora_name, weight: Number(inp.strength_model ?? inp.strength ?? 1) });
      }
      for (const v of Object.values(inp)) {
        // rgthree Power Lora Loader style: { on, lora, strength }
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.lora === 'string' && v.on !== false && v.lora !== 'None') {
          loras.push({ file: v.lora, weight: Number(v.strength ?? 1) });
        }
      }
      if (!checkpoint && typeof inp.ckpt_name === 'string') checkpoint = inp.ckpt_name;
      if (!checkpoint && typeof inp.unet_name === 'string') checkpoint = inp.unet_name;
    }
    const tagged = extractLoraTags(positive);
    positive = tagged.text;
    loras.push(...tagged.loras);
    return { positive, negative, loras: dedupeLoras(loras), checkpoint, source: 'ComfyUI' };
  }

  // A1111 / Forge "parameters" text
  function parseA1111(text) {
    const lines = text.split('\n');
    const idxNeg = lines.findIndex((l) => l.startsWith('Negative prompt:'));
    const idxSteps = lines.findIndex((l) => /^Steps: \d+/.test(l));
    const endPos = idxNeg >= 0 ? idxNeg : idxSteps >= 0 ? idxSteps : lines.length;
    let positive = lines.slice(0, endPos).join('\n').trim();
    let negative = idxNeg >= 0 ? lines.slice(idxNeg, idxSteps >= 0 ? idxSteps : lines.length).join('\n').replace(/^Negative prompt:\s*/, '').trim() : '';
    const tagged = extractLoraTags(positive);
    const model = idxSteps >= 0 ? (lines[idxSteps].match(/Model: ([^,]+)/) || [])[1] || '' : '';
    return { positive: tagged.text, negative, loras: dedupeLoras(tagged.loras), checkpoint: model, source: 'A1111/Forge' };
  }

  function extractLoraTags(text) {
    const loras = [];
    const t = String(text || '').replace(/<lora:([^:>]+)(?::([\d.\-]+))?(?::[^>]*)?>/gi, (m, name, w) => {
      loras.push({ file: name, weight: w ? Number(w) : 1 });
      return '';
    });
    return { text: t.replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim().replace(/,$/, ''), loras };
  }

  function dedupeLoras(arr) {
    const m = new Map();
    for (const l of arr) m.set(stem(l.file).toLowerCase(), l);
    return [...m.values()];
  }

  async function parseImage(file) {
    const chunks = await readPngText(file);
    if (!chunks) return { error: 'Not a PNG (ComfyUI saves PNGs with the workflow inside).' };
    if (chunks.prompt) {
      try { return parseComfyPrompt(chunks.prompt); } catch (e) { /* fall through */ }
    }
    if (chunks.parameters) return parseA1111(chunks.parameters);
    if (chunks.workflow) return { error: 'Only a UI workflow was found (no API prompt). Re-save the image from ComfyUI’s Save Image node.' };
    return { error: 'No generation metadata found in this image.' };
  }

  // Find a library LoRA matching a file name from metadata.
  function matchLora(file) {
    const s = stem(file).toLowerCase();
    return PV.loras().find((l) => stem(l.file || l.name).toLowerCase() === s) || null;
  }

  // ---------- LoRA folder scan (Stability Matrix / ComfyUI / A1111 sidecars) ----------
  const MODEL_RE = /\.(safetensors|ckpt|pt|pth)$/i;
  const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp'];

  // Case-insensitive lookup in object (and nested .model for CivitAI info files)
  function getCI(obj, ...keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    const lower = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
    for (const k of keys) if (lower[k.toLowerCase()] != null && lower[k.toLowerCase()] !== '') return lower[k.toLowerCase()];
    return undefined;
  }

  async function scanLoraFolder(fileList) {
    const files = Array.from(fileList);
    const byPath = new Map(files.map((f) => [(f.webkitRelativePath || f.name).toLowerCase(), f]));
    const results = [];
    for (const f of files) {
      if (!MODEL_RE.test(f.name)) continue;
      const rel = f.webkitRelativePath || f.name;
      const segs = rel.split('/');
      const inner = segs.length > 1 ? segs.slice(1) : segs; // strip the picked root folder
      const dir = segs.slice(0, -1).join('/');
      const base = f.name.replace(MODEL_RE, '');
      const sib = (name) => byPath.get(((dir ? dir + '/' : '') + name).toLowerCase());

      const info = { file: inner.join('\\'), name: base, triggers: '', baseModel: '', weight: 1, url: '', tags: [], imageFile: null, sizeMB: Math.round(f.size / 1048576) };
      const subdirs = inner.slice(0, -1);
      if (subdirs.length) info.tags.push(...subdirs.map((d) => d.toLowerCase()));

      for (const sc of [base + '.cm-info.json', base + '.civitai.info', base + '.json', base + '.info', base + '.metadata.json']) {
        const sf = sib(sc);
        if (!sf) continue;
        try {
          const j = JSON.parse(await sf.text());
          const model = getCI(j, 'model') || {};
          const words = getCI(j, 'trainedWords', 'trained_words') ?? getCI(j, 'activation text') ?? getCI(model, 'trainedWords');
          if (words && !info.triggers) info.triggers = Array.isArray(words) ? words.join(', ') : String(words);
          const bm = getCI(j, 'baseModel', 'base_model', 'sd version');
          if (bm && !info.baseModel) info.baseModel = normBase(bm);
          const mname = getCI(j, 'modelName') || getCI(model, 'name');
          // CivitAI .info: top-level "name" is the version; Stability Matrix: VersionName
          const vname = getCI(j, 'versionName') || (getCI(model, 'name') ? getCI(j, 'name') : undefined);
          if (mname) info.name = vname && vname !== mname ? `${mname} (${vname})` : mname;
          const pw = getCI(j, 'preferred weight');
          if (pw) info.weight = Number(pw) || 1;
          const mid = getCI(j, 'modelId', 'model_id');
          if (mid && !info.url) info.url = `https://civitai.com/models/${mid}`;
          const tags = getCI(j, 'tags') || getCI(model, 'tags');
          if (Array.isArray(tags)) info.tags.push(...tags.slice(0, 6).map((t) => String(typeof t === 'object' ? t.name || '' : t).toLowerCase()).filter(Boolean));
        } catch (e) { /* not JSON, ignore */ }
      }
      for (const cand of [...IMG_EXT.map((e) => base + '.preview.' + e), ...IMG_EXT.map((e) => base + '.' + e)]) {
        const img = sib(cand);
        if (img) { info.imageFile = img; break; }
      }
      info.tags = [...new Set(info.tags)];
      results.push(info);
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  Object.assign(PV, { readPngText, parseImage, parseComfyPrompt, parseA1111, extractLoraTags, matchLora, scanLoraFolder });
})(window.PV);
