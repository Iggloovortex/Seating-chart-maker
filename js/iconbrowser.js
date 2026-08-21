// iconbrowser.js — a searchable grid over the bundled Bootstrap Icons catalog
// (js/iconlib.js). Picking an icon copies it into state.config.customIcons so it
// joins the Icon picker and travels with saves/exports; the ~1MB catalog itself
// is never exported. Degrades to nothing when the catalog is absent (as in an
// exported single-file app, where iconlib.js is intentionally left out).

const ICON_LIB_CAP = 150; // most matches shown at once, so a search stays snappy

function iconLibraryAvailable() {
  return typeof ICON_LIBRARY !== 'undefined' && ICON_LIBRARY && Object.keys(ICON_LIBRARY).length > 0;
}

/** Prettify a Bootstrap icon id ("file-earmark-pdf") into a label. */
function prettyIconName(name) {
  const s = name.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A small svg element from catalog inner markup (all icons are viewBox 16). */
function libIconSvg(inner, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.innerHTML = inner;
  return svg;
}

let iconLibModal = null;
let iconLibOnPick = null;

/** Open the library. `onPick(id)` (optional) fires after an icon is added — the
 *  editor passes one to also apply the icon to the open square. */
function openIconLibrary(onPick) {
  if (!iconLibraryAvailable()) return;
  iconLibOnPick = onPick || null;
  if (!iconLibModal) iconLibModal = buildIconLibModal();
  iconLibModal.hidden = false;
  iconLibModal.setAttribute('aria-hidden', 'false');
  const search = iconLibModal.querySelector('#icon-lib-search');
  search.value = '';
  renderIconLibResults('');
  search.focus();
}

function closeIconLibrary() {
  if (iconLibModal) { iconLibModal.hidden = true; iconLibModal.setAttribute('aria-hidden', 'true'); }
  iconLibOnPick = null;
}

function buildIconLibModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'icon-lib';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML =
    '<div class="modal__backdrop" data-close-iconlib></div>' +
    '<section class="modal__panel modal__panel--iconlib" role="dialog" aria-modal="true" aria-label="Icon library">' +
      '<header class="modal__head">' +
        '<h2 class="modal__title">Icon library</h2>' +
        '<input id="icon-lib-search" class="field__input iconlib__search" type="search" ' +
               'placeholder="Search Bootstrap Icons…" aria-label="Search icons" />' +
        '<button class="btn btn--icon" type="button" data-close-iconlib aria-label="Close">✕</button>' +
      '</header>' +
      '<div class="modal__body">' +
        '<div class="iconlib__grid" id="icon-lib-grid"></div>' +
        '<p class="iconlib__note" id="icon-lib-note"></p>' +
      '</div>' +
      '<footer class="modal__foot">' +
        '<span class="iconlib__credit">Bootstrap Icons — MIT licensed</span>' +
        '<button class="btn" type="button" data-close-iconlib>Done</button>' +
      '</footer>' +
    '</section>';
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-iconlib]').forEach((el) =>
    el.addEventListener('click', closeIconLibrary));
  const search = modal.querySelector('#icon-lib-search');
  search.addEventListener('input', () => renderIconLibResults(search.value));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) { e.stopPropagation(); closeIconLibrary(); }
  });
  return modal;
}

function renderIconLibResults(query) {
  const grid = iconLibModal.querySelector('#icon-lib-grid');
  const note = iconLibModal.querySelector('#icon-lib-note');
  grid.replaceChildren();
  const q = query.trim().toLowerCase();
  const names = Object.keys(ICON_LIBRARY);
  const matches = (q ? names.filter((n) => n.includes(q)) : names);
  const have = new Set(((state.config && state.config.customIcons) || []).map((c) => c.id));

  for (const name of matches.slice(0, ICON_LIB_CAP)) {
    const id = 'bi:' + name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iconlib__tile';
    btn.title = name;
    btn.setAttribute('aria-label', prettyIconName(name));
    if (have.has(id)) btn.classList.add('is-added');
    btn.appendChild(libIconSvg(ICON_LIBRARY[name], 'iconlib__svg'));
    const cap = document.createElement('span');
    cap.className = 'iconlib__name';
    cap.textContent = name;
    btn.appendChild(cap);
    btn.addEventListener('click', () => pickLibraryIcon(name, btn));
    grid.appendChild(btn);
  }

  const total = matches.length;
  note.textContent = total === 0
    ? 'No icons match “' + query + '”.'
    : total > ICON_LIB_CAP
      ? 'Showing ' + ICON_LIB_CAP + ' of ' + total + ' matches — keep typing to narrow it down.'
      : total + ' icon' + (total === 1 ? '' : 's') + '. Click one to add it.';
}

function pickLibraryIcon(name, btn) {
  const id = 'bi:' + name;
  if (!customIcon(id)) {
    addCustomIcon({ id, label: prettyIconName(name), viewBox: '0 0 16 16', inner: ICON_LIBRARY[name] });
  }
  if (btn) btn.classList.add('is-added');
  if (typeof iconLibOnPick === 'function') { const cb = iconLibOnPick; closeIconLibrary(); cb(id); }
}
