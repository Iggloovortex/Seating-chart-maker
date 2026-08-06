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
  chart.querySelectorAll('.table-shape, .table-remove').forEach((n) => n.remove());
  renderTables();
}
