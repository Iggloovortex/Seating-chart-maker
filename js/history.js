// history.js — UNDO / REDO via full-state snapshots.
//
// We do not track inverse operations. Instead we lean on serialize() /
// deserialize() (js/state.js), which already round-trip the whole chart. Each
// undo step is a JSON snapshot string; undoing swaps the live state for an
// older snapshot and redoing swaps it back.
//
// Only the CHART is captured — serialize() deliberately omits the view state
// (selection, filters, manualAdd/Drop, tableSelection, showTrueSizes), and we
// carry those across a restore by hand so an undo never moves the user's
// selection.

// Snapshots as JSON strings, so the byte cap below is measurable.
const past = [];      // older states; the top is the state before the last edit
const future = [];    // states we undid past; redo pops from here
let baseline = null;  // JSON snapshot of the CURRENT committed state

const HISTORY_MAX_STEPS = 100;                 // cap the depth …
const HISTORY_MAX_BYTES = 10 * 1024 * 1024;    // … and the total size (~10 MB)
const HISTORY_DEBOUNCE_MS = 400;               // a burst of edits = one step

let historyReady = false;   // false until initHistory(); checkpoints no-op before it
let restoring = false;      // true while deserialize() replays a snapshot
let commitTimer = 0;        // pending trailing-debounce record

function snapshot() { return JSON.stringify(serialize()); }

function historyBytes() {
  let n = baseline ? baseline.length : 0;
  for (const s of past) n += s.length;
  for (const s of future) n += s.length;
  return n;
}

// Drop the oldest steps until both caps are satisfied, whichever binds first.
function enforceHistoryCaps() {
  while (past.length > HISTORY_MAX_STEPS) past.shift();
  while (past.length && historyBytes() > HISTORY_MAX_BYTES) past.shift();
}

// Commit the current state as a discrete undo step. A no-op when nothing
// actually changed (e.g. a selection-only emit leaves serialize() identical),
// which is what keeps view-only changes out of the undo stack.
function commitHistory() {
  clearTimeout(commitTimer);
  commitTimer = 0;
  if (restoring || !historyReady) return;
  const snap = snapshot();
  if (snap === baseline) return;   // no meaningful change
  past.push(baseline);
  baseline = snap;
  future.length = 0;               // a fresh edit drops the redo stack
  enforceHistoryCaps();
  updateHistoryButtons();
}

// Subscribed to state: every change (re)arms the trailing debounce so a run of
// keystrokes collapses into a single undo step.
function onHistoryChange() {
  if (restoring || !historyReady) return;
  clearTimeout(commitTimer);
  commitTimer = window.setTimeout(commitHistory, HISTORY_DEBOUNCE_MS);
}

/** Force any pending debounced edit to be recorded NOW. Called at the top of
 *  structural mutations (insert/delete line, add/remove table, Clear Grid,
 *  paste, file open) so the pre-op state is its own undo step. No-op during a
 *  restore or before init. */
function historyCheckpoint() {
  if (restoring || !historyReady) return;
  if (commitTimer) commitHistory();
}

// Replace the live chart with a snapshot, preserving the user's view state.
// deserialize() clears filters/manualAdd/manualDrop/tableSelection, so we grab
// them first and put them back, then emit once more to recompute the selection.
function restoreSnapshot(str) {
  restoring = true;
  const view = {
    manualAdd: new Set(state.manualAdd),
    manualDrop: new Set(state.manualDrop),
    filters: new Set(state.filters),
    tableSelection: new Set(state.tableSelection),
    showTrueSizes: state.showTrueSizes,
  };
  deserialize(JSON.parse(str));
  state.manualAdd = view.manualAdd;
  state.manualDrop = view.manualDrop;
  state.filters = view.filters;
  state.tableSelection = view.tableSelection;
  state.showTrueSizes = view.showTrueSizes;
  pruneSelection();                 // drop selection keys now off-grid
  // Drop table-selection ids whose table no longer exists.
  const ids = new Set(state.tables.map((t) => t.id));
  for (const id of [...state.tableSelection]) if (!ids.has(id)) state.tableSelection.delete(id);
  emit();                           // recompute derived selection + re-render
  restoring = false;
  // Keep toolbar inputs (grid size, paper, title, defaults) in step.
  if (typeof reflectControls === 'function') reflectControls();
}

function undo() {
  if (restoring) return;
  if (commitTimer) commitHistory();  // fold any in-flight edit in first
  if (!past.length) return;
  future.push(baseline);
  baseline = past.pop();
  restoreSnapshot(baseline);
  updateHistoryButtons();
}

function redo() {
  if (restoring) return;
  if (commitTimer) commitHistory();
  if (!future.length) return;
  past.push(baseline);
  baseline = future.pop();
  restoreSnapshot(baseline);
  updateHistoryButtons();
}

/** Wipe the undo/redo stacks — used by "New" (a full reset that can't be undone
 *  unless the chart was saved or exported). */
function clearHistory() {
  past.length = 0;
  future.length = 0;
  baseline = snapshot();
  updateHistoryButtons();
}

let undoBtn, redoBtn;
function updateHistoryButtons() {
  if (!undoBtn) return;
  undoBtn.disabled = past.length === 0;
  redoBtn.disabled = future.length === 0;
  undoBtn.title = past.length ? 'Undo' : 'Nothing to undo';
  redoBtn.title = future.length ? 'Redo' : 'Nothing to redo';
}

// Don't hijack the browser's own undo inside a text field.
function inTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function initHistory() {
  undoBtn = document.getElementById('btn-undo');
  redoBtn = document.getElementById('btn-redo');
  baseline = snapshot();            // the state we start from (post-restore)
  historyReady = true;

  subscribe(onHistoryChange);       // record edits (debounced)
  subscribe(updateHistoryButtons);  // keep buttons in step on every emit

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || inTextField(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });

  updateHistoryButtons();
}
