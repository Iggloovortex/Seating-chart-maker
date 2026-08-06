// editor.js — the edit pane (drawer on desktop, bottom sheet on mobile).
// Edits a single cell: labels (each line its own color), icon, rotation, fill/border,
// plus that cell's row height and column width weights.


const editorEl = document.getElementById('editor');
const bodyEl = document.getElementById('editor-body');
const titleEl = document.getElementById('editor-title');

let current = null; // { r, c }

function initEditor() {
  editorEl.querySelectorAll('[data-close-editor]').forEach((el) =>
    el.addEventListener('click', closeEditor)
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !editorEl.hidden) closeEditor();
  });
}

function openEditor(r, c) {
  current = { r, c };
  const cell = getCell(r, c); // ensures it exists so edits persist
  titleEl.textContent = `Seat — Row ${r + 1}, Col ${c + 1}`;
  render(cell);
  showPane();
}

/** Bulk-edit every selected square at once. Shared properties (seat, icon,
 *  facing, fill, border) apply to all; label line colors can be changed for
 *  all, but each square keeps its own label text. */
function openBulkEditor(keys) {
  current = null;
  if (!keys || keys.length === 0) return;
  titleEl.textContent = `Edit ${keys.length} selected square${keys.length > 1 ? 's' : ''}`;
  renderBulk([...keys]);
  showPane();
}

function showPane() {
  editorEl.hidden = false;
  editorEl.setAttribute('aria-hidden', 'false');
  bodyEl.querySelector('input, button, select')?.focus();
}

function closeEditor() {
  editorEl.hidden = true;
  editorEl.setAttribute('aria-hidden', 'true');
  current = null;
}

function render(cell) {
  bodyEl.replaceChildren();

  // --- Seat on/off ---------------------------------------------------------
  bodyEl.appendChild(group('Seat', (g) => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    const onBtn = segBtn('Seated', cell.enabled, () => { updateCell(current.r, current.c, { enabled: true }); render(peekCell(current.r, current.c)); });
    const offBtn = segBtn('Empty', !cell.enabled, () => { updateCell(current.r, current.c, { enabled: false }); render(peekCell(current.r, current.c)); });
    seg.append(onBtn, offBtn);
    g.appendChild(seg);
  }));

  // --- Labels (each line has its own color) --------------------------------
  bodyEl.appendChild(group('Labels', (g) => {
    const list = document.createElement('div');
    list.id = 'label-list';
    const labels = cell.labels.length ? cell.labels : [];
    labels.forEach((line, i) => list.appendChild(labelRow(line, i)));
    g.appendChild(list);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'link-btn';
    add.textContent = '+ Add label line';
    add.addEventListener('click', () => {
      const c = getCell(current.r, current.c);
      c.labels.push({ text: '', color: defaultLabelColor(c.labels.length) });
      updateCell(current.r, current.c, {}); // emit
      render(peekCell(current.r, current.c));
      // focus the newly added input
      const inputs = bodyEl.querySelectorAll('#label-list .field__input');
      inputs[inputs.length - 1]?.focus();
    });
    g.appendChild(add);
  }));

  // --- Icon ---------------------------------------------------------------
  bodyEl.appendChild(group('Icon', (g) => {
    const picker = document.createElement('div');
    picker.className = 'icon-picker';

    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'icon-picker__btn icon-picker__btn--none';
    none.textContent = 'None';
    none.setAttribute('aria-pressed', String(!cell.icon));
    none.addEventListener('click', () => { updateCell(current.r, current.c, { icon: null }); render(peekCell(current.r, current.c)); });
    picker.appendChild(none);

    for (const id of ICON_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-picker__btn';
      btn.title = ICONS[id].label;
      btn.setAttribute('aria-label', ICONS[id].label);
      btn.setAttribute('aria-pressed', String(cell.icon === id));
      const svg = iconUse(id, '');
      if (svg) btn.appendChild(svg);
      btn.addEventListener('click', () => { updateCell(current.r, current.c, { icon: id }); render(peekCell(current.r, current.c)); });
      picker.appendChild(btn);
    }
    g.appendChild(picker);
    g.appendChild(colorRow('Icon color', cell.iconColor, (v) => updateCell(current.r, current.c, { iconColor: v })));

    // The chair icon makes the square a chair: furniture that scales down and
    // fits inside a thinned walkway instead of claiming a full desk square.
    if (cell.icon === 'chair') {
      g.appendChild(chairSizeRow(cell.chairScale, (v) => updateCell(current.r, current.c, { chairScale: v })));
      const note = document.createElement('p');
      note.className = 'egroup__title';
      note.style.textTransform = 'none';
      note.style.fontWeight = '400';
      note.style.marginTop = '6px';
      note.textContent = 'Chairs shrink to their row/column size in the output, so they fit walkway paths.';
      g.appendChild(note);
    }
  }));

  // --- Rotation (arrows for the direction the seat faces) -----------------
  bodyEl.appendChild(group('Facing', (g) => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    // deg maps to the on-screen rotation; arrow shows which way content points.
    const dirs = [
      { deg: 0, arrow: '↑', label: 'Up' },
      { deg: 90, arrow: '→', label: 'Right' },
      { deg: 180, arrow: '↓', label: 'Down' },
      { deg: 270, arrow: '←', label: 'Left' },
    ];
    for (const { deg, arrow, label } of dirs) {
      const b = segBtn(arrow, (cell.rotation || 0) === deg, () => {
        updateCell(current.r, current.c, { rotation: deg });
        render(peekCell(current.r, current.c));
      });
      b.classList.add('seg__btn--arrow');
      b.setAttribute('aria-label', `Face ${label}`);
      b.title = label;
      seg.appendChild(b);
    }
    g.appendChild(seg);
  }));

  // --- Colors -------------------------------------------------------------
  bodyEl.appendChild(group('Colors', (g) => {
    g.appendChild(colorRow('Space (fill)', cell.fill, (v) => updateCell(current.r, current.c, { fill: v })));
    g.appendChild(colorRow('Border', cell.border, (v) => updateCell(current.r, current.c, { border: v })));
  }));

  // --- Row / column size (empty row & column height) ----------------------
  bodyEl.appendChild(group('Size (this row & column)', (g) => {
    g.appendChild(weightRow('Row height ×', rowWeight(current.r), (v) => setRowWeight(current.r, v)));
    g.appendChild(weightRow('Col width ×', colWeight(current.c), (v) => setColWeight(current.c, v)));
    const note = document.createElement('p');
    note.className = 'egroup__title';
    note.style.textTransform = 'none';
    note.style.fontWeight = '400';
    note.style.marginTop = '6px';
    note.textContent = 'In the output, this resizes only the empty spaces in this row/column — seated squares stay full size, which offsets them. The editing grid stays uniform.';
    g.appendChild(note);
  }));

  // --- Footer -------------------------------------------------------------
  const foot = document.createElement('div');
  foot.className = 'editor__foot';
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary';
  done.textContent = 'Done';
  done.addEventListener('click', closeEditor);
  foot.appendChild(done);
  bodyEl.appendChild(foot);
}

// ---------------------------------------------------------------- bulk render

function renderBulk(keys) {
  bodyEl.replaceChildren();

  // Seed color/rotation controls from the first selected cell.
  const [sr, sc] = keys[0].split(',').map(Number);
  const first = getCell(sr, sc);

  // Seat all / Empty all live in the select bar, not here.

  // --- Labels for every selected square -----------------------------------
  // Each line shows the shared text when all selected squares match, or a
  // "(multiple)" placeholder when they differ. Typing overwrites that line on
  // every selected square; the color applies to all of them too.
  bodyEl.appendChild(group('Labels (all selected)', (g) => {
    const maxLines = maxLabelLines(keys);
    for (let i = 0; i < maxLines; i++) {
      g.appendChild(bulkLabelRow(keys, i));
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'link-btn';
    add.textContent = '+ Add label line to all';
    add.addEventListener('click', () => {
      addLineForCells(keys);
      renderBulk(keys);
      const inputs = bodyEl.querySelectorAll('.erow input[type="text"]');
      inputs[inputs.length - 1]?.focus();
    });
    g.appendChild(add);

    const note = document.createElement('p');
    note.className = 'egroup__title';
    note.style.textTransform = 'none';
    note.style.fontWeight = '400';
    note.style.marginTop = '6px';
    note.textContent = maxLines
      ? 'Typing replaces that line on every selected square. Lines showing “(multiple)” keep each square’s own text until you type.'
      : 'No label lines yet — add one to give every selected square the same line.';
    g.appendChild(note);
  }));

  // --- Icon (all) ---------------------------------------------------------
  bodyEl.appendChild(group('Icon (all selected)', (g) => {
    const picker = document.createElement('div');
    picker.className = 'icon-picker';

    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'icon-picker__btn icon-picker__btn--none';
    none.textContent = 'None';
    none.addEventListener('click', () => updateCells(keys, { icon: null }));
    picker.appendChild(none);

    for (const id of ICON_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-picker__btn';
      btn.title = ICONS[id].label;
      btn.setAttribute('aria-label', ICONS[id].label);
      const svg = iconUse(id, '');
      if (svg) btn.appendChild(svg);
      btn.addEventListener('click', () => updateCells(keys, { icon: id }));
      picker.appendChild(btn);
    }
    g.appendChild(picker);
    g.appendChild(colorRow('Icon color', first.iconColor, (v) => updateCells(keys, { iconColor: v })));
  }));

  // --- Facing (all) -------------------------------------------------------
  bodyEl.appendChild(group('Facing (all selected)', (g) => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    const dirs = [
      { deg: 0, arrow: '↑', label: 'Up' },
      { deg: 90, arrow: '→', label: 'Right' },
      { deg: 180, arrow: '↓', label: 'Down' },
      { deg: 270, arrow: '←', label: 'Left' },
    ];
    for (const { deg, arrow, label } of dirs) {
      const b = segBtn(arrow, false, () => updateCells(keys, { rotation: deg }));
      b.classList.add('seg__btn--arrow');
      b.setAttribute('aria-label', `Face ${label}`);
      b.title = label;
      seg.appendChild(b);
    }
    g.appendChild(seg);
  }));

  // --- Colors (all) -------------------------------------------------------
  bodyEl.appendChild(group('Colors (all selected)', (g) => {
    g.appendChild(colorRow('Space (fill)', first.fill, (v) => updateCells(keys, { fill: v })));
    g.appendChild(colorRow('Border', first.border, (v) => updateCells(keys, { border: v })));
  }));

  // --- Footer -------------------------------------------------------------
  const foot = document.createElement('div');
  foot.className = 'editor__foot';
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary';
  done.textContent = 'Done';
  done.addEventListener('click', closeEditor);
  foot.appendChild(done);
  bodyEl.appendChild(foot);
}

/** One bulk label line: shared text (or a "(multiple)" placeholder), a color
 *  that applies to every selected square, and a remove button. */
function bulkLabelRow(keys, index) {
  const row = document.createElement('div');
  row.className = 'erow';

  const shared = commonLineText(keys, index); // null => squares differ
  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'field__input';
  text.value = shared ?? '';
  text.placeholder = shared === null ? '(multiple)' : `Line ${index + 1}`;
  // Only write on real input, so simply opening the pane never clobbers text.
  text.addEventListener('input', () => setLineTextForCells(keys, index, text.value));

  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'field__input field__input--color erow__color';
  color.value = seedLineColor(keys, index);
  bindColorInput(color, () => setLineColorForCells(keys, index, color.value));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--icon btn--ghost';
  del.textContent = '✕';
  del.setAttribute('aria-label', `Remove label line ${index + 1} from all selected`);
  del.addEventListener('click', () => {
    removeLineForCells(keys, index);
    renderBulk(keys);
  });

  row.append(text, color, del);
  return row;
}

/** First non-default color found on line `index` among the selected cells. */
function seedLineColor(keys, index) {
  for (const k of keys) {
    const [r, c] = k.split(',').map(Number);
    const cell = peekCell(r, c);
    if (cell && cell.labels[index]) return cell.labels[index].color;
  }
  return DEFAULTS.labelColor;
}

// ---------------------------------------------------------------- builders

function group(title, build) {
  const g = document.createElement('div');
  g.className = 'egroup';
  const h = document.createElement('h3');
  h.className = 'egroup__title';
  h.textContent = title;
  g.appendChild(h);
  build(g);
  return g;
}

function segBtn(label, pressed, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'seg__btn';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onClick);
  return b;
}

function labelRow(line, index) {
  const row = document.createElement('div');
  row.className = 'erow';

  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'field__input';
  text.placeholder = `Line ${index + 1}`;
  text.value = line.text || '';
  text.addEventListener('input', () => {
    const cell = getCell(current.r, current.c);
    cell.labels[index].text = text.value;
    updateCell(current.r, current.c, {}); // emit → live grid update
  });

  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'field__input field__input--color erow__color';
  color.value = line.color || DEFAULTS.labelColor;
  bindColorInput(color, () => {
    const cell = getCell(current.r, current.c);
    cell.labels[index].color = color.value;
    updateCell(current.r, current.c, {});
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--icon btn--ghost';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Remove label line');
  del.addEventListener('click', () => {
    const cell = getCell(current.r, current.c);
    cell.labels.splice(index, 1);
    updateCell(current.r, current.c, {});
    render(peekCell(current.r, current.c));
  });

  row.append(text, color, del);
  return row;
}

function colorRow(label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'erow';
  const span = document.createElement('span');
  span.style.flex = '1';
  span.textContent = label;
  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'field__input field__input--color';
  color.value = value;
  bindColorInput(color, () => onChange(color.value));
  row.append(span, color);
  return row;
}

/** Wire a color input so it applies on live change AND when the picker closes
 *  with the value unchanged. Native color inputs fire no event if you re-pick
 *  the value already shown, so we also apply on blur — that lets the user keep
 *  the same color without having to change to another and back. */
function bindColorInput(input, apply) {
  input.addEventListener('input', apply);
  input.addEventListener('change', apply);
  input.addEventListener('blur', apply);
}

/** Chair size: how much of its square the chair occupies (0.2–1). */
function chairSizeRow(value, onChange) {
  const row = document.createElement('div');
  row.className = 'erow';
  const span = document.createElement('span');
  span.style.flex = '1';
  span.textContent = 'Chair size';
  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'field__input field__input--num';
  num.min = '0.2';
  num.max = '1';
  num.step = '0.05';
  num.value = value ?? 0.7;
  num.inputMode = 'decimal';
  num.addEventListener('change', () => {
    const v = Math.min(1, Math.max(0.2, parseFloat(num.value) || 0.7));
    num.value = v;
    onChange(v);
  });
  row.append(span, num);
  return row;
}

function weightRow(label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'erow';
  const span = document.createElement('span');
  span.style.flex = '1';
  span.textContent = label;
  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'field__input field__input--num';
  num.min = '0.2';
  num.step = '0.1';
  num.value = value;
  num.inputMode = 'decimal';
  num.addEventListener('change', () => onChange(parseFloat(num.value) || 1));
  row.append(span, num);
  return row;
}
