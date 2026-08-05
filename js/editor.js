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
  editorEl.hidden = false;
  editorEl.setAttribute('aria-hidden', 'false');
  // Focus first control for accessibility.
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
      c.labels.push({ text: '', color: DEFAULTS.labelColor });
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
  }));

  // --- Rotation -----------------------------------------------------------
  bodyEl.appendChild(group('Rotation (seat facing)', (g) => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const deg of [0, 90, 180, 270]) {
      const b = segBtn(`${deg}°`, (cell.rotation || 0) === deg, () => {
        updateCell(current.r, current.c, { rotation: deg });
        render(peekCell(current.r, current.c));
      });
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
    note.textContent = 'Applies to the whole row/column — use for empty spacer rows or columns.';
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
  color.addEventListener('input', () => {
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
  color.addEventListener('input', () => onChange(color.value));
  row.append(span, color);
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
