// A split piece's names stay INSIDE it until keeping them there would make the text
// (or the icon beside it) too small to read — only then do they hang outside. This
// checks the call in BOTH renderers, piece by piece, and that the two agree.
//   node tools/tests/piece-labels.js        (server on :8123)
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const CASES = [
  // [name, split rows, cols, labels, icon, expect]
  // Every name is distinct, so the export's record can be keyed on the text itself —
  // tagging a name to make it unique would lengthen it and change the answer.
  ['halves, short name',        1, 2, ['Ann'],              'monitor', 'inside'],
  ['stacked, short name',       2, 1, ['Bea'],              'monitor', 'inside'],
  ['quarters, short name',      2, 2, ['Cal'],              'monitor', 'inside'],
  ['thirds, short name',        1, 3, ['Dee'],              'monitor', 'inside'],
  ['ninths, short name',        3, 3, ['Eve'],              'monitor', 'inside'],
  ['ninths, two lines',         3, 3, ['Fay', 'Desk 4'],    'monitor', 'hang'],
  ['thirds, long name',         1, 3, ['Tech Manager 2'],   'monitor', 'hang'],
  ['quarters, long name',       2, 2, ['Production Lead'],  'monitor', 'hang'],
  ['quarters, no icon, 2 lines',2, 2, ['Gus', 'Hal'],       null,      'inside'],
];

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  pg.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await pg.goto('http://localhost:8123/index.html');
  await pg.waitForTimeout(700);

  const res = await pg.evaluate(async (CASES) => {
    setGrid(3, CASES.length * 2 + 1);   // (cols, rows)
    state.merges = []; state.tables = [];
    if (state.config) state.config.floatLabels = true;
    CASES.forEach(([, rows, cols, labels, icon], k) => {
      const r = k * 2;
      updateCell(r, 1, { enabled: true });
      splitCell(r, 1, rows, cols);
      updateSubcell(r, 1, 0, { enabled: true, icon,
        labels: labels.map((t) => ({ text: t, color: '#000' })) });
    });
    emit();
    await new Promise((z) => setTimeout(z, 500));

    // GRID: a hanging piece carries .subcell--floatlabel.
    const grid = CASES.map((_, k) => {
      const el = document.querySelector(`.cell[data-key="${k * 2},1"] .subcell[data-sub="0"]`);
      return el ? (el.classList.contains('subcell--floatlabel') ? 'hang' : 'inside') : 'missing';
    });

    // EXPORT: a kept name goes through drawContent with its labels; a hung one through
    // drawLabelBox in the late pass. Wrap both and record which one carried each name.
    const seen = {};
    const tag = (labels) => (labels || []).map((l) => l.text).join('|');
    const oc = window.drawContent, ol = window.drawLabelBox;
    window.drawContent = function (...a) { const d = a[5]; if (d && d.labels && d.labels.length) seen[tag(d.labels)] = 'inside'; return oc.apply(this, a); };
    window.drawLabelBox = function (...a) { const d = a[2]; if (d && d.labels) seen[tag(d.labels)] = 'hang'; return ol.apply(this, a); };
    try { await renderToCanvas(150); } finally { window.drawContent = oc; window.drawLabelBox = ol; }
    const exp = CASES.map(([, , , labels], k) => {
      const key = labels.join('|');
      return seen[key] || 'missing';
    });
    return { grid, exp };
  }, CASES);

  let bad = 0;
  CASES.forEach(([name, , , , , want], k) => {
    const g = res.grid[k], e = res.exp[k];
    const ok = g === want && e === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} grid ${g.padEnd(7)} export ${e.padEnd(7)} want ${want}`);
  });
  console.log(`\n${CASES.length - bad}/${CASES.length} passed`);
  await b.close();
  if (bad) process.exit(1);
})();
