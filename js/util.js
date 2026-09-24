'use strict';
window.PV = window.PV || {};

(function (PV) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const splitTags = (s) => [...new Set(String(s || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fmtW = (w) => { const n = Number(w); return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '1'; };
  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s-]+/g, '_') || 'cat';
  const stem = (path) => String(path || '').split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
  const timeAgo = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString();
  };

  // Seeded RNG so the same builder state always renders the same wildcard picks.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const newSeed = () => Math.floor(Math.random() * 2 ** 31);

  function toast(msg, type = 'info', ms = 2600) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  async function copyText(text, label = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(label, 'ok');
  }

  function download(name, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Resize any image File/Blob into a compact data URL thumbnail.
  async function fileToThumb(file, max = 512) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    let d = c.toDataURL('image/webp', 0.85);
    if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', 0.85);
    return d;
  }

  // ---------- Drag & drop images (files, or images dragged out of a web page) ----------
  const isImageFile = (f) => !!f && (String(f.type).startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name || ''));
  const dragHasImage = (e) => {
    const t = [...((e.dataTransfer && e.dataTransfer.types) || [])];
    return t.includes('Files') || t.includes('text/uri-list') || t.includes('text/html');
  };

  // Must be called synchronously inside the drop event (the data is gone after an await).
  function imageFromDrop(dt) {
    const f = [...(dt.files || [])].find(isImageFile);
    if (f) return Promise.resolve(f);
    const html = dt.getData('text/html') || '';
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const uri = (dt.getData('text/uri-list') || '').split(/\r?\n/).find((u) => /^https?:/i.test(u.trim()));
    const src = m ? m[1].replace(/&amp;/g, '&') : uri;
    if (!src) return Promise.resolve(null);
    return fetch(src.trim())
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && b.type.startsWith('image/')) return b;
        throw new Error('not an image');
      })
      .catch(() => {
        toast("Couldn't grab that image from the web page. Save it to your PC first, then drag the file in.", 'err', 5000);
        return null;
      });
  }

  // ---------- Image search (experimental setting) ----------
  const IMAGE_SEARCH_SITES = {
    pinterest: { label: 'Pinterest', url: (q) => `https://www.pinterest.com/search/pins/?q=${q}` },
    google: { label: 'Google Images', url: (q) => `https://www.google.com/search?tbm=isch&q=${q}` },
    bing: { label: 'Bing Images', url: (q) => `https://www.bing.com/images/search?q=${q}` },
  };
  function openImageSearch(name, source) {
    const st = PV.S.settings;
    const q = [name, source, st.imageSearchExtra].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
    if (!q) { toast('Type a name first'); return; }
    const site = IMAGE_SEARCH_SITES[st.imageSearchSite] || IMAGE_SEARCH_SITES.pinterest;
    // Opens in your normal browser (the desktop app hands web links to it).
    window.open(site.url(encodeURIComponent(q)), '_blank', 'noopener');
  }

  // ---------- Modals ----------
  function openModal(html, { wide = false, dismissable = true, onClose } = {}) {
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(wrap);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); };
    document.addEventListener('keydown', onKey);
    if (dismissable) wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const el = wrap.firstElementChild;
    const first = el.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return { el, close };
  }

  function confirmBox(msg, okLabel = 'Delete', danger = true) {
    return new Promise((res) => {
      const m = openModal(
        `<h3>Are you sure?</h3><p class="muted">${esc(msg)}</p>
         <div class="modal-actions"><button class="btn" data-close>Cancel</button>
         <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`,
        { onClose: () => res(false) }
      );
      m.el.querySelector('[data-ok]').onclick = () => { res(true); m.close(); };
    });
  }

  function promptBox(title, value = '', okLabel = 'Save') {
    return new Promise((res) => {
      const m = openModal(
        `<h3>${esc(title)}</h3><input class="input" data-val value="${esc(value)}">
         <div class="modal-actions"><button class="btn" data-close>Cancel</button>
         <button class="btn primary" data-ok>${esc(okLabel)}</button></div>`,
        { onClose: () => res(null) }
      );
      const inp = m.el.querySelector('[data-val]');
      const ok = () => { res(inp.value.trim()); m.close(); };
      m.el.querySelector('[data-ok]').onclick = ok;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    });
  }

  // Normalize the many ways base models get written (CivitAI, A1111 json, Stability Matrix).
  function normBase(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (!s) return '';
    if (s.includes('pony')) return 'Pony';
    if (s.includes('illustrious')) return 'Illustrious';
    if (s.includes('noob')) return 'NoobAI';
    if (s.includes('flux')) return 'Flux';
    if (s.includes('qwen')) return 'Qwen';
    if (s.includes('wan')) return 'Wan';
    if (s.includes('3.5') || s.includes('sd3')) return 'SD3.5';
    if (s.includes('xl')) return 'SDXL';
    if (s.includes('1.5') || s === 'sd1' || s.includes('sd15')) return 'SD1.5';
    return String(raw).trim();
  }

  const SDXL_FAMILY = ['SDXL', 'Pony', 'Illustrious', 'NoobAI'];
  // 2 = same base, 1 = same family (usually loads, results vary), 0 = incompatible
  function compatLevel(loraBase, target) {
    if (!target || !loraBase || loraBase === 'Other' || target === 'Other') return 2;
    if (loraBase === target) return 2;
    if (SDXL_FAMILY.includes(loraBase) && SDXL_FAMILY.includes(target)) return 1;
    return 0;
  }

  // Tiny event bus
  const listeners = {};
  PV.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  PV.emit = (ev, ...a) => (listeners[ev] || []).forEach((fn) => fn(...a));

  Object.assign(PV, {
    $, $$, esc, uid, debounce, splitTags, pick, fmtW, slug, stem, timeAgo, rng, newSeed,
    IMAGE_SEARCH_SITES, openImageSearch, toast, copyText, download, fileToThumb, isImageFile, dragHasImage, imageFromDrop, openModal, confirmBox, promptBox, normBase, compatLevel,
  });
})(window.PV);
