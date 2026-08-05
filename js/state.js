// state.js — central app state + a tiny pub/sub so the UI re-renders on change.

const listeners = new Set();
let quiet = false; // suppress emits during bulk updates

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  if (quiet) return;
  for (const fn of listeners) fn(state);
}

/** Run several mutations, then emit once. */
export function batch(fn) {
  quiet = true;
  try { fn(); } finally { quiet = false; }
  emit();
}

export const DEFAULTS = {
  fill: '#dbe7ff',
  border: '#2f6feb',
  labelColor: '#1f2933',
  rowWeight: 1,
  colWeight: 1,
};

function makeCell() {
  return {
    enabled: false,
    labels: [],                 // [{ text, color }]
    icon: null,                 // icon id from icons.js
    rotation: 0,                // 0 | 90 | 180 | 270
    fill: DEFAULTS.fill,
    border: DEFAULTS.border,
  };
}

export const state = {
  version: 1,
  grid: { cols: 6, rows: 5 },
  cells: new Map(),             // key "r,c" -> cell
  rowWeights: [],               // per-row size weight (empty => DEFAULTS.rowWeight)
  colWeights: [],               // per-col size weight
  tables: [],                   // [{ id, cellKeys:[], shape:'round'|'square', color }]
  paper: 'letter',              // preset id or { w, h, unit }
  selection: new Set(),         // keys highlighted in select mode
};

export const keyOf = (r, c) => `${r},${c}`;
export const parseKey = (k) => k.split(',').map(Number);

export function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < state.grid.rows && c < state.grid.cols;
}

export function getCell(r, c) {
  const k = keyOf(r, c);
  let cell = state.cells.get(k);
  if (!cell) { cell = makeCell(); state.cells.set(k, cell); }
  return cell;
}

/** Non-creating peek; returns undefined if the cell has no stored data. */
export function peekCell(r, c) {
  return state.cells.get(keyOf(r, c));
}

export function isEnabled(r, c) {
  const cell = peekCell(r, c);
  return !!(cell && cell.enabled);
}

// ---------------------------------------------------------------- mutations

export function setGrid(cols, rows) {
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

export function toggleEnabled(r, c) {
  const cell = getCell(r, c);
  cell.enabled = !cell.enabled;
  emit();
}

export function updateCell(r, c, patch) {
  Object.assign(getCell(r, c), patch);
  emit();
}

export function setRowWeight(r, w) {
  state.rowWeights[r] = w > 0 ? w : undefined;
  emit();
}
export function setColWeight(c, w) {
  state.colWeights[c] = w > 0 ? w : undefined;
  emit();
}
export function rowWeight(r) { return state.rowWeights[r] || DEFAULTS.rowWeight; }
export function colWeight(c) { return state.colWeights[c] || DEFAULTS.colWeight; }

export function setPaper(paper) { state.paper = paper; emit(); }

// ---------------------------------------------------------------- selection

export function toggleSelection(r, c) {
  const k = keyOf(r, c);
  if (state.selection.has(k)) state.selection.delete(k);
  else state.selection.add(k);
  emit();
}
export function clearSelection() { state.selection.clear(); emit(); }
function pruneSelection() {
  for (const k of [...state.selection]) {
    const [r, c] = parseKey(k);
    if (!inBounds(r, c)) state.selection.delete(k);
  }
}

// ---------------------------------------------------------------- tables

export function addTable(shape, color) {
  const cellKeys = [...state.selection];
  if (cellKeys.length === 0) return null;
  const table = { id: `t${Date.now().toString(36)}`, cellKeys, shape, color };
  state.tables.push(table);
  state.selection.clear();
  emit();
  return table;
}
export function removeTable(id) {
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

export function clearAll() {
  batch(() => {
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

export function serialize() {
  return {
    version: state.version,
    grid: { ...state.grid },
    cells: [...state.cells.entries()].map(([k, v]) => [k, v]),
    rowWeights: [...state.rowWeights],
    colWeights: [...state.colWeights],
    tables: state.tables.map((t) => ({ ...t, cellKeys: [...t.cellKeys] })),
    paper: state.paper,
  };
}

export function deserialize(data) {
  if (!data || typeof data !== 'object') return false;
  batch(() => {
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
