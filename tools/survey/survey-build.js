// SURVEY CHART — one ROW per kind of thing that renders text or an icon.
// Row 0 is the reference (a plain square). Every case uses the same label text and the
// same icon, so any difference in rendering is the CASE, not the content.
// All coordinates are (row, col), matching updateCell/splitCell/updateSubcell.
function buildSurvey() {
  const LBL = 'Wg', L2 = 'Wg2', ICON = 'monitor';
  const lab = (...t) => t.map((x) => ({ text: x, color: '#000000' }));
  const both = { enabled: true, labels: lab(LBL), icon: ICON };

  setGrid(14, 24);
  state.tables.length = 0; state.merges.length = 0;
  for (let r = 0; r < 24; r++) for (let c = 0; c < 14; c++)
    updateCell(r, c, { enabled: false, labels: [], icon: null, split: null, subcells: null, submerges: null });

  const rows = [];
  const at = (name, fn) => { const r = rows.length * 2; rows.push({ r, name }); fn(r); };

  const fillSplit = (r, c, rr, cc, n) => {
    updateCell(r, c, { enabled: true });
    splitCell(r, c, rr, cc);
    for (let i = 0; i < n; i++) updateSubcell(r, c, i, { enabled: true, labels: lab(LBL), icon: ICON });
  };
  const mkMerge = (r, c, kind, patch) => {
    for (const cc of [c, c + 1]) updateCell(r, cc, patch || both);
    state.selection = new Set([keyOf(r, c), keyOf(r, c + 1)]);
    addMerge(kind); state.selection = new Set();
    return state.merges[state.merges.length - 1];
  };
  const tableOver = (r, cols) => {
    state.selection = new Set(cols.map((c) => keyOf(r, c)));
    addTable('square'); state.selection = new Set();
    return state.tables[state.tables.length - 1];
  };

  at('1  SQUARE  text | icon | text+icon | two lines', (r) => {
    updateCell(r, 0, { enabled: true, labels: lab(LBL) });
    updateCell(r, 2, { enabled: true, icon: ICON });
    updateCell(r, 4, both);
    updateCell(r, 6, { enabled: true, labels: lab(LBL, L2), icon: ICON });
  });
  at('2  SPLIT  halves | stacked', (r) => {
    fillSplit(r, 0, 1, 2, 2); fillSplit(r, 3, 2, 1, 2);
  });
  at('3  SPLIT  thirds | thirds stacked', (r) => {
    fillSplit(r, 0, 1, 3, 3); fillSplit(r, 3, 3, 1, 3);
  });
  at('4  SPLIT  quarters | ninths', (r) => {
    fillSplit(r, 0, 2, 2, 4); fillSplit(r, 3, 3, 3, 9);
  });
  at('5  MERGE  shape | centered', (r) => {
    mkMerge(r, 0, 'poly'); mkMerge(r, 4, 'unit');
  });
  at('6  MERGE  desk-split | submerge shape | submerge centered', (r) => {
    const m = mkMerge(r, 0, 'poly');
    m.deskSplit = true;
    splitCell(r, 0, 1, 2);
    for (let i = 0; i < 2; i++) updateSubcell(r, 0, i, { enabled: true, labels: lab(LBL), icon: ICON });
    for (const [c, kind] of [[4, 'poly'], [7, 'unit']]) {
      fillSplit(r, c, 2, 2, 4);
      addSubmerge(r, c, [0, 1], kind);
    }
  });
  at('7  FURNITURE square  chair | server | rack | stairs', (r) => {
    updateCell(r, 0, { enabled: true, icon: 'chair', labels: lab(LBL) });
    updateCell(r, 2, { enabled: true, icon: 'server', labels: lab(LBL) });
    updateCell(r, 4, { enabled: true, icon: 'server', labels: lab(LBL, L2) });
    updateCell(r, 6, { enabled: true, icon: 'stairs', labels: lab(LBL) });
  });
  at('8  FURNITURE in a piece  chair | server | plain', (r) => {
    updateCell(r, 0, { enabled: true });
    splitCell(r, 0, 2, 2);
    updateSubcell(r, 0, 0, { enabled: true, icon: 'chair', labels: lab(LBL) });
    updateSubcell(r, 0, 1, { enabled: true, icon: 'server', labels: lab(LBL) });
    updateSubcell(r, 0, 2, { enabled: true, icon: ICON, labels: lab(LBL) });
  });
  at('9  FURNITURE merged  chair | rack | stairs', (r) => {
    mkMerge(r, 0, 'poly', { enabled: true, icon: 'chair', labels: lab(LBL) });
    mkMerge(r, 3, 'poly', { enabled: true, icon: 'server', labels: lab(LBL, L2) });
    mkMerge(r, 6, 'poly', { enabled: true, icon: 'stairs', labels: lab(LBL) });
  });
  at('10 ON A TABLE  square | split piece | merge', (r) => {
    updateCell(r, 0, both);            tableOver(r, [0]);
    fillSplit(r, 3, 1, 2, 2);          tableOver(r, [3]);
    mkMerge(r, 6, 'poly');             tableOver(r, [6, 7]);
  });
  at('11 TABLE REACHING 1/2 into a split piece', (r) => {
    updateCell(r, 1, { enabled: true });
    const t = tableOver(r, [1]);
    fillSplit(r, 2, 1, 2, 2);
    resizeTable(t.id, r, 1, r, 1, { e: 0.5 });
  });

  emit();
  return rows;
}
