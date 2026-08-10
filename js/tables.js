// tables.js — table-select mode UI: build a table shape from selected squares.


function initTables() {
  const selectBtn = document.getElementById('btn-select');
  const bar = document.getElementById('select-bar');
  const countEl = document.getElementById('select-count');
  const colorInput = document.getElementById('table-color');
  const stageHint = document.getElementById('stage-hint');

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

  document.getElementById('btn-table-round').addEventListener('click', () => {
    addTable('round', colorInput.value);
  });
  document.getElementById('btn-table-square').addEventListener('click', () => {
    addTable('square', colorInput.value);
  });
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
