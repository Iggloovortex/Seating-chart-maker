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

/** Full re-render of the grid. Called on any state change. */
function renderGrid() {
  const { cols, rows } = state.grid;

  // All cells share one square size, so the grid stays uniform as content grows.
  const size = uniformCellSize();
  chart.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
  chart.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;

  chart.replaceChildren();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      chart.appendChild(buildCell(r, c));
    }
  }

  renderTables();
  renderMoveHandle();
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
    moveSelection(dr, dc); // false (no change) when it would leave the grid
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function buildCell(r, c) {
  const key = keyOf(r, c);
  const data = peekCell(r, c);
  const el = document.createElement('div');
  el.className = 'cell';
  el.dataset.r = r;
  el.dataset.c = c;
  el.dataset.key = key;
  el.setAttribute('role', 'gridcell');
  el.tabIndex = -1;

  if (state.selection.has(key)) el.classList.add('cell--selected');

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
