// paper.js — paper-size registry driving preview & export dimensions.
// Landscape orientation (width > height), matching the README's "landscape letter" default.


// Dimensions in inches (landscape).
const PAPER_PRESETS = {
  letter:  { label: 'Letter (11×8.5")',  w: 11,    h: 8.5 },
  legal:   { label: 'Legal (14×8.5")',   w: 14,    h: 8.5 },
  tabloid: { label: 'Tabloid (17×11")',  w: 17,    h: 11 },
  a4:      { label: 'A4 (11.69×8.27")',  w: 11.69, h: 8.27 },
  a3:      { label: 'A3 (16.54×11.69")', w: 16.54, h: 11.69 },
};

const MM_PER_IN = 25.4;

/** Resolve the active paper to inches: { w, h }. */
function paperInches() {
  const p = state.paper;
  if (typeof p === 'string') {
    const preset = PAPER_PRESETS[p] || PAPER_PRESETS.letter;
    return { w: preset.w, h: preset.h };
  }
  // custom { w, h, unit }
  const factor = p.unit === 'mm' ? 1 / MM_PER_IN : 1;
  return { w: (p.w || 11) * factor, h: (p.h || 8.5) * factor };
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

  // Populate presets + custom option.
  select.replaceChildren();
  for (const [id, p] of Object.entries(PAPER_PRESETS)) {
    select.appendChild(new Option(p.label, id));
  }
  select.appendChild(new Option('Custom…', 'custom'));

  const syncCustomVisibility = () => {
    const isCustom = select.value === 'custom';
    customFields.forEach((f) => (f.hidden = !isCustom));
  };

  const apply = () => {
    if (select.value === 'custom') {
      setPaper({ w: parseFloat(wIn.value) || 11, h: parseFloat(hIn.value) || 8.5, unit: unitIn.value });
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
  if (typeof p === 'string' && PAPER_PRESETS[p]) {
    select.value = p;
  } else if (p && typeof p === 'object') {
    select.value = 'custom';
    wIn.value = p.w;
    hIn.value = p.h;
    unitIn.value = p.unit || 'in';
  } else {
    select.value = 'letter';
  }
  syncCustomVisibility();
}
