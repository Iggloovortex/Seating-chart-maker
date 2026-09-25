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
/** Arm the bar with a type, as clicking its button does. Assigned by initWalls;
 *  placeWallFromHint uses it to adopt the type of the wall being lifted. */
let selectWallType = () => {};

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
 *  places the active type, exactly as the strip says it will.
 *
 *  From OUTSIDE walls mode the strip is the way IN, and it does the whole gesture
 *  in one press: a bare seam takes a plain wall and the mode turns on, while a seam
 *  that already carries one turns the mode on, ARMS THE BAR WITH THAT TYPE and
 *  lifts the wall. So a wall removed by accident is put straight back by clicking
 *  the seam again, and a run is re-laid in its own type without hunting for it in
 *  the bar. Inside walls mode nothing changes — there the press places, replaces or
 *  clears exactly as the bar says. */
function placeWallFromHint(o, r, c) {
  if (wallsMode) { placeWall(o, r, c); return; }
  const cur = wallAt(o, r, c);
  if (!cur) { setWall(o, r, c, 'wall'); setWallsMode(true); return; }
  selectWallType(wallTypeOf(cur));
  setWall(o, r, c, null);
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
  selectWallType = select;
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
  swatch('window-fill', 'windowFill');
  swatch('rail-fill', 'railFill');
  swatch('rail-border', 'railBorder');
  swatch('door-fill', 'doorFill');
  swatch('door-border', 'doorBorder');

  const chartEl = document.getElementById('chart');

  document.getElementById('wall-clear').addEventListener('click', () => {
    if (hasWalls() && confirm('Remove every wall, railing, door and window?')) clearWalls();
  });

  setWallsMode = (on) => {
    // Walls and Select are separate modes; don't show both bars at once. The
    // handover happens BEFORE our own flag flips: the Select button's handler turns
    // walls mode off when it sees it on, so setting the flag first made the two
    // cancel each other out and walls mode never came on from select mode.
    const selBtn = document.getElementById('btn-select');
    if (on && selBtn && selBtn.getAttribute('aria-pressed') === 'true') selBtn.click();
    wallsMode = on;
    // The squares are not clickable while walls mode is on, so they stop
    // answering the pointer — the seams and the walls are what respond.
    if (chartEl) chartEl.classList.toggle('chart--walls', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Walls — on (Esc to exit)' : 'Walls — draw walls, doors and windows on the seams';
    bar.hidden = !on;
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
