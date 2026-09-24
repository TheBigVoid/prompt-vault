'use strict';
(function (PV) {
  const { S, esc, toast, confirmBox, slug } = PV;
  let root;

  function render() {
    const st = S.settings;
    root.innerHTML = `
      <div class="settings">
        <section class="panel">
          <div class="panel-head"><h3>🗂 Categories</h3><button class="btn sm" data-act="add-cat">＋ Add category</button></div>
          <p class="muted small">These are the builder slots. Their order is the order they appear in the prompt. "Negative" categories go into the negative prompt.
            You can use <code>__id__</code> inside any prompt to insert a random item from a category.</p>
          <div class="cat-list">
            ${st.categories.map((c, i) => `
              <div class="cat-row" data-i="${i}">
                <input class="input icon-in" value="${esc(c.icon)}" data-k="icon" aria-label="Icon" maxlength="4">
                <input class="input grow" value="${esc(c.name)}" data-k="name" aria-label="Name">
                <code class="muted small" title="Use __${esc(c.id)}__ in prompts">__${esc(c.id)}__</code>
                <select class="input" data-k="kind"><option value="positive" ${c.kind !== 'negative' ? 'selected' : ''}>Positive</option><option value="negative" ${c.kind === 'negative' ? 'selected' : ''}>Negative</option></select>
                <button class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
                <button class="icon-btn" data-act="down" ${i === st.categories.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
                <button class="icon-btn" data-act="del-cat" aria-label="Delete">✕</button>
              </div>`).join('')}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>✏️ Prompt output</h3></div>
          <div class="form-grid">
            <label>LoRA format
              <select class="input" data-s="loraFormat">
                <option value="comfy" ${st.loraFormat === 'comfy' ? 'selected' : ''}>Loader nodes: trigger words in prompt, LoRA list separate</option>
                <option value="tag" ${st.loraFormat === 'tag' ? 'selected' : ''}>&lt;lora:name:weight&gt; tags in prompt (Lora Tag Loader / Impact Pack / A1111)</option>
              </select></label>
            <label>Trigger words go
              <select class="input" data-s="triggerPos">
                <option value="start" ${st.triggerPos === 'start' ? 'selected' : ''}>After the prefix (start)</option>
                <option value="end" ${st.triggerPos === 'end' ? 'selected' : ''}>Before the suffix (end)</option>
                <option value="none" ${st.triggerPos === 'none' ? 'selected' : ''}>Don't add them</option>
              </select></label>
            <label>Separator<input class="input mono" data-s="separator" value="${esc(st.separator)}"></label>
            <label class="check"><input type="checkbox" data-s="resolveWildcards" ${st.resolveWildcards ? 'checked' : ''}>
              Resolve <code>{a|b|c}</code> here (off = leave them for ComfyUI to pick when it runs)</label>
          </div>
          <label class="lbl">Default prefix (for new/cleared builders)<textarea class="input" rows="2" data-s="defaultPrefix">${esc(st.defaultPrefix)}</textarea></label>
          <label class="lbl">Default negative<textarea class="input" rows="2" data-s="defaultNegative">${esc(st.defaultNegative)}</textarea></label>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>🧠 Base models</h3></div>
          <p class="muted small">Used to tag LoRAs and to filter the randomizer. Comma separated.</p>
          <input class="input" data-s="baseModels" value="${esc(st.baseModels.join(', '))}">
        </section>

        <section class="panel">
          <div class="panel-head"><h3>🎨 Appearance</h3></div>
          <div class="seg" role="group" aria-label="Theme">
            ${['system', 'dark', 'light'].map((t) => `<button class="${st.theme === t ? 'on' : ''}" data-act="theme" data-v="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>💽 Storage</h3></div>
          <p class="muted small" data-storage>Checking…</p>
          <div class="row">
            <button class="btn" data-act="starter">Add starter pack again</button>
            <button class="btn danger" data-act="wipe">Delete everything</button>
          </div>
        </section>
      </div>`;
    storageInfo();
  }

  async function storageInfo() {
    const el = root.querySelector('[data-storage]');
    if (!el) return;
    let txt = `${S.items.size} items · ${S.presets.length} presets · ${S.history.length} history entries.`;
    try {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        txt += ` Using ~${(e.usage / 1048576).toFixed(1)} MB.`;
      }
      if (navigator.storage?.persisted) {
        const p = await navigator.storage.persisted();
        txt += p ? ' ✅ Storage is persistent (the browser won\'t auto-clear it).' : ' ⚠️ Storage isn\'t marked persistent yet, so export backups regularly.';
      }
    } catch (e) { /* ignore */ }
    el.textContent = txt;
  }

  function uniqueId(name) {
    let id = slug(name);
    let n = 2;
    while (id === 'lora' || PV.cat(id)) id = slug(name) + '_' + n++;
    return id;
  }

  function onChangeCats() {
    PV.ensureSlots(S.builder);
    PV.saveSettings();
    PV.saveBuilder();
  }

  function mount(el) {
    root = el;
    render();
    el.addEventListener('change', (e) => {
      const t = e.target;
      const row = t.closest('.cat-row');
      if (row && t.dataset.k) {
        const c = S.settings.categories[row.dataset.i];
        c[t.dataset.k] = t.value.trim() || c[t.dataset.k];
        onChangeCats();
        return;
      }
      const k = t.dataset.s;
      if (!k) return;
      if (t.type === 'checkbox') S.settings[k] = t.checked;
      else if (k === 'baseModels') S.settings.baseModels = t.value.split(',').map((x) => x.trim()).filter(Boolean);
      else S.settings[k] = t.value;
      PV.saveSettings();
      toast('Saved', 'ok', 1200);
    });
    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const cats = S.settings.categories;
      const row = btn.closest('.cat-row');
      const i = row ? Number(row.dataset.i) : -1;
      if (act === 'add-cat') {
        const name = await PV.promptBox('New category name', '', 'Add');
        if (!name) return;
        cats.push({ id: uniqueId(name), name, icon: '🏷️', kind: 'positive' });
        onChangeCats();
        render();
      } else if (act === 'up' || act === 'down') {
        const j = act === 'up' ? i - 1 : i + 1;
        [cats[i], cats[j]] = [cats[j], cats[i]];
        onChangeCats();
        render();
      } else if (act === 'del-cat') {
        const c = cats[i];
        const items = PV.itemsIn(c.id);
        const msg = items.length ? `Delete "${c.name}" and its ${items.length} items?` : `Delete "${c.name}"?`;
        if (!(await confirmBox(msg))) return;
        for (const it of items) await PV.deleteItem(it.id);
        cats.splice(i, 1);
        onChangeCats();
        render();
      } else if (act === 'theme') {
        S.settings.theme = btn.dataset.v;
        PV.saveSettings();
        PV.applyTheme();
        render();
      } else if (act === 'starter') {
        await PV.seedStarter();
        toast('Starter pack added', 'ok');
        PV.emit('data');
        render();
      } else if (act === 'wipe') {
        if (!(await confirmBox('Delete ALL items, LoRAs, presets, history and settings from this browser? Export a backup first if you might want them.', 'Delete everything'))) return;
        await PV.wipeAll();
        PV.applyTheme();
        toast('Everything deleted');
        PV.emit('data');
        render();
      }
    });
  }

  PV.settingsView = { mount, render };
})(window.PV);
