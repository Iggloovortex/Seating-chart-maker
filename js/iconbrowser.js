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
const iconLibSelected = new Set(); // catalog names chosen this session, loaded on Done

/** Open the library. `onPick(id)` (optional) fires after Done — the editor passes
 *  one to also apply the first chosen icon to the open square. */
function openIconLibrary(onPick) {
  if (!iconLibraryAvailable()) return;
  iconLibOnPick = onPick || null;
  iconLibSelected.clear();
  if (!iconLibModal) iconLibModal = buildIconLibModal();
  iconLibModal.hidden = false;
  iconLibModal.setAttribute('aria-hidden', 'false');
  const search = iconLibModal.querySelector('#icon-lib-search');
  search.value = '';
  renderIconLibResults('');
  renderIconLibSelected();
  search.focus();
}

function closeIconLibrary() {
  if (iconLibModal) { iconLibModal.hidden = true; iconLibModal.setAttribute('aria-hidden', 'true'); }
  iconLibOnPick = null;
}

/** Done: add every selected icon to the config (if not already there), then hand
 *  the first one to the editor's onPick, if any. */
function loadSelectedIcons() {
  const chosen = [...iconLibSelected];
  for (const name of chosen) {
    const id = 'bi:' + name;
    if (!customIcon(id)) addCustomIcon({ id, label: prettyIconName(name), viewBox: '0 0 16 16', inner: ICON_LIBRARY[name] });
  }
  const cb = iconLibOnPick, first = chosen[0];
  closeIconLibrary();
  if (cb && first) cb('bi:' + first);
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
      '<footer class="modal__foot iconlib__foot">' +
        '<span class="iconlib__credit">Bootstrap Icons — MIT licensed</span>' +
        '<div class="iconlib__selectedbar">' +
          '<div class="iconlib__selected" id="icon-lib-selected"></div>' +
          '<button class="btn btn--primary" type="button" id="icon-lib-done">Done</button>' +
        '</div>' +
      '</footer>' +
    '</section>';
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-iconlib]').forEach((el) =>
    el.addEventListener('click', closeIconLibrary));
  modal.querySelector('#icon-lib-done').addEventListener('click', loadSelectedIcons);
  const search = modal.querySelector('#icon-lib-search');
  search.addEventListener('input', () => renderIconLibResults(search.value));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) { e.stopPropagation(); closeIconLibrary(); }
  });
  return modal;
}

/** The strip of currently-selected icons in the footer; clicking one removes it. */
function renderIconLibSelected() {
  const strip = iconLibModal.querySelector('#icon-lib-selected');
  const done = iconLibModal.querySelector('#icon-lib-done');
  strip.replaceChildren();
  for (const name of iconLibSelected) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'iconlib__chip';
    chip.title = 'Remove ' + name;
    chip.setAttribute('aria-label', 'Remove ' + prettyIconName(name));
    chip.appendChild(libIconSvg(ICON_LIBRARY[name], 'iconlib__chipsvg'));
    chip.addEventListener('click', () => toggleLibraryIcon(name));
    strip.appendChild(chip);
  }
  const n = iconLibSelected.size;
  done.textContent = n ? `Add ${n} icon${n === 1 ? '' : 's'}` : 'Done';
}

function renderIconLibResults(query) {
  const grid = iconLibModal.querySelector('#icon-lib-grid');
  const note = iconLibModal.querySelector('#icon-lib-note');
  grid.replaceChildren();
  const q = query.trim().toLowerCase();
  const names = Object.keys(ICON_LIBRARY);
  // "*" or "all" shows the whole set (uncapped); an empty box shows the first
  // page; anything else filters by name.
  const showAll = q === '*' || q === 'all';
  const matches = (!q || showAll) ? names : names.filter((n) => n.includes(q));
  const cap = showAll ? matches.length : ICON_LIB_CAP;
  const have = new Set(((state.config && state.config.customIcons) || []).map((c) => c.id));

  for (const name of matches.slice(0, cap)) {
    const id = 'bi:' + name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iconlib__tile';
    btn.dataset.name = name;
    btn.title = name;
    btn.setAttribute('aria-label', prettyIconName(name));
    btn.setAttribute('aria-pressed', String(iconLibSelected.has(name)));
    if (have.has(id)) btn.classList.add('is-added');
    if (iconLibSelected.has(name)) btn.classList.add('is-selected');
    btn.appendChild(libIconSvg(ICON_LIBRARY[name], 'iconlib__svg'));
    const nameEl = document.createElement('span');
    nameEl.className = 'iconlib__name';
    nameEl.textContent = name;
    btn.appendChild(nameEl);
    btn.addEventListener('click', () => toggleLibraryIcon(name));
    grid.appendChild(btn);
  }

  const total = matches.length;
  const shown = Math.min(cap, total);
  note.textContent = total === 0
    ? 'No icons match “' + query + '”.'
    : shown < total
      ? 'Showing ' + shown + ' of ' + total + ' — keep typing, or search “*” for all.'
      : total + ' icon' + (total === 1 ? '' : 's') + '. Click to select, then Add.';
}

/** Toggle an icon in the pending selection and reflect it on its tile + the
 *  footer strip. Nothing is added to the config until Done. */
function toggleLibraryIcon(name) {
  if (iconLibSelected.has(name)) iconLibSelected.delete(name);
  else iconLibSelected.add(name);
  const tile = iconLibModal.querySelector(`.iconlib__tile[data-name="${CSS.escape(name)}"]`);
  if (tile) {
    const on = iconLibSelected.has(name);
    tile.classList.toggle('is-selected', on);
    tile.setAttribute('aria-pressed', String(on));
  }
  renderIconLibSelected();
}
