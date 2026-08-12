// filters.js — the selection filter toggles.
//
// The selection is DERIVED, not stored. It is rebuilt on every emit from three
// pieces held in state:
//
//   selection = manualAdd ∪ ⋃ active filters − manualDrop   (then the ghost mask)
//
// That is what makes a lit toggle live: label a square while "All labeled" is
// on and it joins the selection on the same tick, and turning a toggle off only
// gives up the squares no other toggle still claims.
//
// "No ghost" is not a filter but a MASK. Turning it on drops ghosts from the
// selection and keeps them out while it is lit; turning it off puts nothing
// back, which is why it also clears the ghost filter and purges ghosts from the
// hand-picked set on the way in.


// Set by js/tables.js so a filter click can open select mode.
let enterSelectFromFilter = () => {};
function onFilterNeedsSelect(fn) { enterSelectFromFilter = fn; }

/** A square with content that is currently empty — a seat that used to be used.
 *  Those render faded in the grid (see .cell__content--ghost). */
function isGhostCell(cell) {
  return !!(cell && !cell.enabled && hasContent(cell));
}
function isGhostKey(k) {
  const [r, c] = parseKey(k);
  return isGhostCell(peekCell(r, c));
}

/** Every square in the grid, whether it has stored data or not. */
function allGridKeys() {
  const keys = [];
  for (let r = 0; r < state.grid.rows; r++)
    for (let c = 0; c < state.grid.cols; c++) keys.push(keyOf(r, c));
  return keys;
}

/** Keys of stored cells matching `pred(cell, r, c)`. */
function cellKeysWhere(pred) {
  const keys = [];
  for (const [k, cell] of state.cells) {
    const [r, c] = parseKey(k);
    if (pred(cell, r, c)) keys.push(k);
  }
  return keys;
}

const labelled = (cell) => (cell.labels || []).some((l) => l.text && l.text.trim());

// A table fills everything under it, so every one of those squares is unlabelled
// and icon-less. Left in, they would swamp the "absence" filters, so those two
// skip squares a table covers.
const freeOf = (pred) => (cell, r, c) => pred(cell) && !isUnderTable(r, c);

/** The toggles, in the order they appear in the toolbar. `keys` returns the
 *  squares the filter claims; a filter without one acts on something else. */
const FILTERS = {
  all:       { label: 'All squares',   icon: 'ui-f-all',
               keys: () => allGridKeys() },
  filled:    { label: 'All filled',    icon: 'ui-f-filled',
               keys: () => cellKeysWhere((cell) => cell.enabled) },
  blank:     { label: 'All blank',     icon: 'ui-f-blank',
               keys: () => allGridKeys().filter((k) => {
                 const [r, c] = parseKey(k);
                 const cell = peekCell(r, c);
                 return !cell || !hasContent(cell);
               }) },
  labeled:   { label: 'All labeled',   icon: 'ui-f-labeled',
               keys: () => cellKeysWhere((cell) => cell.enabled && labelled(cell)) },
  unlabeled: { label: 'All unlabeled', icon: 'ui-f-labeled', negated: true,
               keys: () => cellKeysWhere((cell, r, c) =>
                 cell.enabled && freeOf((x) => !labelled(x))(cell, r, c)) },
  icons:     { label: 'All w/ icons',  icon: 'ui-f-icons',
               keys: () => cellKeysWhere((cell) => cell.enabled && !!cell.icon) },
  noicons:   { label: 'All w/o icons', icon: 'ui-f-icons', negated: true,
               keys: () => cellKeysWhere((cell, r, c) =>
                 cell.enabled && freeOf((x) => !x.icon)(cell, r, c)) },
  ghost:     { label: 'All ghost',     icon: 'ui-f-ghost',
               keys: () => cellKeysWhere(isGhostCell) },
  // Picks TABLES rather than squares, so it has no `keys`.
  tables:    { label: 'All tables',    icon: 'ui-f-tables' },
  // A mask over the result rather than a source of squares.
  noghost:   { label: 'No ghost',      icon: 'ui-f-ghost', negated: true },
};

const FILTER_ORDER = ['all', 'filled', 'blank', 'labeled', 'unlabeled',
                      'icons', 'noicons', 'ghost', 'tables', 'noghost'];

/** Rebuild state.selection. Called from emit() — must not emit itself. */
function recomputeSelection() {
  const keys = new Set(state.manualAdd);
  for (const id of state.filters) {
    const f = FILTERS[id];
    if (!f || !f.keys) continue;
    for (const k of f.keys()) keys.add(k);
  }
  for (const k of state.manualDrop) keys.delete(k);
  if (state.filters.has('noghost')) {
    for (const k of [...keys]) if (isGhostKey(k)) keys.delete(k);
  }
  for (const k of [...keys]) {
    const [r, c] = parseKey(k);
    if (!inBounds(r, c)) keys.delete(k);
  }
  state.selection = keys;
}

/** Flip one toggle. Returns the new state so callers can react. */
function toggleFilter(id) {
  const on = !state.filters.has(id);
  batch(() => {
    if (on) state.filters.add(id); else state.filters.delete(id);

    // Hand-drops were made against the old filter set; keeping them would leave
    // squares mysteriously missing from a freshly lit toggle.
    state.manualDrop.clear();

    if (id === 'tables') {
      if (on) selectAllTables(); else clearTableSelection();
    }
    if (id === 'noghost' && on) {
      // Turning the mask on both clears the ghost toggle and forgets any ghost
      // that was picked by hand, so turning it back off restores nothing.
      state.filters.delete('ghost');
      for (const k of [...state.manualAdd]) if (isGhostKey(k)) state.manualAdd.delete(k);
    }
    if (id === 'ghost' && on) state.filters.delete('noghost');
  });
  return on;
}

function initFilters() {
  const buttons = new Map();
  for (const id of FILTER_ORDER) {
    const btn = document.getElementById(`btn-filter-${id}`);
    if (!btn) continue;
    buttons.set(id, btn);
    btn.addEventListener('click', () => {
      // A lit toggle needs the select bar open to be any use.
      if (!isSelectMode()) enterSelectFromFilter();
      toggleFilter(id);
    });
  }

  subscribe(() => {
    for (const [id, btn] of buttons) {
      const on = state.filters.has(id);
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
    }
  });
}
