// interactions.js — unified pointer handling for mouse + touch.
//  - short tap / left-click  => toggle seat (or toggle selection in select mode)
//  - right-click / long-press => open the edit pane for that cell
// Uses Pointer Events so one code path serves both input types.

import { toggleEnabled, toggleSelection, parseKey } from './state.js';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10; // px of travel that cancels a tap/long-press

let selectMode = false;
export function setSelectMode(on) { selectMode = on; }
export function isSelectMode() { return selectMode; }

let openEditor = () => {};
export function onRequestEdit(fn) { openEditor = fn; }

export function initInteractions(chartEl) {
  let pointer = null; // { id, x, y, cell, timer, longFired }

  const cellFrom = (target) => target.closest?.('.cell');

  chartEl.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; // right-click handled via contextmenu
    const cell = cellFrom(e.target);
    if (!cell) return;

    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, cell, longFired: false, timer: 0 };
    pointer.timer = window.setTimeout(() => {
      pointer.longFired = true;
      fireEdit(cell);
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
    }, LONG_PRESS_MS);
  });

  chartEl.addEventListener('pointermove', (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > MOVE_TOLERANCE) {
      cancelPointer(); // treat as a scroll, not a tap
    }
  });

  const endHandler = (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    window.clearTimeout(pointer.timer);
    if (!pointer.longFired) fireTap(pointer.cell);
    pointer = null;
  };
  chartEl.addEventListener('pointerup', endHandler);
  chartEl.addEventListener('pointercancel', () => cancelPointer());

  function cancelPointer() {
    if (!pointer) return;
    window.clearTimeout(pointer.timer);
    pointer = null;
  }

  // Desktop right-click => edit.
  chartEl.addEventListener('contextmenu', (e) => {
    const cell = cellFrom(e.target);
    if (!cell) return;
    e.preventDefault();
    fireEdit(cell);
  });

  // Keyboard: Enter/Space toggles a focused cell; "e" edits it.
  chartEl.addEventListener('keydown', (e) => {
    const cell = cellFrom(e.target);
    if (!cell) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fireTap(cell); }
    else if (e.key.toLowerCase() === 'e') { e.preventDefault(); fireEdit(cell); }
  });
}

function fireTap(cell) {
  const [r, c] = parseKey(cell.dataset.key);
  if (selectMode) toggleSelection(r, c);
  else toggleEnabled(r, c);
}

function fireEdit(cell) {
  const [r, c] = parseKey(cell.dataset.key);
  openEditor(r, c);
}
