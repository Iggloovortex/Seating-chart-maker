// grid.js — build/refresh the DOM grid from state (fill, border, icon, label, rotation)
// and render multi-square table overlays.


const chart = document.getElementById('chart');

// Live editing grid uses ONE uniform square size for every cell (row/column
// weights are output-only). The base fits ~2 label lines of 10 characters, so
// basic use never resizes; when any cell needs more, they all grow together.
const CELL_BASE = 88;      // px — fits 2 lines × 10 chars (+icon)
const CHAR_W = 7.2;        // approx px per label character at the grid font
const PAD = 16;            // inner padding allowance
const LINE_H = 16;         // px per label line
const ICON_RESERVE = 40;   // px reserved for an icon above labels

/** Uniform square cell size (px) needed to hold the largest cell's content. */
function uniformCellSize() {
  const { cols, rows } = state.grid;
  let maxChars = 10, maxLines = 2, anyIcon = false;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = peekCell(r, c);
      if (!d || !d.enabled) continue;
      if (d.icon) anyIcon = true;
      const lines = (d.labels || []).filter((l) => l.text);
      maxLines = Math.max(maxLines, lines.length);
      for (const l of lines) maxChars = Math.max(maxChars, l.text.length);
    }
  }
  const neededW = maxChars * CHAR_W + PAD;
  const neededH = PAD + (anyIcon ? ICON_RESERVE : 0) + maxLines * LINE_H;
  return Math.round(Math.max(CELL_BASE, neededW, neededH));
}

const CHART_PAD = 4;   // .chart padding, in px
const CELL_GAP = 4;    // .chart gap, in px
const BADGE_PAD = 5;   // inset for a badge inside a shape (matches .cell__check)
const TABLE_BADGE = 24; // .table-remove size, in px

/** Full re-render of the grid. Called on any state change. */
function renderGrid() {
  const { cols, rows } = state.grid;

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
  renderTables();
  renderMoveHandle();
  buildInsertGuides();
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
  // Table mode picks squares too, so the handle belongs there just as much.
  const picking = (typeof isSelectMode === 'function' && isSelectMode()) ||
                  (typeof isTableMode === 'function' && isTableMode());
  if (!picking) return;
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

  // A square that has been emptied but still holds a label or an icon shows them
  // faded, so somewhere you have used before stays recognisable. Grid only — the
  // output draws nothing at all for an empty square.
  const ghost = !!(data && !data.enabled && hasContent(data));

  if (data && (data.enabled || ghost)) {
    if (data.enabled) {
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
        svg.style.color = data.iconColor || '#1f2933'; // drives currentColor in the icon
        // Chairs preview at their chair size, matching the scaled-down output.
        if (data.icon === 'chair') svg.style.width = `${Math.round(60 * CHAIR_SCALE)}%`;
        content.appendChild(svg);
      }
    }

    if (data.labels && data.labels.length) {
      const labels = document.createElement('div');
      labels.className = 'cell__labels';
      for (const line of data.labels) {
        if (!line.text) continue;
        const span = document.createElement('span');
        span.className = 'cell__label';
        span.textContent = line.text;
        span.style.color = line.color;
        labels.appendChild(span);
      }
      content.appendChild(labels);
    }
    el.appendChild(content);
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
    if (state.tableSelection.has(table.id) && typeof isTableMode === 'function' && isTableMode()) {
      addResizeHandles(table, left + inset, top + inset, right - inset, bottom - inset, spin);
    }
  }
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
  chart.querySelectorAll('.table-shape, .table-remove, .table-handle, .move-handle')
    .forEach((n) => n.remove());
  renderTables();
  renderMoveHandle();
}

