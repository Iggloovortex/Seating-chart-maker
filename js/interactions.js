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
/** Turn select mode on from anywhere (e.g. after a table delete leaves squares
 *  selected), through the same hook Ctrl+click uses. */
function enterSelectMode() { enterSelectHandler(); }

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

  // A unit (centred) merge's member cells are inert; its centred overlay is the
  // live target and carries the anchor's data-key, so resolve it like a cell.
  const cellFrom = (target) => target.closest?.('.cell')
    || target.closest?.('.merge-unit') || target.closest?.('.merge-furniture--live')
    || target.closest?.('.merge-shape') || target.closest?.('.merge-split');
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
    // A unit merge draws ONE centred square; the rest of its footprint is empty
    // surround. That surround must still be grabbable — on a 3-cell desk the square
    // is a third of it, so requiring the press to land on the square is why a wide
    // merge could not be picked up — but a TAP there stays a no-op, so only the
    // square itself seats or empties the desk.
    const mergeHere = typeof mergeAt === 'function' ? mergeAt(...parseKey(cell.dataset.key)) : null;
    const onLive = !!(e.target.closest?.('.merge-unit') || e.target.closest?.('.merge-furniture--live'));
    const unitSurround = !!mergeHere && mergeHere.kind === 'unit' && !onLive;

    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, cell, sub, longFired: false,
                timer: 0, additive, shift, pointerType: e.pointerType, unitSurround };
    // Long-press opens the editor on TOUCH only. On a mouse the gesture belongs to
    // the drag: press, hold, then pull has to pick the square (or desk) up, and a
    // timer firing mid-hold would open the pane instead and kill the drag. Right-
    // click is the desktop way into the editor, so nothing is lost.
    if (e.pointerType !== 'mouse') {
      pointer.timer = window.setTimeout(() => {
        pointer.longFired = true;
        fireEdit(cell, sub);
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
      }, LONG_PRESS_MS);
    }
  });

  chartEl.addEventListener('pointermove', (e) => {
    if (drag) return;                       // a drag listens on the window instead
    if (!pointer || e.pointerId !== pointer.id) return;
    if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > MOVE_TOLERANCE) {
      // On a mouse, pulling a square off its cell picks it up and carries it to
      // another one. Touch keeps the old meaning — the travel is a scroll — so
      // dragging is desktop-only for now.
      const src = dragSourceOf(pointer);
      if (src) startContentDrag(src, pointer, e);
      else {
        const table = canDragTable(pointer);
        if (table && typeof startTableBodyDrag === 'function') {
          window.clearTimeout(pointer.timer);
          startTableBodyDrag(table, e);
          pointer = null;               // the window drag owns the gesture now
        } else cancelPointer();
      }
    }
  });

  const endHandler = (e) => {
    if (drag) return;                       // the window listeners finish a drag
    if (!pointer || e.pointerId !== pointer.id) return;
    window.clearTimeout(pointer.timer);
    if (!pointer.longFired && !pointer.unitSurround) fireTap(pointer.cell, { additive: pointer.additive, shift: pointer.shift, sub: pointer.sub });
    pointer = null;
  };
  chartEl.addEventListener('pointerup', endHandler);
  chartEl.addEventListener('pointercancel', () => { if (!drag) cancelPointer(); });

  function cancelPointer() {
    if (!pointer) return;
    window.clearTimeout(pointer.timer);
    pointer = null;
  }

  // ---------------------------------------------------------------- drag content
  //
  // Press and pull: the thing under the pointer lifts off and follows it, and the
  // landing spot is outlined. A whole square dragged onto another whole square
  // trades places (moveSquare); anything involving a split PIECE swaps CONTENT
  // between the two slots — so content moves piece↔piece, piece↔square and
  // square↔piece. Mouse only; touch keeps its scroll meaning (cut/paste covers it).

  /** What a press would drag: a split PIECE (when it has content), or a whole
   *  non-split square (when it does), or null when nothing/mode owns the gesture.
   *  A table-covered cell is not a content drag (handled elsewhere). */
  function dragSourceOf(p) {
    if (p.additive || p.shift || p.longFired) return null;
    if (p.pointerType !== 'mouse') return null;
    if (selectMode) return null;                     // select mode has its own move handle
    if (typeof isWallsMode === 'function' && isWallsMode()) return null;
    const [r, c] = parseKey(p.cell.dataset.key);
    // A merged desk drags its CONTENT (the anchor), keeping the merge in place —
    // dropContentDrag swaps content rather than moving the cell.
    if (typeof mergeAt === 'function' && mergeAt(r, c)) {
      const [ar, ac] = parseKey(mergeAnchorKey(mergeAt(r, c)));
      const anchor = peekCell(ar, ac);
      // On a desk-split merge, drag the PIECE under the pointer; otherwise the whole
      // desk's content. Either way it is a content swap, so the merge stays put.
      if (p.sub != null && isSplit(anchor)) {
        const sub = subcellAt(ar, ac, p.sub);
        return sub && (sub.enabled || hasContent(sub)) ? { r: ar, c: ac, sub: p.sub, merge: true } : null;
      }
      return cellHasAnyContent(anchor) ? { r: ar, c: ac, sub: null, merge: true } : null;
    }
    if (typeof tableAt === 'function' && tableAt(r, c)) return null;
    const cell = peekCell(r, c);
    if (!cell) return null;
    if (isSplit(cell)) {
      if (p.sub == null) return null;                // a whole split moves via select mode
      const sub = subcellAt(r, c, p.sub);
      return sub && (sub.enabled || hasContent(sub)) ? { r, c, sub: p.sub } : null;
    }
    return (cell.enabled || cellHasAnyContent(cell)) ? { r, c, sub: null } : null;
  }

  /** A plain mouse drag off a table's body moves the whole table, the way a
   *  square drag moves a square. Only outside select mode (which has the grip and
   *  handles) and only when the pressed cell is actually under a table. */
  function canDragTable(p) {
    if (p.additive || p.shift || p.longFired) return null;
    if (p.pointerType !== 'mouse') return null;
    if (selectMode) return null;
    if (typeof isWallsMode === 'function' && isWallsMode()) return null;
    const [r, c] = parseKey(p.cell.dataset.key);
    if (typeof mergeAt === 'function' && mergeAt(r, c)) return null;
    return typeof tableAt === 'function' ? tableAt(r, c) : null;
  }

  function startContentDrag(src, p, e) {
    window.clearTimeout(p.timer);
    const srcEl = (src.sub != null
      ? p.cell.querySelector(`.subcell[data-sub="${src.sub}"]`) : p.cell) || p.cell;
    const rect = srcEl.getBoundingClientRect();
    const ghost = srcEl.cloneNode(true);
    ghost.classList.add('cell--dragging');
    ghost.removeAttribute('data-key');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    drag = { src, ghost, target: null, tkey: null,
             dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    chartEl.classList.add('chart--dragging');
    // Follows the WINDOW so it keeps tracking past the grid's edge and still
    // finishes if released outside it.
    window.addEventListener('pointermove', trackContentDrag, true);
    window.addEventListener('pointerup', dropContentDrag, true);
    window.addEventListener('pointercancel', cancelContentDrag, true);
    trackContentDrag(e);
    pointer = null;
  }

  /** The slot under the pointer — a split piece if one is there, else the cell.
   *  A merged desk IS a drop target: content lands on its anchor (or the piece
   *  under the pointer for a desk-split merge), keeping the merge intact. */
  function slotUnder(clientX, clientY) {
    const under = document.elementFromPoint(clientX, clientY);
    if (!under || !under.closest) return null;
    const subEl = under.closest('.subcell');
    const sub = subEl && subEl.dataset.sub != null ? Number(subEl.dataset.sub) : null;

    // Resolve a merge under the pointer — from a member .cell (poly), or straight
    // from an overlay whose member cells are inert (unit / furniture / split desk).
    let mergeHit = null;
    const cell = under.closest('.cell');
    if (cell && cell.dataset.key) {
      const [cr, cc] = parseKey(cell.dataset.key);
      mergeHit = typeof mergeAt === 'function' ? mergeAt(cr, cc) : null;
      if (!mergeHit) return { key: cell.dataset.key, r: cr, c: cc, sub };
    }
    if (!mergeHit) {
      const mEl = under.closest('.merge-unit, .merge-furniture, .merge-shape, .merge-split, .merge-content');
      if (mEl && mEl.dataset.mergeId) mergeHit = state.merges.find((m) => m.id === mEl.dataset.mergeId);
    }
    // A poly merge's overlay is pointer-events:none and its desk spans the gaps
    // between member cells, so the pointer can land on the bare chart between them.
    // Hit-test the merge overlays geometrically to still resolve the desk.
    if (!mergeHit) {
      for (const el of chartEl.querySelectorAll('.merge-shape[data-merge-id], .merge-unit[data-merge-id], .merge-furniture[data-merge-id], .merge-split[data-merge-id]')) {
        const b = el.getBoundingClientRect();
        if (clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom) {
          mergeHit = state.merges.find((m) => m.id === el.dataset.mergeId);
          if (mergeHit) break;
        }
      }
    }
    if (mergeHit) {
      const [ar, ac] = parseKey(mergeAnchorKey(mergeHit));
      return { key: keyOf(ar, ac), r: ar, c: ac, sub, merge: true, mergeId: mergeHit.id };
    }
    return null;
  }

  function trackContentDrag(e) {
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    drag.ghost.style.visibility = 'hidden';
    const t = slotUnder(e.clientX, e.clientY);
    drag.ghost.style.visibility = '';
    const same = t && t.r === drag.src.r && t.c === drag.src.c &&
                 (t.sub == null ? null : t.sub) === (drag.src.sub == null ? null : drag.src.sub);
    const next = same ? null : t;
    const nextKey = next ? `${next.key}#${next.sub == null ? '' : next.sub}` : null;
    if (nextKey === drag.tkey) return;
    markSlot(drag.target, false);
    drag.target = next;
    drag.tkey = nextKey;
    markSlot(next, true);
  }

  function markSlot(t, on) {
    if (!t) return;
    // A merge target highlights the desk overlay (or the piece under the pointer on
    // a desk-split merge), not the inert member cell.
    if (t.merge) {
      if (t.sub != null) {
        const el = chartEl.querySelector(`.merge-split[data-merge-id="${CSS.escape(t.mergeId)}"] .subcell[data-sub="${t.sub}"]`);
        if (el) el.classList.toggle('subcell--droptarget', on);
      } else {
        chartEl.querySelectorAll(`.merge-unit[data-merge-id="${CSS.escape(t.mergeId)}"], .merge-furniture[data-merge-id="${CSS.escape(t.mergeId)}"], .merge-shape[data-merge-id="${CSS.escape(t.mergeId)}"], .merge-split[data-merge-id="${CSS.escape(t.mergeId)}"]`)
          .forEach((el) => el.classList.toggle('merge--droptarget', on));
      }
      return;
    }
    const el = t.sub != null
      ? chartEl.querySelector(`.cell[data-key="${CSS.escape(t.key)}"] .subcell[data-sub="${t.sub}"]`)
      : chartEl.querySelector(`.cell[data-key="${CSS.escape(t.key)}"]`);
    if (el) el.classList.toggle(t.sub != null ? 'subcell--droptarget' : 'cell--droptarget', on);
  }

  function dropContentDrag() {
    if (!drag) return;
    const { src, target } = drag;
    cancelContentDrag();
    if (!target) return;
    // Anything involving a merge swaps CONTENT with the desk's anchor (or the piece
    // under the pointer), never moving the cell itself — so the merge stays intact.
    if (src.merge || target.merge) { swapContentSlots(src, { r: target.r, c: target.c, sub: target.sub }); return; }
    // Two whole squares trade places (non-destructive, split and all); anything
    // involving a piece swaps CONTENT between the two slots.
    if (src.sub == null && target.sub == null) moveSquare(keyOf(src.r, src.c), target.key);
    else swapContentSlots(src, { r: target.r, c: target.c, sub: target.sub });
  }

  function cancelContentDrag() {
    if (!drag) return;
    markSlot(drag.target, false);
    drag.ghost.remove();
    chartEl.classList.remove('chart--dragging');
    drag = null;
    window.removeEventListener('pointermove', trackContentDrag, true);
    window.removeEventListener('pointerup', dropContentDrag, true);
    window.removeEventListener('pointercancel', cancelContentDrag, true);
  }

  // Desktop right-click => edit. Shift+right-click => the delete menu instead,
  // acting on the whole selection when there is one.
  chartEl.addEventListener('contextmenu', (e) => {
    // The seam's strip covers the band either side of every seam, so a
    // right-click there is not on a square element at all — fall back to the
    // square beside it, or there would be a dead ring around every square.
    const cell = cellFrom(e.target) ||
      (typeof cellNearPoint === 'function' ? cellNearPoint(e.clientX, e.clientY) : null);
    // In walls mode a right-click steps back OUT of it and edits whatever is
    // under the pointer, so there is always a way back to the squares.
    if (typeof isWallsMode === 'function' && isWallsMode()) {
      e.preventDefault();
      setWallsMode(false);
      if (cell) fireEdit(cell, subFrom(e.target));
      return;
    }
    // Right-clicking a WALL from outside walls mode steps into it — the wall is
    // what you are pointing at, so that is what the click should reach. Tested
    // before the square, since the wall is what is in front.
    if (!e.shiftKey && typeof wallAtPoint === 'function' && wallAtPoint(e.clientX, e.clientY)) {
      e.preventDefault();
      setWallsMode(true);
      return;
    }
    if (!cell) return;
    e.preventDefault();
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
  // its own little square, edited through long-press / right-click. But only when
  // we are NOT picking: in select mode (or a Ctrl/Shift gesture) a tap must select
  // the whole square, so a split square can be gathered into a selection and
  // merged like any other.
  if (sub != null && !selectMode && !additive && !shift) {
    const data = peekCell(r, c);
    if (data && isSplit(data)) { toggleSubcell(r, c, sub); return; }
  }

  // A merged desk is one grid-level unit: a plain tap seats or empties the whole
  // desk, just like tapping a square. Editing it is long-press / right-click,
  // which addresses the anchor (see fireEdit).
  if (!selectMode && !shift && !additive) {
    const merge = mergeAt(r, c);
    if (merge) { toggleMergeFilled(merge); return; }
  }

  const picking = selectMode;

  // A pick gathers the WHOLE merge, not the single cell under the pointer, so a
  // merge is selected (and then moved or deleted) as one unit. Shift keeps its
  // rectangle meaning; that is how a merge is swept up alongside other squares.
  if ((picking || additive) && !shift) {
    const merge = mergeAt(r, c);
    if (merge) {
      if (!picking) enterSelectHandler();
      toggleMergeSelection(merge);
      if (state.selection.size === 0) selectionEmptiedHandler();
      return;
    }
  }

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
