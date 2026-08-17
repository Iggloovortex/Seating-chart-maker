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

function initRows() {
  const btn = document.getElementById('btn-rows');
  if (!btn) return;
  btn.disabled = false;
  btn.title = 'Download every square as a tab-separated sheet';
  btn.addEventListener('click', () => exportRows(state.title || 'seating-chart'));
}
