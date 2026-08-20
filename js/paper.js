// paper.js — paper-size registry driving preview & export dimensions.
// Landscape orientation (width > height), matching the README's "landscape letter" default.


// Dimensions in inches, stored landscape (width > height). Portrait swaps them.
const PAPER_PRESETS = {
  letter:  { name: 'Letter',  w: 11,    h: 8.5 },
  legal:   { name: 'Legal',   w: 14,    h: 8.5 },
  tabloid: { name: 'Tabloid', w: 17,    h: 11 },
  a4:      { name: 'A4',      w: 11.69, h: 8.27 },
  a3:      { name: 'A3',      w: 16.54, h: 11.69 },
};

const MM_PER_IN = 25.4;

/** A named custom size from state.config by its id, or null. These are added in
 *  Settings and appended to the paper dropdown alongside the built-in presets. */
function customPaperById(id) {
  return (state.config?.customPapers || []).find((p) => p.id === id) || null;
}

/** Preset name plus its dimensions the way round the page currently sits, so
 *  the dropdown reads "Letter (11×8.5")" landscape and "Letter (8.5×11")" portrait. */
function presetLabel(id) {
  const p = PAPER_PRESETS[id];
  const [a, b] = state.landscape ? [p.w, p.h] : [p.h, p.w];
  return `${p.name} (${a}×${b}")`;
}

/** Dropdown label for any paper id — built-in preset or a named custom size. */
function paperLabelFor(id) {
  if (PAPER_PRESETS[id]) return presetLabel(id);
  const cp = customPaperById(id);
  if (!cp) return id;
  const [a, b] = state.landscape ? [cp.w, cp.h] : [cp.h, cp.w];
  return `${cp.name} (${a}×${b} ${cp.unit})`;
}

/** Rebuild the paper <select>: presets, then any named custom sizes, then the
 *  ad-hoc "Custom…" option. Keeps the current choice if it still exists. Called
 *  when the custom-size list changes in Settings. */
function rebuildPaperOptions() {
  const select = document.getElementById('paper-size');
  if (!select) return;
  const keep = select.value;
  select.replaceChildren();
  for (const id of Object.keys(PAPER_PRESETS)) select.appendChild(new Option(presetLabel(id), id));
  for (const cp of (state.config?.customPapers || [])) select.appendChild(new Option(paperLabelFor(cp.id), cp.id));
  select.appendChild(new Option('Custom…', 'custom'));
  if ([...select.options].some((o) => o.value === keep)) select.value = keep;
}

/** A custom page's stored w/h read out for the current orientation, and the
 *  inverse — what to store for a w/h typed while in that orientation. Both are
 *  the same swap, so one helper covers reading and writing. */
function orientedWH(w, h) {
  return state.landscape ? { w, h } : { w: h, h: w };
}

/** Resolve the active paper to inches: { w, h }. Presets are stored landscape,
 *  so portrait simply swaps the two. */
function paperInches() {
  const p = state.paper;
  let w, h;
  if (typeof p === 'string') {
    const preset = PAPER_PRESETS[p];
    if (preset) {
      w = preset.w; h = preset.h;
    } else {
      const cp = customPaperById(p);          // a named custom size from config
      if (cp) {
        const factor = cp.unit === 'mm' ? 1 / MM_PER_IN : 1;
        w = cp.w * factor; h = cp.h * factor;
      } else {
        w = PAPER_PRESETS.letter.w; h = PAPER_PRESETS.letter.h;   // deleted size => Letter
      }
    }
  } else {
    const factor = p.unit === 'mm' ? 1 / MM_PER_IN : 1;   // custom { w, h, unit }
    w = (p.w || 11) * factor; h = (p.h || 8.5) * factor;
  }
  return state.landscape ? { w, h } : { w: h, h: w };
}

/** Label for the current orientation, used on the rotate buttons. */
function orientationLabel() {
  return state.landscape ? 'Landscape' : 'Portrait';
}

/** Point every rotate button at toggleOrientation, and keep everything that
 *  spells out the orientation in step with it: the buttons, the Paper label,
 *  the preset dimensions in the dropdown and the custom width/height boxes. */
let lastLandscape = null;   // so the size readouts only redraw on a real flip

function initOrientationControls() {
  const buttons = [...document.querySelectorAll('.btn-rotate')];
  for (const btn of buttons) btn.addEventListener('click', () => toggleOrientation());
  const sync = () => {
    for (const btn of buttons) {
      btn.title = `Page is ${orientationLabel()} — click to rotate`;
      btn.setAttribute('aria-label', btn.title);
      // One button carries both: the spiral with the orientation's initial in it
      // and the word beside it.
      const word = btn.querySelector('.btn-rotate__word');
      if (word) word.textContent = orientationLabel();
      const ring = btn.querySelector('.btn-rotate__ring');
      if (ring) ring.setAttribute('href', state.landscape ? '#ui-orient-l' : '#ui-orient-p');
      const letter = btn.querySelector('.btn-rotate__letter');
      if (letter) letter.textContent = state.landscape ? 'L' : 'P';
    }
    const label = document.getElementById('paper-label');
    if (label) label.textContent = `Paper (${orientationLabel()})`;
    // The dimensions only move when the orientation does. Rewriting them on
    // every state change would also stamp over a half-typed custom size.
    if (lastLandscape !== state.landscape) {
      lastLandscape = state.landscape;
      refreshPaperOptions();
      reflectCustomSize();
    }
  };
  subscribe(sync);
  sync();
}

/** Re-label the preset options in place so their dimensions follow the
 *  orientation, without disturbing which one is chosen. */
function refreshPaperOptions() {
  const select = document.getElementById('paper-size');
  if (!select) return;
  for (const opt of select.options) {
    if (PAPER_PRESETS[opt.value]) opt.textContent = presetLabel(opt.value);
    else if (customPaperById(opt.value)) opt.textContent = paperLabelFor(opt.value);
  }
}

/** Show a custom page's width and height the way round it currently prints. */
function reflectCustomSize() {
  const p = state.paper;
  if (!p || typeof p !== 'object') return;
  const wIn = document.getElementById('paper-w');
  const hIn = document.getElementById('paper-h');
  if (!wIn || !hIn) return;
  const { w, h } = orientedWH(p.w, p.h);
  wIn.value = w;
  hIn.value = h;
}

/** Aspect ratio (w / h) for laying out the preview box. */
function paperAspect() {
  const { w, h } = paperInches();
  return w / h;
}

/** Wire the paper-size <select> and custom w/h/unit inputs. */
function initPaperControls() {
  const select = document.getElementById('paper-size');
  const wIn = document.getElementById('paper-w');
  const hIn = document.getElementById('paper-h');
  const unitIn = document.getElementById('paper-unit');
  const customFields = document.querySelectorAll('.field--custom-paper');

  // Populate presets + named custom sizes + the ad-hoc "Custom…" option.
  rebuildPaperOptions();

  const syncCustomVisibility = () => {
    const isCustom = select.value === 'custom';
    customFields.forEach((f) => (f.hidden = !isCustom));
  };

  const apply = () => {
    if (select.value === 'custom') {
      // The boxes read out the page as it prints; store it the canonical way
      // round (landscape) so rotating keeps swapping cleanly.
      const typed = orientedWH(parseFloat(wIn.value) || 11, parseFloat(hIn.value) || 8.5);
      setPaper({ w: typed.w, h: typed.h, unit: unitIn.value });
    } else {
      setPaper(select.value);
    }
  };

  select.addEventListener('change', () => { syncCustomVisibility(); apply(); });
  [wIn, hIn, unitIn].forEach((el) => el.addEventListener('change', apply));

  // Reflect current state into the controls (used after load).
  reflect(select, wIn, hIn, unitIn, syncCustomVisibility);
}

/** Push current state.paper into the controls. */
function reflectPaper() {
  refreshPaperOptions();
  reflect(
    document.getElementById('paper-size'),
    document.getElementById('paper-w'),
    document.getElementById('paper-h'),
    document.getElementById('paper-unit'),
    () => document.querySelectorAll('.field--custom-paper').forEach((f) => (f.hidden = document.getElementById('paper-size').value !== 'custom'))
  );
}

function reflect(select, wIn, hIn, unitIn, syncCustomVisibility) {
  const p = state.paper;
  if (typeof p === 'string' && (PAPER_PRESETS[p] || customPaperById(p))) {
    select.value = p;
  } else if (p && typeof p === 'object') {
    select.value = 'custom';
    const { w, h } = orientedWH(p.w, p.h);   // shown the way round it prints
    wIn.value = w;
    hIn.value = h;
    unitIn.value = p.unit || 'in';
  } else {
    select.value = 'letter';
  }
  syncCustomVisibility();
}
