// tables.js — table-select mode UI: build a table shape from selected squares.

import { state, addTable, clearSelection, removeTable, subscribe } from './state.js';
import { setSelectMode } from './interactions.js';

export function initTables() {
  const selectBtn = document.getElementById('btn-select');
  const bar = document.getElementById('select-bar');
  const countEl = document.getElementById('select-count');
  const colorInput = document.getElementById('table-color');
  const stageHint = document.getElementById('stage-hint');

  let active = false;

  const setActive = (on) => {
    active = on;
    setSelectMode(on);
    selectBtn.setAttribute('aria-pressed', String(on));
    bar.hidden = !on;
    if (!on) clearSelection();
    stageHint.style.display = on ? 'none' : '';
  };

  selectBtn.addEventListener('click', () => setActive(!active));

  document.getElementById('btn-table-round').addEventListener('click', () => {
    addTable('round', colorInput.value);
  });
  document.getElementById('btn-table-square').addEventListener('click', () => {
    addTable('square', colorInput.value);
  });
  document.getElementById('btn-select-clear').addEventListener('click', () => clearSelection());

  // Keep the selection counter in sync.
  subscribe(() => {
    if (!active) return;
    const n = state.selection.size;
    countEl.textContent = `${n} selected`;
  });

  // Double-click / double-tap a table shape removes it.
  document.getElementById('chart').addEventListener('dblclick', (e) => {
    const shape = e.target.closest?.('.table-shape');
    if (shape) removeTable(shape.dataset.tableId);
  });
}
