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
// Hovering near a grid line reveals a thin rule along it with a + at each end;
// clicking either + inserts a row or column there. Only the line nearest the
// pointer shows, and only while the pointer is close to it.

const INSERT_REACH = 14;     // px from a grid line that reveals its guide
let movingSelection = false; // true while the selection is being dragged
let rowGuide = null, colGuide = null;

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

function buildInsertGuides() {
  rowGuide = makeGuide('row');
  colGuide = makeGuide('col');
}

/** Boundary offsets (relative to .chart) for each grid line, plus the span the
 *  guide should cover. Boundary i sits before row/col i; the last is the far edge. */
function boundaries(axis) {
  const { rows, cols } = state.grid;
  const n = axis === 'row' ? rows : cols;
  const chartRect = chart.getBoundingClientRect();
  const out = [];
  for (let i = 0; i <= n; i++) {
    const at = Math.min(i, n - 1);
    const el = chart.querySelector(`.cell[data-key="${CSS.escape(axis === 'row' ? keyOf(at, 0) : keyOf(0, at))}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    const lead = axis === 'row' ? r.top - chartRect.top : r.left - chartRect.left;
    const tail = axis === 'row' ? r.bottom - chartRect.top : r.right - chartRect.left;
    out.push(i < n ? lead : tail);
  }
  return out;
}

/** Show the guide for whichever grid line the pointer is closest to. Only ONE
 *  axis shows at a time: at a grid corner a row and a column boundary coincide,
 *  and their + buttons would otherwise land on top of each other. */
function updateInsertGuides(e) {
  if (!rowGuide || !colGuide || movingSelection) return;
  const chartRect = chart.getBoundingClientRect();
  const x = e.clientX - chartRect.left;
  const y = e.clientY - chartRect.top;
  const zoom = parseFloat(getComputedStyle(chart).getPropertyValue('--zoom')) || 1;
  const reach = INSERT_REACH * zoom;

  // Nearest boundary on each axis, and how far the pointer is from it.
  const nearest = (axis, along, across) => {
    const bs = boundaries(axis);
    if (!bs.length) return null;
    let best = 0, bestD = Infinity;
    bs.forEach((pos, i) => { const d = Math.abs(along - pos); if (d < bestD) { bestD = d; best = i; } });
    const span = axis === 'row' ? chart.clientWidth : chart.clientHeight;
    const beside = across >= -reach && across <= span + reach;
    return bestD <= reach && beside ? { index: best, pos: bs[best], dist: bestD } : null;
  };

  const row = nearest('row', y, x);
  const col = nearest('col', x, y);
  // Whichever line the pointer is closer to wins; ties go to the row.
  const showRow = row && (!col || row.dist <= col.dist);
  const showCol = col && !showRow;

  rowGuide.hidden = !showRow;
  colGuide.hidden = !showCol;
  if (showRow) { rowGuide.dataset.index = String(row.index); rowGuide.style.top = `${row.pos}px`; }
  if (showCol) { colGuide.dataset.index = String(col.index); colGuide.style.left = `${col.pos}px`; }
}

function hideInsertGuides() {
  if (rowGuide) rowGuide.hidden = true;
  if (colGuide) colGuide.hidden = true;
}

/** Wire the hover behaviour once; the stage is bigger than the chart so the
 *  guides can also be reached from just outside its edges. */
function initInsertGuides(stageEl) {
  stageEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;   // touch has no hover to key off
    // While the pointer is on a guide, leave it be — otherwise reaching for a
    // + would recompute and slide the button out from under the cursor.
    if (e.target.closest && e.target.closest('.insert-guide')) return;
    updateInsertGuides(e);
  });
  stageEl.addEventListener('pointerleave', hideInsertGuides);
}

/** Corner grab handle for dragging the whole selection to a new spot. Shown at
 *  the top-left of the selection's bounding box while in select mode. */
function renderMoveHandle() {
  if (typeof isSelectMode === 'function' && !isSelectMode()) return;
  const box = selectionBounds();
  if (!box) return;

  const first = chart.querySelector(`.cell[data-key="${CSS.escape(keyOf(box.minR, box.minC))}"]`);
  const last = chart.querySelector(`.cell[data-key="${CSS.escape(keyOf(box.maxR, box.maxC))}"]`);
  if (!first || !last) return;

  const chartRect = chart.getBoundingClientRect();
  const a = first.getBoundingClientRect();
  const z = last.getBoundingClientRect();
  const left = a.left - chartRect.left;
  const top = a.top - chartRect.top;
  const width = z.right - a.left;
  const height = z.bottom - a.top;

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'move-handle';
  handle.title = 'Drag to move the selection';
  handle.setAttribute('aria-label', 'Move selection');
  handle.textContent = '✥';
  handle.style.left = `${left}px`;
  handle.style.top = `${top}px`;
  chart.appendChild(handle);

  attachMoveDrag(handle, { left, top, width, height, box, cellW: a.width, cellH: a.height });
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
    // Step includes the grid gap, and is measured live so zoom is accounted for.
    const gap = parseFloat(getComputedStyle(chart).gap) || 0;
    drag = { x: e.clientX, y: e.clientY, dr: 0, dc: 0, stepX: geo.cellW + gap, stepY: geo.cellH + gap };

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
    drag.dc = Math.round((e.clientX - drag.x) / drag.stepX);
    drag.dr = Math.round((e.clientY - drag.y) / drag.stepY);
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

  if (data && data.enabled) {
    el.classList.add('cell--on');
    el.style.background = data.fill;
    el.style.borderColor = data.border;

    const content = document.createElement('div');
    content.className = 'cell__content';
    content.style.setProperty('--rot', `${data.rotation || 0}deg`);

    if (data.icon) {
      const svg = iconUse(data.icon);
      if (svg) {
        svg.style.color = data.iconColor || '#1f2933'; // drives currentColor in the icon
        // Chairs preview at their chair size, matching the scaled-down output.
        if (data.icon === 'chair') {
          const scale = data.chairScale || 0.7;
          svg.style.width = `${Math.round(60 * scale)}%`;
        }
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
    el.setAttribute('aria-label', ariaLabel(r, c, data));
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
  // Measure once relative to the chart's padded content box.
  const chartRect = chart.getBoundingClientRect();

  for (const table of state.tables) {
    const rects = table.cellKeys
      .map((k) => chart.querySelector(`.cell[data-key="${CSS.escape(k)}"]`))
      .filter(Boolean)
      .map((el) => el.getBoundingClientRect());
    if (!rects.length) continue;

    const left = Math.min(...rects.map((b) => b.left)) - chartRect.left;
    const top = Math.min(...rects.map((b) => b.top)) - chartRect.top;
    const right = Math.max(...rects.map((b) => b.right)) - chartRect.left;
    const bottom = Math.max(...rects.map((b) => b.bottom)) - chartRect.top;

    const inset = 6; // transparent spacing so the shape never touches borders
    const shape = document.createElement('div');
    shape.className = `table-shape table-shape--${table.shape}`;
    shape.style.left = `${left + inset}px`;
    shape.style.top = `${top + inset}px`;
    shape.style.width = `${right - left - inset * 2}px`;
    shape.style.height = `${bottom - top - inset * 2}px`;
    shape.style.background = table.color;
    shape.dataset.tableId = table.id;
    chart.appendChild(shape);

    // Remove button — the shape itself is pointer-events:none, so this button
    // (pointer-events:auto) is how a table gets deleted. Placed at its top-right.
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'table-remove';
    del.textContent = '✕';
    del.title = 'Remove table';
    del.setAttribute('aria-label', 'Remove table');
    del.style.left = `${right - inset - 12}px`;
    del.style.top = `${top + inset - 12}px`;
    del.addEventListener('click', (e) => { e.stopPropagation(); removeTable(table.id); });
    chart.appendChild(del);
  }
}

/** Re-measure table overlays after layout changes (zoom, resize). */
function refreshTables() {
  chart.querySelectorAll('.table-shape, .table-remove, .move-handle').forEach((n) => n.remove());
  renderTables();
  renderMoveHandle();
}

