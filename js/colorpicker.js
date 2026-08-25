// colorpicker.js — a themed color popover that replaces the browser's own color
// dialog on every <input type="color"> in the app.
//
// The native input stays in the DOM as the value holder and the swatch you click,
// so `.value`, its events, and everything wired through bindColorInput keep
// working unchanged. We only intercept its activation: instead of the OS picker
// (whose RGB/HEX/HSL swap button is tiny and whose chrome ignores the app theme),
// a popover opens with a saturation/value area, a hue slider, and HEX, RGB and HSL
// fields all visible at once. The HEX field takes a code with or without a
// leading '#'.


// ------------------------------------------------------------ colour maths

/** '#rgb' or '#rrggbb', with or without the '#', to {r,g,b} 0–255, or null. */
function hexToRgb(hex) {
  const m = String(hex).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return { r: parseInt(m[0] + m[0], 16), g: parseInt(m[1] + m[1], 16), b: parseInt(m[2] + m[2], 16) };
  }
  if (/^[0-9a-fA-F]{6}$/.test(m)) {
    return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
  }
  return null;
}

const toHex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
function rgbToHex(r, g, b) { return '#' + toHex2(r) + toHex2(g) + toHex2(b); }
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

/** RGB 0–255 → HSV with h 0–360, s/v 0–100. HSV drives the sat/value box. */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max ? d / max : 0;
  return { h, s: s * 100, v: max * 100 };
}

function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** RGB 0–255 → HSL with h 0–360, s/l 0–100 (for the HSL fields). */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// ------------------------------------------------------------ enhancement hook

/** Called by bindColorInput on every color input. Suppresses the OS dialog and
 *  opens the themed popover in its place. Idempotent per input. */
// A colour input can hold one value its own `.value` cannot express: nothing at
// all. TRANSPARENT is kept as a flag on the element beside the hex, so the input
// still remembers the colour you had if you turn transparency back off.
const TRANSPARENT = 'transparent';

/** What a colour input is currently worth — its hex, or TRANSPARENT. Every place
 *  that reads a swatch goes through this rather than `.value`. */
function colorOf(input) {
  return input && input.dataset.transparent === '1' ? TRANSPARENT : (input ? input.value : '');
}

/** Put a value into a colour input, transparency included. A transparent input
 *  keeps its last hex, so the picker opens where you left it. */
function setColorInput(input, value) {
  if (!input) return;
  const clear = value === TRANSPARENT;
  input.dataset.transparent = clear ? '1' : '';
  input.classList.toggle('is-transparent', clear);
  if (!clear && value) input.value = value;
}

/** Whether this swatch may be made transparent. Fills opt out: a transparent
 *  fill is just an empty square, which the app already has other ways to say. */
function allowsTransparent(input) {
  return !!input && input.dataset.noTransparent !== '1';
}

function enhanceColorInput(input) {
  if (!input || input.type !== 'color' || input.dataset.cpick) return;
  input.dataset.cpick = '1';
  const open = (e) => {
    if (input.disabled) return;
    e.preventDefault();   // cancels the input's activation → the OS picker never shows
    openColorPopover(input, input.value, (hex, commit) => {
      setColorInput(input, hex);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  input.addEventListener('click', open);
  // Keyboard activation (Enter/Space) fires a synthetic click, which `open` above
  // already cancels — nothing extra needed.
}

// Icon glyphs for the picker's tool row (Bootstrap Icons style, MIT).
// Drawn as an OUTLINE, not a solid: it sits beside the palette, and every other
// icon in the app is a stroked shape rather than a filled silhouette.
const CPICK_EYE =
  '<path d="M13.354.646a1.207 1.207 0 0 0-1.708 0L8.5 3.793l-.646-.647a.5.5 0 1 0-.708.708' +
  'L8.293 5l-7.147 7.146A.5.5 0 0 0 1 12.5v1.793l-.854.853a.5.5 0 1 0 .708.707L1.707 15H3.5' +
  'a.5.5 0 0 0 .354-.146L11 7.707l1.146 1.147a.5.5 0 0 0 .708-.708l-.647-.646 3.147-3.146' +
  'a1.207 1.207 0 0 0 0-1.708z" fill="none" stroke="currentColor" stroke-width="1.1" ' +
  'stroke-linejoin="round"/>';
const CPICK_PALETTE =
  '<path d="M8 1a7 7 0 1 0 0 14h1.5a1.5 1.5 0 0 0 0-3H9a1 1 0 0 1 0-2h2a4 4 0 0 0 4-4' +
  'c0-3.3-3.1-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<circle cx="5" cy="7.6" r="1"/><circle cx="6.9" cy="4.8" r="1"/>' +
  '<circle cx="10.1" cy="4.8" r="1"/><circle cx="12" cy="7.6" r="1"/>';

/** A 16x16 icon for a picker tool button. */
function cpickIcon(inner) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cpick__toolicon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = inner;
  return svg;
}

// ------------------------------------------------------------ the popover

let cpick = null;

function closeColorPopover() {
  if (!cpick) return;
  cpick.el.remove();
  document.removeEventListener('pointerdown', cpickOutside, true);
  document.removeEventListener('keydown', cpickKey, true);
  window.removeEventListener('resize', closeColorPopover);
  cpick = null;
}
function cpickOutside(e) {
  if (cpick && !e.target.closest?.('.cpick') && e.target !== cpick.anchor) closeColorPopover();
}
function cpickKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeColorPopover(); } }

/** Open the picker anchored to `anchor`, seeded with `value`. `onPick(hex,
 *  commit)` fires on every change — commit=false while dragging/typing, true on
 *  release or when a field is committed. */
function openColorPopover(anchor, value, onPick) {
  closeColorPopover();
  const rgb = hexToRgb(value) || { r: 0, g: 0, b: 0 };
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  const el = document.createElement('div');
  el.className = 'cpick';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Choose a color');

  // Saturation (x) / value (y) area with a draggable dot.
  const sv = document.createElement('div');
  sv.className = 'cpick__sv';
  const dot = document.createElement('div');
  dot.className = 'cpick__dot';
  sv.appendChild(dot);

  // Hue rail beneath it.
  const hue = document.createElement('div');
  hue.className = 'cpick__hue';
  const hthumb = document.createElement('div');
  hthumb.className = 'cpick__huethumb';
  hue.appendChild(hthumb);

  // Fields: a big swatch preview, then HEX / RGB / HSL rows.
  const fields = document.createElement('div');
  fields.className = 'cpick__fields';

  const hexIn = mkField('text', 'cpick__hex');
  hexIn.setAttribute('aria-label', 'Hex color');
  hexIn.spellcheck = false;
  const hexRow = fieldRow('HEX', [hexIn]);

  const r = mkNum(), g = mkNum(), bb = mkNum();
  [r, g, bb].forEach((n) => { n.max = '255'; });
  const rgbRow = fieldRow('RGB', [r, g, bb]);

  const hh = mkNum(), ss = mkNum(), ll = mkNum();
  hh.max = '360'; ss.max = '100'; ll.max = '100';
  const hslRow = fieldRow('HSL', [hh, ss, ll]);

  fields.append(hexRow, rgbRow, hslRow);
  el.append(sv, hue, fields);

  // Optional native eyedropper, when the browser offers one.

  document.body.appendChild(el);
  cpick = { el, anchor };
  placeCpick(el, anchor);

  // ---- painting -----------------------------------------------------------
  const emit = (commit) => onPick(currentHex(), commit);
  const currentHex = () => {
    const c = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return rgbToHex(c.r, c.g, c.b);
  };

  /** Repaint the visuals and every field except the one the user is editing. */
  function render(except) {
    const c = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const hex = rgbToHex(c.r, c.g, c.b);
    sv.style.background =
      'linear-gradient(to top, #000, rgba(0,0,0,0)),' +
      'linear-gradient(to right, #fff, rgba(255,255,255,0)),' +
      `hsl(${hsv.h}, 100%, 50%)`;
    dot.style.left = `${hsv.s}%`;
    dot.style.top = `${100 - hsv.v}%`;
    dot.style.background = hex;
    hthumb.style.left = `${(hsv.h / 360) * 100}%`;
    if (except !== 'hex') hexIn.value = hex;
    if (except !== 'rgb') { r.value = Math.round(c.r); g.value = Math.round(c.g); bb.value = Math.round(c.b); }
    if (except !== 'hsl') {
      const h = rgbToHsl(c.r, c.g, c.b);
      hh.value = Math.round(h.h); ss.value = Math.round(h.s); ll.value = Math.round(h.l);
    }
  }

  // ---- saturation/value drag ---------------------------------------------
  attachDrag(sv, (fx, fy) => {
    hsv.s = fx * 100;
    hsv.v = (1 - fy) * 100;
    render(); emit(false);
  }, () => emit(true));

  // ---- hue drag -----------------------------------------------------------
  attachDrag(hue, (fx) => {
    hsv.h = fx * 360;
    render(); emit(false);
  }, () => emit(true));

  // ---- HEX field ----------------------------------------------------------
  hexIn.addEventListener('input', () => {
    const c = hexToRgb(hexIn.value);
    if (!c) return;                    // wait for a complete code
    Object.assign(hsv, rgbToHsv(c.r, c.g, c.b));
    render('hex'); emit(false);
  });
  hexIn.addEventListener('change', () => { render(); emit(true); });   // reformats to '#rrggbb'

  // ---- RGB fields ---------------------------------------------------------
  const readRgb = (commit) => {
    const c = { r: numVal(r, 255), g: numVal(g, 255), b: numVal(bb, 255) };
    Object.assign(hsv, rgbToHsv(c.r, c.g, c.b));
    render('rgb'); emit(commit);
  };
  [r, g, bb].forEach((n) => {
    n.addEventListener('input', () => readRgb(false));
    n.addEventListener('change', () => { readRgb(true); render(); });
  });

  // ---- HSL fields ---------------------------------------------------------
  const readHsl = (commit) => {
    const c = hslToRgb(numVal(hh, 360), numVal(ss, 100), numVal(ll, 100));
    Object.assign(hsv, rgbToHsv(c.r, c.g, c.b));
    render('hsl'); emit(commit);
  };
  [hh, ss, ll].forEach((n) => {
    n.addEventListener('input', () => readHsl(false));
    n.addEventListener('change', () => { readHsl(true); render(); });
  });


  // ---- Footer: three tools on one row, then the saved colours ------------
  // All three are icon-only and the same size, so the row stays one control
  // tall instead of stacking full-width buttons down the popover.
  const tools = document.createElement('div');
  tools.className = 'cpick__tools';

  const tool = (title, build, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cpick__tool';
    b.title = title;
    b.setAttribute('aria-label', title);
    build(b);
    b.addEventListener('click', onClick);
    tools.appendChild(b);
    return b;
  };

  if (window.EyeDropper) {
    tool('Pick a colour from the screen', (b) => b.appendChild(cpickIcon(CPICK_EYE)), async () => {
      try {
        const res = await new window.EyeDropper().open();
        const c = hexToRgb(res.sRGBHex);
        if (c) { Object.assign(hsv, rgbToHsv(c.r, c.g, c.b)); render(); emit(true); }
      } catch (_) { /* cancelled */ }
    });
  }

  // Transparent — offered on every swatch that is not a fill, and a TOGGLE: the
  // swatch keeps the colour it had underneath, so turning transparency back off
  // restores it rather than making you find that colour again. The popover stays
  // open, since a toggle you cannot immediately undo is not much of a toggle.
  if (allowsTransparent(anchor)) {
    const t = tool('Transparent — draw nothing here (click again to restore)', (b) => {
      const chip = document.createElement('span');
      chip.className = 'cpick__checker';
      chip.setAttribute('aria-hidden', 'true');
      b.appendChild(chip);
    }, () => {
      const goClear = colorOf(anchor) !== TRANSPARENT;
      onPick(goClear ? TRANSPARENT : anchor.value, true);
      t.setAttribute('aria-pressed', String(goClear));
    });
    t.setAttribute('aria-pressed', String(colorOf(anchor) === TRANSPARENT));
  }

  // Keep the colour on the saved bar below.
  tool('Save this colour', (b) => b.appendChild(cpickIcon(CPICK_PALETTE)), () => {
    saveCustomColor(hexIn.value);
    renderSaved();
  });
  el.appendChild(tools);

  const saved = document.createElement('div');
  saved.className = 'cpick__saved';
  el.appendChild(saved);

  /** The saved bar: one slot per remembered colour, the rest left empty. Clicking
   *  a slot takes that colour. */
  function renderSaved() {
    saved.replaceChildren();
    const list = (state.config && state.config.customColors) || [];
    for (let i = 0; i < CUSTOM_COLOR_SLOTS; i++) {
      const hex = list[i];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = hex ? 'cpick__slot' : 'cpick__slot cpick__slot--empty';
      if (hex) {
        slot.style.background = hex;
        slot.title = hex;
        slot.setAttribute('aria-label', 'Use ' + hex);
        slot.addEventListener('click', () => {
          const c = hexToRgb(hex);
          if (!c) return;
          Object.assign(hsv, rgbToHsv(c.r, c.g, c.b));
          render(); emit(true);
        });
      } else {
        slot.disabled = true;
        slot.setAttribute('aria-label', 'Empty slot');
      }
      saved.appendChild(slot);
    }
  }
  renderSaved();

  render();
  document.addEventListener('pointerdown', cpickOutside, true);
  document.addEventListener('keydown', cpickKey, true);
  window.addEventListener('resize', closeColorPopover);
  hexIn.focus();
  hexIn.select();
}

// ------------------------------------------------------------ small helpers

function mkField(type, cls) {
  const el = document.createElement('input');
  el.type = type;
  el.className = 'cpick__field ' + cls;
  return el;
}
function mkNum() {
  const el = mkField('number', 'cpick__num');
  el.min = '0';
  el.inputMode = 'numeric';
  return el;
}
function numVal(input, max) { return clamp(parseFloat(input.value) || 0, 0, max); }

function fieldRow(label, inputs) {
  const row = document.createElement('div');
  row.className = 'cpick__row';
  const l = document.createElement('span');
  l.className = 'cpick__label';
  l.textContent = label;
  const wrap = document.createElement('div');
  wrap.className = 'cpick__inputs';
  wrap.append(...inputs);
  row.append(l, wrap);
  return row;
}

/** Pointer drag over `area`, reporting the pointer as fractions 0–1 of the box.
 *  `onMove(fx, fy)` fires on down and every move; `onEnd()` on release. */
function attachDrag(area, onMove, onEnd) {
  const at = (e) => {
    const b = area.getBoundingClientRect();
    onMove(clamp((e.clientX - b.left) / b.width, 0, 1), clamp((e.clientY - b.top) / b.height, 0, 1));
  };
  area.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    area.setPointerCapture(e.pointerId);
    at(e);
    const move = (ev) => at(ev);
    const up = (ev) => {
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', up);
      onEnd();
    };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
  });
}

/** Place the popover next to its anchor, flipped/clamped to stay on screen. */
function placeCpick(el, anchor) {
  const a = anchor.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let left = a.left;
  let top = a.bottom + 6;
  if (top + box.height > window.innerHeight - 8) top = Math.max(8, a.top - box.height - 6);
  left = clamp(left, 8, window.innerWidth - box.width - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}
