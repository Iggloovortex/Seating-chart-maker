// editor.js — the edit pane (drawer on desktop, bottom sheet on mobile).
// Edits a single cell: labels (each line its own color), icon, rotation, fill/border,
// plus that cell's row height and column width weights.


const editorEl = document.getElementById('editor');
const bodyEl = document.getElementById('editor-body');
const titleEl = document.getElementById('editor-title');

let current = null; // { r, c }
let presetMode = null; // 1 | 2 while the pane is editing a preset instead of a cell

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
  titleEl.textContent = `Square — Row ${r + 1}, Col ${c + 1}`;
  render(cell);
  showPane();
}

/** Bulk-edit every selected square at once. Shared properties (fill, icon,
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
  document.getElementById('editor-actions').replaceChildren();
  editorEl.hidden = true;
  editorEl.setAttribute('aria-hidden', 'true');
  current = null;
  presetMode = null;
}

// -------------------------------------------------- preset maker
//
// The same edit drawer, but bound to a preset in state.config rather than a grid
// cell. Reuses the decoupled primitives (buildCompass, swatch) — the cell-bound
// builders can't be, since they write through current.r/current.c.

/** Open the drawer to build/edit preset `n`. Opened from Settings, which closes
 *  behind it so the drawer isn't fighting the modal for the screen. */
function openPresetEditor(n) {
  if (typeof closeSettings === 'function') closeSettings();
  current = null;
  presetMode = n;
  titleEl.textContent = `Preset ${n}`;
  renderPresetEditor(n);
  showPane();
}

/** The preset being edited, always a full object (a never-saved preset reads as
 *  blank). Writes go straight through updateConfigPreset, so edits persist live. */
function renderPresetEditor(n) {
  const key = String(n);
  const cur = () => state.config.presets[key] || emptyPreset();
  const setP = (patch) => { updateConfigPreset(n, { ...cur(), ...patch }); renderPresetEditor(n); };
  const p = cur();

  bodyEl.replaceChildren();
  document.getElementById('editor-actions').replaceChildren();

  // Facing + colours on one row, matching the square pane (no fill toggle — a
  // preset is always applied as a filled square).
  bodyEl.appendChild(group(null, (g) => {
    const row = document.createElement('div');
    row.className = 'erow erow--controls';

    const facing = controlGroup('Facing');
    facing.appendChild(buildCompass(p.rotation || 0, (deg) => setP({ rotation: deg })));

    const colors = controlGroup('Colors');
    const sw = document.createElement('div');
    sw.className = 'swatches';
    sw.append(
      swatch('Fill', p.fill, (v) => updateConfigPreset(n, { ...cur(), fill: v })),
      swatch('Border', p.border, (v) => updateConfigPreset(n, { ...cur(), border: v })),
      swatch('Icon', p.iconColor, (v) => updateConfigPreset(n, { ...cur(), iconColor: v })),
      presetIconFillSwatch(n, cur),
    );
    colors.appendChild(sw);

    row.append(facing, colors);
    g.appendChild(row);
  }));

  // Icon.
  bodyEl.appendChild(group('Icon', (g) => {
    const picker = document.createElement('div');
    picker.className = 'icon-picker';
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'icon-picker__btn icon-picker__btn--none';
    none.textContent = 'None';
    none.setAttribute('aria-pressed', String(!p.icon));
    none.addEventListener('click', () => setP({ icon: null }));
    picker.appendChild(none);
    for (const id of ICON_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-picker__btn';
      btn.title = ICONS[id].label;
      btn.setAttribute('aria-label', ICONS[id].label);
      btn.setAttribute('aria-pressed', String(p.icon === id));
      const svg = iconUse(id, '');
      if (svg) btn.appendChild(svg);
      btn.addEventListener('click', () => setP({ icon: id }));
      picker.appendChild(btn);
    }
    g.appendChild(picker);
  }));

  // Labels — text + colour per line, add/remove.
  bodyEl.appendChild(group('Labels', (g) => {
    p.labels.forEach((line, i) => g.appendChild(presetLabelRow(n, cur, line, i)));
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'link-btn';
    add.textContent = '+ Add label line';
    add.addEventListener('click', () => {
      const labels = cur().labels.concat({ text: '', color: defaultLabelColor(cur().labels.length) });
      setP({ labels });
    });
    g.appendChild(add);
  }));

  // Footer: clear the preset, or done.
  const foot = document.createElement('div');
  foot.className = 'editor__foot';
  const clr = document.createElement('button');
  clr.type = 'button';
  clr.className = 'btn btn--ghost';
  clr.textContent = 'Clear preset';
  clr.addEventListener('click', () => { updateConfigPreset(n, null); closeEditor(); });
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary';
  done.textContent = 'Done';
  done.addEventListener('click', closeEditor);
  foot.append(clr, done);
  bodyEl.appendChild(foot);
}

function presetIconFillSwatch(n, cur) {
  const on = !!cur().iconFill;
  const item = swatch('Icon fill', cur().iconFill || cur().fill,
                      (v) => updateConfigPreset(n, { ...cur(), iconFill: v }));
  const input = item.querySelector('input');
  input.disabled = !on;
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'swatch__toggle';
  box.checked = on;
  box.setAttribute('aria-label', 'Fill the space inside the icon');
  box.addEventListener('change', () => {
    updateConfigPreset(n, { ...cur(), iconFill: box.checked ? input.value : null });
    renderPresetEditor(n);
  });
  item.querySelector('.defaults__label').prepend(box);
  return item;
}

function presetLabelRow(n, cur, line, index) {
  const row = document.createElement('div');
  row.className = 'erow';
  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'field__input';
  text.value = line.text;
  text.placeholder = `Line ${index + 1}`;
  text.addEventListener('input', () => {
    const labels = cur().labels.map((l, i) => i === index ? { ...l, text: text.value } : l);
    updateConfigPreset(n, { ...cur(), labels }); // live, no re-render (keeps focus/caret)
  });
  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'field__input field__input--color erow__color';
  color.value = line.color;
  bindColorInput(color, () => {
    const labels = cur().labels.map((l, i) => i === index ? { ...l, color: color.value } : l);
    updateConfigPreset(n, { ...cur(), labels });
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--icon btn--ghost';
  del.textContent = '✕';
  del.setAttribute('aria-label', `Remove label line ${index + 1}`);
  del.addEventListener('click', () => {
    const labels = cur().labels.filter((_, i) => i !== index);
    updateConfigPreset(n, { ...cur(), labels });
    renderPresetEditor(n);
  });
  row.append(text, color, del);
  return row;
}

/** The single square the pane is open on, or null (bulk pane / pane closed).
 *  Lets Settings capture the open square as a preset. */
function editorSquare() {
  return current ? { r: current.r, c: current.c, cell: peekCell(current.r, current.c) } : null;
}

/** Re-render the single-square pane in place — used after Settings saves a
 *  preset, so the pane's Preset buttons switch from disabled to live. */
function refreshEditor() {
  if (editorEl.hidden || !current) return;
  render(peekCell(current.r, current.c));
}

function render(cell) {
  bodyEl.replaceChildren();
  renderSquareActions();

  // --- Fill, facing and colors share one row --------------------------------
  // No group heading: each control carries its own label, so a fourth line of
  // text above them only pushed the row further down the pane.
  bodyEl.appendChild(group(null, (g) => {
    const row = document.createElement('div');
    row.className = 'erow erow--controls';
    row.append(fillControls(cell), facingCompass(cell), squareColors(cell));
    g.appendChild(row);
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

    for (const id of pickableIconIds()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-picker__btn';
      btn.title = iconLabel(id);
      btn.setAttribute('aria-label', iconLabel(id));
      btn.setAttribute('aria-pressed', String(cell.icon === id));
      const svg = iconUse(id, '');
      if (svg) btn.appendChild(svg);
      btn.addEventListener('click', () => { updateCell(current.r, current.c, { icon: id }); render(peekCell(current.r, current.c)); });
      picker.appendChild(btn);
    }
    g.appendChild(picker);
  }));

  // --- Special --------------------------------------------------------------
  // A permanent home for the special icons — the ones that turn the square into
  // furniture (a piece tucked to the faced edge, labels in the empty space).
  bodyEl.appendChild(specialSection(cell));

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

  // --- Row / column size (empty row & column height) ----------------------
  bodyEl.appendChild(group('Size (this row & column)', (g) => {
    const row = document.createElement('div');
    row.className = 'erow erow--size';
    row.append(
      sizeEntry('Row ×', rowWeight(current.r), (v) => setRowWeight(current.r, v)),
      sizeEntry('Col ×', colWeight(current.c), (v) => setColWeight(current.c, v)),
    );
    g.appendChild(row);
    const note = document.createElement('p');
    note.className = 'egroup__note';
    note.style.marginTop = '6px';
    note.textContent = 'In the output, this resizes only the empty spaces in this row/column — filled squares stay full size, which offsets them. The editing grid stays uniform.';
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

/** The special icons — the ones that turn a square into furniture and so live in
 *  the Special section rather than the Icon picker. */
const SPECIAL_ICON_IDS = Object.keys(FURNITURE_ICONS);
function isSpecialIcon(id) { return !!FURNITURE_ICONS[id]; }

/** How each special icon behaves, shown in the Special section so the reader
 *  knows why the icon renders tucked rather than as a desk. */
const SPECIAL_SQUARE_NOTES = {
  chair: 'This square is a chair: a small piece of furniture tucked against and lined up ' +
    'with the square it faces. Its label sits in the empty space. The square stays full size.',
  server: 'This square is a server rack. One label shows the server icon and a slab tucked ' +
    'to the side it faces. Add more labels and each becomes its own server slab, filling the ' +
    'square. Labels turn with the facing, like a normal square.',
};

/** The Special section — a permanent home for the special icons. Picking one
 *  turns the square into that furniture; picking it again clears it. When one is
 *  active, its behaviour note appears and points at Facing, which aims it. */
function specialSection(cell) {
  return group('Special', (g) => {
    const picker = document.createElement('div');
    picker.className = 'icon-picker';
    for (const id of SPECIAL_ICON_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-picker__btn';
      btn.title = ICONS[id].label;
      btn.setAttribute('aria-label', ICONS[id].label);
      btn.setAttribute('aria-pressed', String(cell.icon === id));
      const svg = iconUse(id, '');
      if (svg) btn.appendChild(svg);
      btn.addEventListener('click', () => {
        const next = cell.icon === id ? null : id; // clicking the active one clears it
        updateCell(current.r, current.c, { icon: next });
        render(peekCell(current.r, current.c));
      });
      picker.appendChild(btn);
    }
    g.appendChild(picker);

    const text = cell && cell.icon && SPECIAL_SQUARE_NOTES[cell.icon];
    if (text) {
      const note = document.createElement('p');
      note.className = 'egroup__note';
      note.textContent = text + ' Use Facing above to aim it.';
      g.appendChild(note);
    }
  });
}

/** One compact label + number entry for the Size row, so both sit on one line. */
function sizeEntry(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'sizeentry';
  const span = document.createElement('span');
  span.className = 'sizeentry__label';
  span.textContent = label;
  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'field__input field__input--num';
  num.min = '0.2';
  num.step = '0.1';
  num.value = value;
  num.inputMode = 'decimal';
  num.addEventListener('change', () => onChange(parseFloat(num.value) || 1));
  wrap.append(span, num);
  return wrap;
}

// ---------------------------------------------------------------- bulk render

function renderBulk(keys) {
  bodyEl.replaceChildren();
  renderSquareActions();      // empties the header bar; bulk has no single square

  // Seed color/rotation controls from the first selected cell.
  const [sr, sc] = keys[0].split(',').map(Number);
  const first = getCell(sr, sc);

  // --- Fill, facing and colors, laid out exactly as the single pane ---------
  bodyEl.appendChild(group(null, (g) => {
    const row = document.createElement('div');
    row.className = 'erow erow--controls';
    row.append(bulkFillControls(keys), bulkFacing(keys), bulkColors(keys, first));
    g.appendChild(row);
  }));

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

    const bulkIds = ICON_IDS.concat(((state.config && state.config.customIcons) || []).map((c) => c.id));
    for (const id of bulkIds) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-picker__btn';
      btn.title = iconLabel(id);
      btn.setAttribute('aria-label', iconLabel(id));
      const svg = iconUse(id, '');
      if (svg) btn.appendChild(svg);
      btn.addEventListener('click', () => updateCells(keys, { icon: id }));
      picker.appendChild(btn);
    }
    g.appendChild(picker);
  }));

  // --- Paste the copied square onto the whole selection --------------------
  bodyEl.appendChild(group('Copy square', (g) => {
    const paste = document.createElement('button');
    paste.type = 'button';
    paste.className = 'btn';
    paste.style.width = '100%';
    paste.textContent = 'Paste square to all';
    paste.disabled = !hasSquareClipboard();
    paste.addEventListener('click', () => { pasteSquareTo(keys); renderBulk(keys); });
    g.appendChild(paste);
  }));

  // --- Footer -------------------------------------------------------------
  const foot = document.createElement('div');
  foot.className = 'editor__foot';
  // The row and column named in the menu are the first selected square's.
  foot.appendChild(deleteButton(() => [...keys],
                                () => { const [r, c] = parseKey(keys[0]); return { r, c }; }));
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary';
  done.textContent = 'Done';
  done.addEventListener('click', closeEditor);
  foot.appendChild(done);
  bodyEl.appendChild(foot);
}

// ---- bulk versions of the three controls the single pane puts on one row ----
//
// Same shapes, same labels; only the target differs. Anything that reports a
// single square's value shows what the whole selection agrees on, or nothing
// when it disagrees.

/** What every selected square shares for `read`, or `fallback` when they differ. */
function agreedAcross(keys, read, fallback = null) {
  let seen;
  for (const k of keys) {
    const [r, c] = parseKey(k);
    const v = read(getCell(r, c));
    if (seen === undefined) seen = v;
    else if (seen !== v) return fallback;
  }
  return seen === undefined ? fallback : seen;
}

function bulkFillControls(keys) {
  const wrap = controlGroup('Fill');
  const allFilled = keys.every((k) => isEnabled(...parseKey(k)));
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${allFilled ? 'btn--seat' : 'btn--empty'}`;
  btn.textContent = allFilled ? 'Filled' : 'Empty';
  btn.setAttribute('aria-pressed', String(allFilled));
  btn.title = allFilled ? 'Empty every selected square' : 'Fill every selected square';
  btn.addEventListener('click', () => {
    updateCells(keys, { enabled: !allFilled });
    renderBulk(keys);
  });
  const apply = (n) => { applyPreset(n, keys); renderBulk(keys); };
  wrap.appendChild(fillStack(btn, presetButton(1, apply), presetButton(2, apply)));
  return wrap;
}

function bulkFacing(keys) {
  const wrap = controlGroup('Facing');
  const chosen = agreedAcross(keys, (c) => c.rotation || 0);
  wrap.appendChild(buildCompass(chosen, (deg) => {
    updateCells(keys, { rotation: deg });
    renderBulk(keys);
  }));
  return wrap;
}

function bulkColors(keys, first) {
  const wrap = controlGroup('Colors');
  const row = document.createElement('div');
  row.className = 'swatches';
  const seed = (read) => agreedAcross(keys, read, read(first));
  row.append(
    swatch('Fill', seed((c) => c.fill), (v) => updateCells(keys, { fill: v })),
    swatch('Border', seed((c) => c.border), (v) => updateCells(keys, { border: v })),
    swatch('Icon', seed((c) => c.iconColor), (v) => updateCells(keys, { iconColor: v })),
    bulkIconFillSwatch(keys, first),
  );
  wrap.appendChild(row);
  return wrap;
}

function bulkIconFillSwatch(keys, first) {
  const shared = agreedAcross(keys, (c) => c.iconFill);
  const on = !!shared;
  const item = swatch('Icon fill', shared || first.fill,
                      (v) => updateCells(keys, { iconFill: v }));
  const input = item.querySelector('input');
  input.disabled = !on;

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'swatch__toggle';
  box.checked = on;
  box.title = on ? 'Icon fill on' : 'Icon fill off';
  box.setAttribute('aria-label', 'Fill the space inside the icon');
  box.addEventListener('change', () => {
    updateCells(keys, { iconFill: box.checked ? input.value : null });
    renderBulk(keys);
  });
  item.querySelector('.defaults__label').prepend(box);
  return item;
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

function labelGrip(title) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'erow__grip';
  el.textContent = '\u2630';           // hamburger
  el.title = title;
  el.setAttribute('aria-label', title);
  return el;
}

/** Drag a grip up or down the label list to reorder. `kind` decides what
 *  travels: the whole line, or only its colour. Same pointer-drag shape as the
 *  grid's move handle — press, track the nearest row, apply on release. */
function attachLabelDrag(handle, index, kind) {
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    const list = document.getElementById('label-list');
    const rows = list ? [...list.children] : [];
    if (rows.length < 2) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { rows, boxes: rows.map((el) => el.getBoundingClientRect()), target: index };
    rows[index].classList.add(kind === 'color' ? 'erow--dragging-color' : 'erow--dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let best = 0, bestD = Infinity;
    drag.boxes.forEach((b, i) => {
      const d = Math.abs(e.clientY - (b.top + b.height / 2));
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === drag.target) return;
    drag.rows.forEach((el) => el.classList.remove('erow--drop'));
    drag.target = best;
    if (best !== index) drag.rows[best].classList.add('erow--drop');
  });

  const finish = () => {
    if (!drag) return;
    const to = drag.target;
    drag.rows.forEach((el) =>
      el.classList.remove('erow--dragging', 'erow--dragging-color', 'erow--drop'));
    drag = null;
    if (to === index || !current) return;
    const moved = kind === 'color'
      ? moveLabelColor(current.r, current.c, index, to)
      : moveLabelLine(current.r, current.c, index, to);
    if (moved) render(peekCell(current.r, current.c));
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
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

/** A pane section. A null title makes it heading-less, for rows whose own
 *  controls are already labelled. */
function group(title, build) {
  const g = document.createElement('div');
  g.className = title ? 'egroup' : 'egroup egroup--bare';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'egroup__title';
    h.textContent = title;
    g.appendChild(h);
  }
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
    // Goes through state so it can seat the square when this is its first
    // content (and emit for the live grid update).
    setLineText(current.r, current.c, index, text.value);
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

  // Two grips. The left one carries the whole line; the one beside the swatch
  // carries only the colour, so a palette can be shuffled without retyping.
  const grip = labelGrip('Drag to reorder this line');
  const colorGrip = labelGrip('Drag to move this color to another line');
  colorGrip.classList.add('erow__grip--color');
  attachLabelDrag(grip, index, 'line');
  attachLabelDrag(colorGrip, index, 'color');

  row.append(grip, text, color, colorGrip, del);
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
  // Swap the browser's un-themed color dialog for the app's own popover. The
  // native input stays the value holder, so these listeners keep firing.
  if (typeof enhanceColorInput === 'function') enhanceColorInput(input);
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

/** Delete button for either pane. It raises the same menu Shift+right-click
 *  does, so the three ways in can never offer different choices. */
function deleteButton(getKeys, getAt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--empty';
  btn.textContent = 'Delete\u2026';
  btn.title = 'Reset these squares, or delete their row or column';
  btn.style.marginRight = 'auto';
  btn.addEventListener('click', () => {
    const box = btn.getBoundingClientRect();
    openDeleteMenu(box.left, box.bottom + 6, { keys: getKeys(), ...getAt() });
  });
  return btn;
}

// -------------------------------------------------- single-square controls
//
// Seat, facing and colors sit on one row, so the three things you reach for most
// are visible together without scrolling.

/** The left column of the controls row: the fill toggle over the two preset
 *  buttons, three tall so the column stands level with the compass and the
 *  swatches beside it. */
function fillControls(cell) {
  const wrap = controlGroup('Fill');
  const apply = (n) => {
    applyPreset(n, [keyOf(current.r, current.c)]);
    render(peekCell(current.r, current.c));
  };
  wrap.appendChild(fillStack(seatToggle(cell), presetButton(1, apply), presetButton(2, apply)));
  return wrap;
}

/** The three buttons in their own stack, so their tight 3px spacing does not
 *  also pull the group's title down onto them. */
function fillStack(...buttons) {
  const stack = document.createElement('div');
  stack.className = 'fillstack';
  stack.append(...buttons);
  return stack;
}

/** One button that both reports and flips the fill, instead of a two-way pair. */
function seatToggle(cell) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${cell.enabled ? 'btn--seat' : 'btn--empty'}`;
  btn.textContent = cell.enabled ? 'Filled' : 'Empty';
  btn.setAttribute('aria-pressed', String(cell.enabled));
  btn.title = cell.enabled ? 'Filled — click to empty' : 'Empty — click to fill';
  btn.addEventListener('click', () => {
    updateCell(current.r, current.c, { enabled: !cell.enabled });
    render(peekCell(current.r, current.c));
  });
  return btn;
}

/** A saved square configuration, applied in one press. Presets are captured and
 *  stored in Settings (state.config.presets). A button is live only when its
 *  preset is set AND a target is given; `onApply(n)` receives the click. */
function presetButton(n, onApply) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--preset';
  btn.dataset.preset = String(n);
  btn.textContent = `Preset ${n}`;
  const preset = state.config && state.config.presets ? state.config.presets[String(n)] : null;
  const has = !!preset;
  btn.disabled = !has || !onApply;
  btn.title = has ? `Apply Preset ${n} (set in Settings)` : `Preset ${n} — set it in Settings`;
  if (has && onApply) btn.addEventListener('click', () => onApply(n));
  return btn;
}

// Eight directions laid out as a compass, which reads far quicker than a strip
// of arrows. The middle cell is left empty.
const FACINGS = [
  { deg: 315, arrow: '↖', label: 'Up and left' },
  { deg: 0,   arrow: '↑', label: 'Up' },
  { deg: 45,  arrow: '↗', label: 'Up and right' },
  { deg: 270, arrow: '←', label: 'Left' },
  null,
  { deg: 90,  arrow: '→', label: 'Right' },
  { deg: 225, arrow: '↙', label: 'Down and left' },
  { deg: 180, arrow: '↓', label: 'Down' },
  { deg: 135, arrow: '↘', label: 'Down and right' },
];

/** The compass itself. `chosen` marks the current facing (null when a
 *  selection disagrees), `onPick` receives the degrees. */
function buildCompass(chosen, onPick) {
  const grid = document.createElement('div');
  grid.className = 'compass';
  for (const dir of FACINGS) {
    // The middle cell turns the facing one step round the compass, which is the
    // quickest way to nudge a square without hunting for the right arrow.
    if (!dir) { grid.appendChild(rotateButton(chosen, onPick)); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'compass__btn';
    b.textContent = dir.arrow;
    b.title = dir.label;
    b.setAttribute('aria-label', `Face ${dir.label.toLowerCase()}`);
    b.setAttribute('aria-pressed', String(chosen === dir.deg));
    b.addEventListener('click', () => onPick(dir.deg));
    grid.appendChild(b);
  }
  return grid;
}

/** Turn the facing 45 degrees. With a mixed selection there is nothing to turn
 *  FROM, so it starts the sweep at the first step. */
function rotateButton(chosen, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'compass__btn compass__btn--rotate';
  b.title = 'Turn 45\u00b0';
  b.setAttribute('aria-label', 'Turn the facing 45 degrees');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#ui-orient-l');
  svg.appendChild(use);
  b.appendChild(svg);
  b.addEventListener('click', () => onPick((((chosen || 0) + 45) % 360 + 360) % 360));
  return b;
}

function facingCompass(cell) {
  const wrap = controlGroup('Facing');
  wrap.appendChild(buildCompass(cell.rotation || 0, (deg) => {
    updateCell(current.r, current.c, { rotation: deg });
    render(peekCell(current.r, current.c));
  }));
  return wrap;
}

/** Every colour a square carries, as named swatches the size the toolbar's
 *  defaults use — icon colour among them, rather than stranded in the Icon
 *  section. Icon fill paints the space enclosed by the icon's strokes and is off
 *  until its box is ticked. */
function squareColors(cell) {
  const wrap = controlGroup('Colors');
  const row = document.createElement('div');
  row.className = 'swatches';
  row.append(
    swatch('Fill', cell.fill, (v) => updateCell(current.r, current.c, { fill: v })),
    swatch('Border', cell.border, (v) => updateCell(current.r, current.c, { border: v })),
    swatch('Icon', cell.iconColor, (v) => updateCell(current.r, current.c, { iconColor: v })),
    iconFillSwatch(cell),
  );
  wrap.appendChild(row);
  return wrap;
}

function iconFillSwatch(cell) {
  const on = !!cell.iconFill;
  const item = swatch('Icon fill', cell.iconFill || cell.fill,
                      (v) => updateCell(current.r, current.c, { iconFill: v }));
  const input = item.querySelector('input');
  input.disabled = !on;

  // A tick in the label turns it on and off; off means the icon stays an outline.
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'swatch__toggle';
  box.checked = on;
  box.title = on ? 'Icon fill on' : 'Icon fill off';
  box.setAttribute('aria-label', 'Fill the space inside the icon');
  box.addEventListener('change', () => {
    updateCell(current.r, current.c, { iconFill: box.checked ? input.value : null });
    render(peekCell(current.r, current.c));
  });
  item.querySelector('.defaults__label').prepend(box);
  return item;
}

function swatch(label, value, onChange) {
  const item = document.createElement('label');
  item.className = 'defaults__item';
  const name = document.createElement('span');
  name.className = 'defaults__label';
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'defaults__swatch';
  input.value = value;
  input.setAttribute('aria-label', label);
  bindColorInput(input, () => onChange(input.value));
  item.append(name, input);
  return item;
}

function controlGroup(title) {
  const el = document.createElement('div');
  el.className = 'controlgroup';
  const h = document.createElement('span');
  h.className = 'controlgroup__title';
  h.textContent = title;
  el.appendChild(h);
  return el;
}

/** Copy / paste / delete live in the pane's header, under the title, so they are
 *  reached before any scrolling. */
function renderSquareActions() {
  const bar = document.getElementById('editor-actions');
  bar.replaceChildren();
  if (!current) return;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn';
  copy.textContent = 'Copy';
  copy.title = 'Copy this square: colors, icon, facing and every label line';
  copy.addEventListener('click', () => {
    copySquareFrom(current.r, current.c);
    render(peekCell(current.r, current.c));
  });

  const paste = document.createElement('button');
  paste.type = 'button';
  paste.className = 'btn';
  paste.textContent = 'Paste';
  paste.title = 'Clone the copied square onto this one, label text included';
  paste.disabled = !hasSquareClipboard();
  paste.addEventListener('click', () => {
    pasteSquareTo([keyOf(current.r, current.c)]);
    render(peekCell(current.r, current.c));
  });

  const del = deleteButton(() => [keyOf(current.r, current.c)],
                           () => ({ r: current.r, c: current.c }));
  del.style.marginRight = '';
  bar.append(copy, paste, del);
}
