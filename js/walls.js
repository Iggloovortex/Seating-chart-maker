// walls.js — walls mode: draw walls, railings, doors and windows on the seams
// between squares (and the grid's outer border). The grid renders an interactive
// edge layer while this mode is on (renderWallEdges); clicking an edge places the
// active wall type here. The walls themselves are drawn always (renderWalls /
// drawWalls) and live in state.walls (see js/state.js).

let wallsMode = false;
let activeWallType = 'wall';

function isWallsMode() { return wallsMode; }
function activeWall() { return activeWallType; }

/** Human labels for the type buttons. */
const WALL_LABELS = {
  wall: 'Wall', hollow: 'Hollow wall', railing: 'Railing', door: 'Door', window: 'Window',
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

function initWalls() {
  const btn = document.getElementById('btn-walls');
  const bar = document.getElementById('wall-bar');
  const typeWrap = document.getElementById('wall-types');
  if (!btn || !bar || !typeWrap) return;

  // One button per type, plus Erase. The active one is marked with aria-pressed.
  const buttons = {};
  const select = (t) => {
    activeWallType = t;
    for (const k in buttons) buttons[k].setAttribute('aria-pressed', String(k === t));
  };
  for (const t of WALL_TYPES.concat('erase')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn wall-type wall-type--${t}`;
    b.dataset.type = t;
    b.textContent = t === 'erase' ? 'Erase' : WALL_LABELS[t];
    b.setAttribute('aria-pressed', String(t === activeWallType));
    b.addEventListener('click', () => select(t));
    buttons[t] = b;
    typeWrap.appendChild(b);
  }

  document.getElementById('wall-clear').addEventListener('click', () => {
    if (hasWalls() && confirm('Remove every wall, railing, door and window?')) clearWalls();
  });

  const setMode = (on) => {
    wallsMode = on;
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Walls — on (Esc to exit)' : 'Walls — draw walls, doors and windows on the seams';
    bar.hidden = !on;
    // Walls and Select are separate modes; don't show both bars at once.
    const selBtn = document.getElementById('btn-select');
    if (on && selBtn && selBtn.getAttribute('aria-pressed') === 'true') selBtn.click();
    emit(); // re-render so the interactive edge layer appears / disappears
  };
  btn.addEventListener('click', () => setMode(!wallsMode));
  // Entering select mode leaves walls mode, the mirror of the above.
  const selBtn = document.getElementById('btn-select');
  if (selBtn) selBtn.addEventListener('click', () => { if (wallsMode) setMode(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wallsMode) { e.stopPropagation(); setMode(false); }
  });
}
