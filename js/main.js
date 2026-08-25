// main.js — wire modules, controls, and the initial render.


const chartEl = document.getElementById('chart');
const colsInput = document.getElementById('grid-cols');
const rowsInput = document.getElementById('grid-rows');
const titleInput = document.getElementById('chart-title-input');
const titleDisplay = document.getElementById('chart-title');

// ---- Render loop: re-render grid on any state change -----------------------
subscribe(() => renderGrid());

// ---- Title: input drives state; state drives the on-page heading -----------
const updateTitleDisplay = () => {
  titleDisplay.textContent = state.title;
  titleDisplay.hidden = !state.title.trim();
};
titleInput.addEventListener('input', () => setTitle(titleInput.value));
subscribe(updateTitleDisplay);

// Re-measure table overlays after paint (they depend on cell geometry).
const scheduleTableRefresh = () => requestAnimationFrame(() => requestAnimationFrame(refreshTables));
subscribe(scheduleTableRefresh);
window.addEventListener('resize', refreshTables);

// ---- Wire interactions & editor -------------------------------------------
initInteractions(chartEl);
initEditor();
onRequestEdit(openEditor);
onRequestBulkEdit(openBulkEditor);

// ---- Grid size inputs ------------------------------------------------------
const applyGrid = () => setGrid(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
colsInput.addEventListener('change', applyGrid);
rowsInput.addEventListener('change', applyGrid);

// ---- Default colors --------------------------------------------------------
const DEFAULT_COLOR_INPUTS = {
  fill: 'def-fill', border: 'def-border', iconColor: 'def-icon',
  labelColor: 'def-label', labelColor2: 'def-label2',
  tableColor: 'def-table', tableBorder: 'def-table-border',
  wallFill: 'def-wall-fill', wallBorder: 'def-wall-border',
};
for (const [key, id] of Object.entries(DEFAULT_COLOR_INPUTS)) {
  const el = document.getElementById(id);
  el.value = state.defaults[key];
  bindColorInput(el, () => setDefault(key, el.value));
}
function reflectDefaults() {
  for (const [key, id] of Object.entries(DEFAULT_COLOR_INPUTS)) {
    document.getElementById(id).value = state.defaults[key];
  }
  reflectIconFillDefault();
}

// Icon fill is the one default that can be OFF, so it carries a tick as well as
// a swatch — the same pair the edit pane uses.
const iconFillOn = document.getElementById('def-icon-fill-on');
const iconFillSwatchEl = document.getElementById('def-icon-fill');
function reflectIconFillDefault() {
  const on = !!state.defaults.iconFill;
  iconFillOn.checked = on;
  iconFillSwatchEl.disabled = !on;
  if (on) iconFillSwatchEl.value = state.defaults.iconFill;
}
iconFillOn.addEventListener('change', () => {
  setDefault('iconFill', iconFillOn.checked ? iconFillSwatchEl.value : null);
  reflectIconFillDefault();
});
bindColorInput(iconFillSwatchEl, () => {
  if (iconFillOn.checked) setDefault('iconFill', iconFillSwatchEl.value);
});
reflectIconFillDefault();

// ---- App config & settings pane -------------------------------------------
// Restore config first, so custom paper sizes exist before the paper dropdown
// is built and the theme/title/favicon are applied before the first paint.
restoreConfig();
initSettings();

// ---- Paper, tables ---------------------------------------------------------
initPaperControls();
initOrientationControls();
initTables();
initWalls();
initFilters();
initRows();
initInsertGuides(document.getElementById('stage'));

// Grid view options
const trueSizeBtn = document.getElementById('btn-true-size');
trueSizeBtn.addEventListener('click', () => toggleTrueSizes());
subscribe(() => trueSizeBtn.setAttribute('aria-pressed', String(state.showTrueSizes)));
document.getElementById('btn-reset-sizes').addEventListener('click', () => resetLineSizes());

// Clear Grid empties every square. Non-destructive — labels and colors stay put
// — but it is a big sweep, so confirm first.
document.getElementById('btn-empty-all').addEventListener('click', () => {
  if (confirm('Empty every square on the grid? Labels and colors are kept.')) clearGrid();
});

// ---- Toolbar actions -------------------------------------------------------
document.getElementById('btn-preview').addEventListener('click', showPreview);
// Keep an open preview in step with orientation changes.
subscribe(() => { if (!document.getElementById('preview').hidden) showPreview(); });
document.getElementById('btn-print').addEventListener('click', printChart);

document.getElementById('btn-preview-print').addEventListener('click', printChart);

// ---- Save Image: one button, a small menu of three ways to take the image ---
const imageBtn = document.getElementById('btn-preview-png');
const imageMenu = document.getElementById('image-menu');
const setImageMenu = (open) => {
  imageMenu.hidden = !open;
  imageBtn.setAttribute('aria-expanded', String(open));
};
imageBtn.addEventListener('click', (e) => { e.stopPropagation(); setImageMenu(imageMenu.hidden); });
document.addEventListener('pointerdown', (e) => {
  if (!imageMenu.hidden && !(e.target.closest && e.target.closest('.menu-anchor'))) setImageMenu(false);
});

// Each action confirms the same way Share does, in the image tone.
const IMAGE_ACTIONS = {
  copy:     { run: copyPngToClipboard, done: 'Image copied',
              fail: 'Copying images needs the page served over http(s) — use Download Image.' },
  link:     { run: copyPngLink, done: 'Image link copied',
              fail: 'Clipboard unavailable here — use Download Image.' },
  download: { run: downloadPng, done: 'Image downloaded',
              fail: 'The image could not be created — try a smaller paper size.' },
};
for (const item of imageMenu.querySelectorAll('[data-image]')) {
  item.addEventListener('click', async () => {
    const action = IMAGE_ACTIONS[item.dataset.image];
    setImageMenu(false);
    item.disabled = true;
    const ok = await action.run();
    item.disabled = false;
    if (ok) confirmOn(imageBtn, action.done, { tone: 'image', flash: 'btn--ok-image' });
    else alert(action.fail);
  });
}
document.getElementById('btn-preview-save').addEventListener('click', () => {
  const name = prompt('Save as (file name):', 'seating-chart');
  if (name !== null) exportFile(name || 'seating-chart');
});
document.querySelectorAll('[data-close-preview]').forEach((el) =>
  el.addEventListener('click', closePreview)
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('preview').hidden) closePreview();
});

// ---- Save / open / clear ---------------------------------------------------
document.getElementById('btn-save-file').addEventListener('click', () => {
  const name = prompt('Save as (file name):', 'seating-chart');
  if (name !== null) exportFile(name || 'seating-chart');
});

const fileInput = document.getElementById('file-input');
document.getElementById('btn-open-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await importFile(file);
    reflectControls();
  } catch (err) {
    alert(`Could not open file: ${err.message}`);
  }
  fileInput.value = '';
});

// How long the copy confirmation stays up. The toast's fade-out is timed to the
// same span in CSS, so the label and the green flash leave together.
const CONFIRM_MS = 1500;

/** A small message that appears under `anchor` and fades away on its own.
 *  `tone` picks its colour — green for a copied link, blue for image actions. */
function showToast(anchor, text, tone = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  const box = anchor.getBoundingClientRect();
  el.style.left = `${box.left + box.width / 2}px`;
  // Buttons low on the screen get the toast above them instead of off-screen.
  const below = box.bottom + 8;
  if (below + 40 > window.innerHeight) el.style.top = `${box.top - 38}px`;
  else el.style.top = `${below}px`;
  setTimeout(() => el.remove(), CONFIRM_MS);
}

/** Flash a button and float a confirmation under it, then put both back. */
function confirmOn(btn, text, { tone = 'ok', flash = 'iconbtn--ok' } = {}) {
  const title = btn.title;
  btn.classList.add(flash);
  btn.title = text;
  showToast(btn, text, tone);
  setTimeout(() => { btn.classList.remove(flash); btn.title = title; }, CONFIRM_MS);
}

// Copy a link that reopens this layout. Briefly confirms on the button itself.
async function copyShareLink(btn, flash) {
  const link = await buildShareLink();
  if (await copyText(link)) confirmOn(btn, 'Link copied', { flash });
  // Clipboard blocked (file:// is not a secure context): let them copy it.
  else prompt('Copy this link to reopen the layout:', link);
}

const linkBtn = document.getElementById('btn-copy-link');
linkBtn.addEventListener('click', () => copyShareLink(linkBtn, 'iconbtn--ok'));
document.getElementById('btn-preview-share')
  .addEventListener('click', (e) => copyShareLink(e.currentTarget, 'btn--ok'));

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear the whole chart? This wipes the undo history too, so it '
    + "can't be undone unless you've saved or exported the chart.")) {
    clearAll();
    clearHistory();   // New starts fresh: drop the undo/redo stacks
  }
});

// ---- Zoom ------------------------------------------------------------------
let zoom = 1;
const applyZoom = () => {
  chartEl.style.setProperty('--zoom', zoom.toFixed(2));
  scheduleTableRefresh();
};
document.getElementById('btn-zoom-in').addEventListener('click', () => { zoom = Math.min(2.5, zoom + 0.15); applyZoom(); });
document.getElementById('btn-zoom-out').addEventListener('click', () => { zoom = Math.max(0.4, zoom - 0.15); applyZoom(); });
document.getElementById('btn-zoom-reset').addEventListener('click', () => { zoom = 1; applyZoom(); });

// ---- Sync toolbar inputs with state (after load) ---------------------------
function reflectControls() {
  colsInput.value = state.grid.cols;
  rowsInput.value = state.grid.rows;
  titleInput.value = state.title;
  updateTitleDisplay();
  reflectDefaults();
  reflectPaper();
}

// ---- Boot ------------------------------------------------------------------
(async () => {
  // A shared link wins over the saved session; otherwise pick up where we left
  // off. Either way autosave then takes over, so editing continues normally.
  const fromLink = await loadFromHash();
  if (!fromLink) restoreFromCache();
  reflectControls();
  renderGrid();
  scheduleTableRefresh();
  initHistory();         // snapshot the restored state as the undo baseline
  initAutoSave();        // start persisting the chart after the initial restore
  initConfigAutoSave();  // and the app config, on its own channel + key
})();
