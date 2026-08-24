// filters.js — the selection filter toggles.
//
// The selection is DERIVED, not stored. It is rebuilt on every emit from three
// pieces held in state:
//
//   selection = manualAdd ∪ ⋃ active filters − manualDrop
//
// That is what makes a lit toggle live: label a square while "All labeled" is
// on and it joins the selection on the same tick, and turning a toggle off only
// gives up the squares no other toggle still claims.
//
// "Include ghost" is not a filter but a WIDENER. Every other filter tests filled
// squares only, so ghosts — emptied squares that still hold content — never
// reach them. Lighting it lets the same filters see ghosts too, which is the
// useful direction: excluding them was already the default and so did nothing.


// Set by js/tables.js so a filter click can open select mode.
let enterSelectFromFilter = () => {};
function onFilterNeedsSelect(fn) { enterSelectFromFilter = fn; }

/** A square with content that is currently empty — a seat that used to be used.
 *  Those render faded in the grid (see .cell__content--ghost). */
function isGhostCell(cell) {
  return !!(cell && !cell.enabled && hasContent(cell));
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

/** What the content filters count as "in play". Normally that is filled squares
 *  only; with "Include ghost" lit, emptied squares holding content join them. */
const inPlay = (cell) =>
  cell.enabled || (state.filters.has('withghost') && isGhostCell(cell));

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
               keys: () => cellKeysWhere(inPlay) },
  blank:     { label: 'All blank',     icon: 'ui-f-blank',
               keys: () => allGridKeys().filter((k) => {
                 const [r, c] = parseKey(k);
                 const cell = peekCell(r, c);
                 return !cell || !hasContent(cell);
               }) },
  labeled:   { label: 'All labeled',   icon: 'ui-f-labeled',
               keys: () => cellKeysWhere((cell) => inPlay(cell) && labelled(cell)) },
  unlabeled: { label: 'All unlabeled', icon: 'ui-f-labeled', negated: true,
               keys: () => cellKeysWhere((cell, r, c) =>
                 inPlay(cell) && freeOf((x) => !labelled(x))(cell, r, c)) },
  icons:     { label: 'All w/ icons',  icon: 'ui-f-icons',
               keys: () => cellKeysWhere((cell) => inPlay(cell) && !!cell.icon) },
  noicons:   { label: 'All w/o icons', icon: 'ui-f-icons', negated: true,
               keys: () => cellKeysWhere((cell, r, c) =>
                 inPlay(cell) && freeOf((x) => !x.icon)(cell, r, c)) },
  ghost:     { label: 'All ghost',     icon: 'ui-f-ghost',
               keys: () => cellKeysWhere(isGhostCell) },
  // Picks TABLES rather than squares, so it has no `keys`.
  tables:    { label: 'All tables',    icon: 'ui-f-tables' },
  // Widens what the other filters look at rather than matching anything itself.
  withghost: { label: 'Include ghost', icon: 'ui-f-ghost' },
  // Not a button: driven by the search box (see setFilterQuery). Active exactly
  // when filterQuery is non-empty, and claims every square the query matches.
  search:    { label: 'Search',        icon: 'ui-search',
               keys: () => {
                 const q = (state.filterQuery || '').trim();
                 if (!q) return [];
                 const words = q.toLowerCase().split(/\s+/);
                 return cellKeysWhere((cell) => {
                   // Search obeys the same in-play rule as the other content
                   // filters: filled squares only, unless Include ghost is lit.
                   if (!inPlay(cell)) return false;
                   const hay = cellSearchText(cell);
                   return words.every((w) => hay.includes(w));
                 });
               } },
};

/** The lowercased text a search matches against: every label line, plus the
 *  icon's id and its human label. Read live, so relabelling moves a square in
 *  or out of the search selection on the same emit. */
function cellSearchText(cell) {
  const parts = [];
  for (const l of cell.labels || []) if (l.text) parts.push(l.text);
  if (cell.icon) {
    parts.push(cell.icon);
    if (typeof iconLabel === 'function') parts.push(iconLabel(cell.icon));
    else if (ICONS[cell.icon]) parts.push(ICONS[cell.icon].label);
  }
  return parts.join(' ').toLowerCase();
}

const FILTER_ORDER = ['all', 'filled', 'blank', 'labeled', 'unlabeled',
                      'icons', 'noicons', 'ghost', 'tables', 'withghost'];

/** Rebuild state.selection. Called from emit() — must not emit itself. */
function recomputeSelection() {
  const keys = new Set(state.manualAdd);
  for (const id of state.filters) {
    const f = FILTERS[id];
    if (!f || !f.keys) continue;
    for (const k of f.keys()) keys.add(k);
  }
  for (const k of state.manualDrop) keys.delete(k);
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
  });
  return on;
}

/** Drive the search filter from the box. `search` is active exactly when the
 *  query is non-empty; an empty box drops it. Mirrors toggleFilter's handling of
 *  a filter-set change by clearing hand-drops. */
function setFilterQuery(q) {
  batch(() => {
    state.filterQuery = q || '';
    if (state.filterQuery.trim()) state.filters.add('search');
    else state.filters.delete('search');
    state.manualDrop.clear();
  });
}

/** Enable the search box and run it on submit only (Enter or the button) — never
 *  on keystroke, so typing can't select half the chart mid-word. */
function initSearch() {
  const form = document.getElementById('filter-search');
  const input = document.getElementById('filter-query');
  const btn = document.getElementById('btn-filter-search');
  if (!form || !input) return;
  input.removeAttribute('disabled');
  if (btn) {
    btn.removeAttribute('disabled');
    btn.setAttribute('title', 'Search labels & icons');
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // A search is as good a reason to open the bar as a toggle click.
    if (!isSelectMode()) enterSelectFromFilter();
    setFilterQuery(input.value.trim());
  });
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

  initSearch();

  subscribe(() => {
    for (const [id, btn] of buttons) {
      const on = state.filters.has(id);
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
    }
  });
}
