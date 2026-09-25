// ICON "LIMIT BREAK" OPTIONS — the same cases rendered by the REAL export code under
// several icon limits, side by side, with today's editing grid as the first column.
// Only the limit constants change between columns (served through a patched copy of
// the source, so nothing in the repo is edited to make the picture).
//   node tools/survey/icon-options.js [outdir]      (server on :8123)
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// labelled: MAX_ICON (icon + labels) · alone: an icon with no labels · room: a merged
// desk's ICON_ROOM (share of its short side). Each is a share of one square.
// `own`: a labelled icon takes the room left by ITS OWN lines, not by the most-lined
// square in the whole chart (planContent's maxLines), which is what actually holds a
// one-line desk's icon down today — the cap above it rarely comes into play.
const OPTIONS = [
  { name: 'A  today',            labelled: 0.62, alone: 0.60, room: 0.70 },
  { name: 'B  +15%',             labelled: 0.72, alone: 0.70, room: 0.80 },
  { name: 'C  +30%',             labelled: 0.80, alone: 0.78, room: 0.88 },
  { name: 'D  no cap',           labelled: 0.94, alone: 0.88, room: 0.94 },
  { name: 'E  +15%, own room',   labelled: 0.72, alone: 0.70, room: 0.80, own: true },
  { name: 'F  +30%, own room',   labelled: 0.80, alone: 0.78, room: 0.88, own: true },
];

const CASES = [
  ['icon alone',            [1, 1]],
  ['icon + 1 line',         [1, 3]],
  ['icon + 2 lines',        [1, 5]],
  ['double monitor + line', [1, 7]],
  ['quarter piece + line',  [3, 1]],
  ['2×1 merged desk + line', [3, 3]],
];

function build() {
  setGrid(10, 5);
  state.merges = []; state.tables = []; state.walls = {};
  const lab = (...t) => t.map((x) => ({ text: x, color: '#1f2933' }));
  updateCell(1, 1, { enabled: true, icon: 'monitor' });
  updateCell(1, 3, { enabled: true, icon: 'monitor', labels: lab('Ann Lee') });
  updateCell(1, 5, { enabled: true, icon: 'monitor', labels: lab('Ann Lee', 'Desk 4') });
  updateCell(1, 7, { enabled: true, icon: 'monitor2', labels: lab('CBS-KVM') });
  updateCell(3, 1, { enabled: true });
  splitCell(3, 1, 2, 2);
  updateSubcell(3, 1, 0, { enabled: true, icon: 'monitor', labels: lab('Ann') });
  updateCell(3, 3, { enabled: true, icon: 'monitor', labels: lab('Ann Lee') });
  updateCell(3, 4, { enabled: true });
  state.selection = new Set(['3,3', '3,4']); addMerge('poly'); state.selection = new Set();
  emit();
}

async function crops(pg, useExport) {
  return pg.evaluate(async ({ CASES, useExport }) => {
    await new Promise((z) => setTimeout(z, 500));
    const boxOf = (r, c, span) => {
      if (useExport) {
        const a = LAYOUT_RECTS.get(keyOf(r, c)), b = LAYOUT_RECTS.get(keyOf(r, c + span - 1));
        return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h };
      }
      const a = document.querySelector(`.cell[data-key="${r},${c}"]`).getBoundingClientRect();
      const b = document.querySelector(`.cell[data-key="${r},${c + span - 1}"]`).getBoundingClientRect();
      return { x: a.left, y: a.top, w: b.right - a.left, h: a.height };
    };
    let src;
    if (useExport) src = (await renderToCanvas(150)).toDataURL();
    const out = CASES.map(([name, [r, c]]) => boxOf(r, c, name.startsWith('2×1') ? 2 : 1));
    return { src, boxes: out };
  }, { CASES, useExport });
}

(async () => {
  const b = await chromium.launch();
  const columns = [];

  // Column 0: today's editing grid.
  {
    const pg = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
    await pg.goto('http://localhost:8123/index.html');
    await pg.waitForTimeout(700);
    await pg.evaluate(build);
    const { boxes } = await crops(pg, false);
    const shots = [];
    for (const q of boxes) {
      shots.push((await pg.screenshot({ clip: { x: q.x, y: q.y, width: q.w, height: q.h } })).toString('base64'));
    }
    columns.push({ name: 'grid today', shots: shots.map((s) => 'data:image/png;base64,' + s) });
    await pg.close();
  }

  // Columns 1..n: the export under each limit.
  const exportSrc = fs.readFileSync(path.join(ROOT, 'js', 'export.js'), 'utf8');
  const layoutSrc = fs.readFileSync(path.join(ROOT, 'js', 'layout.js'), 'utf8');
  for (const opt of OPTIONS) {
    const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
    const ex = exportSrc
      .replace(/const MAX_ICON = [\d.]+;/, `const MAX_ICON = ${opt.labelled};`)
      .replace('s * (labels.length ? plan.iconFrac : 0.6)', opt.own
        ? `s * (labels.length ? Math.max(MIN_ICON, Math.min(MAX_ICON, 0.94 - labels.length * plan.lineFrac)) : ${opt.alone})`
        : `s * (labels.length ? plan.iconFrac : ${opt.alone})`);
    const la = layoutSrc.replace(/const ICON_ROOM = [\d.]+;/, `const ICON_ROOM = ${opt.room};`);
    // Every limit must be FOUND in the source, or that column silently shows today's
    // look under another name. (Comparing the text for a change is wrong: option A
    // swaps in the values already there.)
    const found = [/const MAX_ICON = [\d.]+;/.test(exportSrc),
                   exportSrc.includes('s * (labels.length ? plan.iconFrac : 0.6)'),
                   /const ICON_ROOM = [\d.]+;/.test(layoutSrc)];
    if (found.includes(false)) throw new Error('a limit constant was not found: ' + found);
    await pg.route('**/js/export.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ex }));
    await pg.route('**/js/layout.js', (r) => r.fulfill({ contentType: 'text/javascript', body: la }));
    await pg.goto('http://localhost:8123/index.html');
    await pg.waitForTimeout(700);
    await pg.evaluate(build);
    const { src, boxes } = await crops(pg, true);
    columns.push({ name: opt.name, src, boxes, opt });
    await pg.close();
  }

  // Compose: one row per case, one column per option.
  const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const png = await pg.evaluate(async ({ CASES, columns }) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const CELL = 150, GAP = 22, LEFT = 190, TOP = 110;
    const wide = (k) => CASES[k][0].startsWith('2×1');
    const colW = CELL * 2 + 10;
    const cv = document.createElement('canvas');
    const W = LEFT + columns.length * (colW + GAP), H = TOP + CASES.length * (CELL + GAP) + 20;
    cv.width = W * 2; cv.height = H * 2;
    const g = cv.getContext('2d'); g.scale(2, 2);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111'; g.font = '700 20px system-ui, sans-serif';
    g.fillText('Icon limits — the same squares under each option (export renderer)', 20, 32);
    g.font = '600 12px system-ui, sans-serif'; g.fillStyle = '#555';
    g.fillText('A–D raise the cap only. A labelled icon is really held by the MOST-lined square in the chart (a 2-line one here), so A–D barely move it; E–F size each square from its OWN lines.', 20, 54);
    for (let j = 0; j < columns.length; j++) {
      const col = columns[j];
      const x = LEFT + j * (colW + GAP);
      g.fillStyle = '#111'; g.font = '700 15px system-ui, sans-serif';
      g.fillText(col.name, x, TOP - 30);
      if (col.opt) {
        g.font = '600 11px system-ui, sans-serif'; g.fillStyle = '#666';
        g.fillText(`labels ≤${col.opt.labelled} · alone ${col.opt.alone} · desk ${col.opt.room}${col.opt.own ? ' · OWN lines' : ''}`, x, TOP - 14);
      } else {
        g.font = '600 11px system-ui, sans-serif'; g.fillStyle = '#666';
        g.fillText('.cell__icon 46%, capped 38px', x, TOP - 14);
      }
      const img = col.src ? await load(col.src) : null;
      for (let k = 0; k < CASES.length; k++) {
        const y = TOP + k * (CELL + GAP);
        const w = wide(k) ? CELL * 2 : CELL;
        if (img) {
          const q = col.boxes[k];
          g.drawImage(img, q.x, q.y, q.w, q.h, x, y, w, CELL);
        } else {
          g.drawImage(await load(col.shots[k]), x, y, w, CELL);
        }
      }
    }
    g.font = '700 13px system-ui, sans-serif'; g.fillStyle = '#111';
    for (let k = 0; k < CASES.length; k++) g.fillText(CASES[k][0], 20, TOP + k * (CELL + GAP) + CELL / 2);
    return cv.toDataURL();
  }, { CASES, columns: columns.map((c) => ({ name: c.name, src: c.src, boxes: c.boxes, shots: c.shots, opt: c.opt })) });
  const file = path.join(OUT, 'icon-options.png');
  fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote ' + file);
  await b.close();
})();
