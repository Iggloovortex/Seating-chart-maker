// walls.js — walls mode: draw walls, railings, doors and windows on the seams
// between squares (and the grid's outer border). Running the pointer near a seam
// reveals the grid's hover bar (updateWallHint in js/grid.js); clicking it places
// the active wall type through here. The walls themselves are drawn always
// (renderWalls / drawWalls) and live in state.walls (see js/state.js).

let wallsMode = false;
let activeWallType = 'wall';
/** Turn walls mode on or off. Assigned by initWalls; right-click uses it to step
 *  into walls mode from a wall, and back out of it again. */
let setWallsMode = () => {};

function isWallsMode() { return wallsMode; }
function activeWall() { return activeWallType; }

/** Human labels for the type buttons. */
const WALL_LABELS = {
  wall: 'Wall', hollow: 'Hollow', window: 'Window', railing: 'Railing', door: 'Door',
};

/** Which section of the Walls bar each type's button belongs in. Walls, glass and
 *  the fittings are separate groups, each beside the colours that drive it. */
const WALL_SECTIONS = {
  'wall-types': ['wall', 'hollow'],
  'wall-types-glass': ['window'],
  'wall-types-rail': ['railing'],
  'wall-types-door': ['door'],
  'wall-types-tool': ['erase'],
};

/** Place, replace or clear the active wall type on an edge — called by the grid's
 *  edge layer. Clicking the same type again removes it (the Erase tool always
 *  removes); a door instead rotates/flips through its four orientations on repeat
 *  clicks, and is removed with Erase. */
function placeWall(o, r, c) {
  if (activeWallType === 'erase') { setWall(o, r, c, null); return; }
  const cur = wallAt(o, r, c);
  if (activeWallType === 'door') {
    const next = (cur && wallTypeOf(cur) === 'door') ? (wallOrient(cur) + 1) % 4 : 0;
    setWall(o, r, c, { t: 'door', o: next });
    return;
  }
  setWall(o, r, c, (cur && wallTypeOf(cur) === activeWallType) ? null : activeWallType);
}

/** A press on the seam's strip (see updateWallHint in js/grid.js), which covers
 *  the whole band a seam owns — bare seams and walls alike. In walls mode it
 *  places the active type, exactly as the strip says it will. From OUTSIDE walls
 *  mode the strip is the way IN: a bare seam takes a plain wall and the mode
 *  turns on, and a seam that already carries a wall just turns the mode on, so
 *  pressing a wall reaches it without changing it by surprise. */
function placeWallFromHint(o, r, c) {
  if (wallsMode) { placeWall(o, r, c); return; }
  if (!wallAt(o, r, c)) setWall(o, r, c, 'wall');
  setWallsMode(true);
}

function initWalls() {
  const btn = document.getElementById('btn-walls');
  const bar = document.getElementById('wall-bar');
  const typeWrap = document.getElementById('wall-types');
  if (!btn || !bar || !typeWrap) return;

  // One button per type, each in its own section, plus Erase.
  const buttons = {};
  const select = (t) => {
    activeWallType = t;
    for (const k in buttons) buttons[k].setAttribute('aria-pressed', String(k === t));
  };
  for (const [sectionId, types] of Object.entries(WALL_SECTIONS)) {
    const host = document.getElementById(sectionId);
    if (!host) continue;
    for (const t of types) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn wall-type wall-type--${t}`;
      b.dataset.type = t;
      b.textContent = t === 'erase' ? 'Erase' : WALL_LABELS[t];
      b.setAttribute('aria-pressed', String(t === activeWallType));
      b.addEventListener('click', () => select(t));
      buttons[t] = b;
      host.appendChild(b);
    }
  }

  // The colours each section owns. The universal wall Fill/Border are NOT here —
  // they live in Default Colors, with the chart's other universal colours.
  const swatch = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    setColorInput(el, state.defaults[key]);
    bindColorInput(el, () => setDefault(key, colorOf(el)));
    subscribe(() => { if (document.activeElement !== el) setColorInput(el, state.defaults[key]); });
  };
  swatch('rail-fill', 'railFill');
  swatch('rail-border', 'railBorder');
  swatch('door-fill', 'doorFill');
  swatch('door-border', 'doorBorder');

  const chartEl = document.getElementById('chart');

  document.getElementById('wall-clear').addEventListener('click', () => {
    if (hasWalls() && confirm('Remove every wall, railing, door and window?')) clearWalls();
  });

  setWallsMode = (on) => {
    wallsMode = on;
    // The squares are not clickable while walls mode is on, so they stop
    // answering the pointer — the seams and the walls are what respond.
    if (chartEl) chartEl.classList.toggle('chart--walls', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Walls — on (Esc to exit)' : 'Walls — draw walls, doors and windows on the seams';
    bar.hidden = !on;
    // Walls and Select are separate modes; don't show both bars at once.
    const selBtn = document.getElementById('btn-select');
    if (on && selBtn && selBtn.getAttribute('aria-pressed') === 'true') selBtn.click();
    emit(); // re-render, so the insert guides stand down / come back with the mode
  };
  btn.addEventListener('click', () => setWallsMode(!wallsMode));
  // Entering select mode leaves walls mode, the mirror of the above.
  const selBtn = document.getElementById('btn-select');
  if (selBtn) selBtn.addEventListener('click', () => { if (wallsMode) setWallsMode(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wallsMode) { e.stopPropagation(); setWallsMode(false); }
  });
}
