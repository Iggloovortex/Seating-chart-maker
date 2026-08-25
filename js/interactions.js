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

// Editing a selected square in select mode opens the bulk pane instead.
let bulkEditHandler = () => {};
function onRequestBulkEdit(fn) { bulkEditHandler = fn; }

// Ctrl/Cmd+click adds to the selection even when not in select mode; this hook
// lets the UI turn select mode on so the select bar appears.
let enterSelectHandler = () => {};
function onEnterSelect(fn) { enterSelectHandler = fn; }

// The same shortcut landing on a TABLE picks the table, so one gesture reaches
// whichever thing is actually under the pointer.
let enterTableHandler = () => {};
function onEnterTable(fn) { enterTableHandler = fn; }

// Fired when a user tap in select mode empties the selection, so the UI can
// leave select mode.
let selectionEmptiedHandler = () => {};
function onSelectionEmptied(fn) { selectionEmptiedHandler = fn; }

// Shift+click sizes a rectangle from `anchor` out to `corner`. Keeping the far
// corner lets a repeat click on the same square be recognised as the commit.
let anchor = null;
let corner = null;

// Ctrl+Shift runs a separate, additive line: `lineAnchor` is where the current
// line starts and `lineKeys` is exactly what that line put into the selection,
// so re-sizing it can take its own squares back without disturbing the lines
// added before it.
let lineAnchor = null;
let lineKeys = [];

/** Forget both runs, so the next Shift+click starts fresh. */
function resetSelectAnchor() {
  anchor = null;
  corner = null;
  lineAnchor = null;
  lineKeys = [];
}

function initInteractions(chartEl) {
  let pointer = null; // { id, x, y, cell, timer, longFired }
  let drag = null;    // a square being carried to another cell (mouse only)

  const cellFrom = (target) => target.closest?.('.cell');
  // Which sub-cell of a split square the pointer is over, or null.
  const subFrom = (target) => {
    const el = target.closest?.('.subcell');
    return el ? Number(el.dataset.sub) : null;
  };

  chartEl.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; // right-click handled via contextmenu
    // In walls mode the grid's edge layer handles clicks; squares don't respond.
    if (typeof isWallsMode === 'function' && isWallsMode()) return;
    const cell = cellFrom(e.target);
    if (!cell) return;

    const additive = e.ctrlKey || e.metaKey; // Ctrl (Win/Linux) or Cmd (Mac) = add to selection
    const shift = e.shiftKey;                 // Shift = range-select from the anchor
    const sub = subFrom(e.target);
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, cell, sub, longFired: false,
                timer: 0, additive, shift, pointerType: e.pointerType };
    pointer.timer = window.setTimeout(() => {
      pointer.longFired = true;
      fireEdit(cell, sub);
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
    }, LONG_PRESS_MS);
  });

  chartEl.addEventListener('pointermove', (e) => {
    if (drag) return;                       // a drag listens on the window instead
    if (!pointer || e.pointerId !== pointer.id) return;
    if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > MOVE_TOLERANCE) {
      // On a mouse, pulling a square off its cell picks it up and carries it to
      // another one. Touch keeps the old meaning — the travel is a scroll — so
      // dragging is desktop-only for now.
      if (canDragSquare(pointer)) startSquareDrag(pointer, e);
      else cancelPointer();
    }
  });

  const endHandler = (e) => {
    if (drag) return;                       // the window listeners finish a drag
    if (!pointer || e.pointerId !== pointer.id) return;
    window.clearTimeout(pointer.timer);
    if (!pointer.longFired) fireTap(pointer.cell, { additive: pointer.additive, shift: pointer.shift, sub: pointer.sub });
    pointer = null;
  };
  chartEl.addEventListener('pointerup', endHandler);
  chartEl.addEventListener('pointercancel', () => { if (!drag) cancelPointer(); });

  function cancelPointer() {
    if (!pointer) return;
    window.clearTimeout(pointer.timer);
    pointer = null;
  }

  // ---------------------------------------------------------------- drag a square
  //
  // Press a square and pull: it lifts off and follows the pointer, and the cell
  // under it is outlined as the landing spot. Letting go swaps the two squares —
  // an empty target simply receives it, an occupied one trades places — so a drag
  // can rearrange a chart without ever destroying anything. The WHOLE square
  // travels, a split square and all of its pieces included.

  /** Only a plain mouse drag off a square that actually holds something, and only
   *  while no other mode owns the gesture. A merged square is skipped: it is one
   *  desk spanning several cells, so moving a single cell of it is meaningless. */
  function canDragSquare(p) {
    if (p.additive || p.shift || p.longFired) return false;
    if (p.pointerType !== 'mouse') return false;
    if (selectMode) return false;                    // select mode has its own move handle
    if (typeof isWallsMode === 'function' && isWallsMode()) return false;
    const [r, c] = parseKey(p.cell.dataset.key);
    if (typeof mergeAt === 'function' && mergeAt(r, c)) return false;
    if (typeof tableAt === 'function' && tableAt(r, c)) return false;
    const cell = peekCell(r, c);
    return !!(cell && (cell.enabled || cellHasAnyContent(cell)));
  }

  function startSquareDrag(p, e) {
    window.clearTimeout(p.timer);
    const rect = p.cell.getBoundingClientRect();
    const ghost = p.cell.cloneNode(true);
    ghost.classList.add('cell--dragging');
    ghost.removeAttribute('data-key');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    drag = { from: p.cell.dataset.key, ghost, target: null,
             dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    chartEl.classList.add('chart--dragging');
    // The square can be carried anywhere on the page, so the drag follows the
    // WINDOW rather than the chart — it keeps tracking past the grid's edge and
    // still finishes if the pointer is released outside it.
    window.addEventListener('pointermove', trackSquareDrag, true);
    window.addEventListener('pointerup', dropSquareDrag, true);
    window.addEventListener('pointercancel', cancelSquareDrag, true);
    trackSquareDrag(e);
    pointer = null;
  }

  function trackSquareDrag(e) {
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    // The ghost sits under the pointer, so ask what is beneath IT, not the event.
    drag.ghost.style.visibility = 'hidden';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    drag.ghost.style.visibility = '';
    const cell = under && under.closest ? under.closest('.cell') : null;
    const key = cell && cell.dataset.key !== drag.from ? cell.dataset.key : null;
    if (key === drag.target) return;
    markDropTarget(drag.target, false);
    drag.target = key;
    markDropTarget(key, true);
  }

  function markDropTarget(key, on = true) {
    if (!key) return;
    const el = chartEl.querySelector(`.cell[data-key="${CSS.escape(key)}"]`);
    if (el) el.classList.toggle('cell--droptarget', on);
  }

  function dropSquareDrag() {
    if (!drag) return;
    const { from, target } = drag;
    cancelSquareDrag();
    if (target) moveSquare(from, target);
  }

  function cancelSquareDrag() {
    if (!drag) return;
    markDropTarget(drag.target, false);
    drag.ghost.remove();
    chartEl.classList.remove('chart--dragging');
    drag = null;
    window.removeEventListener('pointermove', trackSquareDrag, true);
    window.removeEventListener('pointerup', dropSquareDrag, true);
    window.removeEventListener('pointercancel', cancelSquareDrag, true);
  }

  // Desktop right-click => edit. Shift+right-click => the delete menu instead,
  // acting on the whole selection when there is one.
  chartEl.addEventListener('contextmenu', (e) => {
    const cell = cellFrom(e.target);
    // In walls mode a right-click steps back OUT of it and edits whatever is
    // under the pointer, so there is always a way back to the squares.
    if (typeof isWallsMode === 'function' && isWallsMode()) {
      e.preventDefault();
      setWallsMode(false);
      if (cell) fireEdit(cell, subFrom(e.target));
      return;
    }
    if (!cell) return;
    e.preventDefault();
    // Right-clicking a WALL from outside walls mode steps into it — the wall is
    // what you are pointing at, so that is what the click should reach.
    if (!e.shiftKey && typeof wallAtPoint === 'function' && wallAtPoint(e.clientX, e.clientY)) {
      setWallsMode(true);
      return;
    }
    if (e.shiftKey) {
      const [r, c] = parseKey(cell.dataset.key);
      const keys = state.selection.size ? [...state.selection] : [keyOf(r, c)];
      openDeleteMenu(e.clientX, e.clientY, { keys, r, c });
      return;
    }
    fireEdit(cell, subFrom(e.target));
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
  const { additive, shift, sub } = mods;

  // A tap on a piece of a split square fills or empties just that piece — it is
  // its own little square, edited through long-press / right-click.
  if (sub != null) {
    const data = peekCell(r, c);
    if (data && isSplit(data)) { toggleSubcell(r, c, sub); return; }
  }

  // A merged desk is one object: a plain tap opens its editor (there is no single
  // square to fill/empty). In select mode a tap still picks the cell, so a
  // rectangle can gather the whole group to move or delete it.
  if (!selectMode && !shift && !additive) {
    const merge = mergeAt(r, c);
    if (merge) { const [ar, ac] = parseKey(mergeAnchorKey(merge)); openEditor(ar, ac); return; }
  }

  const picking = selectMode;

  // A click that lands on a table picks the TABLE, not the square hiding under
  // it — the table is what you can see there, so it is what a click should mean.
  // Plain and Ctrl/Cmd clicks agree on this; the difference is only that Ctrl
  // reaches for a table without otherwise disturbing a square selection. Covered
  // squares stay editable through right-click / long-press, which addresses the
  // square by its key rather than by what is drawn over it.
  //
  // The shapes are pointer-events:none overlays, so the square underneath is what
  // the pointer actually lands on and the table is found from its position.
  if (!shift) {
    const table = tableAt(r, c);
    if (table) {
      if (!selectMode) enterTableHandler();
      toggleTableSelection(table.id);
      return;
    }
  }

  // Ctrl+Shift ADDS a line to whatever is already selected, rather than replacing
  // it. Clicks sharing the anchor's row or column stretch the line; a diagonal
  // click keeps every line already added and starts a new one where it landed —
  // dropping the old anchor only when nothing ever grew from it, so a stray
  // single square is not left behind.
  if (shift && additive) {
    if (!picking) enterSelectHandler();

    if (!lineAnchor) {
      lineAnchor = { r, c };
      lineKeys = addLineRange(r, c, r, c);
      return;
    }

    // Once a line exists, only a click INSIDE it re-sizes it; anywhere else —
    // even along the same row — starts a fresh line, so consecutive runs down
    // one column do not keep swallowing each other.
    const started = lineKeys.length > 1;
    const inside = lineKeys.includes(keyOf(r, c));
    const sameLine = r === lineAnchor.r || c === lineAnchor.c;
    if (sameLine && (!started || inside)) {
      deselectKeys(lineKeys);                    // re-size: take this line back
      lineKeys = addLineRange(lineAnchor.r, lineAnchor.c, r, c);
      return;
    }

    if (lineKeys.length === 1) deselectKeys(lineKeys);
    lineAnchor = { r, c };
    lineKeys = addLineRange(r, c, r, c);
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
    if (!picking) enterSelectHandler();
    lineAnchor = null; lineKeys = [];   // a rectangle run ends any line run

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

  if (picking) {
    toggleSelection(r, c);
    // Emptying the selection leaves select mode, unless a table is still picked.
    if (state.selection.size === 0) selectionEmptiedHandler();
  } else if (additive) {
    enterSelectHandler();     // turn on select mode + show the select bar
    toggleSelection(r, c);
  } else {
    toggleEnabled(r, c);
  }
  // Only clicks made while PICKING start a range. Outside those modes there is
  // no anchor at all, so the first Shift+click always begins a fresh rectangle
  // instead of stretching from whichever square happened to be clicked last.
  if (picking) {
    anchor = { r, c };
    corner = { r, c };
  } else {
    anchor = null;
    corner = null;
  }
}

function fireEdit(cell, sub = null) {
  const [r, c] = parseKey(cell.dataset.key);
  // A piece of a split square opens its own edit pane.
  if (sub != null) {
    const data = peekCell(r, c);
    if (data && isSplit(data)) { openEditor(r, c, sub); return; }
  }
  // Editing any cell of a merged desk edits the merge's anchor (its content).
  const merge = mergeAt(r, c);
  if (merge) { const [ar, ac] = parseKey(mergeAnchorKey(merge)); editHandler(ar, ac); return; }
  // In select mode, editing a square that's part of the selection edits the
  // whole selection; anything else falls through to the single-square pane.
  if (selectMode && state.selection.has(keyOf(r, c))) {
    bulkEditHandler([...state.selection]);
    return;
  }
  editHandler(r, c);
}
