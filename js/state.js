// state.js — central app state + a tiny pub/sub so the UI re-renders on change.

const listeners = new Set();
let quiet = false; // suppress emits during bulk updates

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  if (quiet) return;
  // The selection is DERIVED — hand-picked squares plus whatever the active
  // filter toggles claim (see js/filters.js). Rebuilding it here, before the
  // listeners run, is what makes a filter live: label a square while "All
  // labeled" is lit and it joins the selection on the same tick.
  if (typeof recomputeSelection === 'function') recomputeSelection();
  for (const fn of listeners) fn(state);
}

/** Run several mutations, then emit once. */
function batch(fn) {
  quiet = true;
  try { fn(); } finally { quiet = false; }
  emit();
}

// ---------------------------------------------------------------- app config
//
// Configuration is the app's own settings — theme, custom paper sizes, site
// icon/title, square presets. It is DISTINCT from chart data: it has its own
// tiny pub/sub, its own serialize, and (in storage.js) its own localStorage key.
// It must NEVER travel in serialize() — the .seatchart / share-link payload.

const configListeners = new Set();
function subscribeConfig(fn) { configListeners.add(fn); return () => configListeners.delete(fn); }
function emitConfig() { for (const fn of configListeners) fn(state.config); }

const DEFAULT_CONFIG = {
  theme: 'system',                    // 'system' | 'light' | 'dark'
  customPapers: [],                   // [{ id, name, w, h, unit }]
  siteTitle: 'Seating Chart Maker',
  favicon: null,                      // data: URI, or null to keep the built-in icon
  presets: { '1': null, '2': null },  // saved square configs, applied from the edit pane
  customIcons: [],                    // imported SVG icons: [{ id, label, viewBox, inner }]
  // Where the mode bars (Select, Walls) sit: 'top' under the toolbar, 'bottom'
  // at the foot of the window, or 'custom' to let each bar choose for itself.
  barPosition: 'top',
  barPositions: { select: 'top', walls: 'top' },
  customColors: [],                   // saved swatches, newest first (see CUSTOM_COLOR_SLOTS)
};

/** How many colours the picker's saved bar holds. Deliberately small: it is a
 *  shortlist of the colours this chart is built from, not a library. */
const CUSTOM_COLOR_SLOTS = 5;

const DEFAULTS = {
  fill: '#dbe7ff',
  border: '#2f6feb',
  labelColor: '#1f2933',
  labelColor2: '#52606d',   // second label line (two lines are the norm)
  iconColor: '#1f2933',
  iconFill: null,           // null => new icons stay outlines
  tableColor: '#8d6e63',
  tableBorder: '#5d4037',
  wallFill: '#909090',      // a solid wall's body
  wallBorder: '#000000',    // the outline every wall bar is drawn with
  windowFill: '#d8feff',    // glass, laid at half opacity so the floor shows
  railFill: '#909090',      // a railing's body
  railBorder: '#000000',    // a railing's outline
  doorFill: '#6c4c00',      // a door's leaf and frame
  doorBorder: '#392b00',    // a door's outline, hinge ring and swing leaf
  rowWeight: 1,
  colWeight: 1,
};

/** "Furniture" squares carry a special icon that renders as a piece tucked to
 *  the edge the square faces, with labels in the empty space, rather than a
 *  full desk. A chair is a small square; a server is a half-square slab. */
const FURNITURE_ICONS = { chair: 'chair', server: 'server' };
function furnitureKind(cell) {
  return cell && cell.enabled && FURNITURE_ICONS[cell.icon] ? cell.icon : null;
}
function isFurnitureCell(cell) { return !!furnitureKind(cell); }

/** A square acts as a "chair" when its icon is the chair: furniture rather than
 *  a desk. */
function isChairCell(cell) {
  return !!(cell && cell.enabled && cell.icon === 'chair');
}
function isServerCell(cell) {
  return !!(cell && cell.enabled && cell.icon === 'server');
}
function isChairAt(r, c) { return isChairCell(peekCell(r, c)); }

/** Default color for label line `index`. Line 1 has its own; line 2 and every
 *  line after it share the second colour. */
function defaultLabelColor(index) {
  return index <= 0 ? state.defaults.labelColor : state.defaults.labelColor2;
}

function makeCell() {
  // Newly created seats inherit the current default colors (see state.defaults);
  // the edit pane then overrides them per cell.
  return {
    enabled: false,
    labels: [],                 // [{ text, color }]
    icon: null,                 // icon id from icons.js
    iconColor: state.defaults.iconColor,
    iconFill: state.defaults.iconFill,   // null => the icon stays an outline
    rotation: 0,                // 0 | 90 | 180 | 270
    fill: state.defaults.fill,
    border: state.defaults.border,
    split: null,                // null, or { rows, cols } — see subcells below
    printer: null,              // null, or { color, compass, labels, size }
  };
}

/** A sub-cell of a split square: a mini square with its own content, but never
 *  itself split. A split square divides its cell into rows×cols of these, each
 *  filled, coloured, iconed and labelled on its own. */
function makeSubcell() {
  return {
    enabled: false,
    labels: [],
    icon: null,
    iconColor: state.defaults.iconColor,
    iconFill: state.defaults.iconFill,
    rotation: 0,
    fill: state.defaults.fill,
    border: state.defaults.border,
    printer: null,
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
    iconFill: DEFAULTS.iconFill,
    tableColor: DEFAULTS.tableColor,
    tableBorder: DEFAULTS.tableBorder,
    wallFill: DEFAULTS.wallFill,
    wallBorder: DEFAULTS.wallBorder,
    windowFill: DEFAULTS.windowFill,
    railFill: DEFAULTS.railFill,
    railBorder: DEFAULTS.railBorder,
    doorFill: DEFAULTS.doorFill,
    doorBorder: DEFAULTS.doorBorder,
  },
  grid: { cols: 6, rows: 5 },
  cells: new Map(),             // key "r,c" -> cell
  rowWeights: [],               // per-row size weight (empty => DEFAULTS.rowWeight)
  colWeights: [],               // per-col size weight
  tables: [],                   // [{ id, cellKeys:[], shape:'round'|'square', color }]
  merges: [],                   // [{ id, keys:[], kind:'poly'|'unit' }] — see merge ops
                                //   content lives on the anchor cell (sorted keys[0])
  walls: {},                    // edge -> type. Key "h:r,c" / "v:r,c"; see wall ops
  paper: 'letter',              // preset id or { w, h, unit }
  landscape: true,              // paper orientation; false swaps width/height
  exportBg: '#ffffff',          // page background of the exported / printed output
  // The selection is derived and must never be assigned to directly: it is
  // rebuilt from the three fields below on every emit.
  selection: new Set(),         // keys highlighted in select mode (DERIVED)
  filters: new Set(),           // active filter toggle ids (see js/filters.js)
  filterQuery: '',              // live search text (view state, never serialized)
  manualAdd: new Set(),         // squares picked by hand
  manualDrop: new Set(),        // squares un-picked by hand, overriding filters
  tableSelection: new Set(),    // table ids highlighted in select mode
  showTrueSizes: false,         // preview weighted row/col sizes in the grid
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),   // app settings (see above)
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
  pruneMerges();
  pruneWalls();
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

/** A square has content once it carries an icon, real label text, or a printer. */
function hasContent(cell) {
  return !!(cell.icon || cell.printer || (cell.labels || []).some((l) => l.text && l.text.trim()));
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

// ---------------------------------------------------------------- split square
//
// A split square divides its one grid cell into a rows×cols block of sub-cells,
// each an independent mini square (own fill, icon, labels, facing). The parent
// stays one cell to the layout — it always occupies its full unit — so splitting
// never disturbs the grid, tables, moves or row/column sizing around it.

/** True when a cell is currently split into sub-cells. */
function isSplit(cell) {
  return !!(cell && cell.split && Array.isArray(cell.subcells) && cell.subcells.length);
}

/** The smallest split space — as a share of a whole square — in which a special
 *  icon still draws as its piece of furniture. Below that there is no room left
 *  to tuck the piece against an edge, so it falls back to a plain filled square.
 *  This is the rule for any special icon added later: give it the space its piece
 *  needs, and anything smaller renders as a normal square.
 *    chair  — a small tile, so it still reads even in a ninth of a square
 *    server — IS a half-slab, and a split space is already that size or smaller,
 *             so a split server is simply the filled space itself */
const FURNITURE_MIN_SPACE = { chair: 1 / 9, server: 1 };

/** Which furniture a sub-cell draws as, given the split it belongs to — or null
 *  when the space is too small and it should render as a plain filled square. */
function subcellFurniture(sub, rows, cols) {
  const kind = furnitureKind(sub);
  if (!kind) return null;
  const space = 1 / (Math.max(1, rows) * Math.max(1, cols));
  return space >= (FURNITURE_MIN_SPACE[kind] ?? 1) ? kind : null;
}

/** A split square holds its content in its pieces, so `hasContent` on the cell
 *  itself misses it. This asks the question of a square however it is built. */
function cellHasAnyContent(cell) {
  if (!cell) return false;
  if (isSplit(cell)) return cell.subcells.some((s) => hasContent(s));
  return hasContent(cell);
}

/** The data a square's content should be READ from: the square itself, or — when
 *  it is split — its first piece that actually holds something. Lets a merged
 *  desk show a split square's content (see mergeAnchorKey). */
function contentDataOf(cell) {
  if (!cell) return null;
  if (isSplit(cell)) return cell.subcells.find((s) => hasContent(s)) || cell.subcells[0] || cell;
  return cell;
}

/** Divide a square into rows×cols sub-cells, keeping any sub-cell content that
 *  still fits when re-splitting to a different shape. A split square is always
 *  "filled" so it claims a full unit in the output layout. */
function splitCell(r, c, rows, cols) {
  const cell = getCell(r, c);
  const n = Math.max(1, rows) * Math.max(1, cols);
  const prev = cell.subcells || [];
  const subs = [];
  for (let i = 0; i < n; i++) subs.push(prev[i] || makeSubcell());
  // Splitting a square that already holds something keeps it: the content moves
  // into the first space rather than vanishing. (The square's own content stays
  // put underneath, so unsplitting brings it back.)
  if (!prev.length && hasContent(cell)) subs[0] = cloneSubcell({ ...cell, enabled: true });
  cell.split = { rows, cols };
  cell.subcells = subs;
  cell.enabled = true;
  pruneSubmerges(cell);
  emit();
}

/** Turn a split square back into a single square, dropping its sub-cells. */
function unsplitCell(r, c) {
  const cell = getCell(r, c);
  cell.split = null;
  delete cell.subcells;
  delete cell.submerges;
  emit();
}

/** The sub-cell at index `i` of a split square, or null. */
function subcellAt(r, c, i) {
  const cell = peekCell(r, c);
  return cell && cell.subcells ? cell.subcells[i] || null : null;
}

/** Patch one sub-cell, seating it when this is its first content (mirrors
 *  updateCell for a whole square). */
function updateSubcell(r, c, i, patch) {
  const sub = subcellAt(r, c, i);
  if (!sub) return;
  const had = hasContent(sub);
  Object.assign(sub, patch);
  if (!('enabled' in patch)) seatOnNewContent(sub, had);
  emit();
}

/** Fill / empty one sub-cell (the sub-cell twin of toggleEnabled). */
function toggleSubcell(r, c, i) {
  const sub = subcellAt(r, c, i);
  if (!sub) return;
  sub.enabled = !sub.enabled;
  emit();
}

// ----------------------------------------------- sub-cell merge (within a split)
//
// Subcells within a 2×2 or 3×3 split can merge with each other. Rectangular
// groups use CSS grid spans; L/T/+ shapes use an SVG overlay (like grid-level
// poly merges). The model mirrors the grid merge:
// cell.submerges = [{ id, indices:[int], anchor:int }], where anchor is the
// top-left subcell whose content the merged region shows.

/** True when a set of subcell indices forms a complete rectangle in a rows×cols grid. */
function isRectSubcells(indices, rows, cols) {
  if (!indices || indices.length < 2) return false;
  let rMin = rows, rMax = -1, cMin = cols, cMax = -1;
  for (const i of indices) {
    const sr = Math.floor(i / cols), sc = i % cols;
    if (sr < rMin) rMin = sr; if (sr > rMax) rMax = sr;
    if (sc < cMin) cMin = sc; if (sc > cMax) cMax = sc;
  }
  const expected = (rMax - rMin + 1) * (cMax - cMin + 1);
  if (indices.length !== expected) return false;
  for (let sr = rMin; sr <= rMax; sr++)
    for (let sc = cMin; sc <= cMax; sc++)
      if (!indices.includes(sr * cols + sc)) return false;
  return true;
}

/** True when a set of subcell indices forms one connected group (4-way adjacency). */
function isConnectedSubcells(indices, rows, cols) {
  if (!indices || indices.length < 2) return false;
  const set = new Set(indices);
  const visited = new Set();
  const queue = [indices[0]];
  visited.add(indices[0]);
  while (queue.length) {
    const cur = queue.shift();
    const sr = Math.floor(cur / cols), sc = cur % cols;
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nr = sr + dr, nc = sc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const ni = nr * cols + nc;
      if (set.has(ni) && !visited.has(ni)) { visited.add(ni); queue.push(ni); }
    }
  }
  return visited.size === indices.length;
}

/** The submerge covering subcell i inside a cell, or null. */
function submergeAt(cell, i) {
  if (!cell || !cell.submerges) return null;
  for (const sm of cell.submerges) if (sm.indices.includes(i)) return sm;
  return null;
}

/** The rectangle a submerge spans in grid coordinates: { r, c, rowSpan, colSpan }. */
function submergeRect(sm, cols) {
  let rMin = Infinity, rMax = -1, cMin = Infinity, cMax = -1;
  for (const i of sm.indices) {
    const sr = Math.floor(i / cols), sc = i % cols;
    if (sr < rMin) rMin = sr; if (sr > rMax) rMax = sr;
    if (sc < cMin) cMin = sc; if (sc > cMax) cMax = sc;
  }
  return { r: rMin, c: cMin, rowSpan: rMax - rMin + 1, colSpan: cMax - cMin + 1 };
}

/** Plan for rendering a subcell merge — mirrors mergePlan for grid merges. */
function submergePlan(sm, rows, cols) {
  const set = new Set(sm.indices);
  const has = (sr, sc) => set.has(sr * cols + sc);
  const isRect = isRectSubcells(sm.indices, rows, cols);

  const rect = submergeRect(sm, cols);
  const midR = (rect.r + rect.r + rect.rowSpan - 1) / 2;
  let labelRun = null;
  for (let sr = rect.r; sr < rect.r + rect.rowSpan; sr++) {
    let start = null;
    for (let sc = rect.c; sc <= rect.c + rect.colSpan; sc++) {
      if (sc < rect.c + rect.colSpan && has(sr, sc)) { if (start === null) start = sc; continue; }
      if (start !== null) {
        const len = sc - start;
        const better = !labelRun || len > labelRun.len ||
          (len === labelRun.len && Math.abs(sr - midR) < Math.abs(labelRun.sr - midR));
        if (better) labelRun = { sr, scStart: start, scEnd: sc - 1, len };
        start = null;
      }
    }
  }

  const runLen = (sr, sc, dr, dc) => {
    let n = 1;
    for (let y = sr - dr, x = sc - dc; has(y, x); y -= dr, x -= dc) n++;
    for (let y = sr + dr, x = sc + dc; has(y, x); y += dr, x += dc) n++;
    return n;
  };
  let iconCell = null, best = Infinity;
  for (const i of sm.indices) {
    const sr = Math.floor(i / cols), sc = i % cols;
    const score = runLen(sr, sc, 0, 1) + runLen(sr, sc, 1, 0);
    if (score < best) { best = score; iconCell = { sr, sc, i }; }
  }

  return { set, has, isRect, labelRun, iconCell };
}

/** Merge a set of subcell indices within a split square. Returns the new submerge
 *  or null on failure (not connected, overlapping an existing merge). */
function addSubmerge(r, c, indices) {
  const cell = peekCell(r, c);
  if (!cell || !isSplit(cell)) return null;
  const { rows, cols } = cell.split;
  if (!isConnectedSubcells(indices, rows, cols)) return null;
  if (!cell.submerges) cell.submerges = [];
  for (const i of indices) if (submergeAt(cell, i)) return null;
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  const anchor = Math.min(...indices);
  const sm = { id: `sm${Date.now().toString(36)}`, indices: [...indices].sort((a, b) => a - b), anchor };
  cell.submerges.push(sm);
  const anchorSub = cell.subcells[anchor];
  if (anchorSub && !anchorSub.enabled) anchorSub.enabled = true;
  emit();
  return sm;
}

/** Remove a subcell merge by id. */
function removeSubmerge(r, c, id) {
  const cell = peekCell(r, c);
  if (!cell || !cell.submerges) return;
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  cell.submerges = cell.submerges.filter((sm) => sm.id !== id);
  if (!cell.submerges.length) delete cell.submerges;
  emit();
}

/** Prune submerges when the split shape changes or the cell is unsplit. */
function pruneSubmerges(cell) {
  if (!cell || !cell.submerges) return;
  if (!isSplit(cell)) { delete cell.submerges; return; }
  const n = cell.split.rows * cell.split.cols;
  cell.submerges = cell.submerges.filter((sm) => {
    sm.indices = sm.indices.filter((i) => i >= 0 && i < n);
    return sm.indices.length >= 2 && isConnectedSubcells(sm.indices, cell.split.rows, cell.split.cols);
  });
  if (!cell.submerges.length) delete cell.submerges;
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

/** Move a whole label line — its text and its colour together — to a new spot. */
function moveLabelLine(r, c, from, to) {
  const cell = getCell(r, c);
  if (!reorderable(cell.labels, from, to)) return false;
  const [line] = cell.labels.splice(from, 1);
  cell.labels.splice(to, 0, line);
  emit();
  return true;
}

/** Move only a line's COLOUR. The texts stay where they are and the colours
 *  shuffle underneath them, so a palette can be rearranged without retyping. */
function moveLabelColor(r, c, from, to) {
  const cell = getCell(r, c);
  if (!reorderable(cell.labels, from, to)) return false;
  const colors = cell.labels.map((l) => l.color);
  const [moved] = colors.splice(from, 1);
  colors.splice(to, 0, moved);
  cell.labels.forEach((l, i) => { l.color = colors[i]; });
  emit();
  return true;
}

function reorderable(list, from, to) {
  return from !== to && from >= 0 && to >= 0 && from < list.length && to < list.length;
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

/** The exported page's background colour (Preview re-renders live on emit). */
function setExportBg(color) { state.exportBg = color || '#ffffff'; emit(); }

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

/** Cut a square: copy it, then strip it back to nothing. The copy happens first,
 *  so a failed cut can never lose the square. */
function cutSquareFrom(r, c) {
  if (!copySquareFrom(r, c)) return false;
  resetSquares([keyOf(r, c)]);
  return true;
}

/** Copy one PIECE of a split square onto the square clipboard, so its content can
 *  be pasted into another piece or onto a whole square. */
function copySubcell(r, c, i) {
  const sub = subcellAt(r, c, i);
  if (!sub) return false;
  squareClipboard = {
    enabled: sub.enabled,
    fill: sub.fill, border: sub.border,
    icon: sub.icon, iconColor: sub.iconColor, rotation: sub.rotation, iconFill: sub.iconFill,
    labels: (sub.labels || []).map((l) => ({ text: l.text, color: l.color })),
    split: null, subcells: null,
  };
  emit();
  return true;
}

/** Paste the copied square INTO one piece of a split square — how content moves
 *  from a whole square into a split space. A piece is never itself split, so the
 *  clipboard's own split is not carried over. */
function pasteSquareToSubcell(r, c, i) {
  const sub = subcellAt(r, c, i);
  if (!squareClipboard || !sub) return false;
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  const f = squareClipboard;
  Object.assign(sub, {
    enabled: f.enabled, fill: f.fill, border: f.border,
    icon: f.icon, iconColor: f.iconColor, rotation: f.rotation, iconFill: f.iconFill,
    labels: f.labels.map((l) => ({ text: l.text, color: l.color })),
  });
  emit();
  return true;
}

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
    iconFill: cell.iconFill,
    labels: (cell.labels || []).map((l) => ({ text: l.text, color: l.color })),
    split: cell.split ? { ...cell.split } : null,
    subcells: cell.subcells ? cell.subcells.map(cloneSubcell) : null,
  };
  emit();
  return true;
}

/** A deep copy of a sub-cell (fresh label objects), for copy/paste and restore.
 *  Missing fields fall back to the sub-cell defaults so a partial object is safe. */
function cloneSubcell(s) {
  const base = makeSubcell();
  const out = {
    enabled: !!s.enabled,
    fill: s.fill || base.fill,
    border: s.border || base.border,
    icon: s.icon || null,
    iconColor: s.iconColor || base.iconColor,
    iconFill: s.iconFill || null,
    rotation: s.rotation || 0,
    labels: (s.labels || []).map((l) => ({ text: String(l.text || ''), color: l.color || DEFAULTS.labelColor })),
    printer: clonePrinter(s.printer),
  };
  return out;
}

function clonePrinter(p) {
  if (!p) return null;
  return {
    color: !!p.color,
    compass: p.compass || 'se',
    labels: (p.labels || []).map((l) => ({ text: String(l.text || ''), color: l.color || DEFAULTS.labelColor })),
    size: p.size === 'small' ? 'small' : 'max',
  };
}

function isPrinterSecondary(data) {
  return !!(data && data.printer && (data.icon || data.printer.size === 'small'));
}

function hasPrinter(data) {
  return !!(data && data.printer);
}

/** Clone the copied square onto every listed square, label lines and all. The
 *  target's own labels are replaced, so it ends up matching the source. */
function pasteSquareTo(keys) {
  if (!squareClipboard || !keys.length) return false;
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before paste
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
      cell.iconFill = f.iconFill;
      // Fresh objects per target so squares never share label instances.
      cell.labels = f.labels.map((l) => ({ text: l.text, color: l.color }));
      // The split (and its sub-cells) travels too, deep-copied so pasted squares
      // never share sub-cell instances.
      if (f.split) { cell.split = { ...f.split }; cell.subcells = (f.subcells || []).map(cloneSubcell); }
      else { cell.split = null; delete cell.subcells; }
    }
  });
  return true;
}

// ---------------------------------------------------------------- move

/** Shift every selected square (and any table wholly inside the selection) by
 *  `dr, dc`. Returns false and changes nothing when the move would leave the
 *  grid, so the caller can silently ignore it and let the user try again. */
/** Shift a set of squares by `dr, dc` — the cells themselves plus any table or
 *  merge lying wholly inside the set. Returns false and changes nothing when the
 *  move would leave the grid. `displaced`, when given, collects the cells that
 *  were standing on the destinations, so a caller can put them somewhere rather
 *  than let them be overwritten.
 *
 *  This is the one move: both the selection's move handle and a square dragged
 *  to a new cell go through it, so they can never drift apart. Call it inside a
 *  batch — it does not emit. */
function shiftCells(keys, dr, dc, displaced) {
  for (const k of keys) {
    const [r, c] = parseKey(k);
    if (!inBounds(r + dr, c + dc)) return false; // off-grid: silent no-op
  }
  const at = (k) => { const [r, c] = parseKey(k); return keyOf(r + dr, c + dc); };

  // Capture before deleting, so moves that overlap their own source still work.
  const moved = new Map();
  for (const k of keys) {
    const cell = state.cells.get(k);
    if (cell) moved.set(at(k), cell);
  }
  const selected = new Set(keys);
  if (displaced) {
    for (const k of keys) {
      const dest = at(k);
      if (selected.has(dest)) continue;     // landing on ground we are vacating
      const cell = state.cells.get(dest);
      if (cell) displaced.set(dest, cell);
    }
  }

  for (const k of keys) state.cells.delete(k);
  for (const [k, cell] of moved) state.cells.set(k, cell);
  for (const t of state.tables) {
    if (t.cellKeys.every((k) => selected.has(k))) t.cellKeys = t.cellKeys.map(at);
  }
  // A table or merge travels only when its whole self is in the moved set.
  for (const m of state.merges) {
    if (m.keys.every((k) => selected.has(k))) {
      m.keys = sortCellKeys(m.keys.map(at));
      if (m.anchor) m.anchor = at(m.anchor);
    }
  }
  return true;
}

/** Shift every selected square (and any table wholly inside the selection) by
 *  `dr, dc`. Returns false and changes nothing when the move would leave the
 *  grid, so the caller can silently ignore it and let the user try again. */
function moveSelection(dr, dc) {
  if (!dr && !dc) return false;
  const keys = [...state.selection];
  if (!keys.length) return false;
  let ok = false;
  batch(() => {
    ok = shiftCells(keys, dr, dc);
    // The moved squares travel with the drag; filters stay out of it, since a
    // move is as explicit a pick as a rectangle.
    if (ok) {
      selectionReplace(keys.map((k) => {
        const [r, c] = parseKey(k);
        return keyOf(r + dr, c + dc);
      }));
    }
  });
  return ok;
}

/** Drag one square onto another — the same move as the handle's, for a single
 *  square, and non-destructive: whatever was standing on the destination comes
 *  back to the square being vacated, so a drop onto an occupied square trades
 *  places instead of overwriting it. The whole cell travels, a split square and
 *  its pieces included. The selection is left alone, since a drag outside select
 *  mode is not a pick. */
function moveSquare(fromKey, toKey) {
  if (fromKey === toKey) return false;
  const [fr, fc] = parseKey(fromKey), [tr, tc] = parseKey(toKey);
  if (!inBounds(fr, fc) || !inBounds(tr, tc)) return false;
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  let ok = false;
  batch(() => {
    const displaced = new Map();
    ok = shiftCells([fromKey], tr - fr, tc - fc, displaced);
    const other = ok && displaced.get(toKey);
    if (other) state.cells.set(fromKey, other);
  });
  return ok;
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
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before insert

  const shift = (k) => {
    const [r, c] = parseKey(k);
    if (isRow) return r >= index ? keyOf(r + 1, c) : k;
    return c >= index ? keyOf(r, c + 1) : k;
  };

  const moved = new Map();
  for (const [k, cell] of state.cells) moved.set(shift(k), cell);

  batch(() => {
    state.cells = moved;
    remapSelection(shift);
    for (const t of state.tables) t.cellKeys = t.cellKeys.map(shift);
    for (const m of state.merges) {
      m.keys = sortCellKeys(m.keys.map(shift));
      if (m.anchor) m.anchor = shift(m.anchor);
    }
    // Walls sit on edges: a line inserted at `index` pushes every edge at or past
    // it one step along the same axis.
    remapWalls((o, r, c) => isRow
      ? [r >= index ? r + 1 : r, c]
      : [r, c >= index ? c + 1 : c]);
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

/** Remove a whole row or column, pulling everything after it back by one. The
 *  exact inverse of insertLine. The last remaining line cannot go — a grid with
 *  no rows is not a chart. */
function deleteLine(axis, index) {
  const isRow = axis === 'row';
  const limit = isRow ? state.grid.rows : state.grid.cols;
  if (index < 0 || index >= limit || limit <= 1) return false;
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before delete

  // undefined => the square went with the deleted line
  const shift = (k) => {
    const [r, c] = parseKey(k);
    const along = isRow ? r : c;
    if (along === index) return undefined;
    if (along < index) return k;
    return isRow ? keyOf(r - 1, c) : keyOf(r, c - 1);
  };

  const moved = new Map();
  for (const [k, cell] of state.cells) {
    const next = shift(k);
    if (next !== undefined) moved.set(next, cell);
  }
  batch(() => {
    state.cells = moved;
    remapSelection(shift);
    for (const t of state.tables) {
      t.cellKeys = t.cellKeys.map(shift).filter((k) => k !== undefined);
    }
    for (const m of state.merges) {
      m.keys = sortCellKeys(m.keys.map(shift).filter((k) => k !== undefined));
      if (m.anchor) m.anchor = shift(m.anchor);
    }
    // Walls: the deleted line's two bounding edges collapse onto one; edges past
    // it move back one. An edge that spanned a removed cell (v on a removed row,
    // h on a removed column) goes with it.
    remapWalls((o, r, c) => {
      if (isRow) {
        if (o === 'v' && r === index) return null;
        return [r > index ? r - 1 : r, c];
      }
      if (o === 'h' && c === index) return null;
      return [r, c > index ? c - 1 : c];
    });
    const weights = isRow ? state.rowWeights : state.colWeights;
    weights.splice(index, 1);
    if (isRow) state.grid = { ...state.grid, rows: state.grid.rows - 1 };
    else state.grid = { ...state.grid, cols: state.grid.cols - 1 };
    state.rowWeights.length = state.grid.rows;
    state.colWeights.length = state.grid.cols;
    pruneTables();      // a table that lived entirely on that line is gone now
    pruneMerges();      // and a merge left with fewer than two cells
    pruneWalls();       // and any edge now outside the smaller grid
    pruneSelection();
  });
  return true;
}

function deleteRow(index) { return deleteLine('row', index); }
function deleteCol(index) { return deleteLine('col', index); }

/** True when a row or column holds any seated square — the caller uses this to
 *  decide whether deleting it is worth confirming first. */
function lineHasContent(axis, index) {
  const { rows, cols } = state.grid;
  if (axis === 'row') {
    for (let c = 0; c < cols; c++) if (isEnabled(index, c)) return true;
  } else {
    for (let r = 0; r < rows; r++) if (isEnabled(r, index)) return true;
  }
  return false;
}

/** Strip squares back to nothing: no labels, no icon, default colours, unseated.
 *  Unlike emptying, this does not keep the content for later. */
function resetSquares(keys) {
  batch(() => {
    for (const k of keys) {
      const [r, c] = parseKey(k);
      state.cells.set(k, makeCell());
      if (!inBounds(r, c)) state.cells.delete(k);
    }
    // A reset square can no longer belong to a merge — drop any merge it was in.
    const gone = new Set(keys);
    state.merges = state.merges.filter((m) => !m.keys.some((k) => gone.has(k)));
  });
}

// ---------------------------------------------------------------- selection

/** Pick squares by hand. A hand-pick outranks a filter that dropped them. */
function selectionAdd(keys) {
  for (const k of keys) { state.manualAdd.add(k); state.manualDrop.delete(k); }
}
/** Un-pick squares by hand. Recorded rather than simply deleted, so a filter
 *  that claims the same square cannot put it straight back. */
function selectionDrop(keys) {
  for (const k of keys) { state.manualDrop.add(k); state.manualAdd.delete(k); }
}
/** Make `keys` THE selection: filters are turned off, since an explicit
 *  rectangle or line means "this, and nothing else". */
function selectionReplace(keys) {
  state.filters.clear();
  state.manualAdd = new Set(keys);
  state.manualDrop.clear();
}
/** Move every remembered key through `shift`, which returns undefined for keys
 *  that no longer exist. Used when a row or column is inserted or deleted. */
function remapSelection(shift) {
  const move = (set) => {
    const next = new Set();
    for (const k of set) { const n = shift(k); if (n !== undefined) next.add(n); }
    return next;
  };
  state.manualAdd = move(state.manualAdd);
  state.manualDrop = move(state.manualDrop);
}

function toggleSelection(r, c) {
  const k = keyOf(r, c);
  if (state.selection.has(k)) selectionDrop([k]);
  else selectionAdd([k]);
  emit();
}
/** Wipe the whole selection — filters included — without emitting. Callers
 *  inside a batch use this; `clearSelection` is the same thing plus the emit. */
function clearManualSelection() {
  state.filters.clear();
  state.manualAdd.clear();
  state.manualDrop.clear();
  state.selection.clear();
}
function clearSelection() { clearManualSelection(); emit(); }

/** Make the rectangle between two cells THE selection, without touching seats.
 *  Used while Shift+click is sizing a rectangle: every click re-sizes the
 *  selection, and only a repeat click on the same corner commits seating. */
function setSelectionRange(r1, c1, r2, c2) {
  const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
  const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
  batch(() => {
    const keys = [];
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) keys.push(keyOf(r, c));
    selectionReplace(keys);
  });
}

/** ADD a straight run of squares to the selection, leaving everything already
 *  picked in place. The run is constrained to one row or one column — whichever
 *  the two ends share — so it can only ever be a line. Returns the keys it
 *  actually added, which is what lets the caller take exactly this line back
 *  without disturbing squares an earlier line had already claimed. */
function addLineRange(r1, c1, r2, c2) {
  const added = [];
  batch(() => {
    if (r1 === r2) {
      const [lo, hi] = c1 <= c2 ? [c1, c2] : [c2, c1];
      for (let c = lo; c <= hi; c++) added.push(...addKey(keyOf(r1, c)));
    } else if (c1 === c2) {
      const [lo, hi] = r1 <= r2 ? [r1, r2] : [r2, r1];
      for (let r = lo; r <= hi; r++) added.push(...addKey(keyOf(r, c1)));
    } else {
      added.push(...addKey(keyOf(r2, c2)));   // not a line: just the square
    }
  });
  return added;
}

function addKey(k) {
  if (state.selection.has(k)) return [];
  selectionAdd([k]);
  state.selection.add(k);   // visible to the rest of this batch, before the emit
  return [k];
}

/** Drop specific keys from the selection. */
function deselectKeys(keys) {
  if (!keys.length) return;
  batch(() => {
    selectionDrop(keys);
    for (const k of keys) state.selection.delete(k);
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
    const keys = [];
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) {
        getCell(r, c).enabled = enabled;
        keys.push(keyOf(r, c));
      }
    selectionReplace(keys);
  });
}

const hasLabelText = (cell) => (cell.labels || []).some((l) => l.text && l.text.trim());

/** True when a square falls inside some table's footprint — the block its shape
 *  is drawn over. Those squares belong to the table rather than standing alone. */
function isUnderTable(r, c) {
  return state.tables.some((t) => tableCoverage(t).includes(keyOf(r, c)));
}

function pruneSelection() {
  for (const set of [state.manualAdd, state.manualDrop]) {
    for (const k of [...set]) {
      const [r, c] = parseKey(k);
      if (!inBounds(r, c)) set.delete(k);
    }
  }
}

// ---------------------------------------------------------------- tables

function addTable(shape, color) {
  const cellKeys = [...state.selection];
  if (cellKeys.length === 0) return null;
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before add table
  const table = { id: `t${Date.now().toString(36)}`, cellKeys, shape,
                  color: color || state.defaults.tableColor,
                  border: state.defaults.tableBorder,
                  rotation: 0 };
  state.tables.push(table);
  // A table seats everything under it: the shape covers its whole footprint, so
  // every square in that block belongs to the table whether it was selected or
  // not. Without this a gap in the selection would punch a hole in the table.
  const fp = footprintOf(cellKeys);
  for (let r = fp.minR; r <= fp.maxR; r++) {
    for (let c = fp.minC; c <= fp.maxC; c++) getCell(r, c).enabled = true;
  }
  clearManualSelection();
  emit();
  return table;
}
function removeTable(id) {
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before remove table
  state.tables = state.tables.filter((t) => t.id !== id);
  state.tableSelection.delete(id);
  emit();
}

// ------------------------------------------------- table selection (table mode)
//
// The mirror of the square selection, keyed by table id. Not saved with the
// chart — like the square selection, it is a working state, not a property of
// the layout.

/** The table drawn over a square, if any. Later tables win, matching paint order.
 *  Uses the coverage, so a turned table answers for the squares it actually sits
 *  on rather than the box it started as. */
function tableAt(r, c) {
  let found = null;
  const k = keyOf(r, c);
  for (const t of state.tables) if (tableCoverage(t).includes(k)) found = t;
  return found;
}

function toggleTableSelection(id) {
  if (state.tableSelection.has(id)) state.tableSelection.delete(id);
  else state.tableSelection.add(id);
  emit();
}
function selectAllTables() {
  batch(() => {
    state.tableSelection.clear();
    for (const t of state.tables) state.tableSelection.add(t.id);
  });
}
function clearTableSelection() {
  state.tableSelection.clear();
  emit();
}
function isTableSelected(id) { return state.tableSelection.has(id); }

/** Apply a patch to every listed table. */
function updateTables(ids, patch) {
  batch(() => {
    for (const t of state.tables) if (ids.includes(t.id)) Object.assign(t, patch);
  });
}
/** Re-shape a table onto a new block of squares. A footprint is always a full
 *  rectangle and every square in it is seated, exactly as when a table is first
 *  made — so growing one picks up the squares it now covers. */
function resizeTable(id, minR, minC, maxR, maxC) {
  const t = state.tables.find((x) => x.id === id);
  if (!t) return false;
  minR = Math.max(0, minR); minC = Math.max(0, minC);
  maxR = Math.min(state.grid.rows - 1, maxR);
  maxC = Math.min(state.grid.cols - 1, maxC);
  if (maxR < minR || maxC < minC) return false;

  const keys = [];
  for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) keys.push(keyOf(r, c));
  const now = new Set(keys);
  // Everything the table used to cover — including squares only its footprint
  // reached — so shrinking hands them back the way growing took them.
  const before = footprintOf(t.cellKeys);
  const dropped = [];
  for (let r = before.minR; r <= before.maxR; r++) {
    for (let c = before.minC; c <= before.maxC; c++) {
      const k = keyOf(r, c);
      if (!now.has(k)) dropped.push(k);
    }
  }

  batch(() => {
    t.cellKeys = keys;
    for (const k of keys) { const [r, c] = parseKey(k); getCell(r, c).enabled = true; }
    // A table seats what it covers, so letting go of a square empties it again.
    // Non-destructive as ever: its labels and colors stay for when it is reseated.
    for (const k of dropped) {
      const [r, c] = parseKey(k);
      if (!isUnderTable(r, c)) getCell(r, c).enabled = false;
    }
  });
  return true;
}

/** Turn each listed table by `step` degrees. Rotation only shows on a square
 *  table — a circle looks the same whichever way round it is — so the control
 *  is worth having mainly for angled banks of desks. */
function rotateTables(ids, step = 45) {
  batch(() => {
    for (const t of state.tables) {
      if (!ids.includes(t.id)) continue;
      // The squares a table sits on change as it turns, so hand back the ones it
      // leaves and take up the ones it now covers.
      const before = tableCoverage(t);
      t.rotation = (((t.rotation || 0) + step) % 360 + 360) % 360;
      const after = new Set(tableCoverage(t));
      for (const k of before) {
        if (after.has(k)) continue;
        const [r, c] = parseKey(k);
        if (!isUnderTable(r, c)) getCell(r, c).enabled = false;
      }
      for (const k of after) { const [r, c] = parseKey(k); getCell(r, c).enabled = true; }
    }
  });
}

function removeTables(ids) {
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before remove tables
  batch(() => {
    state.tables = state.tables.filter((t) => !ids.includes(t.id));
    for (const id of ids) state.tableSelection.delete(id);
  });
}
function pruneTables() {
  for (const t of state.tables) {
    t.cellKeys = t.cellKeys.filter((k) => { const [r, c] = parseKey(k); return inBounds(r, c); });
  }
  state.tables = state.tables.filter((t) => t.cellKeys.length > 0);
}

// ---------------------------------------------------------------- merged squares
//
// A merge fuses a block of selected squares into ONE desk. Two kinds:
//   'poly' — the desk takes the exact SHAPE of the selection (an L, a T, a +),
//            filling every member cell; its labels sit across the widest run and
//            its icon in the slimmest arm (see mergePlan in js/layout.js).
//   'unit' — a single 1×1 square, centred in the block, so a square can straddle
//            the seam between cells while staying square.
// The merged content is just the ANCHOR cell (sorted keys[0]); member cells keep
// their own data for when the merge is undone, but it is not drawn while merged.

/** Keys sorted top-to-bottom, left-to-right — so keys[0] is the anchor. */
function sortCellKeys(keys) {
  return [...keys].sort((a, b) => {
    const [ra, ca] = parseKey(a), [rb, cb] = parseKey(b);
    return ra - rb || ca - cb;
  });
}

/** Fuse the current selection into one merged desk of `kind`. Seats every member
 *  cell (the desk fills its whole footprint) and clears the selection, like a
 *  table. Needs at least two squares. */
function addMerge(kind = 'poly') {
  const keys = sortCellKeys(state.selection);
  if (keys.length < 2) return null;
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  // The merged desk shows ONE square's content, so keep the one that actually has
  // some rather than whichever happens to sit top-left. A split square counts —
  // its content lives in its pieces. With several, the first in reading order wins.
  const anchor = keys.find((k) => cellHasAnyContent(peekCell(...parseKey(k)))) || keys[0];
  const merge = { id: `m${Date.now().toString(36)}`, keys, kind, anchor };
  state.merges.push(merge);
  for (const k of keys) { const [r, c] = parseKey(k); getCell(r, c).enabled = true; }
  clearManualSelection();
  emit();
  return merge;
}

/** The merge covering a square, or null. Later merges win, matching paint order. */
function mergeAt(r, c) {
  const k = keyOf(r, c);
  let found = null;
  for (const m of state.merges) if (m.keys.includes(k)) found = m;
  return found;
}

/** The anchor "r,c" of a merge — the square whose content the fused desk shows.
 *  Chosen when the merge is made (the square that had content); falls back to the
 *  first in reading order if that square is gone. */
function mergeAnchorKey(merge) {
  return (merge.anchor && merge.keys.includes(merge.anchor)) ? merge.anchor : merge.keys[0];
}

/** The data a merged desk draws: the anchor square, or — when that square is
 *  split — the piece of it that holds the content. */
function mergeContentOf(merge) {
  const [r, c] = parseKey(mergeAnchorKey(merge));
  return contentDataOf(peekCell(r, c)) || {};
}

function updateMerge(id, patch) {
  const m = state.merges.find((x) => x.id === id);
  if (!m) return;
  Object.assign(m, patch);
  emit();
}

/** Undo a merge: the squares stand alone again with their own content. */
function removeMerge(id) {
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  state.merges = state.merges.filter((m) => m.id !== id);
  emit();
}

function pruneMerges() {
  for (const m of state.merges) {
    m.keys = m.keys.filter((k) => { const [r, c] = parseKey(k); return inBounds(r, c); });
  }
  // A merge needs at least two cells to mean anything.
  state.merges = state.merges.filter((m) => m.keys.length >= 2);
  for (const m of state.merges) {
    m.keys = sortCellKeys(m.keys);
    if (m.anchor && !m.keys.includes(m.anchor)) delete m.anchor;  // falls back to keys[0]
  }
}

// ---------------------------------------------------------------- walls
//
// Walls, railings, doors and windows are drawn ON the seams between squares (and
// on the grid's outer border) — not inside a square. Each lives on one cell EDGE,
// keyed in state.walls as a plain map: "h:r,c" is the horizontal edge above row r
// spanning column c (r in 0..rows, the top edge of cell (r,c)); "v:r,c" is the
// vertical edge left of column c spanning row r (c in 0..cols, the left edge of
// cell (r,c)). The value is the wall type.

const WALL_TYPES = ['wall', 'hollow', 'railing', 'door', 'window'];

function wallKey(o, r, c) { return `${o}:${r},${c}`; }

/** True when an edge is a real grid seam or border. */
function wallEdgeInBounds(o, r, c) {
  const { rows, cols } = state.grid;
  if (o === 'h') return r >= 0 && r <= rows && c >= 0 && c < cols;
  if (o === 'v') return c >= 0 && c <= cols && r >= 0 && r < rows;
  return false;
}

function wallAt(o, r, c) { return state.walls[wallKey(o, r, c)] || null; }

/** A wall's value can be a plain type string, or (for a door, which carries an
 *  orientation) an object { t:'door', o:0..3 }. These read either shape. */
function wallTypeOf(v) { return v && typeof v === 'object' ? v.t : v; }
function wallOrient(v) { return v && typeof v === 'object' ? (((v.o | 0) % 4) + 4) % 4 : 0; }

/** Wall bars — the types that fuse into one continuous run. A door or a railing
 *  is a fitting: it sits IN a wall and is drawn on its own. */
function isWallBar(t) { return t === 'wall' || t === 'hollow' || t === 'window'; }

/** What kind of piece sits where these edges meet, or null for no piece at all.
 *
 *  A crossing is a piece of wall in its own right rather than whatever the bars
 *  running into it happen to leave behind, and what it is made of follows what
 *  meets there.
 *    hollow — nothing but hollow, which keeps a run of frame hollow throughout.
 *    window — nothing but glass, and only TWO arms: a run carrying straight on or
 *             turning a corner. A tee or a cross is more than a pane carries, so
 *             the panes stop there and the point is a plain wall instead.
 *    wall   — everything else. A wall with anything, glass into hollow, any
 *             meeting involving a door: none of those has a piece of its own, and
 *             a plain wall intersection is what stands in.
 *    null   — nothing but railings, whose junctions are posts (paintRailingPost),
 *             or a lone edge, which is a free end and not a junction at all. */
function junctionType(arms) {
  const types = arms.map((a) => a.type);
  if (!types.length) return null;
  // A door or a pane standing ALONE still ends on a wall point at each side.
  // Neither is seamless with open air any more than with another type, so an end
  // that meets nothing is still an end that has to be closed off.
  if (types.length === 1) return (types[0] === 'door' || types[0] === 'window') ? 'wall' : null;
  if (types.every((t) => t === 'railing')) return null;
  // Two doors meeting OPENING to OPENING are one opening — a double door. The
  // point is still there, but it is COVERED rather than drawn: the pair run
  // together over it, and 'doorseam' is what tells the renderer to patch out the
  // stroke that would otherwise show where their two ends abut. Every other door
  // meeting keeps that stroke, hinge-first meetings included: a door is only ever
  // seamless on the side it opens, and turning the door turns which side.
  if (types.length === 2 && types.every((t) => t === 'door') && doorsMeetOpening(arms)) return 'doorseam';
  if (types.every((t) => t === 'hollow')) return 'hollow';
  if (types.length === 2 && types.every((t) => t === 'window')) return 'window';
  return 'wall';
}

/** Which end of a door is its OPENING — the free edge the leaf sweeps toward,
 *  opposite the hinge (see paintDoor, which reads the same bit). */
function doorOpenEnd(value) { return (wallOrient(value) & 2) ? 'A' : 'B'; }

/** True when two doors meet on the side each of them opens, and in a straight
 *  line — a pair of leaves parting in the middle. A corner is never one opening. */
function doorsMeetOpening(arms) {
  const [a, b] = arms;
  return a.o === b.o && doorOpenEnd(a.value) === a.end && doorOpenEnd(b.value) === b.end;
}

/** The edges meeting at grid point (R,C) and the piece that belongs there. Each
 *  arm carries WHICH of its ends lands on the point, since a door's two ends are
 *  not alike. */
function junctionAt(R, C) {
  const arms = [
    { o: 'h', r: R, c: C - 1, end: 'B' },
    { o: 'h', r: R, c: C, end: 'A' },
    { o: 'v', r: R - 1, c: C, end: 'B' },
    { o: 'v', r: R, c: C, end: 'A' },
  ].map((a) => {
    const value = wallAt(a.o, a.r, a.c);
    return { ...a, value, type: wallTypeOf(value) };
  }).filter((a) => a.type);
  return { arms, type: junctionType(arms) };
}

/** How one end of a wall meets whatever else is at that junction:
 *    'extend' — reach half a thickness past the seam, into the junction. Bars do
 *               this at every joint: they are drawn as one union (see drawWalls),
 *               so the overlap is what makes a corner, tee or cross seamless —
 *               no line runs through the joint.
 *    'trim'   — stop half a thickness short, against the face of whatever owns
 *               the junction.
 *    'plain'  — a free end, capped on the seam.
 *  GLASS and a DOOR stop at the junction rather than running into it, because
 *  neither is seamless with anything but itself: the junction's own outline is
 *  then what the path terminates against. Glass keeps its seam only where the
 *  point is glass too — a run carrying on, or a corner turning — which junctionAt
 *  decides; at a tee or a cross the point is a plain wall and the panes stop.
 *  Everything else reaches in, so walls and hollow frames still fuse. */
function wallEndJoin(o, r, c, end) {
  const type = wallTypeOf(wallAt(o, r, c));
  // The grid point this end sits on.
  const R = o === 'h' ? r : (end === 'A' ? r : r + 1);
  const C = o === 'h' ? (end === 'A' ? c : c + 1) : c;

  const collinear = wallTypeOf(o === 'h'
    ? wallAt('h', R, end === 'A' ? C - 1 : C)
    : wallAt('v', end === 'A' ? R - 1 : R, C));
  const perp = (o === 'h'
    ? [wallAt('v', R - 1, C), wallAt('v', R, C)]
    : [wallAt('h', R, C - 1), wallAt('h', R, C)]).map(wallTypeOf);
  const anyPerp = perp.some(Boolean);
  const joint = junctionAt(R, C).type;

  if (isWallBar(type)) {
    // A door across the junction is an opening: it keeps its width, we give way.
    if (perp.some((t) => t === 'door')) return 'trim';
    // Glass is seamless only with glass. Where the point is anything else — a tee,
    // a cross, or a meeting with another type — the pane stops at its face and the
    // point's outline terminates it.
    if (type === 'window') return joint === 'window' ? 'extend' : (joint ? 'trim' : 'plain');
    return (collinear || anyPerp) ? 'extend' : 'plain';
  }
  // A door stops at whatever point it runs into, which is also what shortens it to
  // fit BETWEEN the points either side of it. The one end that does not is the
  // opening meeting another door's opening: those two are one door, so they run
  // together with no cap and nothing between them.
  if (type === 'door') return joint === 'doorseam' ? 'through' : 'trim';
  return (collinear || anyPerp) ? 'trim' : 'plain';   // a railing always gives way
}

/** How one end of a RAILING finishes:
 *    'post'   — a free end, which flares out into a full-thickness end post
 *    'open'   — another railing carries straight on, so the slim shaft runs
 *               through: no posts back to back in the middle of a run
 *    'corner' — a railing turns here, so the shaft stops short and an octagonal
 *               post is drawn on the junction instead (see paintRailingPost) */
function railingJoin(o, r, c, end) {
  const R = o === 'h' ? r : (end === 'A' ? r : r + 1);
  const C = o === 'h' ? (end === 'A' ? c : c + 1) : c;
  const collinear = wallTypeOf(o === 'h'
    ? wallAt('h', R, end === 'A' ? C - 1 : C)
    : wallAt('v', end === 'A' ? R - 1 : R, C));
  const perp = (o === 'h'
    ? [wallAt('v', R - 1, C), wallAt('v', R, C)]
    : [wallAt('h', R, C - 1), wallAt('h', R, C)]).map(wallTypeOf);
  const arms = [collinear, ...perp];
  return {
    // A turn, a tee or a multi-way meeting is where a railing changes direction:
    // that junction gets the octagonal post. A straight run does not — its
    // segments simply meet end post to end post.
    mode: perp.some((t) => t === 'railing') ? 'corner' : 'post',
    // Anything that is not a railing — a wall, hollow, window or door — owns the
    // junction, and the railing stops short of it rather than running into it.
    meetsWall: arms.some((t) => t && t !== 'railing'),
  };
}

/** Coerce a wall value to a stored form, or null when it isn't a real wall. */
function normalizeWallValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return WALL_TYPES.includes(value) ? value : null;
  if (typeof value === 'object' && value.t === 'door') return { t: 'door', o: wallOrient(value) };
  return null;
}

/** Place (or, with a null/unknown value, clear) the wall on one edge. `value` is
 *  a type string, or a door object { t:'door', o } carrying its orientation. */
function setWall(o, r, c, value) {
  if (!wallEdgeInBounds(o, r, c)) return;
  const key = wallKey(o, r, c);
  const norm = normalizeWallValue(value);
  if (norm) state.walls[key] = norm; else delete state.walls[key];
  emit();
}

function clearWalls() {
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  state.walls = {};
  emit();
}

function hasWalls() { return Object.keys(state.walls).length > 0; }

/** Drop any wall whose edge no longer exists (after a grid resize). */
function pruneWalls() {
  for (const key of Object.keys(state.walls)) {
    const [o, rc] = key.split(':');
    const [r, c] = rc.split(',').map(Number);
    if (!wallEdgeInBounds(o, r, c)) delete state.walls[key];
  }
}

/** Rebuild the wall map through a shift on each edge's (o, r, c). `shift` returns
 *  a new [r, c] or null to drop the edge. Used by row/column insert and delete. */
function remapWalls(shift) {
  const next = {};
  for (const [key, type] of Object.entries(state.walls)) {
    const [o, rc] = key.split(':');
    const [r, c] = rc.split(',').map(Number);
    const moved = shift(o, r, c);
    if (moved) next[wallKey(o, moved[0], moved[1])] = type;
  }
  state.walls = next;
}

// ---------------------------------------------------------------- reset

/** Empty every square on the grid. Non-destructive, like any unseating: labels,
 *  colors and icons stay on the squares and reappear when they are seated
 *  again. Tables are left alone — use New to wipe the chart outright. */
/** Empty every square and take the tables with them. Labels, icons and colours
 *  survive — this clears the layout, not the content. */
function clearGrid() {
  if (typeof historyCheckpoint === 'function') historyCheckpoint(); // undo: record before Clear Grid
  batch(() => {
    for (const cell of state.cells.values()) cell.enabled = false;
    state.tables = [];
    state.merges = [];
    state.tableSelection.clear();
  });
}

function clearAll() {
  // Wiping the chart also drops the Shift+click range anchor (defined in
  // interactions.js) so the next Shift+click can't extend from a stale cell.
  if (typeof resetSelectAnchor === 'function') resetSelectAnchor();
  batch(() => {
    state.title = '';
    state.cells.clear();
    state.tables = [];
    state.merges = [];
    state.walls = {};
    clearManualSelection();
    state.tableSelection.clear();
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
    merges: state.merges.map((m) => ({ id: m.id, kind: m.kind, keys: [...m.keys], anchor: m.anchor })),
    walls: { ...state.walls },
    paper: state.paper,
    landscape: state.landscape,
    exportBg: state.exportBg,
  };
}

function deserialize(data) {
  if (!data || typeof data !== 'object') return false;
  // undo: record before a file open / import replaces the chart. No-op during an
  // undo/redo restore or before history init, so it never fights the restore.
  if (typeof historyCheckpoint === 'function') historyCheckpoint();
  batch(() => {
    state.title = typeof data.title === 'string' ? data.title : '';
    state.defaults = {
      fill: data.defaults?.fill || DEFAULTS.fill,
      border: data.defaults?.border || DEFAULTS.border,
      iconColor: data.defaults?.iconColor || DEFAULTS.iconColor,
      labelColor: data.defaults?.labelColor || DEFAULTS.labelColor,
      labelColor2: data.defaults?.labelColor2 || DEFAULTS.labelColor2,
      iconFill: data.defaults?.iconFill || DEFAULTS.iconFill,
      tableColor: data.defaults?.tableColor || DEFAULTS.tableColor,
      tableBorder: data.defaults?.tableBorder || DEFAULTS.tableBorder,
      wallFill: data.defaults?.wallFill || DEFAULTS.wallFill,
      wallBorder: data.defaults?.wallBorder || DEFAULTS.wallBorder,
      windowFill: data.defaults?.windowFill || DEFAULTS.windowFill,
      railFill: data.defaults?.railFill || DEFAULTS.railFill,
      railBorder: data.defaults?.railBorder || DEFAULTS.railBorder,
      doorFill: data.defaults?.doorFill || DEFAULTS.doorFill,
      doorBorder: data.defaults?.doorBorder || DEFAULTS.doorBorder,
    };
    state.grid = {
      cols: clampInt(data.grid?.cols, 1, 40, 6),
      rows: clampInt(data.grid?.rows, 1, 40, 5),
    };
    state.cells = new Map();
    for (const [k, v] of data.cells || []) {
      const cell = { ...makeCell(), ...v, labels: (v.labels || []).map((l) => ({ ...l })) };
      // A split square carries a rows×cols block of sub-cells. Rebuild it with a
      // clean shape so a stale or hand-edited save can never break rendering.
      if (v && v.split && Array.isArray(v.subcells)) {
        const rows = clampInt(v.split.rows, 1, 3, 1);
        const cols = clampInt(v.split.cols, 1, 3, 1);
        cell.split = { rows, cols };
        cell.subcells = [];
        for (let i = 0; i < rows * cols; i++) cell.subcells.push(cloneSubcell(v.subcells[i] || {}));
        cell.enabled = true;
        if (Array.isArray(v.submerges) && v.submerges.length) {
          cell.submerges = v.submerges
            .filter((sm) => sm && Array.isArray(sm.indices) && sm.indices.length >= 2)
            .map((sm) => ({
              id: String(sm.id || `sm${Math.random().toString(36).slice(2)}`),
              indices: sm.indices.filter((i) => typeof i === 'number' && i >= 0 && i < rows * cols).sort((a, b) => a - b),
              anchor: typeof sm.anchor === 'number' ? sm.anchor : Math.min(...sm.indices),
            }))
            .filter((sm) => sm.indices.length >= 2 && isConnectedSubcells(sm.indices, rows, cols));
          if (!cell.submerges.length) delete cell.submerges;
        } else {
          delete cell.submerges;
        }
      } else {
        cell.split = null;
        delete cell.subcells;
        delete cell.submerges;
      }
      state.cells.set(k, cell);
    }
    state.rowWeights = Array.isArray(data.rowWeights) ? [...data.rowWeights] : [];
    state.colWeights = Array.isArray(data.colWeights) ? [...data.colWeights] : [];
    state.rowWeights.length = state.grid.rows;
    state.colWeights.length = state.grid.cols;
    state.tables = Array.isArray(data.tables)
      ? data.tables.map((t) => ({ id: t.id, shape: t.shape, color: t.color,
                                  border: t.border || DEFAULTS.tableBorder,
                                  rotation: t.rotation || 0,
                                  cellKeys: [...(t.cellKeys || [])] }))
      : [];
    state.merges = Array.isArray(data.merges)
      ? data.merges
          .filter((m) => m && Array.isArray(m.keys) && m.keys.length >= 2)
          .map((m) => ({ id: String(m.id || `m${Math.random().toString(36).slice(2)}`),
                         kind: m.kind === 'unit' ? 'unit' : 'poly',
                         keys: sortCellKeys(m.keys.map(String)),
                         ...(m.anchor ? { anchor: String(m.anchor) } : {}) }))
      : [];
    state.walls = {};
    if (data.walls && typeof data.walls === 'object') {
      for (const [key, value] of Object.entries(data.walls)) {
        const norm = normalizeWallValue(value);
        if (!norm) continue;
        const m = /^([hv]):(\d+),(\d+)$/.exec(key);
        if (m && wallEdgeInBounds(m[1], Number(m[2]), Number(m[3]))) state.walls[key] = norm;
      }
    }
    state.paper = data.paper || 'letter';
    state.landscape = data.landscape !== false;
    state.exportBg = data.exportBg || '#ffffff';
    clearManualSelection();
    state.tableSelection = new Set();
    pruneTables();
    pruneMerges();
  });
  return true;
}

// ---------------------------------------------------------------- config ops
//
// These mutate state.config and emit on the CONFIG channel only, so config
// changes persist to the config key without being confused with chart edits.

function setConfig(patch) { Object.assign(state.config, patch); emitConfig(); }

function updateConfigPreset(n, preset) { state.config.presets[String(n)] = preset; emitConfig(); }

function addCustomPaper(paper) { state.config.customPapers.push(paper); emitConfig(); }

function removeCustomPaper(id) {
  state.config.customPapers = state.config.customPapers.filter((p) => p.id !== id);
  emitConfig();
}

/** Keep a colour on the picker's saved bar. Newest first, no duplicates, and the
 *  oldest falls off the end once the slots are full. */
function saveCustomColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(String(hex || ''))) return false;
  const c = String(hex).toLowerCase();
  state.config.customColors = [c, ...state.config.customColors.filter((x) => x !== c)]
    .slice(0, CUSTOM_COLOR_SLOTS);
  emitConfig();
  return true;
}

/** Forget one saved colour — how a swatch is taken off the picker's bar. */
function removeCustomColor(hex) {
  const before = state.config.customColors.length;
  state.config.customColors = state.config.customColors.filter((c) => c !== hex);
  if (state.config.customColors.length !== before) emitConfig();
}

function addCustomIcon(icon) { state.config.customIcons.push(icon); emitConfig(); }
function removeCustomIcon(id) {
  state.config.customIcons = state.config.customIcons.filter((c) => c.id !== id);
  emitConfig();
}

/** A plain snapshot of config, safe to JSON.stringify for its own localStorage
 *  key or to bake into an exported site. Never merged into serialize(). */
function serializeConfig() {
  const copyPreset = (p) => (p ? { ...p, labels: (p.labels || []).map((l) => ({ ...l })) } : null);
  return {
    theme: state.config.theme,
    customPapers: state.config.customPapers.map((p) => ({ ...p })),
    siteTitle: state.config.siteTitle,
    favicon: state.config.favicon,
    presets: { '1': copyPreset(state.config.presets['1']), '2': copyPreset(state.config.presets['2']) },
    customIcons: state.config.customIcons.map((c) => ({ ...c })),
    barPosition: state.config.barPosition,
    barPositions: { ...state.config.barPositions },
    customColors: [...state.config.customColors],
  };
}

/** Load a config snapshot back into state.config, coercing every field so a
 *  stale or hand-edited store can never break the app. */
function applyConfig(data) {
  if (!data || typeof data !== 'object') return false;
  const cfg = state.config;
  cfg.theme = ['system', 'light', 'dark'].includes(data.theme) ? data.theme : 'system';
  cfg.customPapers = Array.isArray(data.customPapers)
    ? data.customPapers
        .filter((p) => p && p.id)
        .map((p) => ({
          id: String(p.id),
          name: String(p.name || 'Custom'),
          w: Number(p.w) || 11,
          h: Number(p.h) || 8.5,
          unit: p.unit === 'mm' ? 'mm' : 'in',
        }))
    : [];
  cfg.siteTitle = typeof data.siteTitle === 'string' && data.siteTitle.trim()
    ? data.siteTitle : DEFAULT_CONFIG.siteTitle;
  cfg.favicon = typeof data.favicon === 'string' ? data.favicon : null;
  const okPreset = (p) => (p && typeof p === 'object') ? {
    icon: p.icon || null,
    iconColor: p.iconColor || DEFAULTS.iconColor,
    iconFill: p.iconFill || null,
    rotation: p.rotation || 0,
    fill: p.fill || DEFAULTS.fill,
    border: p.border || DEFAULTS.border,
    labels: Array.isArray(p.labels)
      ? p.labels.map((l) => ({ text: String(l.text || ''), color: l.color || DEFAULTS.labelColor }))
      : [],
  } : null;
  cfg.presets = { '1': okPreset(data.presets?.['1']), '2': okPreset(data.presets?.['2']) };
  cfg.customIcons = Array.isArray(data.customIcons)
    ? data.customIcons
        .filter((c) => c && c.id && typeof c.inner === 'string')
        .map((c) => ({
          id: String(c.id),
          label: String(c.label || 'Icon'),
          viewBox: /^[-\d.\s]+$/.test(String(c.viewBox || '')) ? String(c.viewBox) : '0 0 16 16',
          inner: String(c.inner),
        }))
    : [];
  const spot = (v, fallback) => (v === 'top' || v === 'bottom' ? v : fallback);
  cfg.barPosition = ['top', 'bottom', 'custom'].includes(data.barPosition) ? data.barPosition : 'top';
  cfg.barPositions = {
    select: spot(data.barPositions?.select, 'top'),
    walls: spot(data.barPositions?.walls, 'top'),
  };
  cfg.customColors = (Array.isArray(data.customColors) ? data.customColors : [])
    .filter((c) => /^#[0-9a-f]{6}$/i.test(String(c)))
    .map((c) => String(c).toLowerCase())
    .slice(0, CUSTOM_COLOR_SLOTS);
  emitConfig();
  return true;
}

// ---------------------------------------------------------------- utils

function clampInt(v, min, max, fallback) {
  v = parseInt(v, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
