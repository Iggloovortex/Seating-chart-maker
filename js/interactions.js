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

// Table mode picks TABLES rather than squares. The two modes are mutually
// exclusive — the UI layer (js/tables.js) turns one off when the other goes on.
let tableMode = false;
function setTableMode(on) { tableMode = on; }
function isTableMode() { return tableMode; }

let editHandler = () => {};
function onRequestEdit(fn) { editHandler = fn; }

// Editing a selected square in select mode opens the bulk pane instead.
let bulkEditHandler = () => {};
function onRequestBulkEdit(fn) { bulkEditHandler = fn; }

// Ctrl/Cmd+click adds to the selection even when not in select mode; this hook
// lets the UI turn select mode on so the select bar appears.
let enterSelectHandler = () => {};
function onEnterSelect(fn) { enterSelectHandler = fn; }

// Fired when a user tap in select mode empties the selection, so the UI can
// leave select mode.
let selectionEmptiedHandler = () => {};
function onSelectionEmptied(fn) { selectionEmptiedHandler = fn; }

// Shift+click sizes a rectangle from `anchor` out to `corner`. Keeping the far
// corner lets a repeat click on the same square be recognised as the commit.
let anchor = null;
let corner = null;

/** Forget the range, so the next Shift+click starts a fresh run. */
function resetSelectAnchor() { anchor = null; corner = null; }

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

  // In table mode a tap picks the table drawn over the square. The shapes are
  // pointer-events:none overlays, so the square underneath is what the pointer
  // actually lands on and the table is found from its position.
  if (tableMode) {
    const table = tableAt(r, c);
    if (table) toggleTableSelection(table.id);
    return;
  }

  // Shift+click sizes a rectangle from a fixed anchor, and only commits seating
  // when the same rectangle is clicked twice:
  //   - no run yet          -> anchor here, select this square, no seat change
  //   - a different corner  -> re-size the rect (inside shrinks, outside grows)
  //   - the same corner     -> COMMIT: seat the rect, or empty it if it is
  //                            already fully seated
  // The rect always replaces the selection, so squares outside it are dropped.
  if (shift) {
    enterSelectHandler();

    if (!anchor) {
      anchor = { r, c };
      corner = { r, c };
      setSelectionRange(r, c, r, c);
      return;
    }

    if (corner && corner.r === r && corner.c === c) {
      // Same rectangle again — commit. A rect with any gap fills in; only an
      // already-complete rect empties.
      seatRange(anchor.r, anchor.c, r, c, !allSeatedInRange(anchor.r, anchor.c, r, c));
      return;
    }

    corner = { r, c };
    setSelectionRange(anchor.r, anchor.c, r, c);
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
  // Only clicks made IN select mode start a range. Outside select mode there is
  // no anchor at all, so the first Shift+click always begins a fresh rectangle
  // instead of stretching from whichever square happened to be clicked last.
  if (selectMode) {
    anchor = { r, c };
    corner = { r, c };
  } else {
    anchor = null;
    corner = null;
  }
}

function fireEdit(cell) {
  const [r, c] = parseKey(cell.dataset.key);
  // In select mode, editing a square that's part of the selection edits the
  // whole selection; anything else falls through to the single-square pane.
  if (selectMode && state.selection.has(keyOf(r, c))) {
    bulkEditHandler([...state.selection]);
    return;
  }
  editHandler(r, c);
}
