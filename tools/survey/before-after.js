// BEFORE / AFTER — one scene rendered by two builds of the app (two ports), grid and
// export each, side by side. Used to show a rendering change before it is committed:
// serve the committed tree on one port and the working tree on another.
//   node tools/survey/before-after.js [outdir] [beforeUrl] [afterUrl]
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'out');
const BEFORE = process.argv[3] || 'http://localhost:8124/index.html';
const AFTER = process.argv[4] || 'http://localhost:8123/index.html';
fs.mkdirSync(OUT, { recursive: true });

const CASES = [
  ['icon alone',              [1, 1], 1],
  ['double monitor alone',    [1, 3], 1],
  ['icon + 1 line',           [1, 5], 1],
  ['icon + 2 lines',          [1, 7], 1],
  ['double monitor + 1 line', [3, 1], 1],
  ['quarter piece + 1 line',  [3, 3], 1],
  ['2×1 merged desk + line',  [3, 5], 2],
  ['centred desk + line',     [7, 1], 2],
  ['two-line labels',         [5, 1], 1],
  ['chair + 2 lines',         [5, 3], 1],
];

function build() {
  setGrid(10, 9);   // (cols, rows)
  state.merges = []; state.tables = []; state.walls = {};
  const lab = (...t) => t.map((x) => ({ text: x, color: '#1f2933' }));
  updateCell(1, 1, { enabled: true, icon: 'monitor' });
  updateCell(1, 3, { enabled: true, icon: 'monitor2' });
  updateCell(1, 5, { enabled: true, icon: 'monitor', labels: lab('Ann Lee') });
  updateCell(1, 7, { enabled: true, icon: 'monitor', labels: lab('Ann Lee', 'Desk 4') });
  updateCell(3, 1, { enabled: true, icon: 'monitor2', labels: lab('CBS-KVM') });
  updateCell(3, 3, { enabled: true });
  splitCell(3, 3, 2, 2);
  updateSubcell(3, 3, 0, { enabled: true, icon: 'monitor', labels: lab('Ann') });
  updateCell(3, 5, { enabled: true, icon: 'monitor', labels: lab('Ann Lee') });
  updateCell(3, 6, { enabled: true });
  state.selection = new Set(['3,5', '3,6']); addMerge('poly'); state.selection = new Set();
  updateCell(5, 1, { enabled: true, labels: lab('Ann Lee', 'Desk 4') });
  updateCell(5, 3, { enabled: true, icon: 'chair', labels: lab('Ann', 'Lee') });
  updateCell(7, 1, { enabled: true, icon: 'monitor', labels: lab('Ann Lee') });
  updateCell(7, 2, { enabled: true });
  state.selection = new Set(['7,1', '7,2']); addMerge('unit'); state.selection = new Set();
  emit();
}

async function renderBuild(b, url) {
  const pg = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  pg.on('pageerror', (e) => console.log('PAGEERROR ' + url + ' ' + e.message));
  await pg.goto(url);
  await pg.waitForTimeout(700);
  await pg.evaluate(build);
  await pg.waitForTimeout(500);
  const gridBoxes = await pg.evaluate((CASES) => CASES.map(([, [r, c], span]) => {
    const a = document.querySelector(`.cell[data-key="${r},${c}"]`).getBoundingClientRect();
    const z = document.querySelector(`.cell[data-key="${r},${c + span - 1}"]`).getBoundingClientRect();
    return { x: a.left, y: a.top, width: z.right - a.left, height: a.height };
  }), CASES);
  const grid = [];
  for (const q of gridBoxes) grid.push('data:image/png;base64,' + (await pg.screenshot({ clip: q })).toString('base64'));
  const exp = await pg.evaluate(async (CASES) => {
    const src = (await renderToCanvas(150)).toDataURL();
    const boxes = CASES.map(([, [r, c], span]) => {
      const a = LAYOUT_RECTS.get(keyOf(r, c)), z = LAYOUT_RECTS.get(keyOf(r, c + span - 1));
      return { x: a.x, y: a.y, w: z.x + z.w - a.x, h: a.h };
    });
    return { src, boxes };
  }, CASES);
  await pg.close();
  return { grid, exp };
}

(async () => {
  const b = await chromium.launch();
  const before = await renderBuild(b, BEFORE);
  const after = await renderBuild(b, AFTER);
  const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const png = await pg.evaluate(async ({ CASES, before, after }) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const CELL = 130, GAP = 18, LEFT = 200, TOP = 96, COLW = CELL * 2 + 16;
    const cols = [['BEFORE · grid', before, 'grid'], ['BEFORE · export', before, 'exp'],
                  ['AFTER · grid', after, 'grid'], ['AFTER · export', after, 'exp']];
    const W = LEFT + cols.length * (COLW + GAP), H = TOP + CASES.length * (CELL + GAP) + 10;
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
    const g = cv.getContext('2d'); g.scale(2, 2);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111'; g.font = '700 20px system-ui, sans-serif';
    g.fillText('Before / after — icons follow the export (option E), labels follow the grid (1.15 lines)', 20, 32);
    g.font = '600 12px system-ui, sans-serif'; g.fillStyle = '#555';
    g.fillText('Each square rendered by the committed build (before) and the working tree (after), in the editing grid and in the export.', 20, 54);
    for (let j = 0; j < cols.length; j++) {
      const [name, build, kind] = cols[j];
      const x = LEFT + j * (COLW + GAP);
      g.fillStyle = j >= 2 ? '#2f9e44' : '#868e96'; g.font = '700 14px system-ui, sans-serif';
      g.fillText(name, x, TOP - 14);
      const img = kind === 'exp' ? await load(build.exp.src) : null;
      for (let k = 0; k < CASES.length; k++) {
        const y = TOP + k * (CELL + GAP);
        const w = CASES[k][2] === 2 ? CELL * 2 : CELL;
        if (img) { const q = build.exp.boxes[k]; g.drawImage(img, q.x, q.y, q.w, q.h, x, y, w, CELL); }
        else g.drawImage(await load(build.grid[k]), x, y, w, CELL);
      }
    }
    g.font = '700 13px system-ui, sans-serif'; g.fillStyle = '#111';
    for (let k = 0; k < CASES.length; k++) g.fillText(CASES[k][0], 20, TOP + k * (CELL + GAP) + CELL / 2);
    return cv.toDataURL();
  }, { CASES, before, after });
  const file = path.join(OUT, 'before-after.png');
  fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote ' + file);
  await b.close();
})();
