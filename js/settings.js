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
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.addEventListener('click', () => setConfig({ theme: effectiveDark() ? 'light' : 'dark' }));
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

  // With the theme on "System", an OS light/dark switch changes the grid surface
  // but fires no config event — re-render so surface-flipped labels keep up.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.config.theme === 'system') { updateThemeToggle(); if (typeof renderGrid === 'function') renderGrid(); }
    });
  }
}

/** Whether the app is effectively showing its dark palette right now. */
function effectiveDark() {
  const t = state.config.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** The toolbar toggle shows what a click will DO: a bright sun to switch to light
 *  (when dark now), or a dark-purple moon to switch to dark (when light now). */
function updateThemeToggle() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const dark = effectiveDark();
  btn.querySelector('use')?.setAttribute('href', dark ? '#ui-sun' : '#ui-moon');
  btn.style.color = dark ? '#f7c948' : '#6b46c1';
  btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  btn.setAttribute('aria-label', btn.title);
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
  applyBarPositions();
  updateThemeToggle();

  // The grid recolors furniture/ghost labels against the theme surface at render
  // time, so a theme change (or a newly imported icon) needs a re-render.
  if (typeof renderGrid === 'function') renderGrid();
}

// ---------------------------------------------------------------- bar position
//
// The mode bars (Select, Walls) normally sit under the toolbar. They can be moved
// to the foot of the window instead — nearer the thumb on a laptop, and out of the
// way of the chart's top edge — either together or one at a time.

const MODE_BARS = [
  { key: 'select', id: 'select-bar', label: 'Select bar' },
  { key: 'walls', id: 'wall-bar', label: 'Walls bar' },
];

/** Where one bar should sit, honouring the per-bar choice only in 'custom'. */
function barPositionFor(key) {
  const cfg = state.config;
  if (cfg.barPosition === 'custom') return (cfg.barPositions && cfg.barPositions[key]) || 'top';
  return cfg.barPosition === 'bottom' ? 'bottom' : 'top';
}

/** Move each bar to its side of the stage. A bar is a sibling of the stage, so
 *  this is just which side of it the bar is inserted on; the rule it carries
 *  flips with it (see .selectbar--bottom). */
function applyBarPositions() {
  const app = document.querySelector('.app');
  const stage = document.getElementById('stage');
  if (!app || !stage) return;
  for (const bar of MODE_BARS) {
    const el = document.getElementById(bar.id);
    if (!el) continue;
    const bottom = barPositionFor(bar.key) === 'bottom';
    el.classList.toggle('selectbar--bottom', bottom);
    if (bottom) app.appendChild(el);
    else app.insertBefore(el, stage);
  }
}

/** The Settings control: one dropdown for both bars, and — on "Each bar its own"
 *  — a dropdown per bar underneath. */
function barsSection() {
  const g = sgroup('Mode bars');
  const pick = (value, options, onChange) => {
    const sel = document.createElement('select');
    sel.className = 'field__input';
    for (const [val, label] of options) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      o.selected = val === value;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  g.appendChild(slabel('Position', pick(state.config.barPosition, [
    ['top', 'Top — under the toolbar'],
    ['bottom', 'Bottom — foot of the window'],
    ['custom', 'Each bar its own'],
  ], (v) => { setConfig({ barPosition: v }); renderSettings(); })));

  if (state.config.barPosition === 'custom') {
    for (const bar of MODE_BARS) {
      g.appendChild(slabel(bar.label, pick(barPositionFor(bar.key), [
        ['top', 'Top'], ['bottom', 'Bottom'],
      ], (v) => {
        setConfig({ barPositions: { ...state.config.barPositions, [bar.key]: v } });
        renderSettings();
      })));
    }
  }

  g.appendChild(snote('The Select and Walls bars appear when their mode is on. '
    + 'Moving them to the bottom keeps the chart’s top edge clear.'));
  return g;
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

// Settings is split into tabs (rendered into the header, under the title): the
// chart-side options (presets, custom icons) and the "Site" tab that packages the
// app — export, its icon/title branding, appearance and paper sizes.
let settingsTab = 'general';
const SETTINGS_TABS = [
  { id: 'general', label: 'General', build: () => [presetSection(), customIconsSection()] },
  { id: 'site', label: 'Site & export', build: () => [exportSection(), siteSection(), themeSection(), barsSection(), paperSection()] },
];

function renderSettings() {
  const body = document.getElementById('settings-body');
  const tabsBar = document.getElementById('settings-tabs');
  if (!body) return;
  if (!SETTINGS_TABS.some((t) => t.id === settingsTab)) settingsTab = 'general';
  const tab = SETTINGS_TABS.find((t) => t.id === settingsTab);

  if (tabsBar) {
    tabsBar.replaceChildren();
    for (const t of SETTINGS_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'settings-tab';
      b.textContent = t.label;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.id === settingsTab));
      b.addEventListener('click', () => { settingsTab = t.id; renderSettings(); });
      tabsBar.appendChild(b);
    }
  }
  body.replaceChildren(...tab.build());
}

/** Import custom SVG icons — e.g. MIT-licensed Bootstrap Icons. Paste an <svg>,
 *  name it, Add; imported markup is sanitized to plain shapes before it is
 *  stored. Icons appear in the edit pane's Icon picker. */
function customIconsSection() {
  const g = sgroup('Custom icons');
  const icons = state.config.customIcons;

  if (typeof iconLibraryAvailable === 'function' && iconLibraryAvailable()) {
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'btn btn--primary settings-browse-icons';
    browse.textContent = 'Browse icon library…';
    browse.addEventListener('click', () => openIconLibrary());
    g.appendChild(browse);
    g.appendChild(snote('Search 2,000+ MIT-licensed Bootstrap Icons and click to add — or paste your ' +
      'own SVG below. Added icons appear in the edit pane’s Icon picker.'));
  } else if (!icons.length) {
    g.appendChild(snote('No imported icons yet. Paste an SVG below — for example any icon from ' +
      'Bootstrap Icons (icons.getbootstrap.com), which are MIT-licensed — name it, and Add.'));
  }
  if (icons.length) {
    const list = document.createElement('div');
    list.className = 'settings-list';
    for (const ic of icons) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const prev = document.createElement('span');
      prev.className = 'settings-icon-preview';
      const svg = iconUse(ic.id, 'settings-icon-preview__svg');
      if (svg) prev.appendChild(svg);
      const name = document.createElement('span');
      name.className = 'settings-row__name';
      name.textContent = ic.label;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--empty';
      del.textContent = 'Delete';
      del.addEventListener('click', () => { removeCustomIcon(ic.id); renderSettings(); });
      row.append(prev, name, del);
      list.appendChild(row);
    }
    g.appendChild(list);
  }

  // Add form: name + pasted SVG + Add.
  const form = document.createElement('div');
  form.className = 'settings-addicon';
  const nameIn = sinput('text', 'Name (e.g. Printer)');
  const svgIn = document.createElement('textarea');
  svgIn.className = 'field__input settings-svg';
  svgIn.rows = 3;
  svgIn.placeholder = '<svg viewBox="0 0 16 16">…</svg>';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--primary';
  add.textContent = 'Add icon';
  add.addEventListener('click', () => {
    const parsed = parseIconSvg(svgIn.value);
    if (!parsed) { alert('That doesn’t look like an SVG icon. Paste the full <svg>…</svg> markup.'); return; }
    const label = (nameIn.value || '').trim() || 'Icon';
    addCustomIcon({ id: 'custom:' + Date.now().toString(36), label, viewBox: parsed.viewBox, inner: parsed.inner });
    renderSettings();
  });
  form.append(slabel('Name', nameIn), slabel('SVG', svgIn), add);
  g.appendChild(form);
  return g;
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
  const sub = document.createElement('p');
  sub.className = 'settings-subtext';
  sub.textContent = 'Current page: ' + (typeof currentPaperLabel === 'function' ? currentPaperLabel() : '');
  g.appendChild(sub);
  const papers = state.config.customPapers;

  if (!papers.length) {
    g.appendChild(snote('No custom sizes yet — add one below to see it in the Export dialog.'));
  } else {
    // Added items sit on their own panel so they read as saved entries, distinct
    // from the controls around them.
    const list = document.createElement('div');
    list.className = 'settings-list';
    for (const cp of papers) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const name = document.createElement('span');
      name.className = 'settings-row__name';
      name.textContent = `${cp.name} — W ${Math.min(cp.w, cp.h)} × L ${Math.max(cp.w, cp.h)} ${cp.unit}`;
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
      list.appendChild(row);
    }
    g.appendChild(list);
  }

  // Add form
  const form = document.createElement('div');
  form.className = 'settings-addpaper';
  const nameIn = sinput('text', 'e.g. Poster');
  const wIn = sinput('number', 'W'); wIn.min = '1'; wIn.step = '0.1';
  const lIn = sinput('number', 'L'); lIn.min = '1'; lIn.step = '0.1';
  const unitIn = document.createElement('select');
  unitIn.className = 'field__input';
  unitIn.append(new Option('in', 'in'), new Option('mm', 'mm'));
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--primary';
  add.textContent = 'Add size';
  add.addEventListener('click', () => {
    const nm = (nameIn.value || '').trim();
    const a = parseFloat(wIn.value);
    const b = parseFloat(lIn.value);
    if (!nm || !(a > 0) || !(b > 0)) { alert('Enter a name, width (W) and length (L).'); return; }
    // Store canonical landscape: w = the long side. W and L are physical sides.
    addCustomPaper({ id: 'custom:' + Date.now().toString(36), name: nm, w: Math.max(a, b), h: Math.min(a, b), unit: unitIn.value });
    renderSettings();
  });
  form.append(
    slabel('Name', nameIn),
    slabel('W', wIn),
    slabel('L', lIn),
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
  const g = sgroup('Presets');
  for (const n of [1, 2]) {
    const p = state.config.presets[String(n)];
    const row = document.createElement('div');
    row.className = 'settings-row settings-row--preset';

    // A small square that draws the preset the way the grid would: fill, border,
    // icon (coloured, filled and turned) and the first label line under it.
    const preview = presetPreview(p);

    const desc = document.createElement('div');
    desc.className = 'preset-desc';
    const status = document.createElement('span');
    status.className = 'settings-row__name preset-desc__name';
    status.textContent = p ? `Preset ${n}: set` : `Preset ${n}: empty`;
    desc.appendChild(status);
    if (p) desc.appendChild(presetSummaryLine(p));

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

    row.append(preview, desc, edit, clr);
    g.appendChild(row);
  }
  g.appendChild(snote(
    'A saved square look — icon, colours, facing and labels — applied from the edit pane’s Preset buttons.'
  ));
  return g;
}

/** A miniature of the preset, drawn the way the grid draws a square: fill and
 *  border, the icon coloured/filled/turned, and the first label under it. An
 *  empty preset shows a dashed placeholder instead. */
function presetPreview(p) {
  const box = document.createElement('div');
  box.className = 'preset-preview';
  if (!p) {
    box.classList.add('preset-preview--empty');
    box.title = 'No preset saved yet';
    return box;
  }
  box.style.background = p.fill || DEFAULTS.fill;
  box.style.borderColor = p.border || DEFAULTS.border;

  if (p.icon) {
    const svg = iconUse(p.icon, 'preset-preview__icon', p.iconFill || null);
    if (svg) {
      svg.style.color = p.iconColor || DEFAULTS.iconColor;
      if (p.rotation) svg.style.transform = `rotate(${p.rotation}deg)`;
      box.appendChild(svg);
    }
  }
  const first = (p.labels || []).find((l) => (l.text || '').trim());
  if (first) {
    const t = document.createElement('span');
    t.className = 'preset-preview__text';
    t.textContent = first.text;
    t.style.color = first.color || DEFAULTS.labelColor;
    box.appendChild(t);
  }
  return box;
}

/** The second line under a set preset: what it carries, spelled out. */
function presetSummaryLine(p) {
  const bits = [];
  if (p.icon) bits.push(p.icon);
  if (p.labels && p.labels.length) bits.push(`${p.labels.length} line${p.labels.length === 1 ? '' : 's'}`);
  if (p.rotation) bits.push(`${p.rotation}°`);
  const el = document.createElement('span');
  el.className = 'preset-desc__meta';
  el.textContent = bits.length ? bits.join(' · ') : 'plain square';
  return el;
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
