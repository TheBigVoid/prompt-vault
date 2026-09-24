# 🎲 Prompt Vault

A local library and prompt builder for AI image generation. Store your **characters, poses, outfits, scenes, styles and LoRAs** in one place, then build or randomize prompts to paste into **ComfyUI** (Stability Matrix works fine), Forge, A1111 and similar tools.

It's one static web page with no server, no account and no build step. Your library is stored in your own browser (IndexedDB) and never leaves your PC.

**▶ Use it online:** https://thebigvoid.github.io/prompt-vault/

**▶ Or offline:** download the repo and double-click `index.html`.

---

## Features

### 🧱 Builder
- One **slot per category** (Characters, Outfits, Poses, Expressions, Scenes, Camera, Lighting, Styles, Negatives). You can add, rename and reorder categories.
- **🎲 Randomize all** (or press `R`). Each slot has:
  - 🔒 **Lock** to keep your character while everything else changes
  - **Chance** (100 / 75 / 50 / 25 %) so optional slots are sometimes left empty
  - 🎲 **Roll** to reroll just that slot
- The randomizer can filter by **tags**, **favorites only** and **base model** (Illustrious, Pony, SDXL, Flux…). A filter that would leave a slot with nothing is skipped for that slot.
- **LoRA stack** with weight sliders, on/off toggles and locks. It can also add *N random LoRAs of a type*, for example one random style LoRA per roll.
- **Linked LoRAs:** attach a LoRA to a character (or any item). Picking the character loads its LoRA at the right weight.
- Compatibility warnings when a LoRA doesn't match the chosen base model.
- Output for **ComfyUI loader nodes** (trigger words in the prompt and a separate LoRA list), or as `<lora:name:weight>` tags for Lora Tag Loader, Impact Pack or A1111.

### 🎲 Random character
- The **Random character** button in the top bar (or press `C`) shows a random character with their picture and a ready-to-copy prompt, including their linked LoRAs' trigger words. Press Space for another one. You can limit it to one source or to favorites, and send the result to the Builder.

### 🔀 Wildcards
- `{red|blue|green}` picks one option at random, and nesting works.
- `__pose__` inserts a random item from the **Poses** category. Any category ID works.
- 🔀 **Re-roll wildcards** gives new picks without changing the slots. You can also leave `{a|b}` unresolved so ComfyUI picks at queue time.

### 📚 Library
- Cards with preview images. Drop an image, paste one with Ctrl+V, or click to choose one. You can drag images straight from a web page (e.g. Pinterest): drop one on a card to set its picture, or on empty space to start a new item with it.
- **Source** for every item (e.g. Nami → *One Piece*). Filter by source, or sort **By source** to see your library grouped by series. The Builder's random filter matches sources too, so typing `one piece` rolls only One Piece characters.
- Search, tags, favorites, and sorting by name, newest or most used.

### 📥 Import
- **Scan your LoRA folder.** It reads names, trigger words, base model and preview images from the **Stability Matrix** (`.cm-info.json` + `.preview.*`), **CivitAI Helper** (`.civitai.info`) and **A1111** (`.json`) files next to your models. Model files themselves are never read or uploaded.
- **Read prompts from ComfyUI PNGs.** Drop a generated image on the Import tab's box to pull out the positive and negative prompts, LoRAs and weights (LoraLoader, rgthree Power Lora Loader, `<lora:>` tags) and the checkpoint. A1111/Forge PNGs work too.
- **Quick add** many items at once, one per line.
- **Backup / restore** everything as a single `.json` file.

### 💾 Presets & History
- Save the whole builder (slots, locks, LoRAs, text) as a preset with a thumbnail.
- Every prompt you copy is logged to History, where you can reopen it in the Builder or turn it into a preset.

---

## Tips for ComfyUI / Stability Matrix

- **LoRA folder:** usually `StabilityMatrix\Data\Models\Lora` (portable install) or `%APPDATA%\StabilityMatrix\Models\Lora`.
- For LoRA **file names** to match ComfyUI's dropdown, scan the Lora folder itself, not a parent folder. Subfolders are kept, e.g. `characters\myChar.safetensors`.
- If you use **Lora Tag Loader** or **Impact Pack wildcard encode**, switch the output to `<lora:> tags` and paste a single prompt with no loader nodes.

## Your data

- Everything stays in your browser's local storage for the site you opened. The GitHub Pages copy and a local `index.html` copy are **separate libraries**, so use **Import → Export backup** to move data between them or to another PC.
- Clearing browser site data deletes the library, so export a backup now and then.

## Desktop app (Windows)

The same app can run in its own window with desktop and Start menu shortcuts, using Electron:

```bash
npm install
npm run dist
```

Then run `dist\PromptVault-Setup-<version>.exe`. It installs per-user with no admin needed. To try it without installing, use `npm start`.

The desktop app keeps its own library in `%APPDATA%\Prompt Vault`, so browser data isn't shared with it. Use **Export / Import backup** to move your library in. Keys: **F5** reload, **F11** fullscreen, **F12** dev tools.

## Development

Plain HTML, CSS and JavaScript with no dependencies. To run it with a local server:

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

| File | What it does |
|---|---|
| `js/store.js` | IndexedDB storage, defaults, starter pack, backup |
| `js/prompt.js` | prompt building, wildcards, randomizer |
| `js/meta.js` | PNG metadata reader (ComfyUI / A1111), LoRA folder scanner |
| `js/components.js` | cards, item editor, picker |
| `js/view-*.js` | the six screens |

## License

MIT. See [LICENSE](LICENSE).
