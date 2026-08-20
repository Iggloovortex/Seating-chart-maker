// rows.js — every square as a flat row of named fields.
//
// This is the shared substrate under the Spreadsheet export/import and, later,
// the filter search: one place that decides what a square's fields are called
// and what they hold. Read-only — nothing here changes state.
//
// TAB-delimited, not comma. Labels routinely contain commas ("Smith, J.") and
// essentially never contain tabs, so the whole quoting problem goes away: no
// escaping to get wrong on the way out, no quoted-field parser to get wrong on
// the way back. Spreadsheets paste TSV natively.

const ROW_SEP = '\n';
const COL_SEP = '\t';

/** Deepest label stack in the chart, so the header is as wide as it needs to be
 *  and no wider. Always at least 1, so an empty chart still has a Label column
 *  to type into. */
function maxLabelDepth() {
  let n = 1;
  for (const cell of state.cells.values()) n = Math.max(n, (cell.labels || []).length);
  return n;
}

/** The column names, in order. Label columns come in text/colour pairs so a
 *  human editing the file sees each line next to its own colour. */
function rowColumns() {
  const cols = ['row', 'col', 'filled'];
  const depth = maxLabelDepth();
  for (let i = 1; i <= depth; i++) cols.push(`label${i}`, `label${i}Color`);
  cols.push('icon', 'iconColor', 'iconFill', 'fill', 'border', 'facing', 'table');
  return cols;
}

/** Which table covers a square, named by its 1-based position in state.tables
 *  rather than its internal id — an id like "tmf3k2" means nothing in a
 *  spreadsheet, and the ids are regenerated on every load anyway. */
function tableIndexAt(r, c) {
  const k = keyOf(r, c);
  for (let i = 0; i < state.tables.length; i++) {
    if (tableCoverage(state.tables[i]).includes(k)) return i + 1;
  }
  return '';
}

/** One plain object per square, row-major. Empty squares are included so the
 *  grid's shape survives the trip. */
function squareRows() {
  const depth = maxLabelDepth();
  const out = [];
  for (let r = 0; r < state.grid.rows; r++) {
    for (let c = 0; c < state.grid.cols; c++) {
      const cell = peekCell(r, c);
      const labels = (cell && cell.labels) || [];
      const row = {
        // 1-based, to match what the edit pane's title says.
        row: r + 1,
        col: c + 1,
        filled: cell && cell.enabled ? 'yes' : 'no',
      };
      for (let i = 0; i < depth; i++) {
        const line = labels[i];
        row[`label${i + 1}`] = (line && line.text) || '';
        row[`label${i + 1}Color`] = line ? (line.color || '') : '';
      }
      row.icon = (cell && cell.icon) || '';
      row.iconColor = (cell && cell.iconColor) || '';
      // null means "no fill", which is different from an empty cell meaning
      // "leave it alone" on the way back in.
      row.iconFill = (cell && cell.iconFill) || '';
      row.fill = (cell && cell.fill) || '';
      row.border = (cell && cell.border) || '';
      row.facing = cell ? (cell.rotation || 0) : 0;
      row.table = tableIndexAt(r, c);
      out.push(row);
    }
  }
  return out;
}

/** The rows as a tab-delimited sheet, header first. Any stray tab or newline in
 *  a value is turned into a space rather than escaped — the point of TSV is
 *  that there is no escaping to misread. */
function rowsToTsv(rows = squareRows(), cols = rowColumns()) {
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
  const lines = [cols.join(COL_SEP)];
  for (const row of rows) lines.push(cols.map((c) => clean(row[c])).join(COL_SEP));
  return lines.join(ROW_SEP) + ROW_SEP;
}

/** Download the sheet. `.tsv` rather than `.csv` so a spreadsheet opens it with
 *  the right delimiter instead of asking. */
function exportRows(name = 'seating-chart') {
  const blob = new Blob([rowsToTsv()], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitize(name)}.tsv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- import
//
// Opening a .tsv REPLACES the chart, exactly as a .seatchart does: the grid
// becomes whatever extent the sheet covers, a blank cell means "no value". The
// parser is deliberately forgiving, because a real round trip through Excel
// adds quotes around fields with commas, uppercases hex colours, rewrites the
// line endings as CRLF and may prepend a UTF-8 BOM — none of which the export
// ever wrote, all of which must still read back.

/** True when a filename ends in .tsv (case-insensitive). */
function hasTsvExtension(name) {
  return /\.tsv$/i.test(String(name || ''));
}

/** Drop a leading UTF-8 BOM and fold CRLF / CR line endings down to '\n'. */
function normalizeTsvText(text) {
  return String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Undo the quoting a spreadsheet adds: strip one pair of surrounding double
 *  quotes and turn each doubled "" back into a single ". Fields the app wrote
 *  itself are bare and pass straight through. */
function unquoteField(v) {
  let s = String(v ?? '');
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

/** A colour field as a lowercase #hex, or '' when it isn't one — <input
 *  type=color> rejects uppercase, and Excel hands hex back uppercased. */
function normalizeColor(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s) ? s : '';
}

/** Decide whether an opened file is a TSV sheet rather than a JSON chart. A
 *  .tsv name is decisive; otherwise a .seatchart always begins with '{', so
 *  anything else (a header line of tab-separated columns) is a sheet. */
function looksLikeTsv(name, text) {
  if (hasTsvExtension(name)) return true;
  return normalizeTsvText(text).replace(/^\s+/, '')[0] !== '{';
}

/** Parse a tab-delimited sheet (header first) into row objects keyed by column
 *  name. Tolerant of BOM, CRLF, spreadsheet quoting, and blank lines. */
function parseTsv(text) {
  const lines = normalizeTsvText(text).split(ROW_SEP);
  const header = (lines.shift() || '').split(COL_SEP).map((h) => unquoteField(h).trim());
  const rows = [];
  for (const line of lines) {
    if (line.trim() === '') continue; // trailing/blank lines carry no square
    const cells = line.split(COL_SEP);
    const row = {};
    header.forEach((name, j) => { row[name] = unquoteField(cells[j] ?? ''); });
    rows.push(row);
  }
  return rows;
}

/** Build a fresh chart from a tab-separated sheet and apply it, replacing the
 *  current chart. Lossy for tables — a sheet can't carry a table's shape,
 *  rotation, colour or border, so imported tables come back as default square
 *  tables grouping the squares that shared a `table` value. */
function importTsv(text) {
  const rows = parseTsv(text);
  let maxRow = 1, maxCol = 1;
  for (const row of rows) {
    const r = parseInt(row.row, 10);
    const c = parseInt(row.col, 10);
    if (Number.isFinite(r)) maxRow = Math.max(maxRow, r);
    if (Number.isFinite(c)) maxCol = Math.max(maxCol, c);
  }

  batch(() => {
    // Full reset, mirroring clearAll(), then grow/shrink to the sheet's extent.
    if (typeof resetSelectAnchor === 'function') resetSelectAnchor();
    state.title = '';
    state.cells.clear();
    state.tables = [];
    clearManualSelection();
    state.tableSelection.clear();
    setGrid(maxCol, maxRow); // (cols, rows); emit is suppressed inside batch

    const tableGroups = new Map(); // shared `table` value -> [cell keys]
    for (const row of rows) {
      const r = parseInt(row.row, 10) - 1;
      const c = parseInt(row.col, 10) - 1;
      if (!inBounds(r, c)) continue;
      const cell = getCell(r, c);

      // Labels: the non-empty labelN / labelNColor pairs, in order.
      const labels = [];
      for (let i = 1; (`label${i}` in row) || (`label${i}Color` in row); i++) {
        const textVal = row[`label${i}`] || '';
        if (!textVal) continue;
        const color = normalizeColor(row[`label${i}Color`]) || defaultLabelColor(labels.length);
        labels.push({ text: textVal, color });
      }
      cell.labels = labels;

      const icon = (row.icon || '').trim();
      cell.icon = ICON_IDS.includes(icon) ? icon : null; // unknown id => no icon

      // Malformed/empty colour leaves the makeCell() default in place.
      const iconColor = normalizeColor(row.iconColor);
      if (iconColor) cell.iconColor = iconColor;
      cell.iconFill = normalizeColor(row.iconFill) || null; // blank => outline
      const fill = normalizeColor(row.fill);
      if (fill) cell.fill = fill;
      const border = normalizeColor(row.border);
      if (border) cell.border = border;

      cell.rotation = Number(row.facing) || 0;
      cell.enabled = String(row.filled ?? '').trim().toLowerCase() === 'yes';

      const tval = String(row.table ?? '').trim();
      if (tval) (tableGroups.get(tval) || tableGroups.set(tval, []).get(tval)).push(keyOf(r, c));
    }

    // Rebuild tables as plain default square tables — the lossy part.
    let n = 0;
    for (const keys of tableGroups.values()) {
      if (!keys.length) continue;
      state.tables.push({
        id: `t${Date.now().toString(36)}${n++}`,
        cellKeys: keys,
        shape: 'square',
        color: state.defaults.tableColor,
        border: state.defaults.tableBorder,
        rotation: 0,
      });
    }
    pruneTables();
  });
  return true;
}

function initRows() {
  const btn = document.getElementById('btn-rows');
  if (!btn) return;
  btn.disabled = false;
  btn.title = 'Download every square as a tab-separated sheet';
  btn.addEventListener('click', () => exportRows(state.title || 'seating-chart'));
}
