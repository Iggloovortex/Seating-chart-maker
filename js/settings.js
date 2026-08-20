// settings.js — the Settings modal: app configuration kept apart from chart data.
//
// Everything here reads/writes state.config (theme, custom paper sizes, site
// icon/title, square presets) and persists via the config channel (storage.js).
// None of it enters serialize(), the .seatchart file, or the share link.


// The app's built-in icon/title, captured before any config is applied, so
// "Reset icon" and an empty title can fall back to them.
let DEFAULT_FAVICON = '';
let DEFAULT_TITLE = 'Seating Chart Maker';

function initSettings() {
  const link = document.querySelector('link[rel="icon"]');
  DEFAULT_FAVICON = link ? (link.getAttribute('href') || '') : '';
  DEFAULT_TITLE = document.title || 'Seating Chart Maker';

  const btn = document.getElementById('btn-settings');
  if (btn) {
    btn.disabled = false;
    btn.title = 'Settings';
    btn.addEventListener('click', openSettings);
  }
  document.querySelectorAll('[data-close-settings]').forEach((el) =>
    el.addEventListener('click', closeSettings)
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('settings').hidden) closeSettings();
  });

  // Side effects (theme, title, favicon, paper dropdown) follow every config
  // change; the modal body is re-rendered only by explicit actions, so open
  // text fields are never clobbered mid-edit.
  subscribeConfig(applyConfigEffects);
  applyConfigEffects();
}

function openSettings() {
  renderSettings();
  const m = document.getElementById('settings');
  m.hidden = false;
  m.setAttribute('aria-hidden', 'false');
  m.querySelector('button, input, select')?.focus();
}

function closeSettings() {
  const m = document.getElementById('settings');
  m.hidden = true;
  m.setAttribute('aria-hidden', 'true');
}

/** Apply config to the live page: theme attribute, document + brand title,
 *  favicon, and the paper dropdown (custom sizes may have changed). */
function applyConfigEffects() {
  const root = document.documentElement;
  const t = state.config.theme;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');

  const title = state.config.siteTitle || DEFAULT_TITLE;
  document.title = title;
  const brand = document.querySelector('.toolbar__title');
  if (brand) brand.textContent = title;

  const link = document.querySelector('link[rel="icon"]');
  if (link) link.setAttribute('href', state.config.favicon || DEFAULT_FAVICON);

  // Show the uploaded icon in the app header too, not only the browser tab, so
  // the change is visible immediately. Falls back to the built-in emoji.
  const logo = document.querySelector('.toolbar__logo');
  if (logo) {
    if (state.config.favicon) {
      let img = logo.querySelector('img');
      if (!img) { logo.textContent = ''; img = document.createElement('img'); img.alt = ''; logo.appendChild(img); }
      img.src = state.config.favicon;
    } else {
      logo.textContent = '🪑';
    }
  }

  if (typeof rebuildPaperOptions === 'function') { rebuildPaperOptions(); reflectPaper(); }
}

// ---------------------------------------------------------------- presets

/** A blank preset — the shape the maker starts from and Clear resets to. */
function emptyPreset() {
  return {
    icon: null,
    iconColor: DEFAULTS.iconColor,
    iconFill: null,
    rotation: 0,
    fill: DEFAULTS.fill,
    border: DEFAULTS.border,
    labels: [],
  };
}

/** Snapshot a square's look — icon, colours, facing, label lines — as a preset. */
function capturePreset(cell) {
  return {
    icon: cell.icon || null,
    iconColor: cell.iconColor || DEFAULTS.iconColor,
    iconFill: cell.iconFill || null,
    rotation: cell.rotation || 0,
    fill: cell.fill || DEFAULTS.fill,
    border: cell.border || DEFAULTS.border,
    labels: (cell.labels || []).map((l) => ({ text: l.text || '', color: l.color || DEFAULTS.labelColor })),
  };
}

/** A small "which preset?" menu, styled like the delete menu, opened by the
 *  select bar's Save preset button. `cell` is the square to capture. */
let presetSaveMenu = null;
function closePresetSaveMenu() { presetSaveMenu?.remove(); presetSaveMenu = null; }
function openPresetSaveMenu(x, y, cell) {
  closePresetSaveMenu();
  presetSaveMenu = document.createElement('div');
  presetSaveMenu.className = 'popmenu preset-menu';
  presetSaveMenu.setAttribute('role', 'menu');
  for (const n of [1, 2]) {
    const set = !!state.config.presets[String(n)];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'popmenu__item';
    b.setAttribute('role', 'menuitem');
    b.textContent = set ? `Replace Preset ${n}` : `Save as Preset ${n}`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closePresetSaveMenu();
      updateConfigPreset(n, capturePreset(cell));
      if (typeof refreshEditor === 'function') refreshEditor(); // light up the pane's Preset buttons
    });
    presetSaveMenu.appendChild(b);
  }
  document.body.appendChild(presetSaveMenu);
  const box = presetSaveMenu.getBoundingClientRect();
  presetSaveMenu.style.left = `${Math.min(x, window.innerWidth - box.width - 8)}px`;
  presetSaveMenu.style.top = `${Math.min(y, window.innerHeight - box.height - 8)}px`;
}
document.addEventListener('pointerdown', (e) => {
  if (presetSaveMenu && !e.target.closest?.('.preset-menu')) closePresetSaveMenu();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePresetSaveMenu(); });

/** Apply preset `n` to `keys` (a single square in the single pane, the whole
 *  selection in the bulk pane). Called from the edit-pane Preset buttons. */
function applyPreset(n, keys) {
  const p = state.config.presets[String(n)];
  if (!p || !keys || !keys.length) return false;
  updateCells(keys, {
    icon: p.icon,
    iconColor: p.iconColor,
    iconFill: p.iconFill,
    rotation: p.rotation || 0,
    fill: p.fill,
    border: p.border,
    enabled: true,               // applying a preset fills the square
    labels: p.labels.map((l) => ({ text: l.text, color: l.color })),
  });
  return true;
}

// ---------------------------------------------------------------- render

function renderSettings() {
  const body = document.getElementById('settings-body');
  if (!body) return;
  body.replaceChildren(
    exportSection(),
    themeSection(),
    paperSection(),
    siteSection(),
    presetSection(),
  );
}

function exportSection() {
  const g = sgroup('Export site');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--primary settings-export';
  btn.textContent = 'Export self-contained HTML';
  btn.addEventListener('click', exportSite);
  g.appendChild(btn);
  g.appendChild(snote(
    'Downloads a single index.html with all styles, scripts and your current ' +
    'settings baked in — no external files.'
  ));
  return g;
}

function themeSection() {
  const g = sgroup('Appearance');
  const seg = document.createElement('div');
  seg.className = 'seg settings-seg';
  for (const [val, label] of [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg__btn';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(state.config.theme === val));
    b.addEventListener('click', () => { setConfig({ theme: val }); renderSettings(); });
    seg.appendChild(b);
  }
  g.appendChild(seg);
  g.appendChild(snote('System follows your device; Light and Dark override it in both directions.'));
  return g;
}

function paperSection() {
  const g = sgroup('Custom paper sizes');
  const papers = state.config.customPapers;

  if (!papers.length) {
    g.appendChild(snote('No custom sizes yet — add one below to see it in the Export dialog.'));
  }
  for (const cp of papers) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const name = document.createElement('span');
    name.className = 'settings-row__name';
    name.textContent = `${cp.name} — ${cp.w}×${cp.h} ${cp.unit}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--empty';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      if (state.paper === cp.id) setPaper('letter');   // open chart falls back to Letter
      removeCustomPaper(cp.id);
      renderSettings();
    });
    row.append(name, del);
    g.appendChild(row);
  }

  // Add form
  const form = document.createElement('div');
  form.className = 'settings-addpaper';
  const nameIn = sinput('text', 'e.g. Poster');
  const wIn = sinput('number', 'W'); wIn.min = '1'; wIn.step = '0.1';
  const hIn = sinput('number', 'H'); hIn.min = '1'; hIn.step = '0.1';
  const unitIn = document.createElement('select');
  unitIn.className = 'field__input';
  unitIn.append(new Option('in', 'in'), new Option('mm', 'mm'));
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--primary';
  add.textContent = 'Add size';
  add.addEventListener('click', () => {
    const nm = (nameIn.value || '').trim();
    const w = parseFloat(wIn.value);
    const h = parseFloat(hIn.value);
    if (!nm || !(w > 0) || !(h > 0)) { alert('Enter a name, width and height.'); return; }
    addCustomPaper({ id: 'custom:' + Date.now().toString(36), name: nm, w, h, unit: unitIn.value });
    renderSettings();
  });
  form.append(
    slabel('Name', nameIn),
    slabel('W', wIn),
    slabel('H', hIn),
    slabel('Unit', unitIn),
    add,
  );
  g.appendChild(form);
  return g;
}

function siteSection() {
  const g = sgroup('Site icon & title');

  const titleIn = sinput('text', 'Seating Chart Maker');
  titleIn.value = state.config.siteTitle;
  titleIn.addEventListener('change', () => setConfig({ siteTitle: titleIn.value.trim() || DEFAULT_TITLE }));
  g.appendChild(slabel('Title', titleIn));

  const row = document.createElement('div');
  row.className = 'settings-row settings-row--favicon';
  const prev = document.createElement('img');
  prev.className = 'settings-favicon';
  prev.alt = 'Favicon preview';
  prev.src = state.config.favicon || DEFAULT_FAVICON;
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.className = 'field__input settings-file';
  // Read to a data: URI so the icon stays self-contained (no external URL).
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setConfig({ favicon: String(reader.result) }); renderSettings(); };
    reader.readAsDataURL(f);
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn';
  reset.textContent = 'Reset icon';
  reset.disabled = !state.config.favicon;
  reset.addEventListener('click', () => { setConfig({ favicon: null }); renderSettings(); });
  row.append(prev, file, reset);

  const wrap = document.createElement('label');
  wrap.className = 'settings-field';
  const cap = document.createElement('span');
  cap.className = 'settings-field__label';
  cap.textContent = 'Favicon';
  wrap.append(cap, row);
  g.appendChild(wrap);
  return g;
}

function presetSection() {
  const g = sgroup('Square presets');
  for (const n of [1, 2]) {
    const p = state.config.presets[String(n)];
    const row = document.createElement('div');
    row.className = 'settings-row';
    const status = document.createElement('span');
    status.className = 'settings-row__name';
    status.textContent = p
      ? `Preset ${n}: set${p.icon ? ` · ${p.icon}` : ''}${p.labels.length ? ` · ${p.labels.length} line(s)` : ''}`
      : `Preset ${n}: empty`;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn--primary';
    edit.textContent = p ? 'Edit' : 'Make';
    edit.title = 'Open an edit pane to build this preset';
    edit.addEventListener('click', () => {
      if (typeof openPresetEditor === 'function') openPresetEditor(n);
    });

    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'btn';
    clr.textContent = 'Clear';
    clr.disabled = !p;
    clr.addEventListener('click', () => {
      updateConfigPreset(n, null);
      if (typeof refreshEditor === 'function') refreshEditor();
      renderSettings();
    });

    row.append(status, edit, clr);
    g.appendChild(row);
  }
  g.appendChild(snote(
    'A preset stores a square’s icon, colours, facing and label lines. Build one here ' +
    'with Make/Edit, or capture a square with Save preset in the select bar. Apply a preset ' +
    'from the Preset buttons in the edit pane — to the open square, or the whole selection.'
  ));
  return g;
}

// ---------------------------------------------------------------- export site
//
// Writes a single self-contained index.html: the app's own source, with the
// stylesheet inlined into a <style>, every js/*.js inlined into a <script>, the
// current config baked in as a seed, and the title/favicon set. Under file:// a
// fetch of a sibling file is blocked, so the source is read from window.__SOURCES
// (js/sources.js) rather than off disk.

function exportSite() {
  let html;
  try {
    html = buildExportedHTML();
  } catch (err) {
    alert(err.message);
    return;
  }
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seating-chart-app.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildExportedHTML() {
  const S = window.__SOURCES;
  if (!S || !S['index.html']) {
    throw new Error('Source map missing — run tools/gen-sources.py to regenerate js/sources.js.');
  }
  // Any inlined text may itself contain a closing script tag inside a string;
  // neutralise it so it cannot end the <script> block early. `\/` reads back as
  // `/` at runtime, so the string is unchanged for the code that uses it.
  const neutralize = (s) => String(s).replace(/<\/script>/gi, '<\\/script>');
  const CLOSE = '</scr' + 'ipt>';

  let html = S['index.html'];

  // 1) Inline the stylesheet.
  html = html.replace(/<link rel="stylesheet" href="styles\.css"[^>]*>/,
    '<style>\n' + (S['styles.css'] || '') + '\n</style>');

  // 2) Inline every js/*.js script. sources.js is special: re-emit the current
  //    source map so the exported app can itself re-export.
  html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, path) => {
    if (path === 'js/sources.js') {
      return '<script>window.__SOURCES = ' + neutralize(JSON.stringify(S)) + ';' + CLOSE;
    }
    const code = S[path];
    if (code == null) return '<script>/* ' + path + ' missing from source map */' + CLOSE;
    return '<script>\n' + neutralize(code) + '\n' + CLOSE;
  });

  // 3) Seed the current config so the exported app opens with these settings.
  const seed = '<script>window.__CONFIG_SEED = ' + neutralize(JSON.stringify(serializeConfig())) + ';' + CLOSE + '\n';
  html = html.replace('</head>', seed + '</head>');

  // 4) Bake title + favicon into the head so they are right before JS runs.
  const cfg = state.config;
  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escapeHtml(cfg.siteTitle || DEFAULT_TITLE) + '</title>');
  if (cfg.favicon) {
    html = html.replace(/<link rel="icon"[\s\S]*?\/>/, '<link rel="icon" href="' + cfg.favicon + '" />');
  }
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---------------------------------------------------------------- DOM helpers

function sgroup(title) {
  const g = document.createElement('section');
  g.className = 'settings-section';
  const h = document.createElement('h3');
  h.className = 'settings-section__title';
  h.textContent = title;
  g.appendChild(h);
  return g;
}

function snote(text) {
  const p = document.createElement('p');
  p.className = 'settings-note';
  p.textContent = text;
  return p;
}

function sinput(type, placeholder) {
  const el = document.createElement('input');
  el.type = type;
  el.className = 'field__input';
  if (placeholder) el.placeholder = placeholder;
  if (type === 'number') el.inputMode = 'decimal';
  return el;
}

function slabel(text, control) {
  const wrap = document.createElement('label');
  wrap.className = 'settings-field';
  const span = document.createElement('span');
  span.className = 'settings-field__label';
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}
