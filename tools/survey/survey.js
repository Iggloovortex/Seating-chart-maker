const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-Seating-chart-maker/043675fc-7888-5119-be38-0ff2851328ad/scratchpad';
const builder = fs.readFileSync(S + '/survey-build.js', 'utf8');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2 });
  pg.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  await pg.goto('http://localhost:8123/index.html');
  await pg.waitForTimeout(700);
  await pg.addScriptTag({ content: builder });
  const out = await pg.evaluate(async () => {
    const rows = buildSurvey();
    await new Promise(x => setTimeout(x, 900));
    // Measure every rendered label span and icon in the grid.
    const num = (v) => Math.round(parseFloat(v) * 10) / 10;
    const seen = [];
    for (const { r, name } of rows) {
      const cells = [...document.querySelectorAll('.cell')]
        .filter((el) => el.dataset.key && parseKey(el.dataset.key)[0] === r);
      for (const cell of cells) {
        const hosts = [cell, ...cell.querySelectorAll('.subcell')];
        for (const host of hosts) {
          const span = host.querySelector('.cell__label');
          const icon = host.querySelector('.cell__icon, .cell__rackicon');
          if (!span && !icon) continue;
          const hb = host.getBoundingClientRect();
          const rec = { row: name, host: host === cell ? 'square' : 'piece',
                        box: `${Math.round(hb.width)}x${Math.round(hb.height)}` };
          if (span) {
            const cs = getComputedStyle(span);
            const sb = span.getBoundingClientRect();
            rec.font = num(cs.fontSize); rec.lineH = num(cs.lineHeight);
            rec.textW = Math.round(sb.width);
            rec.padTop = num(getComputedStyle(span.parentElement).paddingTop);
          }
          if (icon) {
            const ib = icon.getBoundingClientRect();
            rec.icon = Math.round(ib.width);
            rec.iconPct = Math.round((ib.width / hb.width) * 100);
          }
          seen.push(rec);
        }
      }
    }
    // merge overlays carry their own content wrappers
    for (const w of document.querySelectorAll('.merge-content, .merge-unit, .merge-furniture')) {
      const span = w.querySelector('.cell__label');
      const icon = w.querySelector('.cell__icon, .cell__rackicon');
      if (!span && !icon) continue;
      const hb = w.getBoundingClientRect();
      const rec = { row: 'MERGE OVERLAY', host: w.className.split(' ')[0],
                    box: `${Math.round(hb.width)}x${Math.round(hb.height)}` };
      if (span) { const cs = getComputedStyle(span);
        rec.font = num(cs.fontSize); rec.lineH = num(cs.lineHeight);
        rec.textW = Math.round(span.getBoundingClientRect().width); }
      if (icon) { const ib = icon.getBoundingClientRect();
        rec.icon = Math.round(ib.width); rec.iconPct = Math.round((ib.width / hb.width) * 100); }
      seen.push(rec);
    }
    return { rows: rows.map(x => x.name), seen, chart: serialize() };
  });
  fs.writeFileSync(S + '/survey.seatchart', typeof out.chart === 'string' ? out.chart : JSON.stringify(out.chart));
  // group the measurements by row for a readable table
  const by = {};
  for (const s of out.seen) (by[s.row] ||= []).push(s);
  for (const [row, list] of Object.entries(by)) {
    console.log('\n### ' + row);
    const key = (s) => `${s.host} ${s.box}`;
    const uniq = new Map();
    for (const s of list) {
      const k = `${s.host}|${s.box}|${s.font}|${s.lineH}|${s.icon}|${s.iconPct}`;
      if (!uniq.has(k)) uniq.set(k, { ...s, n: 0 });
      uniq.get(k).n++;
    }
    for (const s of uniq.values())
      console.log(`  ${String(s.host).padEnd(16)} box ${String(s.box).padEnd(9)} font ${String(s.font ?? '-').padEnd(6)} line ${String(s.lineH ?? '-').padEnd(6)} icon ${String(s.icon ?? '-').padEnd(5)} ${String(s.iconPct ?? '-').padStart(3)}%  x${s.n}`);
  }
  await pg.locator('#chart').screenshot({ path: S + '/survey-grid.png' });
  const png = await pg.evaluate(async () => (await renderToCanvas(150)).toDataURL());
  fs.writeFileSync(S + '/survey-export.png', Buffer.from(png.split(',')[1], 'base64'));
  await b.close();
})();
