# Styling baseline

The look-and-feel contract for this app. New UI should reuse these tokens and
patterns so it feels like one product. When something *should* diverge, change it
here first (see "Consistency dials" at the end) rather than one-off in a component.

## 1. Design tokens (the only source of colour/spacing)

Defined on `:root` in `styles.css`. **Never hard-code a colour in a component** —
use a token, so light/dark and future retheming work for free.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f4f5f7` | `#1a1f26` | app background |
| `--surface` | `#ffffff` | `#232a33` | cards, panels, inputs, cells |
| `--surface-2` | `#eceef1` | `#2b333d` | insets, hovers, tab/segment tracks, list panels |
| `--ink` | `#1f2933` | `#e4e7eb` | primary text |
| `--ink-soft` | `#52606d` | `#9aa5b1` | secondary text, labels, notes |
| `--line` | `#cbd2d9` | `#3e4c59` | borders/dividers |
| `--line-strong` | `#9aa5b1` | `#616e7c` | emphasised borders, hover edges |
| `--accent` | `#2f6feb` | (same) | primary action, selection, focus |
| `--accent-ink` | `#ffffff` | (same) | text/icon on `--accent` |
| `--danger` | `#c0392b` | (same) | destructive action |
| `--seat` / `--seat-border` | `#dbe7ff` / `#2f6feb` | `#23405f` / `#2f6feb` | a filled square's default fill/border |

Non-colour tokens: `--radius: 10px` (panels), `--radius-sm: 7px` (buttons,
inputs, chips), `--tap: 44px` (min touch target — buttons/inputs/swatches),
`--shadow` (elevated surfaces), `--font` (system stack — no web fonts).

## 2. Theming mechanism (keep this exact shape)

- Light palette lives on **bare `:root`**.
- Dark palette is declared **twice**, carrying the same tokens:
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
  **and** `:root[data-theme="dark"] { … }`.
- Settings writes `data-theme="light|dark"` on `<html>` (or removes it for
  "system"). An explicit choice therefore wins in both directions.
- Any new themable colour MUST be added to **all three** palette blocks.
- Text drawn straight onto a fill or the page (labels, titles) is run through
  `contrastLabelColor(color, bg)` / `readableInk(bg)` (`js/icons.js`) so it never
  vanishes on a matching background. Do the same for any new on-surface text.

## 3. Component patterns (reuse, don't reinvent)

- **Buttons** — `.btn` (neutral), `.btn--primary` (accent), `.btn--empty` /
  `.btn--ghost`, `.btn--icon` (square). Icon-only toolbar buttons are `.iconbtn`
  with an inline `<svg><use href="#ui-…"></svg>` from the symbol sheet at the top
  of `index.html`. Min height `--tap`.
- **Colour swatches** are **square** everywhere (`.defaults__swatch`,
  `.field__input--color`) — keep them square, and the colour fills the whole
  rounded box (padding 0, the browser's inner swatch stripped). The custom picker
  popover is wired by `enhanceColorInput` (`js/colorpicker.js`); hex accepts
  values with/without `#`. Its footer is one row of equal icon-only tools —
  eyedropper, Transparent, save-to-palette — over a 5-slot saved-colour bar
  (`config.customColors`, newest first, `saveCustomColor`). Transparent is a
  **toggle**: the swatch keeps the colour underneath, so turning it off restores
  that colour rather than making you find it again. Every swatch offers it —
  except a
  FILL, which opts out with `data-no-transparent="1"` (an empty square already
  says "nothing"); `swatch()` sets that automatically for any label matching
  /fill/i. Read a swatch with `colorOf(input)` and write one with
  `setColorInput(input, value)` — never `.value`, which cannot carry the
  transparent state. The stored value is the string `'transparent'`, which canvas,
  CSS and SVG all accept, and which the contrast helpers pass through untouched.
- **Modals** — `.modal` > `.modal__panel` (`--settings` = left pane, `--iconlib`
  = wide) with `.modal__head` / `.modal__body` / `.modal__foot`. Settings tabs
  (`.settings-tabs` / `.settings-tab`) live in the header under the title.
- **Popmenus** — `.popmenu` / `.popmenu__item`, `position: fixed; z-index: 70`.
- **Fields** — `.field__input`; stacked label via `.settings-field` /
  `.field__label`; helper text `.settings-note` / `.egroup__note` (12px,
  `--ink-soft`).
- **Saved-entry lists** (custom papers/icons) sit on a `.settings-list` inset
  panel (`--surface-2` + `--line`) to read as a distinct list.
- **Icon picker** — `.icon-picker` / `.icon-picker__btn`; `aria-pressed` marks the
  active icon.
- **Grid ↔ export parity**: the editing grid (DOM, `js/grid.js`) and the exported
  canvas (`js/export.js`) must render a square the same way. When you change one
  renderer, change its twin (e.g. `placeChairLabels`/`chairLabelBox`,
  `buildServerRack`/`drawServerRack`).

## 4. Conventions

- Semantic, kebab-case, BEM-ish class names (`.block__el--mod`).
- z-index ladder: cell content ~2, tables ~1, drawers/modals 50, popmenus 70.
- Focus is always visible: `outline: 2px solid var(--accent)`.
- Respect `prefers-reduced-motion` for any new animation.
- Icons are inline `<symbol>`s (grid/UI) or `iconUse()`/`iconDataUrl()` (icons.js);
  keep the 24×24 viewBox and `currentColor` so colour follows the token.

## 5. Consistency dials — what's shared vs. tunable

**Should stay uniform (change here, once):** the token palette; radii and `--tap`;
button/field/modal/popmenu shapes; square colour swatches; the dark-mode triple
declaration; label/icon contrast behaviour; grid↔export parity.

**Fine to vary per feature (and where to set it):** the accent hue (single token
`--accent`); per-context icon glyphs; a component's own spacing/size within the
token scale; furniture-specific geometry (chair 0.5 tile, server half-slab); grid
cell base size (`CELL_BASE` and the `CHAR_W/LINE_H/ICON_RESERVE` budgets in
`js/grid.js`).

To retune the whole app's feel, edit the `:root` tokens (all three palette
blocks) — every component follows. To make a targeted exception, add a token or a
`--modifier` class rather than a hard-coded value, and note the intent here.
