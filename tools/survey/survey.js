// SURVEY — every kind of thing that renders text or an icon (survey-build.js), measured
// in BOTH renderers and put side by side. Sizes are given as a share of ONE FULL SQUARE,
// so the editing grid (px on screen) and the export (px at the print dpi) can be
// compared directly: where the two columns differ, the renderers disagree.
//   node tools/survey/survey.js [outdir]      (server on :8123)
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const builder = fs.readFileSync(path.join(__dirname, 'survey-build.js'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1700, height: 1400 } });
  pg.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await pg.goto('http://localhost:8123/index.html');
  await pg.waitForTimeout(700);
  await pg.addScriptTag({ content: builder });

  const out = await pg.evaluate(async () => {
    const rows = buildSurvey();
    await new Promise((z) => setTimeout(z, 900));
    const rowName = new Map(rows.map((x) => [x.r, x.name]));
    const nameOf = (r) => rowName.get(r) || rowName.get(r - 1) || null;

    // ---------------- GRID: every label span and icon, by the square it belongs to
    // A full square in the grid, px: the DRAWN square, measured off a real, unweighted
    // one. The layout unit includes the CELL_GAP inset between squares, which the
    // gapless export does not have — dividing by it read every grid size ~10% small.
    const ref = document.querySelector('#chart .cell[data-key="1,13"]')
             || document.querySelector('#chart .cell');
    const gUnit = ref.getBoundingClientRect().width;
    const gLayout = layoutUnit();
    const grid = {};
    const add = (bag, name, kind, v) => {
      if (!name || !(v > 0)) return;
      ((bag[name] ||= {})[kind] ||= []).push(v);
    };
    for (const span of document.querySelectorAll('#chart .cell__label')) {
      const host = span.closest('[data-key]');
      if (!host) continue;
      const cs = getComputedStyle(span);
      const font = parseFloat(cs.fontSize);
      const lh = cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight);
      const name = nameOf(parseKey(host.dataset.key)[0]);
      add(grid, name, 'font', font / gUnit);
      if (isFinite(lh)) add(grid, name, 'line', lh / font);
      else add(grid, name, 'lineNormal', 1);
    }
    for (const icon of document.querySelectorAll('#chart .cell__icon')) {
      const host = icon.closest('[data-key]');
      if (!host) continue;
      const r = icon.getBoundingClientRect();
      add(grid, nameOf(parseKey(host.dataset.key)[0]), 'icon', Math.sqrt(r.width * r.height) / gUnit);
    }

    // ---------------- EXPORT: trace every fillText and drawImage through the render
    const calls = [];
    const P = CanvasRenderingContext2D.prototype;
    const realText = P.fillText, realImg = P.drawImage;
    const page = (ctx, x, y) => {
      const m = ctx.getTransform();
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, s: Math.hypot(m.a, m.b) };
    };
    P.fillText = function (text, x, y, ...rest) {
      const p = page(this, x, y);
      const f = /(\d+(\.\d+)?)px/.exec(this.font);
      if (f && String(text).trim()) calls.push({ kind: 'text', x: p.x, y: p.y, font: parseFloat(f[1]) * p.s });
      return realText.call(this, text, x, y, ...rest);
    };
    P.drawImage = function (...a) {
      if (a.length === 5) {
        const p = page(this, a[1] + a[3] / 2, a[2] + a[4] / 2);
        calls.push({ kind: 'icon', x: p.x, y: p.y, size: Math.sqrt(a[3] * a[4]) * p.s });
      }
      return realImg.apply(this, a);
    };
    try { await renderToCanvas(150); } finally { P.fillText = realText; P.drawImage = realImg; }
    // renderToCanvas laid the chart out last, so the layout cache holds EXPORT rects.
    const eUnit = layoutUnit();
    const rowAt = (x, y) => {
      for (const [key, rc] of LAYOUT_RECTS) {
        if (x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h) return parseKey(key)[0];
      }
      return null;
    };
    const exp = {};
    for (const c of calls) {
      const r = rowAt(c.x, c.y);
      if (r == null) continue;
      if (c.kind === 'text') add(exp, nameOf(r), 'font', c.font / eUnit);
      else add(exp, nameOf(r), 'icon', c.size / eUnit);
    }
    const png = await (async () => (await renderToCanvas(150)).toDataURL())();
    return { rows: rows.map((x) => x.name), grid, exp, gUnit, gLayout, eUnit, png, chart: serialize() };
  });

  fs.writeFileSync(path.join(OUT, 'survey-export.png'), Buffer.from(out.png.split(',')[1], 'base64'));
  await pg.locator('#chart').screenshot({ path: path.join(OUT, 'survey-grid.png') });
  fs.writeFileSync(path.join(OUT, 'survey.seatchart'),
    typeof out.chart === 'string' ? out.chart : JSON.stringify(out.chart));

  // Distinct values, rounded — a case usually has one or two sizes.
  const set = (a) => a && a.length ? [...new Set(a.map((v) => v.toFixed(3)))].sort() : [];
  const fmt = (a) => (a.length ? a.join(' ') : '—');
  // Where both renderers report a size, do they agree within 5%?
  const agree = (g, e) => {
    if (!g.length || !e.length) return '';
    const mg = Math.max(...g.map(Number)), me = Math.max(...e.map(Number));
    const d = Math.abs(mg - me) / Math.max(mg, me);
    return d <= 0.05 ? 'ok' : `DIFF ${Math.round(d * 100)}%`;
  };
  console.log(`full square: grid ${out.gUnit.toFixed(1)}px drawn (layout unit ${out.gLayout.toFixed(1)} incl. gap), export ${out.eUnit.toFixed(1)}px — every size below is a share of it\n`);
  for (const name of out.rows) {
    const g = out.grid[name] || {}, e = out.exp[name] || {};
    const gf = set(g.font), ef = set(e.font), gi = set(g.icon), ei = set(e.icon);
    console.log(`### ${name}`);
    console.log(`  text   grid ${fmt(gf).padEnd(26)} export ${fmt(ef).padEnd(26)} ${agree(gf, ef)}`);
    console.log(`  icon   grid ${fmt(gi).padEnd(26)} export ${fmt(ei).padEnd(26)} ${agree(gi, ei)}`);
    const lines = set(g.line);
    if (lines.length || g.lineNormal) {
      console.log(`  line   grid ${fmt(lines)}${g.lineNormal ? ' + normal×' + g.lineNormal.length : ''}   export 1.220`);
    }
  }
  console.log('\nwrote survey-grid.png, survey-export.png, survey.seatchart to ' + OUT);
  await b.close();
})();
