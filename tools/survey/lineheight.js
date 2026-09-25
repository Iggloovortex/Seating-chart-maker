// LINE-HEIGHT PICTURE — every kind of thing that stacks label lines, grid beside
// export, at the SAME font size, with each line's box outlined and its pitch (top of
// one line to the top of the next) written on it. Pitch ÷ font size is the number
// that should match everywhere; the picture is so the difference can be SEEN.
//   node tools/survey/lineheight.js [outdir]      (server on :8123)
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// [case name, the two lines it stacks]. Names are distinct so the export's text calls
// can be traced back to their case.
const CASES = [
  ['Square',            ['Ann', 'Bob']],
  ['Split piece (half)', ['Cal', 'Dee']],
  ['Merged desk',       ['Eve', 'Fay']],
  ['Server rack',       ['Gus', 'Hal']],
  ['Chair',             ['Ivy', 'Jon']],
];

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  pg.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await pg.goto('http://localhost:8123/index.html');
  await pg.waitForTimeout(700);

  // ---- build: one case per row, column 1 (merges take columns 1-2)
  await pg.evaluate((CASES) => {
    setGrid(5, CASES.length * 2);
    state.merges = []; state.tables = []; state.walls = {};
    const lab = (ls) => ls.map((t) => ({ text: t, color: '#000000' }));
    const [sq, pc, mg, rk, ch] = CASES.map((c) => c[1]);
    updateCell(0, 1, { enabled: true, labels: lab(sq) });
    updateCell(2, 1, { enabled: true });
    splitCell(2, 1, 1, 2);
    updateSubcell(2, 1, 0, { enabled: true, labels: lab(pc) });
    updateCell(4, 1, { enabled: true, labels: lab(mg) });
    updateCell(4, 2, { enabled: true });
    state.selection = new Set(['4,1', '4,2']); addMerge('poly'); state.selection = new Set();
    updateCell(6, 1, { enabled: true, icon: 'server', labels: lab(rk) });
    updateCell(8, 1, { enabled: true, icon: 'chair', labels: lab(ch), rotation: 0 });
    emit();
  }, CASES);
  await pg.waitForTimeout(600);

  // ---- GRID: each line's box, from the rendered span, plus a crop of its case
  const grid = [];
  for (const [name, lines] of CASES) {
    const m = await pg.evaluate((lines) => {
      const spans = [...document.querySelectorAll('#chart .cell__label')]
        .filter((s) => lines.includes(s.textContent.trim()));
      spans.sort((a, b) => lines.indexOf(a.textContent.trim()) - lines.indexOf(b.textContent.trim()));
      const boxes = spans.map((s) => {
        const r = s.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height,
                 font: parseFloat(getComputedStyle(s).fontSize),
                 lh: getComputedStyle(s).lineHeight };
      });
      const x0 = Math.min(...boxes.map((q) => q.x)) - 24, y0 = Math.min(...boxes.map((q) => q.y)) - 14;
      const x1 = Math.max(...boxes.map((q) => q.x + q.w)) + 24, y1 = Math.max(...boxes.map((q) => q.y + q.h)) + 14;
      return { boxes, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
    }, lines);
    const png = await pg.screenshot({ clip: m.clip });
    grid.push({ name, ...m, png: png.toString('base64') });
  }

  // ---- EXPORT: trace every fillText of these lines (position, size, baseline)
  const exp = await pg.evaluate(async (CASES) => {
    const want = new Set(CASES.flatMap((c) => c[1]));
    const calls = [];
    const proto = CanvasRenderingContext2D.prototype;
    const real = proto.fillText;
    proto.fillText = function (text, x, y, ...rest) {
      const t = String(text).trim();
      if (want.has(t)) {
        const m = this.getTransform();
        const font = parseFloat(/(\d+(\.\d+)?)px/.exec(this.font)[1]);
        const w = this.measureText(String(text)).width;
        // Page position: through the current transform (rack / chair labels are drawn
        // translated and possibly turned).
        const px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
        calls.push({ t, px, py, font: font * Math.hypot(m.a, m.b), w: w * Math.hypot(m.a, m.b),
                     align: this.textAlign, base: this.textBaseline });
      }
      return real.call(this, text, x, y, ...rest);
    };
    let cv;
    try { cv = await renderToCanvas(150); } finally { proto.fillText = real; }
    return { calls, png: cv.toDataURL() };
  }, CASES);

  // ---- COMPOSE: one row per case, grid | export, export scaled to the grid's font
  const composed = await pg.evaluate(async ({ CASES, grid, exp }) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const expImg = await load(exp.png);
    const DPR = 2;                        // the page's deviceScaleFactor
    const ROW = 190, COL = 520, PAD = 24, HEAD = 70;
    const cv = document.createElement('canvas');
    cv.width = (PAD * 3 + COL * 2 + 360) * DPR;
    cv.height = (HEAD + CASES.length * ROW + 60) * DPR;
    const g = cv.getContext('2d');
    g.scale(DPR, DPR);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#111'; g.font = '700 20px system-ui, sans-serif';
    g.fillText('Line height — the same two lines in every case', PAD, 30);
    g.font = '600 13px system-ui, sans-serif'; g.fillStyle = '#555';
    g.fillText('Each line box outlined; the number on it is its PITCH (top to next top) ÷ font size. Export scaled to the grid’s font so the two can be compared.', PAD, 52);
    g.font = '700 14px system-ui, sans-serif'; g.fillStyle = '#111';
    g.fillText('EDITING GRID', PAD, HEAD + 8);
    g.fillText('EXPORT', PAD * 2 + COL, HEAD + 8);
    g.fillText('pitch ÷ font', PAD * 3 + COL * 2, HEAD + 8);

    const summary = [];
    const box = (x, y, w, h, color) => {
      g.save(); g.strokeStyle = color; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.strokeRect(x, y, w, h); g.restore();
    };
    const tag = (x, y, text, color) => {
      g.save(); g.font = '700 12px system-ui, sans-serif';
      const w = g.measureText(text).width + 10;
      g.fillStyle = color; g.fillRect(x, y - 13, w, 17);
      g.fillStyle = '#fff'; g.fillText(text, x + 5, y); g.restore();
    };

    for (let k = 0; k < CASES.length; k++) {
      const [name, lines] = CASES[k];
      const top = HEAD + 22 + k * ROW;
      g.font = '700 15px system-ui, sans-serif'; g.fillStyle = '#111';
      g.fillText(`${k + 1}. ${name}`, PAD, top + 4);

      // grid crop, at scale 1 (page px)
      const G = grid[k];
      const gi = await load('data:image/png;base64,' + G.png);
      const gx = PAD, gy = top + 14, gs = Math.min(1.6, (COL - 10) / G.clip.width, (ROW - 30) / G.clip.height);
      g.drawImage(gi, gx, gy, G.clip.width * gs, G.clip.height * gs);
      const gFont = G.boxes[0].font;
      G.boxes.forEach((q, i) => {
        const x = gx + (q.x - G.clip.x) * gs, y = gy + (q.y - G.clip.y) * gs;
        box(x, y, q.w * gs, q.h * gs, i ? '#d6336c' : '#1c7ed6');
      });
      const gPitch = G.boxes.length > 1 ? G.boxes[1].y - G.boxes[0].y : NaN;
      const gRatio = gPitch / gFont;
      tag(gx + G.clip.width * gs + 6, gy + 18, `${gRatio.toFixed(2)}×`, '#1c7ed6');
      g.save(); g.font = '600 11px system-ui, sans-serif'; g.fillStyle = '#666';
      g.fillText(`font ${gFont.toFixed(1)}px · pitch ${gPitch.toFixed(1)}px · css line-height: ${G.boxes[0].lh}`, gx, top + ROW - 6);
      g.restore();

      // export crop: the lines of this case, scaled so its font matches the grid's
      const cs = exp.calls.filter((c) => lines.includes(c.t));
      cs.sort((a, b) => lines.indexOf(a.t) - lines.indexOf(b.t));
      let eRatio = NaN, ePitch = NaN;
      if (cs.length) {
        const eFont = cs[0].font;
        const s = gFont / eFont * gs;                     // export px -> composite px
        const pitch = cs.length > 1 ? Math.hypot(cs[1].px - cs[0].px, cs[1].py - cs[0].py) : NaN;
        ePitch = pitch; eRatio = pitch / eFont;
        // Line boxes in export px: centred on each call's baseline when it is 'middle'.
        const lbox = (c) => {
          const h = isFinite(pitch) ? pitch : eFont * 1.2;
          const left = c.align === 'center' ? c.px - c.w / 2 : c.align === 'right' ? c.px - c.w : c.px;
          const topY = c.base === 'middle' ? c.py - h / 2 : c.base === 'top' ? c.py : c.py - h * 0.8;
          return { x: left, y: topY, w: c.w, h };
        };
        const lb = cs.map(lbox);
        const ex0 = Math.min(...lb.map((q) => q.x)) - 24 * (eFont / gFont);
        const ey0 = Math.min(...lb.map((q) => q.y)) - 14 * (eFont / gFont);
        const ex1 = Math.max(...lb.map((q) => q.x + q.w)) + 24 * (eFont / gFont);
        const ey1 = Math.max(...lb.map((q) => q.y + q.h)) + 14 * (eFont / gFont);
        const dx = PAD * 2 + COL, dy = top + 14;
        g.drawImage(expImg, ex0, ey0, ex1 - ex0, ey1 - ey0, dx, dy, (ex1 - ex0) * s, (ey1 - ey0) * s);
        lb.forEach((q, i) => box(dx + (q.x - ex0) * s, dy + (q.y - ey0) * s, q.w * s, q.h * s, i ? '#d6336c' : '#1c7ed6'));
        tag(dx + (ex1 - ex0) * s + 6, dy + 18, `${eRatio.toFixed(2)}×`, '#2f9e44');
        g.save(); g.font = '600 11px system-ui, sans-serif'; g.fillStyle = '#666';
        g.fillText(`font ${eFont.toFixed(1)}px · pitch ${pitch.toFixed(1)}px (at 150dpi)`, dx, top + ROW - 6);
        g.restore();
      }

      // summary bar
      const sx = PAD * 3 + COL * 2;
      g.save(); g.font = '700 13px system-ui, sans-serif';
      g.fillStyle = '#1c7ed6'; g.fillText(`grid   ${isFinite(gRatio) ? gRatio.toFixed(2) + '×' : '—'}`, sx, top + 40);
      g.fillStyle = '#2f9e44'; g.fillText(`export ${isFinite(eRatio) ? eRatio.toFixed(2) + '×' : '—'}`, sx, top + 62);
      g.restore();
      summary.push({ name, grid: +gRatio.toFixed(3), export: +eRatio.toFixed(3),
                     gridFont: gFont, gridPitch: +gPitch.toFixed(2), exportPitch: +(+ePitch).toFixed(2) });
    }
    return { png: cv.toDataURL(), summary };
  }, { CASES, grid, exp });

  fs.writeFileSync(path.join(OUT, 'lineheight.png'), Buffer.from(composed.png.split(',')[1], 'base64'));
  console.log('case'.padEnd(20), 'grid ×font', ' export ×font', '  grid pitch');
  for (const s of composed.summary)
    console.log(s.name.padEnd(20), String(s.grid).padEnd(11), String(s.export).padEnd(12), `${s.gridPitch}px @ ${s.gridFont}px`);
  console.log('\nwrote ' + path.join(OUT, 'lineheight.png'));
  await b.close();
})();
