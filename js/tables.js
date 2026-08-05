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
  };

  selectBtn.addEventListener('click', () => setActive(!active));

  document.getElementById('btn-table-round').addEventListener('click', () => {
    addTable('round', colorInput.value);
  });
  document.getElementById('btn-table-square').addEventListener('click', () => {
    addTable('square', colorInput.value);
  });
  document.getElementById('btn-select-clear').addEventListener('click', () => clearSelection());

  // Keep the selection counter in sync.
  subscribe(() => {
    if (!active) return;
    const n = state.selection.size;
    countEl.textContent = `${n} selected`;
  });
  // Tables are removed via the ✕ button rendered on each shape (see grid.js).
}
