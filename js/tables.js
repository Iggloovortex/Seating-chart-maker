// tables.js — select mode, which is now the only picking mode.
//
// One bar covers both halves of the work. A tap on a square carrying a table
// picks the TABLE; a tap on a bare square picks the SQUARE, which is how the
// next table gets built. Which one a tap means is decided by what is under it
// (see fireTap in js/interactions.js), so table work never needs a mode swap.


function initTables() {
  const selectBtn = document.getElementById('btn-select');
  const bar = document.getElementById('select-bar');
  const countEl = document.getElementById('select-count');
  const stageHint = document.getElementById('stage-hint');
  const colorInput = document.getElementById('table-edit-color');
  const borderInput = document.getElementById('table-edit-border');
  const tableIds = () => [...state.tableSelection];

  let active = false;

  const setActive = (on) => {
    active = on;
    setSelectMode(on);
    selectBtn.setAttribute('aria-pressed', String(on));
    // Icon-only button: the box itself says whether select mode is on.
    document.getElementById('select-icon')
      .setAttribute('href', on ? '#ui-select' : '#ui-select-off');
    selectBtn.title = on ? 'Select mode — on' : 'Select mode — off';
    bar.hidden = !on;
    if (!on) batch(() => { clearManualSelection(); clearTableSelection(); });
    stageHint.style.display = on ? 'none' : '';
    syncSelectionButtons();
    emit(); // re-render so the move handle appears/disappears with the mode
  };

  // Buttons that act on the current selection are disabled when it is empty.
  const syncSelectionButtons = () => {
    const squares = state.selection.size;
    const tables = state.tableSelection.size;
    document.getElementById('btn-edit-selected').disabled = squares === 0;
    document.getElementById('btn-seat-all').disabled = squares === 0;
    // Copying formatting needs exactly one source square; pasting needs a copy.
    const copyBtn = document.getElementById('btn-copy-format');
    const pasteBtn = document.getElementById('btn-paste-format');
    if (copyBtn) copyBtn.disabled = squares !== 1;
    if (pasteBtn) pasteBtn.disabled = squares === 0 || !hasSquareClipboard();

    // Shape buttons build from selected squares, or convert picked tables.
    const canShape = squares > 0 || tables > 0;
    document.getElementById('btn-table-round').disabled = !canShape;
    document.getElementById('btn-table-square').disabled = !canShape;
    document.getElementById('btn-table-rotate').disabled = tables === 0;
    document.getElementById('btn-table-remove').disabled = squares === 0 && tables === 0;
    colorInput.disabled = tables === 0;
    borderInput.disabled = tables === 0;
  };

  selectBtn.addEventListener('click', () => setActive(!active));

  // Ctrl/Cmd+click on a square or a table (outside select mode) turns it on.
  onEnterSelect(() => { if (!active) setActive(true); });
  onEnterTable(() => { if (!active) setActive(true); });
  // A filter toggle needs the bar open to be any use.
  onFilterNeedsSelect(() => { if (!active) setActive(true); });

  // Deselecting the last square (manually) leaves select mode too — unless a
  // table is still picked, since the bar is what edits it.
  onSelectionEmptied(() => { if (!state.tableSelection.size) setActive(false); });

  // Escape clears the selection and leaves select mode (unless the edit pane,
  // which handles its own Escape, is open).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !active) return;
    if (!document.getElementById('editor').hidden) return;
    setActive(false);
  });

  // "Clear selection" clears AND leaves select mode.
  document.getElementById('btn-select-clear').addEventListener('click', () => setActive(false));

  // Fill / empty every selected square. A toggle: it reports whether the whole
  // selection is filled, and flips it either way.
  const fillBtn = document.getElementById('btn-seat-all');
  fillBtn.addEventListener('click', () => {
    if (!state.selection.size) return;
    updateCells([...state.selection], { enabled: !allSelectedFilled() });
  });

  // Copy formatting from a single selected square, paste onto the selection.
  document.getElementById('btn-copy-format').addEventListener('click', () => {
    if (state.selection.size !== 1) return;
    const [r, c] = parseKey([...state.selection][0]);
    copySquareFrom(r, c);
  });
  document.getElementById('btn-paste-format').addEventListener('click', () => {
    if (state.selection.size) pasteSquareTo([...state.selection]);
  });

  // Bulk-edit every selected square at once.
  document.getElementById('btn-edit-selected').addEventListener('click', () => {
    if (state.selection.size) openBulkEditor([...state.selection]);
  });

  // --- tables ---------------------------------------------------------------
  // One pair of shape buttons covers both jobs, because you are only ever doing
  // one of them: squares selected means "build a table out of these", tables
  // picked means "make these that shape".
  const shapeAction = (shape) => () => {
    if (state.selection.size) addTable(shape);
    else if (tableIds().length) updateTables(tableIds(), { shape });
  };
  document.getElementById('btn-table-round').addEventListener('click', shapeAction('round'));
  document.getElementById('btn-table-square').addEventListener('click', shapeAction('square'));
  document.getElementById('btn-table-rotate')
    .addEventListener('click', () => { if (tableIds().length) rotateTables(tableIds(), 45); });
  bindColorInput(colorInput, () => updateTables(tableIds(), { color: colorInput.value }));
  bindColorInput(borderInput, () => updateTables(tableIds(), { border: borderInput.value }));

  // Remove covers everything that is picked, squares and tables alike, through
  // the same menu the grid and the edit panes open.
  document.getElementById('btn-table-remove').addEventListener('click', (e) => {
    const keys = [...state.selection];
    if (!keys.length && !state.tableSelection.size) return;
    const [r, c] = parseKey(keys[0] || firstTableKey() || '0,0');
    const box = e.currentTarget.getBoundingClientRect();
    openDeleteMenu(box.left, box.bottom + 4, { keys, r, c });
  });

  // The bar reports whichever halves of the selection are non-empty, and each
  // control is live only when it has something to act on.
  subscribe(() => {
    if (!active) return;
    const squares = state.selection.size;
    const tables = state.tableSelection.size;
    renderSelectionCount(countEl, squares, tables);
    syncSelectionButtons();

    const filled = squares > 0 && allSelectedFilled();
    fillBtn.setAttribute('aria-pressed', String(filled));
    fillBtn.classList.toggle('is-on', filled);
    fillBtn.title = filled ? 'Empty every selected square' : 'Fill every selected square';

    // Each swatch shows the value the picked tables share, or the default when
    // they disagree.
    const picked = state.tables.filter((t) => state.tableSelection.has(t.id));
    const agreed = (key, fallback) =>
      picked.length && picked.every((t) => t[key] === picked[0][key]) ? picked[0][key] : fallback;
    colorInput.value = agreed('color', state.defaults.tableColor);
    borderInput.value = agreed('border', state.defaults.tableBorder);
  });
}

/** What the bar says about the selection. With nothing picked it tells you how
 *  to pick something instead of reporting two zeroes; otherwise it names only
 *  the halves that have anything in them. */
function renderSelectionCount(el, squares, tables) {
  if (!squares && !tables) {
    // The bar is only ever visible in select mode, so on a touch device a plain
    // tap is what picks a square — long-press opens the editor instead. Both
    // spellings ship; CSS shows the one matching the pointer (see
    // .hint-desktop / .hint-touch).
    el.innerHTML = '<span class="hint-desktop">Ctrl+Click</span>' +
                   '<span class="hint-touch">Tap</span> to select';
    return;
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [];
  if (squares) parts.push(plural(squares, 'Square'));
  if (tables) parts.push(plural(tables, 'Table'));
  el.textContent = parts.join(' & ');
}

/** True when every selected square is already filled — what makes the fill
 *  button a toggle rather than a one-way action. */
function allSelectedFilled() {
  for (const k of state.selection) {
    const [r, c] = parseKey(k);
    if (!isEnabled(r, c)) return false;
  }
  return state.selection.size > 0;
}

/** Any square belonging to the first picked table, so a toolbar delete still
 *  has a row and column to offer when only tables are picked. */
function firstTableKey() {
  const t = state.tables.find((x) => state.tableSelection.has(x.id));
  return t ? t.cellKeys[0] : null;
}
