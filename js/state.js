// state.js — central app state + a tiny pub/sub so the UI re-renders on change.

const listeners = new Set();
let quiet = false; // suppress emits during bulk updates

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  if (quiet) return;
  for (const fn of listeners) fn(state);
}

/** Run several mutations, then emit once. */
function batch(fn) {
  quiet = true;
  try { fn(); } finally { quiet = false; }
  emit();
}

const DEFAULTS = {
  fill: '#dbe7ff',
  border: '#2f6feb',
  labelColor: '#1f2933',
  labelColor2: '#52606d',   // second label line (two lines are the norm)
  iconColor: '#1f2933',
  rowWeight: 1,
  colWeight: 1,
  chairScale: 0.7,          // chairs draw smaller than a desk by default
};

/** A square acts as a "chair" when its icon is the chair: it is furniture
 *  rather than a desk, so it can shrink to fit a walkway. */
function isChairCell(cell) {
  return !!(cell && cell.enabled && cell.icon === 'chair');
}
function isChairAt(r, c) { return isChairCell(peekCell(r, c)); }

/** Default color for label line `index` (line 2 and beyond use labelColor2). */
function defaultLabelColor(index) {
  return index >= 1 ? state.defaults.labelColor2 : state.defaults.labelColor;
}

function makeCell() {
  // Newly created seats inherit the current default colors (see state.defaults);
  // the edit pane then overrides them per cell.
  return {
    enabled: false,
    labels: [],                 // [{ text, color }]
    icon: null,                 // icon id from icons.js
    iconColor: state.defaults.iconColor,
    chairScale: DEFAULTS.chairScale, // size of the chair within its square

    rotation: 0,                // 0 | 90 | 180 | 270
    fill: state.defaults.fill,
    border: state.defaults.border,
  };
}

const state = {
  version: 1,
  title: '',                    // chart title, shown on page and in output
  // Default colors applied to newly set seats / icons / labels.
  defaults: {
    fill: DEFAULTS.fill,
    border: DEFAULTS.border,
    iconColor: DEFAULTS.iconColor,
    labelColor: DEFAULTS.labelColor,
    labelColor2: DEFAULTS.labelColor2,
  },
  grid: { cols: 6, rows: 5 },
  cells: new Map(),             // key "r,c" -> cell
  rowWeights: [],               // per-row size weight (empty => DEFAULTS.rowWeight)
  colWeights: [],               // per-col size weight
  tables: [],                   // [{ id, cellKeys:[], shape:'round'|'square', color }]
  paper: 'letter',              // preset id or { w, h, unit }
  selection: new Set(),         // keys highlighted in select mode
};

const keyOf = (r, c) => `${r},${c}`;
const parseKey = (k) => k.split(',').map(Number);

function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < state.grid.rows && c < state.grid.cols;
}

function getCell(r, c) {
  const k = keyOf(r, c);
  let cell = state.cells.get(k);
  if (!cell) { cell = makeCell(); state.cells.set(k, cell); }
  return cell;
}

/** Non-creating peek; returns undefined if the cell has no stored data. */
function peekCell(r, c) {
  return state.cells.get(keyOf(r, c));
}

function isEnabled(r, c) {
  const cell = peekCell(r, c);
  return !!(cell && cell.enabled);
}

// ---------------------------------------------------------------- mutations

function setGrid(cols, rows) {
  cols = clampInt(cols, 1, 40, state.grid.cols);
  rows = clampInt(rows, 1, 40, state.grid.rows);
  state.grid = { cols, rows };
  // Prune out-of-bounds cell data, table members, and selection.
  for (const k of [...state.cells.keys()]) {
    const [r, c] = parseKey(k);
    if (r >= rows || c >= cols) state.cells.delete(k);
  }
  pruneTables();
  pruneSelection();
  state.rowWeights.length = rows;
  state.colWeights.length = cols;
  emit();
}

function toggleEnabled(r, c) {
  const cell = getCell(r, c);
  cell.enabled = !cell.enabled;
  emit();
}

function updateCell(r, c, patch) {
  Object.assign(getCell(r, c), patch);
  emit();
}

function setRowWeight(r, w) {
  state.rowWeights[r] = w > 0 ? w : undefined;
  emit();
}
function setColWeight(c, w) {
  state.colWeights[c] = w > 0 ? w : undefined;
  emit();
}
function rowWeight(r) { return state.rowWeights[r] || DEFAULTS.rowWeight; }
function colWeight(c) { return state.colWeights[c] || DEFAULTS.colWeight; }

function setPaper(paper) { state.paper = paper; emit(); }

function setTitle(title) { state.title = title || ''; emit(); }

/** Set a default color (fill | border | iconColor | labelColor) for future cells. */
function setDefault(key, color) { state.defaults[key] = color; emit(); }

// ---------------------------------------------------------------- bulk edit

/** Apply a shared patch to every cell key, emitting once. */
function updateCells(keys, patch) {
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      Object.assign(getCell(r, c), patch);
    }
  });
}

/** Recolor label line `index` on every listed cell that has that line — text
 *  is never touched (labels stay individual per square). */
function setLineColorForCells(keys, index, color) {
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      const cell = getCell(r, c);
      if (cell.labels[index]) cell.labels[index].color = color;
    }
  });
}

/** Set the TEXT of label line `index` on every listed cell, creating the line
 *  (and any lines before it) where missing. Used by bulk "overwrite" edits. */
function setLineTextForCells(keys, index, text) {
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      const cell = getCell(r, c);
      while (cell.labels.length <= index) {
        cell.labels.push({ text: '', color: defaultLabelColor(cell.labels.length) });
      }
      cell.labels[index].text = text;
    }
  });
}

/** Remove label line `index` from every listed cell that has it. */
function removeLineForCells(keys, index) {
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      const cell = getCell(r, c);
      if (cell.labels[index]) cell.labels.splice(index, 1);
    }
  });
}

/** Add one more label line to every listed cell, padding shorter cells so the
 *  same line index means the same line on every selected square. */
function addLineForCells(keys, text = '') {
  setLineTextForCells(keys, maxLabelLines(keys), text);
}

/** The shared text of label line `index` across cells, or null when they
 *  differ (so the bulk pane can show a common value but not clobber others). */
function commonLineText(keys, index) {
  let seen = null, first = true;
  for (const k of keys) {
    const [r, c] = parseKey(k);
    const cell = peekCell(r, c);
    const text = cell?.labels[index]?.text ?? null;
    if (first) { seen = text; first = false; }
    else if (seen !== text) return null;
  }
  return seen;
}

/** Largest label-line count across the listed cells. */
function maxLabelLines(keys) {
  let max = 0;
  for (const k of keys) {
    const [r, c] = parseKey(k);
    const cell = peekCell(r, c);
    if (cell) max = Math.max(max, cell.labels.length);
  }
  return max;
}

// ---------------------------------------------------------------- selection

function toggleSelection(r, c) {
  const k = keyOf(r, c);
  if (state.selection.has(k)) state.selection.delete(k);
  else state.selection.add(k);
  emit();
}
function clearSelection() { state.selection.clear(); emit(); }

/** Add every square in the rectangle between two cells to the selection. */
function selectRange(r1, c1, r2, c2) {
  const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
  const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
  batch(() => {
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) state.selection.add(keyOf(r, c));
  });
}

/** Set the seat state of every square in the rectangle and make it THE
 *  selection (Shift+click both seats/unseats and selects). The range replaces
 *  the selection rather than adding to it, so squares outside the line are
 *  dropped. */
function seatRange(r1, c1, r2, c2, enabled) {
  const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
  const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
  batch(() => {
    state.selection.clear();
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) {
        getCell(r, c).enabled = enabled;
        state.selection.add(keyOf(r, c));
      }
  });
}

/** Select every seated (enabled) square. */
function selectAllEnabled() {
  batch(() => {
    state.selection.clear();
    for (const [k, cell] of state.cells) if (cell.enabled) state.selection.add(k);
  });
}

/** Select every SEATED square matching `pred(cell)`. (A first pass at
 *  filtered selection; a general filter system can replace this later.) */
function selectSeatedWhere(pred) {
  batch(() => {
    state.selection.clear();
    for (const [k, cell] of state.cells) {
      if (cell.enabled && pred(cell)) state.selection.add(k);
    }
  });
}

const hasLabelText = (cell) => (cell.labels || []).some((l) => l.text && l.text.trim());

/** Seated squares that carry at least one non-empty label line. */
function selectLabeled() { selectSeatedWhere(hasLabelText); }
/** Seated squares with no label text at all. */
function selectUnlabeled() { selectSeatedWhere((cell) => !hasLabelText(cell)); }
/** Seated squares that have an icon. */
function selectWithIcons() { selectSeatedWhere((cell) => !!cell.icon); }
/** Seated squares with no icon. */
function selectWithoutIcons() { selectSeatedWhere((cell) => !cell.icon); }

/** Select every square in the grid. */
function selectAllSquares() {
  batch(() => {
    state.selection.clear();
    for (let r = 0; r < state.grid.rows; r++)
      for (let c = 0; c < state.grid.cols; c++) state.selection.add(keyOf(r, c));
  });
}
function pruneSelection() {
  for (const k of [...state.selection]) {
    const [r, c] = parseKey(k);
    if (!inBounds(r, c)) state.selection.delete(k);
  }
}

// ---------------------------------------------------------------- tables

function addTable(shape, color) {
  const cellKeys = [...state.selection];
  if (cellKeys.length === 0) return null;
  const table = { id: `t${Date.now().toString(36)}`, cellKeys, shape, color };
  state.tables.push(table);
  state.selection.clear();
  emit();
  return table;
}
function removeTable(id) {
  state.tables = state.tables.filter((t) => t.id !== id);
  emit();
}
function pruneTables() {
  for (const t of state.tables) {
    t.cellKeys = t.cellKeys.filter((k) => { const [r, c] = parseKey(k); return inBounds(r, c); });
  }
  state.tables = state.tables.filter((t) => t.cellKeys.length > 0);
}

// ---------------------------------------------------------------- reset

function clearAll() {
  // Wiping the chart also drops the Shift+click range anchor (defined in
  // interactions.js) so the next Shift+click can't extend from a stale cell.
  if (typeof resetSelectAnchor === 'function') resetSelectAnchor();
  batch(() => {
    state.title = '';
    state.cells.clear();
    state.tables = [];
    state.selection.clear();
    state.rowWeights = [];
    state.colWeights = [];
    state.rowWeights.length = state.grid.rows;
    state.colWeights.length = state.grid.cols;
  });
}

// ---------------------------------------------------------------- serialize

function serialize() {
  return {
    version: state.version,
    title: state.title,
    defaults: { ...state.defaults },
    grid: { ...state.grid },
    cells: [...state.cells.entries()].map(([k, v]) => [k, v]),
    rowWeights: [...state.rowWeights],
    colWeights: [...state.colWeights],
    tables: state.tables.map((t) => ({ ...t, cellKeys: [...t.cellKeys] })),
    paper: state.paper,
  };
}

function deserialize(data) {
  if (!data || typeof data !== 'object') return false;
  batch(() => {
    state.title = typeof data.title === 'string' ? data.title : '';
    state.defaults = {
      fill: data.defaults?.fill || DEFAULTS.fill,
      border: data.defaults?.border || DEFAULTS.border,
      iconColor: data.defaults?.iconColor || DEFAULTS.iconColor,
      labelColor: data.defaults?.labelColor || DEFAULTS.labelColor,
      labelColor2: data.defaults?.labelColor2 || DEFAULTS.labelColor2,
    };
    state.grid = {
      cols: clampInt(data.grid?.cols, 1, 40, 6),
      rows: clampInt(data.grid?.rows, 1, 40, 5),
    };
    state.cells = new Map();
    for (const [k, v] of data.cells || []) {
      state.cells.set(k, { ...makeCell(), ...v, labels: (v.labels || []).map((l) => ({ ...l })) });
    }
    state.rowWeights = Array.isArray(data.rowWeights) ? [...data.rowWeights] : [];
    state.colWeights = Array.isArray(data.colWeights) ? [...data.colWeights] : [];
    state.rowWeights.length = state.grid.rows;
    state.colWeights.length = state.grid.cols;
    state.tables = Array.isArray(data.tables)
      ? data.tables.map((t) => ({ id: t.id, shape: t.shape, color: t.color, cellKeys: [...(t.cellKeys || [])] }))
      : [];
    state.paper = data.paper || 'letter';
    state.selection = new Set();
    pruneTables();
  });
  return true;
}

// ---------------------------------------------------------------- utils

function clampInt(v, min, max, fallback) {
  v = parseInt(v, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
