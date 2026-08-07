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
}

// ---- Paper, tables ---------------------------------------------------------
initPaperControls();
initOrientationControls();
initTables();
initInsertGuides(document.getElementById('stage'));

// Grid view options
const trueSizeBtn = document.getElementById('btn-true-size');
trueSizeBtn.addEventListener('click', () => toggleTrueSizes());
subscribe(() => trueSizeBtn.setAttribute('aria-pressed', String(state.showTrueSizes)));
document.getElementById('btn-reset-sizes').addEventListener('click', () => resetLineSizes());

// ---- Toolbar actions -------------------------------------------------------
document.getElementById('btn-preview').addEventListener('click', showPreview);
// Keep an open preview in step with orientation changes.
subscribe(() => { if (!document.getElementById('preview').hidden) showPreview(); });
document.getElementById('btn-print').addEventListener('click', printChart);

document.getElementById('btn-preview-png').addEventListener('click', downloadPng);
document.getElementById('btn-preview-print').addEventListener('click', printChart);
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

// Copy a link that reopens this layout. Briefly confirms on the button itself.
const linkBtn = document.getElementById('btn-copy-link');
linkBtn.addEventListener('click', async () => {
  const link = await buildShareLink();
  const ok = await copyText(link);
  if (ok) {
    // Icon-only button, so confirm with a flash rather than swapping its text.
    linkBtn.classList.add('iconbtn--ok');
    linkBtn.title = 'Link copied';
    setTimeout(() => {
      linkBtn.classList.remove('iconbtn--ok');
      linkBtn.title = 'Share — copy a link that reopens this layout';
    }, 1500);
  } else {
    // Clipboard blocked (file:// is not a secure context): let them copy it.
    prompt('Copy this link to reopen the layout:', link);
  }
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear the whole chart? This cannot be undone.')) clearAll();
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
  initAutoSave();        // start persisting after the initial restore
})();
