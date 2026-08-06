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
    bar.hidden = !on;
    if (!on) clearSelection();
    stageHint.style.display = on ? 'none' : '';
    const editBtn = document.getElementById('btn-edit-selected');
    if (editBtn) editBtn.disabled = state.selection.size === 0;
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

  document.getElementById('btn-table-round').addEventListener('click', () => {
    addTable('round', colorInput.value);
  });
  document.getElementById('btn-table-square').addEventListener('click', () => {
    addTable('square', colorInput.value);
  });
  // "Clear selection" clears AND leaves select mode.
  document.getElementById('btn-select-clear').addEventListener('click', () => setActive(false));

  // Bulk-edit every selected square at once.
  const editBtn = document.getElementById('btn-edit-selected');
  editBtn.addEventListener('click', () => {
    if (state.selection.size) openBulkEditor([...state.selection]);
  });

  // Keep the selection counter + Edit button state in sync.
  subscribe(() => {
    if (!active) return;
    const n = state.selection.size;
    countEl.textContent = `${n} selected`;
    editBtn.disabled = n === 0;
  });
  // Tables are removed via the ✕ button rendered on each shape (see grid.js).
}
