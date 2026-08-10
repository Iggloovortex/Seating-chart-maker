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
  landscape: true,              // paper orientation; false swaps width/height
  selection: new Set(),         // keys highlighted in select mode
  showTrueSizes: false,         // preview weighted row/col sizes in the grid
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

/** A square has content once it carries an icon or real label text. */
function hasContent(cell) {
  return !!(cell.icon || (cell.labels || []).some((l) => l.text && l.text.trim()));
}

/** Giving an EMPTY square content implies it is a seat, so setting an icon or
 *  label text fills it in. Only the no-content -> content transition seats, so
 *  a square deliberately unseated while holding content stays unseated through
 *  unrelated edits. Callers that set `enabled` themselves skip this entirely,
 *  which keeps "Empty all" and the pane's Empty button working. */
function seatOnNewContent(cell, hadContent) {
  if (!cell.enabled && !hadContent && hasContent(cell)) cell.enabled = true;
}

function updateCell(r, c, patch) {
  const cell = getCell(r, c);
  const had = hasContent(cell);
  Object.assign(cell, patch);
  if (!('enabled' in patch)) seatOnNewContent(cell, had);
  emit();
}

/** Set one label line's text on a single square, seating it if this is the
 *  content that brings the square to life. */
function setLineText(r, c, index, text) {
  const cell = getCell(r, c);
  const had = hasContent(cell);
  if (!cell.labels[index]) return false;
  cell.labels[index].text = text;
  seatOnNewContent(cell, had);
  emit();
  return true;
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

/** Show the weighted row/column sizes in the editing grid (a view option, so
 *  it is not saved with the chart). */
function toggleTrueSizes() { state.showTrueSizes = !state.showTrueSizes; emit(); }

/** Put every row and column back to the default size. */
function resetLineSizes() {
  batch(() => {
    state.rowWeights = [];
    state.colWeights = [];
    state.rowWeights.length = state.grid.rows;
    state.colWeights.length = state.grid.cols;
  });
}

/** Flip the page between landscape and portrait. */
function toggleOrientation() { state.landscape = !state.landscape; emit(); }

function setTitle(title) { state.title = title || ''; emit(); }

/** Set a default color (fill | border | iconColor | labelColor) for future cells. */
function setDefault(key, color) { state.defaults[key] = color; emit(); }

// ---------------------------------------------------------------- bulk edit

/** Apply a shared patch to every cell key, emitting once. */
function updateCells(keys, patch) {
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      const cell = getCell(r, c);
      const had = hasContent(cell);
      Object.assign(cell, patch);
      if (!('enabled' in patch)) seatOnNewContent(cell, had);
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
      const had = hasContent(cell);
      while (cell.labels.length <= index) {
        cell.labels.push({ text: '', color: defaultLabelColor(cell.labels.length) });
      }
      cell.labels[index].text = text;
      seatOnNewContent(cell, had); // label text fills an empty square
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

// ---------------------------------------------------------------- copy square

// A whole square: colors, icon, facing, chair size AND its label lines (text
// included), so pasting clones the square rather than just its formatting.
let squareClipboard = null;

function hasSquareClipboard() { return !!squareClipboard; }

/** Copy a square: colors, icon, facing, chair size and every label line with
 *  its text and color. */
function copySquareFrom(r, c) {
  const cell = peekCell(r, c);
  if (!cell) return false;
  squareClipboard = {
    enabled: cell.enabled,
    fill: cell.fill,
    border: cell.border,
    icon: cell.icon,
    iconColor: cell.iconColor,
    rotation: cell.rotation,
    labels: (cell.labels || []).map((l) => ({ text: l.text, color: l.color })),
  };
  emit();
  return true;
}

/** Clone the copied square onto every listed square, label lines and all. The
 *  target's own labels are replaced, so it ends up matching the source. */
function pasteSquareTo(keys) {
  if (!squareClipboard || !keys.length) return false;
  const f = squareClipboard;
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      const cell = getCell(r, c);
      cell.enabled = f.enabled;   // pasting a seated square fills an empty one
      cell.fill = f.fill;
      cell.border = f.border;
      cell.icon = f.icon;
      cell.iconColor = f.iconColor;
      cell.rotation = f.rotation;
      // Fresh objects per target so squares never share label instances.
      cell.labels = f.labels.map((l) => ({ text: l.text, color: l.color }));
    }
  });
  return true;
}

// ---------------------------------------------------------------- move

/** Shift every selected square (and any table wholly inside the selection) by
 *  `dr, dc`. Returns false and changes nothing when the move would leave the
 *  grid, so the caller can silently ignore it and let the user try again. */
function moveSelection(dr, dc) {
  if (!dr && !dc) return false;
  const keys = [...state.selection];
  if (!keys.length) return false;

  for (const k of keys) {
    const [r, c] = parseKey(k);
    if (!inBounds(r + dr, c + dc)) return false; // off-grid: silent no-op
  }

  // Capture before deleting, so moves that overlap their own source still work.
  const moved = new Map();
  for (const k of keys) {
    const [r, c] = parseKey(k);
    const cell = state.cells.get(k);
    if (cell) moved.set(keyOf(r + dr, c + dc), cell);
  }
  const selected = new Set(keys);

  batch(() => {
    for (const k of keys) state.cells.delete(k);
    for (const [k, cell] of moved) state.cells.set(k, cell);
    for (const t of state.tables) {
      if (t.cellKeys.every((k) => selected.has(k))) {
        t.cellKeys = t.cellKeys.map((k) => {
          const [r, c] = parseKey(k);
          return keyOf(r + dr, c + dc);
        });
      }
    }
    state.selection = new Set(keys.map((k) => {
      const [r, c] = parseKey(k);
      return keyOf(r + dr, c + dc);
    }));
  });
  return true;
}

/** Bounding box of the current selection, or null when nothing is selected. */
function selectionBounds() {
  if (!state.selection.size) return null;
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const k of state.selection) {
    const [r, c] = parseKey(k);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return { minR, maxR, minC, maxC };
}

// ---------------------------------------------------------------- insert

/** Shift every cell, table and selection key at or past `index` along one axis,
 *  then grow the grid. Shared by row and column insertion. */
function insertLine(axis, index) {
  const isRow = axis === 'row';
  const limit = isRow ? state.grid.rows : state.grid.cols;
  if (index < 0 || index > limit || limit >= 40) return false;

  const shift = (k) => {
    const [r, c] = parseKey(k);
    if (isRow) return r >= index ? keyOf(r + 1, c) : k;
    return c >= index ? keyOf(r, c + 1) : k;
  };

  const moved = new Map();
  for (const [k, cell] of state.cells) moved.set(shift(k), cell);
  const sel = new Set([...state.selection].map(shift));

  batch(() => {
    state.cells = moved;
    state.selection = sel;
    for (const t of state.tables) t.cellKeys = t.cellKeys.map(shift);
    const weights = isRow ? state.rowWeights : state.colWeights;
    weights.splice(index, 0, undefined);          // the new line takes the default
    if (isRow) state.grid = { ...state.grid, rows: state.grid.rows + 1 };
    else state.grid = { ...state.grid, cols: state.grid.cols + 1 };
    state.rowWeights.length = state.grid.rows;
    state.colWeights.length = state.grid.cols;
  });
  return true;
}

/** Insert an empty row above row `index` (index === rows appends at the end). */
function insertRow(index) { return insertLine('row', index); }
/** Insert an empty column left of column `index` (index === cols appends). */
function insertCol(index) { return insertLine('col', index); }

// ---------------------------------------------------------------- selection

function toggleSelection(r, c) {
  const k = keyOf(r, c);
  if (state.selection.has(k)) state.selection.delete(k);
  else state.selection.add(k);
  emit();
}
function clearSelection() { state.selection.clear(); emit(); }

/** Make the rectangle between two cells THE selection, without touching seats.
 *  Used while Shift+click is sizing a rectangle: every click re-sizes the
 *  selection, and only a repeat click on the same corner commits seating. */
function setSelectionRange(r1, c1, r2, c2) {
  const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
  const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
  batch(() => {
    state.selection.clear();
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) state.selection.add(keyOf(r, c));
  });
}

/** True when every square in the rectangle is already seated. Drives the
 *  Shift+click commit direction: a rect with any gap fills in, and only an
 *  already-complete rect empties. */
function allSeatedInRange(r1, c1, r2, c2) {
  const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
  const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
  for (let r = rMin; r <= rMax; r++)
    for (let c = cMin; c <= cMax; c++) if (!isEnabled(r, c)) return false;
  return true;
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
      const [r, c] = parseKey(k);
      if (cell.enabled && pred(cell, r, c)) state.selection.add(k);
    }
  });
}

const hasLabelText = (cell) => (cell.labels || []).some((l) => l.text && l.text.trim());

/** True when a square falls inside some table's footprint — the block its shape
 *  is drawn over. Those squares belong to the table rather than standing alone. */
function isUnderTable(r, c) {
  return state.tables.some((t) => {
    const fp = footprintOf(t.cellKeys);
    return r >= fp.minR && r <= fp.maxR && c >= fp.minC && c <= fp.maxC;
  });
}

/** Seated squares matching `pred` that are NOT part of a table. The "absence"
 *  filters use this: a table seats everything under it, so those squares are all
 *  unlabelled and icon-less and would otherwise swamp the result. */
function selectSeatedWhereFree(pred) {
  selectSeatedWhere((cell, r, c) => pred(cell) && !isUnderTable(r, c));
}

/** Seated squares that carry at least one non-empty label line. */
function selectLabeled() { selectSeatedWhere(hasLabelText); }
/** Seated squares with no label text at all, table squares excepted. */
function selectUnlabeled() { selectSeatedWhereFree((cell) => !hasLabelText(cell)); }
/** Seated squares that have an icon. */
function selectWithIcons() { selectSeatedWhere((cell) => !!cell.icon); }
/** Seated squares with no icon, table squares excepted. */
function selectWithoutIcons() { selectSeatedWhereFree((cell) => !cell.icon); }

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
  // A table seats everything under it: the shape covers its whole footprint, so
  // every square in that block belongs to the table whether it was selected or
  // not. Without this a gap in the selection would punch a hole in the table.
  const fp = footprintOf(cellKeys);
  for (let r = fp.minR; r <= fp.maxR; r++) {
    for (let c = fp.minC; c <= fp.maxC; c++) getCell(r, c).enabled = true;
  }
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

/** Empty every square on the grid. Non-destructive, like any unseating: labels,
 *  colors and icons stay on the squares and reappear when they are seated
 *  again. Tables are left alone — use New to wipe the chart outright. */
function clearGrid() {
  batch(() => { for (const cell of state.cells.values()) cell.enabled = false; });
}

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
    landscape: state.landscape,
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
    state.landscape = data.landscape !== false;
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
