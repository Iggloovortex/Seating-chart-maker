// Behaviour suite for the one hit test (targetAt). Every gesture the refactor
// touched: tap, hover, keyboard, right-click, drag slots — on plain, split,
// merged, unit-merged, table-covered and seam points.
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const results = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} got ${JSON.stringify(got)}${ok ? '' : '  want ' + JSON.stringify(want)}`);
};

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1300, height: 950 } });
  pg.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  await pg.goto('http://localhost:8123/index.html');
  await pg.waitForTimeout(700);

  // Helpers installed in the page.
  await pg.evaluate(() => {
    window.T = {
      reset() {
        state.merges = []; state.tables = []; state.walls = {};
        state.tableSelection.clear(); clearManualSelection();
        setSelectMode && setSelectMode(false);
        setWallsMode(false);
        if (typeof closeEditor === 'function') closeEditor();
        setGrid(8, 8);
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) updateCell(r, c, { enabled: false, labels: [], icon: null, split: null, subcells: null });
        emit();
      },
      centre(key, sub) {
        const cell = document.querySelector(`.cell[data-key="${key}"]`);
        const el = sub == null ? cell : cell.querySelector(`.subcell[data-sub="${sub}"]`);
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      },
      press(key, sub, mods = {}) {
        const cell = document.querySelector(`.cell[data-key="${key}"]`);
        const el = sub == null ? cell : cell.querySelector(`.subcell[data-sub="${sub}"]`);
        const [x, y] = T.centre(key, sub);
        const o = { clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: 'mouse', ...mods };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        el.dispatchEvent(new PointerEvent('pointerup', o));
      },
      hover(x, y) {
        document.getElementById('stage').dispatchEvent(
          new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
      },
      lit() {
        return {
          table: !!document.querySelector('.table-shape--hot'),
          merge: !!document.querySelector('.merge--hot'),
          wall: !document.querySelector('.wall-hint').hidden,
        };
      },
    };
  });

  const run = (fn, arg) => pg.evaluate(fn, arg);

  // ---- 1. plain square: tap seats it
  check('plain square tap seats', await run(async () => {
    T.reset(); await new Promise(z => setTimeout(z, 150));
    T.press('2,2'); await new Promise(z => setTimeout(z, 100));
    return !!peekCell(2, 2).enabled;
  }), true);

  // ---- 2. split piece: tap fills just that piece
  check('split piece tap fills the piece', await run(async () => {
    T.reset(); splitCell(2, 2, 2, 2); emit(); await new Promise(z => setTimeout(z, 200));
    T.press('2,2', 1); await new Promise(z => setTimeout(z, 100));
    const subs = peekCell(2, 2).subcells;
    return [!!subs[0].enabled, !!subs[1].enabled];
  }), [false, true]);

  // ---- 3. merged desk: ONE tap toggles the whole desk (a new merge starts filled)
  check('merge tap toggles the whole desk', await run(async () => {
    T.reset();
    clearManualSelection(); ['2,2', '2,3'].forEach(k => state.selection.add(k));
    const m = addMerge('poly'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 200));
    const before = mergeIsEmpty(state.merges[0]);
    T.press('2,3'); await new Promise(z => setTimeout(z, 120));
    return [before, mergeIsEmpty(state.merges[0])];
  }), [false, true]);

  // ---- 4. unit merge: the bare surround is a no-op, the centred square is not
  check('unit merge surround tap is a no-op', await run(async () => {
    T.reset();
    clearManualSelection(); ['2,1', '2,2', '2,3'].forEach(k => state.selection.add(k));
    addMerge('unit'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 250));
    const before = !mergeIsEmpty(state.merges[0]);
    T.press('2,1');                       // far end of the desk = bare surround
    await new Promise(z => setTimeout(z, 120));
    return [before, !mergeIsEmpty(state.merges[0])];
  }), [true, true]);

  // ---- 5. select mode: a tap on any member gathers the WHOLE merge
  check('select-mode tap gathers the whole merge', await run(async () => {
    T.reset();
    clearManualSelection(); ['2,2', '2,3'].forEach(k => state.selection.add(k));
    addMerge('poly'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 200));
    T.press('2,3', null, { ctrlKey: true });
    await new Promise(z => setTimeout(z, 120));
    return state.selection.size;
  }), 2);

  // ---- 6. Shift rectangle is struck from the square pressed, not a merge anchor
  check('shift rect uses the pressed square', await run(async () => {
    T.reset();
    clearManualSelection(); ['2,2', '2,3'].forEach(k => state.selection.add(k));
    addMerge('poly'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 200));
    T.press('4,4', null, { shiftKey: true });          // anchor
    await new Promise(z => setTimeout(z, 100));
    T.press('2,3', null, { shiftKey: true });          // a MERGE member, anchor is 2,2
    await new Promise(z => setTimeout(z, 120));
    // rows 2..4 x cols 3..4 = 6 squares if struck from 2,3; 9 if from the anchor 2,2
    return state.selection.size;
  }), 6);

  // ---- 7. keyboard Enter on a covered square still picks the table
  check('keyboard Enter on covered square = table', await run(async () => {
    T.reset(); updateCell(2, 2, { enabled: true });
    clearManualSelection(); state.selection.add('2,2'); addTable('square');
    clearManualSelection(); state.tableSelection.clear(); emit();
    await new Promise(z => setTimeout(z, 200));
    const cell = document.querySelector('.cell[data-key="2,2"]');
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(z => setTimeout(z, 120));
    return state.tableSelection.size;
  }), 1);

  // ---- 8. right-click reaches THROUGH the table to the square
  check('right-click on covered square edits it', await run(async () => {
    T.reset(); updateCell(2, 2, { enabled: true });
    clearManualSelection(); state.selection.add('2,2'); addTable('square');
    clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 200));
    const [x, y] = T.centre('2,2');
    document.querySelector('.cell[data-key="2,2"]').dispatchEvent(
      new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true }));
    await new Promise(z => setTimeout(z, 150));
    const pane = document.getElementById('editor');
    return !!(pane && !pane.hidden);
  }), true);

  // ---- 9. hover lights EXACTLY one thing
  const litCases = await run(async () => {
    T.reset();
    for (const k of ['2,2', '2,3', '5,5']) { const [r, c] = parseKey(k); updateCell(r, c, { enabled: true }); }
    clearManualSelection(); ['2,2', '2,3'].forEach(k => state.selection.add(k));
    addMerge('poly'); clearManualSelection();
    state.selection.add('2,2'); state.selection.add('2,3'); addTable('square'); clearManualSelection();
    setWall('v', 5, 5, 'wall');
    emit(); await new Promise(z => setTimeout(z, 250));
    const out = {};
    T.hover(...T.centre('2,2')); await new Promise(z => setTimeout(z, 80));
    out.mergeUnderTable = T.lit();                       // table only — the click's target
    T.hover(...T.centre('5,5')); await new Promise(z => setTimeout(z, 80));
    out.plainSquare = T.lit();                           // nothing
    const a = document.querySelector('.cell[data-key="5,4"]').getBoundingClientRect();
    const b2 = document.querySelector('.cell[data-key="5,5"]').getBoundingClientRect();
    T.hover((a.right + b2.left) / 2, a.top + a.height / 2);
    await new Promise(z => setTimeout(z, 80));
    out.wallSeam = T.lit();                              // wall only
    return out;
  });
  check('hover: merge under a table -> table only', litCases.mergeUnderTable, { table: true, merge: false, wall: false });
  check('hover: plain square -> nothing lit', litCases.plainSquare, { table: false, merge: false, wall: false });
  check('hover: seam with a wall -> wall only', litCases.wallSeam, { table: false, merge: false, wall: true });

  // ---- 9b. a bare merge still lights its whole desk
  check('hover: bare merge -> merge only', await run(async () => {
    T.reset();
    clearManualSelection(); ['2,2', '2,3'].forEach(k => state.selection.add(k));
    addMerge('poly'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 250));
    T.hover(...T.centre('2,3'));
    await new Promise(z => setTimeout(z, 100));
    return T.lit();
  }), { table: false, merge: true, wall: false });

  // ---- 10. drag slots: the notch of an L is its own square, not the desk
  check('drop slot in an L-merge notch = the square', await run(async () => {
    T.reset();
    // L: (2,2) (3,2) (3,3) — the notch is (2,3)
    for (const k of ['2,2', '3,2', '3,3']) { const [r, c] = parseKey(k); updateCell(r, c, { enabled: true }); }
    updateCell(2, 3, { enabled: true, labels: [{ text: 'notch', color: '#000' }] });
    clearManualSelection(); ['2,2', '3,2', '3,3'].forEach(k => state.selection.add(k));
    addMerge('poly'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 250));
    const [x, y] = T.centre('2,3');
    const t = targetAt(x, y, { content: true });
    return [t.kind, t.r, t.c];
  }), ['square', 2, 3]);

  // ---- 11. drag slots reach THROUGH a table
  check('drop slot on a covered square = the square', await run(async () => {
    T.reset(); updateCell(2, 2, { enabled: true });
    clearManualSelection(); state.selection.add('2,2'); addTable('square'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 200));
    const t = targetAt(...T.centre('2,2'), { content: true });
    return [t.kind, t.r, t.c];
  }), ['square', 2, 2]);

  // ---- 12. a covered square can still be dragged (the table is a surface)
  check('covered square still drags', await run(async () => {
    T.reset();
    updateCell(2, 2, { enabled: true, labels: [{ text: 'A', color: '#000' }] });
    clearManualSelection(); state.selection.add('2,2'); addTable('square'); clearManualSelection(); emit();
    await new Promise(z => setTimeout(z, 200));
    const cell = document.querySelector('.cell[data-key="2,2"]');
    const [x, y] = T.centre('2,2');
    cell.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 5, pointerType: 'mouse' }));
    document.getElementById('chart').dispatchEvent(new PointerEvent('pointermove', { clientX: x + 60, clientY: y, bubbles: true, pointerId: 5, pointerType: 'mouse' }));
    await new Promise(z => setTimeout(z, 100));
    const dragging = document.querySelectorAll('.cell--dragging').length;
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 5, bubbles: true }));
    return dragging;
  }), 1);

  // ---- 13. walls mode: a tap neither seats nor edits a square
  check('walls mode tap does not seat a square', await run(async () => {
    T.reset(); setWallsMode(true); emit();
    await new Promise(z => setTimeout(z, 200));
    T.press('2,2'); await new Promise(z => setTimeout(z, 120));
    const seated = !!peekCell(2, 2).enabled;
    setWallsMode(false);
    return seated;
  }), false);

  await b.close();
  const bad = results.filter(x => !x).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  if (bad) process.exit(1);
})();
