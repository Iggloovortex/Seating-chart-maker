// tables.js — the two picking modes.
//   Select mode  — picks SQUARES, for editing seats.
//   Table mode   — everything to do with tables. It picks TABLES to recolour,
//                  reshape or remove, AND picks bare squares to build the next
//                  table out of, so table work never needs a trip to the other
//                  bar. Which one a tap means is decided by what is under it.


// Set by initTables so table mode can switch select mode off, and vice versa.
let setSelectActive = () => {};

function initTables() {
  const selectBtn = document.getElementById('btn-select');
  const bar = document.getElementById('select-bar');
  const countEl = document.getElementById('select-count');
  const stageHint = document.getElementById('stage-hint');

  let active = false;

  const setActive = (on) => {
    // The two modes are mutually exclusive, but switching straight from one to
    // the other keeps the squares already picked — they are usually the reason
    // for the switch.
    if (on) setTableActive(false, { keepSquares: true });
    active = on;
    setSelectMode(on);
    selectBtn.setAttribute('aria-pressed', String(on));
    // Icon-only button: the box itself says whether select mode is on.
    document.getElementById('select-icon')
      .setAttribute('href', on ? '#ui-select' : '#ui-select-off');
    selectBtn.title = on ? 'Select mode — on' : 'Select mode — off';
    bar.hidden = !on;
    if (!on && !switchingModes) clearSelection();
    stageHint.style.display = on ? 'none' : '';
    syncSelectionButtons();
    emit(); // re-render so the move handle appears/disappears with the mode
  };

  // Buttons that act on the current selection are disabled when it is empty.
  const SELECTION_BUTTON_IDS = ['btn-edit-selected', 'btn-seat-all'];
  const syncSelectionButtons = () => {
    const n = state.selection.size;
    for (const id of SELECTION_BUTTON_IDS) {
      const el = document.getElementById(id);
      if (el) el.disabled = n === 0;
    }
    // Copying formatting needs exactly one source square; pasting needs a copy.
    const copyBtn = document.getElementById('btn-copy-format');
    const pasteBtn = document.getElementById('btn-paste-format');
    if (copyBtn) copyBtn.disabled = n !== 1;
    if (pasteBtn) pasteBtn.disabled = n === 0 || !hasSquareClipboard();
  };

  setSelectActive = setActive;
  selectBtn.addEventListener('click', () => setActive(!active));

  // Ctrl/Cmd+click on a bare square (outside both modes) turns select mode on.
  onEnterSelect(() => { if (!active) setActive(true); });

  // Deselecting the last square (manually) leaves select mode too.
  onSelectionEmptied(() => setActive(false));

  // Escape clears the selection and leaves select mode (unless the edit pane,
  // which handles its own Escape, is open).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !active) return;
    if (!document.getElementById('editor').hidden) return;
    setActive(false);
  });

  // Select-all helpers.
  document.getElementById('btn-select-enabled').addEventListener('click', () => {
    if (!active) setActive(true);
    selectAllEnabled();
  });
  document.getElementById('btn-select-all').addEventListener('click', () => {
    if (!active) setActive(true);
    selectAllSquares();
  });

  // Filtered selections — all imply "seated".
  const FILTER_BUTTONS = {
    'btn-select-labeled': selectLabeled,
    'btn-select-unlabeled': selectUnlabeled,
    'btn-select-icons': selectWithIcons,
    'btn-select-no-icons': selectWithoutIcons,
  };
  for (const [id, select] of Object.entries(FILTER_BUTTONS)) {
    document.getElementById(id).addEventListener('click', () => {
      if (!active) setActive(true);
      select();
    });
  }

  // "Clear selection" clears AND leaves select mode.
  document.getElementById('btn-select-clear').addEventListener('click', () => setActive(false));

  // Seat / empty every selected square (moved here from the bulk edit pane).
  document.getElementById('btn-seat-all').addEventListener('click', () => {
    if (state.selection.size) updateCells([...state.selection], { enabled: true });
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
  const editBtn = document.getElementById('btn-edit-selected');
  editBtn.addEventListener('click', () => {
    if (state.selection.size) openBulkEditor([...state.selection]);
  });

  // Keep the selection counter + selection-button states in sync.
  subscribe(() => {
    if (!active) return;
    countEl.textContent = `${state.selection.size} selected`;
    syncSelectionButtons();
  });
  // Tables are removed via the ✕ button rendered on each shape (see grid.js).
}

// ---------------------------------------------------------------- table mode
//
// A tap on a square carrying a table picks that table; a tap on a bare square
// selects the square (see fireTap in js/interactions.js). The bar then acts on
// whichever half is populated — build a table from the squares, or edit the
// tables — so both sides of table work live in one place.

let tableActive = false;

// True while one mode is handing over to the other, so the square selection
// survives the switch instead of being cleared on the way out.
let switchingModes = false;

/** Turn table mode on or off. Exported so select mode can switch it off. */
function setTableActive(on, { keepSquares = false } = {}) {
  if (tableActive === on) return;
  tableActive = on;
  setTableMode(on);
  const btn = document.getElementById('btn-table-mode');
  const bar = document.getElementById('table-bar');
  btn.setAttribute('aria-pressed', String(on));
  bar.hidden = !on;
  // Leaving drops the picked tables, and the squares too unless another mode is
  // taking them over. Entering just forces a redraw so the picked rings appear.
  if (!on) batch(() => { clearTableSelection(); if (!keepSquares) clearSelection(); });
  else emit();
}

function initTableMode() {
  const btn = document.getElementById('btn-table-mode');
  const countEl = document.getElementById('table-count');
  const colorInput = document.getElementById('table-edit-color');
  const borderInput = document.getElementById('table-edit-border');
  const ids = () => [...state.tableSelection];

  btn.addEventListener('click', () => {
    const turningOn = !tableActive;
    if (turningOn) {
      switchingModes = true;                 // keep the squares through the swap
      setSelectActive(false);
      switchingModes = false;
    }
    setTableActive(turningOn);
  });

  // Ctrl/Cmd+click landing on a table opens this bar instead of the select one.
  onEnterTable(() => {
    if (!tableActive) {
      switchingModes = true;
      setSelectActive(false);
      switchingModes = false;
      setTableActive(true);
    }
  });

  document.getElementById('btn-table-all').addEventListener('click', selectAllTables);
  document.getElementById('btn-table-clear').addEventListener('click', () => setTableActive(false));

  // One pair of shape buttons covers both jobs, because you are only ever doing
  // one of them: squares selected means "build a table out of these", tables
  // picked means "make these that shape".
  const shapeAction = (shape) => () => {
    if (state.selection.size) addTable(shape);
    else if (ids().length) updateTables(ids(), { shape });
  };
  document.getElementById('btn-table-round').addEventListener('click', shapeAction('round'));
  document.getElementById('btn-table-square').addEventListener('click', shapeAction('square'));
  document.getElementById('btn-table-remove').addEventListener('click', () => {
    if (ids().length) removeTables(ids());
  });
  bindColorInput(colorInput, () => updateTables(ids(), { color: colorInput.value }));
  bindColorInput(borderInput, () => updateTables(ids(), { border: borderInput.value }));
  document.getElementById('btn-table-rotate')
    .addEventListener('click', () => { if (ids().length) rotateTables(ids(), 45); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tableActive) setTableActive(false);
  });

  // The bar reports both halves of the selection, and each control is live only
  // when it has something to act on.
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  subscribe(() => {
    if (!tableActive) return;
    const squares = state.selection.size;
    const tables = state.tableSelection.size;
    // Both halves are always reported, since either can be non-empty here.
    countEl.textContent =
      `${plural(squares, 'square')} & ${plural(tables, 'table')} selected`;

    // Shape buttons build from selected squares, or convert picked tables.
    const canShape = squares > 0 || tables > 0;
    document.getElementById('btn-table-round').disabled = !canShape;
    document.getElementById('btn-table-square').disabled = !canShape;
    document.getElementById('btn-table-remove').disabled = tables === 0;
    document.getElementById('btn-table-rotate').disabled = tables === 0;
    colorInput.disabled = tables === 0;
    borderInput.disabled = tables === 0;
    // Each swatch shows the value the picked tables share, or the default when
    // they disagree.
    const picked = state.tables.filter((t) => state.tableSelection.has(t.id));
    const agreed = (key, fallback) =>
      picked.length && picked.every((t) => t[key] === picked[0][key]) ? picked[0][key] : fallback;
    colorInput.value = agreed('color', state.defaults.tableColor);
    borderInput.value = agreed('border', state.defaults.tableBorder);
  });
}
