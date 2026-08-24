// grid.js — build/refresh the DOM grid from state (fill, border, icon, label, rotation)
// and render multi-square table overlays.


const chart = document.getElementById('chart');

// Live editing grid uses ONE uniform square size for every cell (row/column
// weights are output-only). The size follows a comfortable base plus the tallest
// label stack / icon — NOT the longest label, so a single long name shrinks only
// its own cell's text (fitCellLabels) instead of enlarging every square.
const CELL_BASE = 88;      // px — fits 2 lines × 10 chars (+icon)
const CHAR_W = 7.2;        // approx px per label character at the grid font
const PAD = 16;            // inner padding allowance
const LINE_H = 16;         // px per label line
const ICON_RESERVE = 40;   // px reserved for an icon above labels

/** Uniform square cell size (px). A comfortable fixed base (room for a ~10-char,
 *  2-line label plus an icon) — deliberately NOT driven by the longest label or
 *  the most label lines, so no single square enlarges every other one. A square
 *  with more/longer text shrinks its own text to fit instead (see fitCellLabels). */
function uniformCellSize() {
  let anyIcon = false;
  for (let r = 0; r < state.grid.rows; r++)
    for (let c = 0; c < state.grid.cols; c++)
      if (peekCell(r, c)?.icon && isEnabled(r, c)) anyIcon = true;
  const neededW = 10 * CHAR_W + PAD;                       // ~10-char label
  const neededH = PAD + (anyIcon ? ICON_RESERVE : 0) + 2 * LINE_H; // ~2 lines + icon
  return Math.round(Math.max(CELL_BASE, neededW, neededH));
}

const CHART_PAD = 4;   // .chart padding, in px
const CELL_GAP = 4;    // .chart gap, in px
const BADGE_PAD = 5;   // inset for a badge inside a shape (matches .cell__check)
const TABLE_BADGE = 24; // .table-remove size, in px

/** Full re-render of the grid. Called on any state change. */
function renderGrid() {
  const { cols, rows } = state.grid;
  refreshGridSurface();

  // All cells share one square size, so the grid stays uniform as content grows.
  const size = uniformCellSize();

  // With "true sizes" on, the squares are laid out by the OUTPUT's rules
  // (js/layout.js): desks keep the full uniform size and only empty squares and
  // chairs take their row/column weights. That layout has per-row column
  // offsets, which CSS Grid cannot express — so those cells are absolutely
  // positioned instead, and the grid falls back to plain tracks otherwise.
  const rects = state.showTrueSizes ? trueSizeRects(size) : null;
  chart.classList.toggle('chart--true', !!rects);
  if (rects) {
    chart.style.gridTemplateColumns = '';
    chart.style.gridTemplateRows = '';
    chart.style.width = `${rects.extent.w * size + CHART_PAD * 2}px`;
    chart.style.height = `${rects.extent.h * size + CHART_PAD * 2}px`;
  } else {
    chart.style.width = '';
    chart.style.height = '';
    chart.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    chart.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;
  }

  chart.replaceChildren();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      chart.appendChild(buildCell(r, c, rects));
    }
  }

  chart.style.setProperty('--line-out', `${LINE_BTN_OUT}px`);
  fitCellLabels();
  renderTables();
  renderMerges();
  renderWalls();
  if (typeof isWallsMode === 'function' && isWallsMode()) renderWallEdges();
  renderMoveHandle();
  buildInsertGuides();
}

/** Natural width of label text at the base font — measured on a canvas, so a
 *  span's max-width/ellipsis can't mask the true length. */
let _labelMeasureCtx = null;
function measureLabelWidth(text) {
  if (!_labelMeasureCtx) _labelMeasureCtx = document.createElement('canvas').getContext('2d');
  _labelMeasureCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  return _labelMeasureCtx.measureText(text).width;
}

/** Shrink each square's label text to fit that square — per square, so one long
 *  name or a tall stack of lines shrinks only its own cell rather than every
 *  square resizing together (as the output's single global size does). Fits both
 *  the widest line to the cell width AND the whole stack to the height under any
 *  icon. A no-op for labels that already fit. */
function fitCellLabels() {
  const BASE = 12;        // .cell__label font-size, px
  const LINE = BASE * 1.25; // line box at the base font (line-height 1.15 + gap)
  for (const cell of chart.querySelectorAll('.cell')) {
    // A split cell's label spans belong to its sub-cells, each far narrower than
    // the whole cell — sizing them against the cell width would let them overflow.
    // The sub-cells clip and ellipsize their own labels via CSS instead.
    if (cell.classList.contains('cell--split')) continue;
    const spans = cell.querySelectorAll('.cell__label');
    if (!spans.length) continue;
    const availW = cell.clientWidth - 10;
    if (availW <= 0) continue;
    let widest = 0;
    for (const s of spans) widest = Math.max(widest, measureLabelWidth(s.textContent));
    const wScale = widest > availW ? availW / widest : 1;
    // Height budget: the cell minus any icon above the labels and a little padding.
    const iconEl = cell.querySelector('.cell__icon');
    const iconH = iconEl ? iconEl.getBoundingClientRect().height : 0;
    const availH = cell.clientHeight - iconH - 10;
    const stackH = spans.length * LINE;
    const hScale = stackH > availH && availH > 0 ? availH / stackH : 1;
    const scale = Math.min(wScale, hScale);
    const px = scale < 1 ? Math.max(6, Math.round(BASE * scale)) : null; // floor so it stays legible
    for (const s of spans) s.style.fontSize = px ? `${px}px` : '';
  }
}

/** Output-accurate rectangles for the true-size preview, at the grid's own unit
 *  size. Carries the overall extent so the chart can be sized to fit them. */
function trueSizeRects(size) {
  const rules = layoutRules();
  const rects = layoutRects(rules, size, 0, 0);
  rects.extent = layoutExtent(rules);
  return rects;
}

// ---------------------------------------------------------------- insert guides
//
// Inserts are offered from the OUTER border of the grid only — never from the
// seam between two squares in the middle, where a stray + would sit on top of
// the chart you are editing. Running the pointer down the left or right edge
// reveals a rule along the nearest row line with a + at each end; along the top
// or bottom edge it does the same for columns. At a corner both lines meet, so
// a single + appears instead and asks which one you meant.

const INSERT_REACH = 14;     // px from the border that reveals a guide
// How far outside the grid the line buttons stand. Both the insert + and the
// delete x use it, so they land on the same line either side of the chart.
const LINE_BTN_OUT = 16;
let movingSelection = false; // true while the selection is being dragged
let rowGuide = null, colGuide = null, cornerBtn = null, cornerMenu = null;
let rowDelBtn = null, colDelBtn = null;
let cornerMenuOpen = false;

function makeGuide(axis) {
  const el = document.createElement('div');
  el.className = `insert-guide insert-guide--${axis}`;
  el.hidden = true;
  for (const end of ['start', 'end']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `insert-add insert-add--${end}`;
    btn.textContent = '+';
    const what = axis === 'row' ? 'row' : 'column';
    btn.title = `Insert ${what} here`;
    btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const at = Number(el.dataset.index);
      if (axis === 'row') insertRow(at); else insertCol(at);
    });
    el.appendChild(btn);
  }
  chart.appendChild(el);
  return el;
}

/** The corner +: one button standing where a row line and a column line cross,
 *  with a two-item menu behind it. Hovering an item previews that line. */
function makeCorner() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'insert-add insert-corner';
  btn.textContent = '+';
  btn.title = 'Insert a row or a column here';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-haspopup', 'true');
  btn.hidden = true;
  btn.addEventListener('click', (e) => { e.stopPropagation(); openCornerMenu(); });
  chart.appendChild(btn);

  cornerMenu = document.createElement('div');
  cornerMenu.className = 'popmenu insert-menu';
  cornerMenu.setAttribute('role', 'menu');
  cornerMenu.hidden = true;
  for (const axis of ['row', 'col']) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'popmenu__item';
    item.setAttribute('role', 'menuitem');
    item.dataset.axis = axis;
    item.textContent = axis === 'row' ? 'Insert row' : 'Insert column';
    item.addEventListener('pointerenter', () => previewInsertLine(axis));
    item.addEventListener('pointerleave', () => previewInsertLine(null));
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const at = Number(axis === 'row' ? btn.dataset.rowIndex : btn.dataset.colIndex);
      closeCornerMenu();
      if (axis === 'row') insertRow(at); else insertCol(at);
    });
    cornerMenu.appendChild(item);
  }
  chart.appendChild(cornerMenu);
  return btn;
}

/** The red x that deletes a whole row or column. It stands OUTSIDE the grid,
 *  level with the middle of the line it removes — the complement of the insert
 *  guides, which appear when the pointer is near a line instead of a square. */
function makeDelete(axis) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `line-remove line-remove--${axis}`;
  el.textContent = '\u2715';
  el.hidden = true;
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const at = Number(el.dataset.index);
    const what = axis === 'row' ? 'row' : 'column';
    if (lineHasContent(axis, at) &&
        !confirm(`Delete ${what} ${at + 1}? Everything in it is removed.`)) return;
    if (axis === 'row') deleteRow(at); else deleteCol(at);
  });
  chart.appendChild(el);
  return el;
}

function buildInsertGuides() {
  rowGuide = makeGuide('row');
  colGuide = makeGuide('col');
  cornerBtn = makeCorner();
  rowDelBtn = makeDelete('row');
  colDelBtn = makeDelete('col');
  cornerMenuOpen = false;   // a re-render throws the old menu away
}

/** Which row/column an offset falls inside, from a boundary list. */
function lineAt(bs, along) {
  for (let i = 0; i < bs.length - 1; i++) {
    if (along >= bs[i] && along < bs[i + 1]) return i;
  }
  return -1;
}

/** Offset of each grid line, in the chart's own layout pixels. Boundary i sits
 *  before row/column i and the last one is the far edge — each centred in the
 *  gap between the squares rather than on one square's border. */
function boundaries(axis) {
  const { rows, cols } = state.grid;
  const n = axis === 'row' ? rows : cols;
  const chartRect = chart.getBoundingClientRect();
  const zoom = chartZoom();
  const half = (parseFloat(getComputedStyle(chart).gap) || 0) / 2;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const at = Math.min(i, n - 1);
    const el = chart.querySelector(`.cell[data-key="${CSS.escape(axis === 'row' ? keyOf(at, 0) : keyOf(0, at))}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    const lead = (axis === 'row' ? r.top - chartRect.top : r.left - chartRect.left) / zoom;
    const tail = (axis === 'row' ? r.bottom - chartRect.top : r.right - chartRect.left) / zoom;
    out.push(i < n ? lead - half : tail + half);
  }
  return out;
}

function chartZoom() {
  return parseFloat(getComputedStyle(chart).getPropertyValue('--zoom')) || 1;
}

/** Reveal whichever insert the pointer is reaching for, or nothing. */
function updateInsertGuides(e) {
  if (!rowGuide || !colGuide || movingSelection || cornerMenuOpen) return;
  const chartRect = chart.getBoundingClientRect();
  const zoom = chartZoom();
  const x = (e.clientX - chartRect.left) / zoom;
  const y = (e.clientY - chartRect.top) / zoom;

  const rowBs = boundaries('row');
  const colBs = boundaries('col');
  if (!rowBs.length || !colBs.length) return;
  const left = colBs[0], right = colBs[colBs.length - 1];
  const top = rowBs[0], bottom = rowBs[rowBs.length - 1];

  const nearest = (bs, along) => {
    let best = 0, bestD = Infinity;
    bs.forEach((pos, i) => { const d = Math.abs(along - pos); if (d < bestD) { bestD = d; best = i; } });
    return bestD <= INSERT_REACH ? { index: best, pos: bs[best] } : null;
  };
  const near = (v, a, b) => Math.min(Math.abs(v - a), Math.abs(v - b)) <= INSERT_REACH;

  // A row line is offered only from the grid's left or right border, a column
  // line only from its top or bottom one.
  const inside = x >= left - INSERT_REACH && x <= right + INSERT_REACH &&
                 y >= top - INSERT_REACH && y <= bottom + INSERT_REACH;
  const row = inside && near(x, left, right) ? nearest(rowBs, y) : null;
  const col = inside && near(y, top, bottom) ? nearest(colBs, x) : null;

  hideInsertGuides();

  // Beside the grid but NOT near a line means the pointer is level with the
  // middle of a row or column, which is where that line's delete button sits.
  if (inside && !row && !col) {
    if (near(x, left, right)) {
      const i = lineAt(rowBs, y);
      if (i >= 0 && rowBs.length > 2) {
        placeDelete(rowDelBtn, i,
          x < (left + right) / 2 ? left - LINE_BTN_OUT : right + LINE_BTN_OUT,
          (rowBs[i] + rowBs[i + 1]) / 2, 'row');
      }
    } else if (near(y, top, bottom)) {
      const i = lineAt(colBs, x);
      if (i >= 0 && colBs.length > 2) {
        placeDelete(colDelBtn, i, (colBs[i] + colBs[i + 1]) / 2,
          y < (top + bottom) / 2 ? top - LINE_BTN_OUT : bottom + LINE_BTN_OUT, 'col');
      }
    }
    return;
  }

  if (row && col) {
    // The two lines cross here, so ask rather than guess.
    cornerBtn.dataset.rowIndex = String(row.index);
    cornerBtn.dataset.colIndex = String(col.index);
    cornerBtn.dataset.rowPos = String(row.pos);
    cornerBtn.dataset.colPos = String(col.pos);
    cornerBtn.style.left = `${col.pos}px`;
    cornerBtn.style.top = `${row.pos}px`;
    cornerBtn.hidden = false;
  } else if (row) {
    placeGuide(rowGuide, 'top', row, left, right);
  } else if (col) {
    placeGuide(colGuide, 'left', col, top, bottom);
  }
}

/** Stretch a guide across the grid itself rather than the chart's padding box,
 *  so its ends sit exactly on the grid's edges. */
function spanGuide(guide, axis, from, to) {
  if (axis === 'row') {
    guide.style.left = `${from}px`;
    guide.style.width = `${to - from}px`;
  } else {
    guide.style.top = `${from}px`;
    guide.style.height = `${to - from}px`;
  }
}

function placeDelete(btn, index, x, y, axis) {
  btn.dataset.index = String(index);
  btn.style.left = `${x}px`;
  btn.style.top = `${y}px`;
  btn.title = `Delete ${axis === 'row' ? 'row' : 'column'} ${index + 1}`;
  btn.setAttribute('aria-label', btn.title);
  btn.hidden = false;
}

function placeGuide(guide, side, at, from, to) {
  guide.dataset.index = String(at.index);
  guide.style[side] = `${at.pos}px`;
  spanGuide(guide, side === 'top' ? 'row' : 'col', from, to);
  guide.classList.remove('insert-guide--preview');
  guide.hidden = false;
}

/** Show one line, +-less, while its menu item is hovered — context only. */
function previewInsertLine(axis) {
  rowGuide.hidden = true;
  colGuide.hidden = true;
  if (!axis) return;
  const guide = axis === 'row' ? rowGuide : colGuide;
  const side = axis === 'row' ? 'top' : 'left';
  guide.style[side] = `${cornerBtn.dataset[axis === 'row' ? 'rowPos' : 'colPos']}px`;
  const bs = boundaries(axis === 'row' ? 'col' : 'row');   // the span it crosses
  if (bs.length) spanGuide(guide, axis, bs[0], bs[bs.length - 1]);
  guide.classList.add('insert-guide--preview');
  guide.hidden = false;
}

function openCornerMenu() {
  const rowPos = parseFloat(cornerBtn.dataset.rowPos);
  const colPos = parseFloat(cornerBtn.dataset.colPos);
  // Open away from whichever corner it is, so the menu stays over the chart.
  cornerMenu.style.left = `${colPos}px`;
  cornerMenu.style.top = `${rowPos}px`;
  cornerMenu.classList.toggle('insert-menu--left', colPos > chart.clientWidth / 2);
  cornerMenu.classList.toggle('insert-menu--up', rowPos > chart.clientHeight / 2);
  cornerMenu.hidden = false;
  cornerMenuOpen = true;
  cornerBtn.setAttribute('aria-expanded', 'true');
}

function closeCornerMenu() {
  cornerMenuOpen = false;
  if (cornerMenu) cornerMenu.hidden = true;
  if (cornerBtn) cornerBtn.setAttribute('aria-expanded', 'false');
  hideInsertGuides();
}

function hideInsertGuides() {
  if (rowGuide) { rowGuide.hidden = true; rowGuide.classList.remove('insert-guide--preview'); }
  if (colGuide) { colGuide.hidden = true; colGuide.classList.remove('insert-guide--preview'); }
  if (cornerBtn && !cornerMenuOpen) cornerBtn.hidden = true;
  if (rowDelBtn) rowDelBtn.hidden = true;
  if (colDelBtn) colDelBtn.hidden = true;
}

// ---------------------------------------------------------------- delete menu
//
// One menu behind three doors: Shift+right-click on the grid, and the Delete
// button in either edit pane. Whatever opens it, the choices are the same.

let deleteMenu = null;

/** Open the delete menu at a point on screen. `keys` is what Reset acts on;
 *  `r` and `c` name the row and column the click landed in. */
function openDeleteMenu(x, y, { keys, r, c }) {
  closeDeleteMenu();
  deleteMenu = document.createElement('div');
  deleteMenu.className = 'popmenu delete-menu';
  deleteMenu.setAttribute('role', 'menu');

  const n = keys.length;
  const tables = [...state.tableSelection];
  const item = (label, danger, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `popmenu__item${danger ? ' popmenu__item--danger' : ''}`;
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); closeDeleteMenu(); run(); });
    deleteMenu.appendChild(b);
  };

  // Deleting squares takes any picked tables with them, so one action clears
  // everything that is currently selected.
  const many = n > 1 || tables.length > 0;
  const what = many ? 'selected items' : 'square';
  item(`Delete ${what}`, true, () => {
    const filled = keys.some((k) => { const [rr, cc] = parseKey(k); return isEnabled(rr, cc); });
    if ((filled || tables.length) &&
        !confirm(`Delete ${what}? Labels, icons and colors go with them.`)) return;
    batch(() => {
      resetSquares(keys);
      if (tables.length) removeTables(tables);
    });
  });
  item(`Delete row ${r + 1}`, true, () => {
    if (lineHasContent('row', r) &&
        !confirm(`Delete row ${r + 1}? Everything in it is removed.`)) return;
    deleteRow(r);
  });
  item(`Delete column ${c + 1}`, true, () => {
    if (lineHasContent('col', c) &&
        !confirm(`Delete column ${c + 1}? Everything in it is removed.`)) return;
    deleteCol(c);
  });

  document.body.appendChild(deleteMenu);
  // Keep it on screen when the click lands near an edge.
  const box = deleteMenu.getBoundingClientRect();
  deleteMenu.style.left = `${Math.min(x, window.innerWidth - box.width - 8)}px`;
  deleteMenu.style.top = `${Math.min(y, window.innerHeight - box.height - 8)}px`;
}

function closeDeleteMenu() {
  deleteMenu?.remove();
  deleteMenu = null;
}

document.addEventListener('pointerdown', (e) => {
  if (deleteMenu && !e.target.closest?.('.delete-menu')) closeDeleteMenu();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDeleteMenu(); });

/** Wire the hover behaviour once; the stage is bigger than the chart so the
 *  guides can also be reached from just outside its edges. */
function initInsertGuides(stageEl) {
  stageEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;   // touch has no hover to key off
    // While the pointer is on a guide, a +, an x or the corner menu, leave things
    // be — otherwise reaching for a button would recompute and hide it. The
    // delete x sits just outside the grid, past the reach that revealed it, so
    // without this it disappears the moment you go for it.
    if (e.target.closest &&
        e.target.closest('.insert-guide, .insert-corner, .insert-menu, .line-remove')) return;
    updateInsertGuides(e);
  });
  stageEl.addEventListener('pointerleave', () => { if (!cornerMenuOpen) hideInsertGuides(); });
  // The menu is modal-ish: anything else you click dismisses it.
  document.addEventListener('pointerdown', (e) => {
    if (!cornerMenuOpen) return;
    if (e.target.closest && e.target.closest('.insert-menu, .insert-corner')) return;
    closeCornerMenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCornerMenu(); });
}

/** Corner grab handle for dragging the whole selection to a new spot. Shown at
 *  the top-left of the selection's bounding box while in select mode. */
function renderMoveHandle() {
  if (typeof isSelectMode !== 'function' || !isSelectMode()) return;
  const box = selectionBounds();
  if (!box) return;

  const first = chart.querySelector(`.cell[data-key="${CSS.escape(keyOf(box.minR, box.minC))}"]`);
  const last = chart.querySelector(`.cell[data-key="${CSS.escape(keyOf(box.maxR, box.maxC))}"]`);
  if (!first || !last) return;

  // getBoundingClientRect reports SCREEN pixels, which the chart's zoom transform
  // has already scaled; style.left/top are the chart's own unscaled layout
  // pixels. Divide through so the two agree at any zoom.
  const chartRect = chart.getBoundingClientRect();
  const zoom = chartZoom();
  const a = first.getBoundingClientRect();
  const z = last.getBoundingClientRect();
  const left = (a.left - chartRect.left) / zoom;
  const top = (a.top - chartRect.top) / zoom;
  const width = (z.right - a.left) / zoom;
  const height = (z.bottom - a.top) / zoom;

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'move-handle';
  handle.title = 'Drag to move the selection';
  handle.setAttribute('aria-label', 'Move selection');
  handle.textContent = '✥';
  handle.style.left = `${left}px`;
  handle.style.top = `${top}px`;
  chart.appendChild(handle);

  attachMoveDrag(handle, { left, top, width, height, box,
                           cellW: a.width / zoom, cellH: a.height / zoom });
}

/** Drag the handle to shift the selection; a dashed preview shows the landing
 *  spot and the move is applied on release (silently ignored if off-grid). */
function attachMoveDrag(handle, geo) {
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideInsertGuides();          // keep + buttons out of the drag's way
    handle.setPointerCapture(e.pointerId);
    // geo is in layout px, so pointer travel is converted to match before it is
    // divided into whole-square steps.
    const gap = parseFloat(getComputedStyle(chart).gap) || 0;
    drag = { x: e.clientX, y: e.clientY, dr: 0, dc: 0, zoom: chartZoom(),
             stepX: geo.cellW + gap, stepY: geo.cellH + gap };

    const preview = document.createElement('div');
    preview.className = 'move-preview';
    preview.style.left = `${geo.left}px`;
    preview.style.top = `${geo.top}px`;
    preview.style.width = `${geo.width}px`;
    preview.style.height = `${geo.height}px`;
    chart.appendChild(preview);
    drag.preview = preview;
    movingSelection = true;
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dc = Math.round((e.clientX - drag.x) / drag.zoom / drag.stepX);
    drag.dr = Math.round((e.clientY - drag.y) / drag.zoom / drag.stepY);
    drag.preview.style.left = `${geo.left + drag.dc * drag.stepX}px`;
    drag.preview.style.top = `${geo.top + drag.dr * drag.stepY}px`;
    // Flag a landing spot that would fall off the grid.
    const fits = geo.box.minR + drag.dr >= 0 && geo.box.minC + drag.dc >= 0 &&
                 geo.box.maxR + drag.dr < state.grid.rows && geo.box.maxC + drag.dc < state.grid.cols;
    drag.preview.classList.toggle('move-preview--blocked', !fits);
  });

  const finish = () => {
    if (!drag) return;
    const { dr, dc } = drag;
    drag.preview.remove();
    drag = null;
    movingSelection = false;
    moveSelection(dr, dc); // false (no change) when it would leave the grid
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

/** Position a chair's furniture tile (50% of the square) against the edge it
 *  faces, centred on the other axis — the DOM twin of chairGeometry in the
 *  output. Diagonal facings tuck into the matching corner. */
function placeChairTile(tile, rot) {
  const n = ((Math.round(rot / 45) * 45) % 360 + 360) % 360;
  const [dr, dc] = FACING_STEP[n] || FACING_STEP[0];
  tile.style.left = dc < 0 ? '0' : dc > 0 ? '50%' : '25%';
  tile.style.top = dr < 0 ? '0' : dr > 0 ? '50%' : '25%';
}

/** Position a chair's labels in the region opposite the tile — a full-width
 *  top/bottom band for a vertical facing (hugging the tile), or the far half
 *  (full height) beside a side-facing chair, whose label reads vertically once
 *  the element is turned by the facing. The DOM twin of the output's chairLabelBox. */
function placeChairLabels(el, rot) {
  const [dr, dc] = serverHalf(rot);
  if (dr < 0) { el.style.left = '0'; el.style.width = '100%'; el.style.top = '50%'; el.style.height = '50%'; el.style.justifyContent = 'flex-start'; }
  else if (dr > 0) { el.style.left = '0'; el.style.width = '100%'; el.style.top = '0'; el.style.height = '50%'; el.style.justifyContent = 'flex-end'; }
  else { placeVertFurnitureLabels(el, dc); }
}

/** A turned (side-facing) furniture label: a full-height strip whose centre — the
 *  rotation pivot — sits just outside the tile, so the vertical name hugs the
 *  piece rather than floating in the far half. dc<0 faces left (tile left), dc>0
 *  faces right (tile right). */
function placeVertFurnitureLabels(el, dc) {
  el.style.top = '0';
  el.style.height = '100%';
  el.style.width = '40%';
  el.style.left = dc < 0 ? '38%' : '22%'; // centre ~58% (hug left tile) or ~42% (hug right tile)
  el.style.justifyContent = 'center';
  el.classList.add('cell__furniturelabels--vert');
}

/** Which orthogonal half a server slab fills, given its facing — a diagonal
 *  collapses to its vertical side, mirroring serverGeometry in the output. */
function serverHalf(rot) {
  const n = ((Math.round(rot / 45) * 45) % 360 + 360) % 360;
  let [dr, dc] = FACING_STEP[n] || FACING_STEP[0];
  if (dr && dc) dc = 0;
  return [dr, dc];
}

/** Position a server's half-square slab against the edge it faces. */
function placeServerTile(tile, rot) {
  const [dr, dc] = serverHalf(rot);
  if (dr || !dc) { tile.style.width = '100%'; tile.style.left = '0'; }
  if (dc) { tile.style.width = '50%'; tile.style.left = dc < 0 ? '0' : '50%'; tile.style.height = '100%'; tile.style.top = '0'; }
  if (dr) { tile.style.height = '50%'; tile.style.top = dr < 0 ? '0' : '50%'; }
}

/** Position a server's labels in the other half of the square. */
function placeServerLabels(el, rot) {
  const [dr, dc] = serverHalf(rot);
  if (dc) { placeVertFurnitureLabels(el, dc); }
  else { el.style.width = '100%'; el.style.left = '0'; el.style.height = '50%'; el.style.top = dr < 0 ? '50%' : '0'; }
}

/** A rack of servers: the square split into one slab per non-empty label,
 *  stacked and turned to the facing. Fit-content wide — every slab stretches to
 *  the widest label — so the column is only as wide as its longest name and the
 *  cell centres it. The DOM twin of drawServerRack. */
function buildServerRack(data, rot) {
  const rack = document.createElement('div');
  rack.className = 'cell__rack';
  rack.style.transform = `rotate(${rot}deg)`;
  for (const line of data.labels) {
    if (!line.text) continue;
    const unit = document.createElement('div');
    unit.className = 'cell__rackunit';
    unit.style.background = data.fill;
    unit.style.borderColor = data.border;
    const span = document.createElement('span');
    span.className = 'cell__label';
    span.textContent = line.text;
    // The label sits on its slab fill; keep it legible against that colour.
    span.style.color = typeof contrastLabelColor === 'function'
      ? contrastLabelColor(line.color, data.fill || '#dbe7ff') : line.color;
    unit.appendChild(span);
    rack.appendChild(unit);
  }
  return rack;
}

// The theme surface a bare (furniture/ghost) label sits on, refreshed each full
// render so a label that would vanish on it (white on white in light mode) can be
// flipped to a readable colour — the grid twin of the export's page-background flip.
let GRID_SURFACE = '#ffffff';
function refreshGridSurface() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  if (v) GRID_SURFACE = v;
}
/** Recolor a label placed directly on the grid surface so it stays legible in
 *  both light and dark themes. */
function surfaceLabelColor(color) {
  return typeof contrastLabelColor === 'function' ? contrastLabelColor(color, GRID_SURFACE) : color;
}

/** The sub-grid of a split square: a CSS-grid of rows×cols sub-cells. */
function buildSplitGrid(r, c, data) {
  const wrap = document.createElement('div');
  wrap.className = 'cell__split';
  wrap.style.gridTemplateColumns = `repeat(${data.split.cols}, 1fr)`;
  wrap.style.gridTemplateRows = `repeat(${data.split.rows}, 1fr)`;
  data.subcells.forEach((sub, i) => wrap.appendChild(buildSubcell(sub, i)));
  return wrap;
}

/** One sub-cell of a split square — a mini desk: fill/border when seated, its
 *  icon and labels turned to its own facing, faded when it holds content but is
 *  empty (the same ghost treatment a whole square gets). */
function buildSubcell(sub, i) {
  const el = document.createElement('div');
  el.className = 'subcell';
  el.dataset.sub = i;
  const ghost = !sub.enabled && hasContent(sub);
  if (sub.enabled) {
    el.classList.add('subcell--on');
    el.style.background = sub.fill;
    el.style.borderColor = sub.border;
  }
  if (sub.enabled || ghost) {
    const content = document.createElement('div');
    content.className = ghost ? 'cell__content cell__content--ghost' : 'cell__content';
    content.style.setProperty('--rot', `${sub.rotation || 0}deg`);
    if (sub.icon) {
      const svg = iconUse(sub.icon, 'cell__icon', sub.iconFill);
      if (svg) {
        const ic = sub.iconColor || '#1f2933';
        svg.style.color = ghost ? surfaceLabelColor(ic) : contrastLabelColor(ic, sub.fill || '#dbe7ff');
        content.appendChild(svg);
      }
    }
    if (sub.labels && sub.labels.some((l) => l.text)) {
      const labels = document.createElement('div');
      labels.className = 'cell__labels';
      for (const line of sub.labels) {
        if (!line.text) continue;
        const span = document.createElement('span');
        span.className = 'cell__label';
        span.textContent = line.text;
        span.style.color = ghost ? surfaceLabelColor(line.color)
                                 : contrastLabelColor(line.color, sub.fill || '#dbe7ff');
        labels.appendChild(span);
      }
      content.appendChild(labels);
    }
    el.appendChild(content);
  }
  return el;
}

function buildCell(r, c, rects) {
  const key = keyOf(r, c);
  const data = peekCell(r, c);
  const el = document.createElement('div');
  el.className = 'cell';
  el.dataset.r = r;
  el.dataset.c = c;
  el.dataset.key = key;
  el.setAttribute('role', 'gridcell');
  el.tabIndex = -1;

  // True-size mode positions each square itself. Half a gap of inset on every
  // side reproduces the grid's seams while keeping the true footprint.
  if (rects) {
    const box = rects.get(key);
    el.style.left = `${CHART_PAD + box.x + CELL_GAP / 2}px`;
    el.style.top = `${CHART_PAD + box.y + CELL_GAP / 2}px`;
    el.style.width = `${Math.max(2, box.w - CELL_GAP)}px`;
    el.style.height = `${Math.max(2, box.h - CELL_GAP)}px`;
  }

  if (state.selection.has(key)) {
    el.classList.add('cell--selected');
    el.appendChild(checkBadge());
  }

  // A split square renders as a small block of independent sub-cells instead of a
  // single desk. Tapping a piece fills it; long-press / right-click edits it
  // (see interactions.js). Everything below (furniture, ghost, desk) is skipped.
  // A merged square draws as one desk over the whole group (renderMerges), so its
  // member cells render blank here and let that overlay show through. Merge wins
  // over a split — a split cell can be pulled into a merge.
  if (mergeAt(r, c)) {
    el.classList.add('cell--merged');
    el.setAttribute('aria-label', `Merged square, row ${r + 1}, column ${c + 1}`);
    return el;
  }

  if (data && isSplit(data)) {
    el.classList.add('cell--split');
    el.appendChild(buildSplitGrid(r, c, data));
    el.setAttribute('aria-label', `Split square, row ${r + 1}, column ${c + 1}`);
    return el;
  }

  // A square that has been emptied but still holds a label or an icon shows them
  // faded, so somewhere you have used before stays recognisable. Grid only — the
  // output draws nothing at all for an empty square.
  const ghost = !!(data && !data.enabled && hasContent(data));

  if (data && (data.enabled || ghost)) {
    // Furniture (chair, server) keeps its full-size square but draws a piece of
    // furniture inside it, tucked against the edge it faces — matching the
    // output. So the square itself is NOT filled desk-style; the furniture is.
    const furniture = data.enabled ? furnitureKind(data) : null;

    if (data.enabled && !furniture) {
      el.classList.add('cell--on');
      el.style.background = data.fill;
      el.style.borderColor = data.border;
    }

    const content = document.createElement('div');
    content.className = ghost ? 'cell__content cell__content--ghost' : 'cell__content';
    // A square under a table turns with the table, on top of its own facing.
    const tableRot = tableAt(r, c)?.rotation || 0;
    content.style.setProperty('--rot', `${(data.rotation || 0) + tableRot}deg`);

    if (data.icon) {
      const svg = iconUse(data.icon, 'cell__icon', data.iconFill);
      if (svg) {
        // Keep the icon legible: a ghost's icon flips against the surface (like
        // its labels); a live icon sits on its square/tile fill, so it flips
        // against that fill when it would otherwise vanish (white on a light fill).
        const ic = data.iconColor || '#1f2933';
        svg.style.color = ghost ? surfaceLabelColor(ic) : contrastLabelColor(ic, data.fill || '#dbe7ff');
        content.appendChild(svg);
      }
    }

    let labelsEl = null;
    if (data.labels && data.labels.length && data.labels.some((l) => l.text)) {
      labelsEl = document.createElement('div');
      labelsEl.className = 'cell__labels';
      for (const line of data.labels) {
        if (!line.text) continue;
        const span = document.createElement('span');
        span.className = 'cell__label';
        span.textContent = line.text;
        // Furniture/ghost labels sit on the bare grid surface; a desk label sits
        // on its own fill. Either way, flip it when it would vanish on that bg.
        span.style.color = (furniture || ghost)
          ? surfaceLabelColor(line.color)
          : (typeof contrastLabelColor === 'function' ? contrastLabelColor(line.color, data.fill || '#dbe7ff') : line.color);
        labelsEl.appendChild(span);
      }
    }

    const labelCount = data.labels ? data.labels.filter((l) => l.text).length : 0;

    if (furniture === 'server' && labelCount >= 2) {
      // A rack of several servers: one slab per label, stacked and turned to the
      // facing — the DOM twin of drawServerRack. The server icon sits upright in
      // the square's empty corner (the rack is only as wide as its labels).
      const rot = (data.rotation || 0) + tableRot;
      el.classList.add('cell--furniturehost');
      el.appendChild(buildServerRack(data, rot));
      const svg = iconUse('server', 'cell__rackicon');
      if (svg) { svg.style.color = surfaceLabelColor(data.iconColor || '#1f2933'); el.appendChild(svg); }
    } else if (furniture) {
      // Furniture piece carries only the icon (turned to face); labels sit in the
      // square's empty space (a single server's label turns with the facing).
      const rot = (data.rotation || 0) + tableRot;
      const tile = document.createElement('div');
      tile.className = `cell__furniture cell__${furniture}`;
      tile.style.background = data.fill;
      tile.style.borderColor = data.border;
      if (furniture === 'server') placeServerTile(tile, rot);
      else placeChairTile(tile, rot);
      tile.appendChild(content);
      el.classList.add('cell--furniturehost');
      el.appendChild(tile);
      if (labelsEl) {
        labelsEl.classList.add('cell__furniturelabels');
        if (furniture === 'server') placeServerLabels(labelsEl, rot);
        else placeChairLabels(labelsEl, rot);
        labelsEl.style.transform = `rotate(${rot}deg)`; // labels turn with the piece
        el.appendChild(labelsEl);
      }
    } else {
      if (labelsEl) content.appendChild(labelsEl);
      el.appendChild(content);
    }
    el.setAttribute('aria-label', ghost
      ? `Empty seat row ${r + 1}, column ${c + 1}, previously ${ariaLabel(r, c, data)}`
      : ariaLabel(r, c, data));
  } else {
    el.setAttribute('aria-label', `Empty seat row ${r + 1}, column ${c + 1}`);
  }

  return el;
}

/** Ticked-checkbox marker for a selected square. The badge itself is small, but
 *  it sits inside a transparent padded corner so it never crowds the square's
 *  edge or the content underneath. Decorative — the outline and the cell's
 *  aria-selected carry the meaning. */
function checkBadge() {
  const wrap = document.createElement('span');
  wrap.className = 'cell__check';
  wrap.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#ui-select');
  svg.appendChild(use);
  wrap.appendChild(svg);
  return wrap;
}

function ariaLabel(r, c, data) {
  const text = (data.labels || []).map((l) => l.text).filter(Boolean).join(' ');
  return `Seat row ${r + 1}, column ${c + 1}${text ? `: ${text}` : ''}`;
}

/** Position table shapes over the bounding box of their member cells. */
function renderTables() {
  if (!state.tables.length) return;
  // Measure once relative to the chart's padded content box. Bounding rects are
  // screen pixels and the chart carries a zoom transform, so everything is
  // divided back into the chart's own layout pixels — the units style.left uses.
  const chartRect = chart.getBoundingClientRect();
  const zoom = chartZoom();

  for (const table of state.tables) {
    const rects = table.cellKeys
      .map((k) => chart.querySelector(`.cell[data-key="${CSS.escape(k)}"]`))
      .filter(Boolean)
      .map((el) => el.getBoundingClientRect());
    if (!rects.length) continue;

    const left = (Math.min(...rects.map((b) => b.left)) - chartRect.left) / zoom;
    const top = (Math.min(...rects.map((b) => b.top)) - chartRect.top) / zoom;
    const right = (Math.max(...rects.map((b) => b.right)) - chartRect.left) / zoom;
    const bottom = (Math.max(...rects.map((b) => b.bottom)) - chartRect.top) / zoom;

    const inset = 6; // transparent spacing so the shape never touches borders
    const shape = document.createElement('div');
    shape.className = `table-shape table-shape--${table.shape}`;
    if (state.tableSelection.has(table.id)) shape.classList.add('table-shape--picked');
    shape.style.left = `${left + inset}px`;
    shape.style.top = `${top + inset}px`;
    shape.style.width = `${right - left - inset * 2}px`;
    shape.style.height = `${bottom - top - inset * 2}px`;
    shape.style.background = table.color;
    shape.style.borderColor = table.border || state.defaults.tableBorder;
    // Turned at full size, matching the output: the shape keeps its dimensions
    // and overhangs its footprint instead of shrinking into it.
    if (table.rotation) shape.style.transform = `rotate(${table.rotation}deg)`;
    shape.dataset.tableId = table.id;
    chart.appendChild(shape);

    // Remove button — the shape itself is pointer-events:none, so this button
    // (pointer-events:auto) is how a table gets deleted. It sits INSIDE the
    // shape's top-right corner, held off the edges by the same padding a
    // square's tick badge uses.
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'table-remove';
    del.textContent = '✕';
    del.title = 'Remove table';
    del.setAttribute('aria-label', 'Remove table');
    // Everything pinned to a table turns with it, so the x and the grips stay on
    // the corners they belong to rather than hanging where the shape used to be.
    const spin = spinner(table, left + inset, top + inset, right - inset, bottom - inset);
    const dp = spin(right - inset - TABLE_BADGE / 2 - BADGE_PAD, top + inset + TABLE_BADGE / 2 + BADGE_PAD);
    del.style.left = `${dp.x - TABLE_BADGE / 2}px`;
    del.style.top = `${dp.y - TABLE_BADGE / 2}px`;
    del.addEventListener('click', (e) => { e.stopPropagation(); removeTable(table.id); });
    chart.appendChild(del);

    // A picked table can be re-shaped by its own edges.
    if (state.tableSelection.has(table.id) && typeof isSelectMode === 'function' && isSelectMode()) {
      addResizeHandles(table, left + inset, top + inset, right - inset, bottom - inset, spin);
    }
  }
}

// ---------------------------------------------------------------- merged squares
//
// A merged square draws as ONE desk over its whole group. The member cells render
// blank (see buildCell) and these overlays — pointer-events:none, so clicks still
// reach the cells and edit the anchor — draw the fused desk on top.

const MERGE_SVGNS = 'http://www.w3.org/2000/svg';

function renderMerges() {
  if (!state.merges.length) return;
  for (const merge of state.merges) {
    const [ar, ac] = parseKey(merge.keys[0]);
    const data = peekCell(ar, ac) || {};
    const fill = data.fill || '#dbe7ff';
    const border = data.border || '#2f6feb';

    // Each member cell's box in the chart's own layout px.
    const rects = new Map();
    for (const k of merge.keys) {
      const [r, c] = parseKey(k);
      const rc = cellLocalRect(r, c);
      if (rc) rects.set(k, { ...rc, r, c });
    }
    if (!rects.size) continue;
    const vals = [...rects.values()];
    const left = Math.min(...vals.map((b) => b.left));
    const top = Math.min(...vals.map((b) => b.top));
    const right = Math.max(...vals.map((b) => b.left + b.width));
    const bottom = Math.max(...vals.map((b) => b.top + b.height));

    const plan = mergePlan(merge);
    if (merge.kind === 'unit') {
      renderMergeUnit(data, fill, border, { left, top, right, bottom }, vals[0]);
      continue;
    }

    // Extend each cell's fill across the grid's gap toward member neighbours, so
    // the block reads as one continuous desk (the export layout has no gaps).
    const g = CELL_GAP / 2;
    const exp = vals.map((b) => ({
      r: b.r, c: b.c,
      x0: b.left - (plan.has(b.r, b.c - 1) ? g : 0),
      y0: b.top - (plan.has(b.r - 1, b.c) ? g : 0),
      x1: b.left + b.width + (plan.has(b.r, b.c + 1) ? g : 0),
      y1: b.top + b.height + (plan.has(b.r + 1, b.c) ? g : 0),
    }));
    const oLeft = Math.min(...exp.map((e) => e.x0));
    const oTop = Math.min(...exp.map((e) => e.y0));
    const oRight = Math.max(...exp.map((e) => e.x1));
    const oBottom = Math.max(...exp.map((e) => e.y1));

    // Filled member rects + an outline of only the edges that border a non-member
    // — the block's outer shape (the rule drawDesk and the export share, so an
    // L/T/+ reads as one connected desk).
    const svg = document.createElementNS(MERGE_SVGNS, 'svg');
    svg.setAttribute('class', 'merge-shape');
    svg.style.left = `${oLeft}px`;
    svg.style.top = `${oTop}px`;
    svg.setAttribute('width', oRight - oLeft);
    svg.setAttribute('height', oBottom - oTop);
    for (const e of exp) {
      const rect = document.createElementNS(MERGE_SVGNS, 'rect');
      rect.setAttribute('x', e.x0 - oLeft);
      rect.setAttribute('y', e.y0 - oTop);
      rect.setAttribute('width', e.x1 - e.x0);
      rect.setAttribute('height', e.y1 - e.y0);
      rect.setAttribute('fill', fill);
      svg.appendChild(rect);
    }
    const lw = Math.max(1.5, Math.min(vals[0].width, vals[0].height) * 0.03);
    for (const e of exp) {
      const x0 = e.x0 - oLeft, y0 = e.y0 - oTop, x1 = e.x1 - oLeft, y1 = e.y1 - oTop;
      const seg = (a1, b1, a2, b2) => {
        const l = document.createElementNS(MERGE_SVGNS, 'line');
        l.setAttribute('x1', a1); l.setAttribute('y1', b1); l.setAttribute('x2', a2); l.setAttribute('y2', b2);
        l.setAttribute('stroke', border); l.setAttribute('stroke-width', lw); l.setAttribute('stroke-linecap', 'square');
        svg.appendChild(l);
      };
      if (!plan.has(e.r - 1, e.c)) seg(x0, y0, x1, y0);
      if (!plan.has(e.r, e.c + 1)) seg(x1, y0, x1, y1);
      if (!plan.has(e.r + 1, e.c)) seg(x0, y1, x1, y1);
      if (!plan.has(e.r, e.c - 1)) seg(x0, y0, x0, y1);
    }
    chart.appendChild(svg);

    // Content. A full rectangle lays out centred like a desk; an L/T/+ puts its
    // labels across the widest run and its icon in the slimmest cell.
    if (plan.isRect) {
      placeMergeContent(data, fill, { left, top, w: right - left, h: bottom - top }, 'both');
    } else {
      if (plan.labelRun) {
        const a = rects.get(keyOf(plan.labelRun.r, plan.labelRun.cStart));
        const z = rects.get(keyOf(plan.labelRun.r, plan.labelRun.cEnd));
        if (a && z) placeMergeContent(data, fill,
          { left: a.left, top: a.top, w: (z.left + z.width) - a.left, h: a.height }, 'labels');
      }
      if (plan.iconCell && data.icon) {
        const ic = rects.get(keyOf(plan.iconCell.r, plan.iconCell.c));
        if (ic) placeMergeContent(data, fill, { left: ic.left, top: ic.top, w: ic.width, h: ic.height }, 'icon');
      }
    }
  }
}

/** One 'unit' merge: a single square (one cell in size) centred in the block, so
 *  a desk can straddle the seam between cells while staying square. */
function renderMergeUnit(data, fill, border, box, sample) {
  const size = Math.min(sample.width, sample.height);
  const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
  const div = document.createElement('div');
  div.className = 'merge-unit';
  div.style.left = `${cx - size / 2}px`;
  div.style.top = `${cy - size / 2}px`;
  div.style.width = `${size}px`;
  div.style.height = `${size}px`;
  div.style.background = fill;
  div.style.borderColor = border;
  div.appendChild(mergeContentInner(data, fill, 'both'));
  chart.appendChild(div);
}

/** The icon/label stack for a merged desk, contrast-corrected against its fill. */
function mergeContentInner(data, fill, which) {
  const inner = document.createElement('div');
  inner.className = 'cell__content';
  inner.style.setProperty('--rot', `${data.rotation || 0}deg`);
  if (data.icon && (which === 'both' || which === 'icon')) {
    const svg = iconUse(data.icon, 'cell__icon', data.iconFill);
    if (svg) { svg.style.color = contrastLabelColor(data.iconColor || '#1f2933', fill); inner.appendChild(svg); }
  }
  if ((which === 'both' || which === 'labels') && (data.labels || []).some((l) => l.text)) {
    const labels = document.createElement('div');
    labels.className = 'cell__labels';
    for (const line of data.labels) {
      if (!line.text) continue;
      const span = document.createElement('span');
      span.className = 'cell__label';
      span.textContent = line.text;
      span.style.color = contrastLabelColor(line.color, fill);
      labels.appendChild(span);
    }
    inner.appendChild(labels);
  }
  return inner;
}

/** An absolutely-positioned content stack over one region of a merged desk. */
function placeMergeContent(data, fill, box, which) {
  const wrap = document.createElement('div');
  wrap.className = 'merge-content';
  wrap.style.left = `${box.left}px`;
  wrap.style.top = `${box.top}px`;
  wrap.style.width = `${box.w}px`;
  wrap.style.height = `${box.h}px`;
  wrap.appendChild(mergeContentInner(data, fill, which));
  chart.appendChild(wrap);
}

// ---------------------------------------------------------------- walls
//
// Walls, railings, doors and windows live on the seams between squares. They are
// drawn (renderWalls) as an SVG overlay of axis-aligned bars — the export twin is
// drawWalls. In walls mode an interactive edge layer (renderWallEdges) sits on top
// so every seam and border can be clicked to place the active wall type.

/** A {x,y,w,h} for cell (r,c) in the chart's own layout px — the shape wallSegment
 *  expects — or null if the cell isn't in the DOM. */
function cellXYWH(r, c) {
  const b = cellLocalRect(r, c);
  return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
}

function makeWallsSvg(cls) {
  const svg = document.createElementNS(MERGE_SVGNS, 'svg');
  svg.setAttribute('class', cls);
  svg.style.left = '0';
  svg.style.top = '0';
  svg.setAttribute('width', chart.clientWidth);
  svg.setAttribute('height', chart.clientHeight);
  return svg;
}

function renderWalls() {
  if (!hasWalls()) return;
  const svg = makeWallsSvg('walls-layer');
  const bar = (x, y, w, h, color) => {
    const rect = document.createElementNS(MERGE_SVGNS, 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', Math.max(0, w)); rect.setAttribute('height', Math.max(0, h));
    rect.setAttribute('fill', color);
    svg.appendChild(rect);
  };
  const rectOf = (r, c) => cellXYWH(r, c);
  for (const [key, type] of Object.entries(state.walls)) {
    const m = /^([hv]):(\d+),(\d+)$/.exec(key);
    if (!m) continue;
    const seg = wallSegment(m[1], Number(m[2]), Number(m[3]), rectOf);
    if (seg && Number.isFinite(seg.cross)) paintWall(seg, type, GRID_SURFACE, bar);
  }
  chart.appendChild(svg);
}

/** The interactive edge layer for walls mode: a clickable strip on every seam and
 *  border. Clicking places the active wall type (see placeWall in walls.js). */
function renderWallEdges() {
  const { rows, cols } = state.grid;
  const svg = makeWallsSvg('wall-edges');
  const rectOf = (r, c) => cellXYWH(r, c);
  const HIT = 14; // px hit thickness across the seam

  const edge = (o, r, c) => {
    const seg = wallSegment(o, r, c, rectOf);
    if (!seg || !Number.isFinite(seg.cross)) return;
    const rect = document.createElementNS(MERGE_SVGNS, 'rect');
    if (o === 'h') { rect.setAttribute('x', seg.a0); rect.setAttribute('y', seg.cross - HIT / 2); rect.setAttribute('width', seg.a1 - seg.a0); rect.setAttribute('height', HIT); }
    else { rect.setAttribute('x', seg.cross - HIT / 2); rect.setAttribute('y', seg.a0); rect.setAttribute('width', HIT); rect.setAttribute('height', seg.a1 - seg.a0); }
    rect.setAttribute('class', wallAt(o, r, c) ? 'wall-edge wall-edge--set' : 'wall-edge');
    rect.addEventListener('click', (e) => { e.stopPropagation(); if (typeof placeWall === 'function') placeWall(o, r, c); });
    svg.appendChild(rect);
  };

  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) edge('h', r, c);
  for (let r = 0; r < rows; r++) for (let c = 0; c <= cols; c++) edge('v', r, c);
  chart.appendChild(svg);
}

// ------------------------------------------------------------ table resizing
//
// Eight handles on a picked table's shape — four corners and four sides. Each
// drag moves its own edges by whole squares, previewing the block it would land
// on, and the table takes that block on release.

const RESIZE_DIRS = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0],
  w:  [0, 0.5],            e:  [1, 0.5],
  sw: [0, 1], s: [0.5, 1], se: [1, 1],
};

/** Turns a point on an unrotated table into where it lands once the table is
 *  turned, so anything attached to the shape travels with it. */
function spinner(table, x1, y1, x2, y2) {
  const rot = ((table.rotation || 0) * Math.PI) / 180;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };
}

function addResizeHandles(table, x1, y1, x2, y2, spin) {
  for (const [dir, [fx, fy]] of Object.entries(RESIZE_DIRS)) {
    const h = document.createElement('button');
    h.type = 'button';
    h.className = `table-handle table-handle--${dir}`;
    h.title = 'Drag to resize the table';
    h.setAttribute('aria-label', h.title);
    const at = spin(x1 + (x2 - x1) * fx, y1 + (y2 - y1) * fy);
    h.style.left = `${at.x}px`;
    h.style.top = `${at.y}px`;
    // The rotation has to sit in the same transform as the centring translate.
    // As a separate `rotate` property it is applied first, which then spins the
    // translate(-50%,-50%) too and slides every grip off its corner.
    if (table.rotation) h.style.transform = `translate(-50%, -50%) rotate(${table.rotation}deg)`;
    attachResizeDrag(h, table, dir);
    chart.appendChild(h);
  }
}

/** A cell's box in the chart's own layout pixels. */
function cellLocalRect(r, c) {
  const el = chart.querySelector(`.cell[data-key="${CSS.escape(keyOf(r, c))}"]`);
  if (!el) return null;
  const chartRect = chart.getBoundingClientRect();
  const zoom = chartZoom();
  const b = el.getBoundingClientRect();
  return { left: (b.left - chartRect.left) / zoom, top: (b.top - chartRect.top) / zoom,
           width: b.width / zoom, height: b.height / zoom };
}

function attachResizeDrag(handle, table, dir) {
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();          // never let it reach the square underneath
    const fp = footprintOf(table.cellKeys);
    const first = cellLocalRect(fp.minR, fp.minC);
    if (!first) return;
    handle.setPointerCapture(e.pointerId);
    const gap = parseFloat(getComputedStyle(chart).gap) || 0;
    drag = { x: e.clientX, y: e.clientY, fp, next: { ...fp }, zoom: chartZoom(),
             stepX: first.width + gap, stepY: first.height + gap };
    drag.preview = document.createElement('div');
    drag.preview.className = 'move-preview';
    chart.appendChild(drag.preview);
    showResizePreview(drag);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dc = Math.round((e.clientX - drag.x) / drag.zoom / drag.stepX);
    const dr = Math.round((e.clientY - drag.y) / drag.zoom / drag.stepY);
    const n = { ...drag.fp };
    if (dir.includes('w')) n.minC += dc;
    if (dir.includes('e')) n.maxC += dc;
    if (dir.includes('n')) n.minR += dr;
    if (dir.includes('s')) n.maxR += dr;
    // An edge never crosses its opposite, and never leaves the grid.
    n.minC = Math.max(0, Math.min(n.minC, n.maxC));
    n.maxC = Math.min(state.grid.cols - 1, Math.max(n.maxC, n.minC));
    n.minR = Math.max(0, Math.min(n.minR, n.maxR));
    n.maxR = Math.min(state.grid.rows - 1, Math.max(n.maxR, n.minR));
    drag.next = n;
    showResizePreview(drag);
  });

  const finish = () => {
    if (!drag) return;
    const n = drag.next;
    drag.preview.remove();
    drag = null;
    resizeTable(table.id, n.minR, n.minC, n.maxR, n.maxC);
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function showResizePreview({ preview, next }) {
  const a = cellLocalRect(next.minR, next.minC);
  const z = cellLocalRect(next.maxR, next.maxC);
  if (!a || !z) return;
  preview.style.left = `${a.left}px`;
  preview.style.top = `${a.top}px`;
  preview.style.width = `${z.left + z.width - a.left}px`;
  preview.style.height = `${z.top + z.height - a.top}px`;
}

/** Re-measure table overlays after layout changes (zoom, resize). */
function refreshTables() {
  chart.querySelectorAll('.table-shape, .table-remove, .table-handle, .move-handle, .merge-shape, .merge-content, .merge-unit, .walls-layer, .wall-edges')
    .forEach((n) => n.remove());
  renderTables();
  renderMerges();
  renderWalls();
  if (typeof isWallsMode === 'function' && isWallsMode()) renderWallEdges();
  renderMoveHandle();
}

