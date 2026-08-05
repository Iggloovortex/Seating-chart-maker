// grid.js — build/refresh the DOM grid from state (fill, border, icon, label, rotation)
// and render multi-square table overlays.

import { state, keyOf, peekCell, rowWeight, colWeight, parseKey } from './state.js';
import { iconUse } from './icons.js';

const chart = document.getElementById('chart');

/** Full re-render of the grid. Called on any state change. */
export function renderGrid() {
  const { cols, rows } = state.grid;

  // Column/row track sizing uses the per-index weights (empty row/col heights).
  chart.style.gridTemplateColumns =
    Array.from({ length: cols }, (_, c) => `${colWeight(c)}fr`).join(' ');
  chart.style.gridTemplateRows =
    Array.from({ length: rows }, (_, r) => `${rowWeight(r)}fr`).join(' ');

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
      if (svg) content.appendChild(svg);
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
  }
}

/** Re-measure table overlays after layout changes (zoom, resize). */
export function refreshTables() {
  chart.querySelectorAll('.table-shape').forEach((n) => n.remove());
  renderTables();
}
