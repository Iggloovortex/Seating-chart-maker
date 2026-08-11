// tables.js — the two picking modes. Select mode picks SQUARES (and builds
// tables out of them); table mode picks TABLES and edits them.


// Set by initTables so table mode can switch select mode off, and vice versa.
let setSelectActive = () => {};

function initTables() {
  const selectBtn = document.getElementById('btn-select');
  const bar = document.getElementById('select-bar');
  const countEl = document.getElementById('select-count');
  const stageHint = document.getElementById('stage-hint');

  let active = false;

  const setActive = (on) => {
    if (on) setTableActive(false);   // the two modes are mutually exclusive
    active = on;
    setSelectMode(on);
    selectBtn.setAttribute('aria-pressed', String(on));
    // Icon-only button: the box itself says whether select mode is on.
    document.getElementById('select-icon')
      .setAttribute('href', on ? '#ui-select' : '#ui-select-off');
    selectBtn.title = on ? 'Select mode — on' : 'Select mode — off';
    bar.hidden = !on;
    if (!on) clearSelection();
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

  // Ctrl/Cmd+click on a square (outside select mode) turns select mode on.
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

  // New tables take the default table colour; recolouring happens in table mode.
  document.getElementById('btn-table-round').addEventListener('click', () => addTable('round'));
  document.getElementById('btn-table-square').addEventListener('click', () => addTable('square'));
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
// The mirror of select mode, for tables instead of squares. A tap picks the
// table under the pointer (see fireTap in js/interactions.js) and the bar edits
// every picked table at once.

let tableActive = false;

/** Turn table mode on or off. Exported so select mode can switch it off. */
function setTableActive(on) {
  if (tableActive === on) return;
  tableActive = on;
  setTableMode(on);
  const btn = document.getElementById('btn-table-mode');
  const bar = document.getElementById('table-bar');
  btn.setAttribute('aria-pressed', String(on));
  bar.hidden = !on;
  if (!on) clearTableSelection();
  else emit();   // clearTableSelection already emits; otherwise force a re-render
}

function initTableMode() {
  const btn = document.getElementById('btn-table-mode');
  const countEl = document.getElementById('table-count');
  const colorInput = document.getElementById('table-edit-color');
  const ids = () => [...state.tableSelection];

  btn.addEventListener('click', () => {
    const turningOn = !tableActive;
    if (turningOn) setSelectActive(false);   // the two modes are exclusive
    setTableActive(turningOn);
  });

  document.getElementById('btn-table-all').addEventListener('click', selectAllTables);
  document.getElementById('btn-table-clear').addEventListener('click', () => setTableActive(false));
  document.getElementById('btn-table-to-round').addEventListener('click', () => updateTables(ids(), { shape: 'round' }));
  document.getElementById('btn-table-to-square').addEventListener('click', () => updateTables(ids(), { shape: 'square' }));
  document.getElementById('btn-table-remove').addEventListener('click', () => {
    if (ids().length) removeTables(ids());
  });
  bindColorInput(colorInput, () => updateTables(ids(), { color: colorInput.value }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tableActive) setTableActive(false);
  });

  // Buttons that act on the picked tables are dead while none are picked, and
  // the swatch shows the colour they share (or the default when they differ).
  const TABLE_BUTTON_IDS = ['btn-table-to-round', 'btn-table-to-square', 'btn-table-remove'];
  subscribe(() => {
    if (!tableActive) return;
    const n = state.tableSelection.size;
    countEl.textContent = `${n} ${n === 1 ? 'table' : 'tables'} selected`;
    for (const id of TABLE_BUTTON_IDS) document.getElementById(id).disabled = n === 0;
    colorInput.disabled = n === 0;
    const picked = state.tables.filter((t) => state.tableSelection.has(t.id));
    const shared = picked.length && picked.every((t) => t.color === picked[0].color);
    colorInput.value = shared ? picked[0].color : state.defaults.tableColor;
  });
}
