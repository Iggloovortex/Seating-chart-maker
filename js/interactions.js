// interactions.js — unified pointer handling for mouse + touch.
//  - short tap / left-click  => toggle seat (or toggle selection in select mode)
//  - right-click / long-press => open the edit pane for that cell
// Uses Pointer Events so one code path serves both input types.


const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10; // px of travel that cancels a tap/long-press

let selectMode = false;
function setSelectMode(on) {
  selectMode = on;
  if (!on) anchor = null; // leaving select mode drops the range anchor
}
function isSelectMode() { return selectMode; }

let editHandler = () => {};
function onRequestEdit(fn) { editHandler = fn; }

// Ctrl/Cmd+click adds to the selection even when not in select mode; this hook
// lets the UI turn select mode on so the select bar appears.
let enterSelectHandler = () => {};
function onEnterSelect(fn) { enterSelectHandler = fn; }

// Fired when a user tap in select mode empties the selection, so the UI can
// leave select mode.
let selectionEmptiedHandler = () => {};
function onSelectionEmptied(fn) { selectionEmptiedHandler = fn; }

// Anchor for Shift+click range selection (the last clicked cell).
let anchor = null;

function initInteractions(chartEl) {
  let pointer = null; // { id, x, y, cell, timer, longFired }

  const cellFrom = (target) => target.closest?.('.cell');

  chartEl.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; // right-click handled via contextmenu
    const cell = cellFrom(e.target);
    if (!cell) return;

    const additive = e.ctrlKey || e.metaKey; // Ctrl (Win/Linux) or Cmd (Mac) = add to selection
    const shift = e.shiftKey;                 // Shift = range-select from the anchor
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, cell, longFired: false, timer: 0, additive, shift };
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
    if (!pointer.longFired) fireTap(pointer.cell, { additive: pointer.additive, shift: pointer.shift });
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
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fireTap(cell, {}); }
    else if (e.key.toLowerCase() === 'e') { e.preventDefault(); fireEdit(cell); }
  });
}

function fireTap(cell, mods = {}) {
  const [r, c] = parseKey(cell.dataset.key);
  const { additive, shift } = mods;

  // Shift+click: seat (or unseat) the rectangle from the anchor AND select it.
  // Direction follows the clicked square: empty -> seat the range, seated ->
  // empty the range. Enters select mode so the selection bar shows.
  if (shift) {
    enterSelectHandler();
    const a = anchor || { r, c };
    seatRange(a.r, a.c, r, c, !isEnabled(r, c));
    // Keep the existing anchor so repeated Shift+clicks extend from the same
    // origin; the first Shift+click (no anchor yet) establishes one.
    if (!anchor) anchor = { r, c };
    return;
  }

  if (selectMode) {
    toggleSelection(r, c);
    if (state.selection.size === 0) selectionEmptiedHandler(); // last one deselected
  } else if (additive) {
    enterSelectHandler();     // turn on select mode + show the select bar
    toggleSelection(r, c);
  } else {
    toggleEnabled(r, c);
  }
  anchor = { r, c };
}

function fireEdit(cell) {
  const [r, c] = parseKey(cell.dataset.key);
  editHandler(r, c);
}
