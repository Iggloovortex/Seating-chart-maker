# Handoff — table / icon / targeting session

Branch: `claude/table-rework-t0cpjy` (pushed, working tree clean, `8b3c15a`).
Read `CLAUDE.md` first — every finished item below is written up there in full.
This file is only the *live* state: what landed, what is open, and what not to
repeat.

## How to run and test

```bash
python3 -m http.server 8123 &            # background it; foreground sleep is blocked
python3 tools/gen-sources.py             # after editing ANY source file
node tools/tests/targeting.js            # 16 gesture cases — run after touching hit-testing
node tools/survey/survey.js              # the icon/text survey chart + its measurements
```
Playwright lives at `/opt/node22/lib/node_modules/playwright/index.js`.
Grid: screenshot `#chart`. Export: `(await renderToCanvas(150)).toDataURL()`.
Anything in the scratchpad is wiped by a container reset — commit what matters.

## Landed this session

| Commit | What |
|---|---|
| `e8a1119`…`dbdf7c0` | Fractional table edges: a table stops on a split's seam, and shrinks by the same edge reversed |
| `dc2336a` | Drags work in every mode; a table's body drags what sits on it |
| `eead590` `2823460` | A merged desk (and a centred merged piece) layers like a plain cell, so it sits under a table |
| `01e3f48` `e9ecf26` | A table's reach covers the split pieces it extends over |
| `cc55c12` | A merged server with no names fills its desk instead of shrinking to one square |
| `f428b22` | Thirds splits (1×3 and 3×1) between Stacked and Quarters |
| `cf50119` | The icon/text survey chart + measurement pass (`tools/survey/`) |
| `10b0046` `a6d3507` `865d5bb` | A desk's icon cap follows the desk; an icon declares its shape in its viewBox; the double-monitor glyph rebuilt in both copies |
| `e5afaad` `62a4253` | Icons scale to fit, never stretch — and a size is the glyph's WEIGHT, not an axis |
| `ce3d38c` | A table owns the click over its whole area; walls inside a table are half-weight dividers; clicking a wall from outside walls mode lifts it |
| `8b3c15a` | `targetAt` — one hit test for every gesture |

## OPEN — the biggest one

**The universal square/piece icon & text pass is UNFINISHED.** The user asked for
a chart of every rendering case, then "determine and eliminate the differences
between them all… a full pass for completion". The chart is built
(`tools/survey/`) and its differences reported, but **only the icon-size items
have been acted on**. Still outstanding, from the survey's own measurements:

- **Split pieces hang their names OUTSIDE while squares keep them inside.** The
  biggest inconsistency left. It needs the user's call on which is the reference
  behaviour — the question was put to them and is still unanswered, so do not
  start this without it.
- **Line-height differs**: 13.8px on squares vs 15.8px on pieces at the same 12px
  font.
- **Rack labels report no computed line-height** (`NaN`) — they do not go through
  the same label element as everything else.
- **The survey only measured the GRID.** The export was never measured the same
  way, and the grid screenshot was clipped below ~row 7.

## OPEN — smaller

- **Covered split-piece labels, export only.** In the export a covered piece's
  label renders small in the piece's corner; the grid draws it cell-struck
  (`fitSubcellLabels`). `CLAUDE.md` says text is struck from the CELL in *both*
  renderers, so the export is the wrong one. Pre-existing.
- **A table's own seated square keeps its blue outline ring** showing through the
  80%-opacity table. It matches a plain covered square, so it was left alone —
  worth confirming it does not read wrong on the user's dark charts.
- **Icon art lives in two copies** (`index.html`'s `<symbol>` and `SYMBOL_MARKUP`
  in js/icons.js) and has drifted before. Collapsing them into one source is
  flagged but not started.
- Backlog items in `CLAUDE.md` never started: 2-column labels, C2 diagonal drag,
  C4 selection animation, the tutorial line, the dense-rack corner icon.

## Do not repeat these

- **`targetAt` (js/grid.js) is THE hit test.** A new kind of thing on the chart
  joins its order — walls mode → table → wall → merge → piece → square — it does
  not get a branch inside a gesture. Every "unify the targeting" round of this
  feature came from gestures each deciding for themselves. `tools/tests/targeting.js`
  is the guard; run it.
- **An icon's size is its WEIGHT, not its height or its width** (`iconBox`).
  Taking one axis was wrong in both directions at once: as the height a 2:1 glyph
  drew twice as wide as a square one, as the width half as tall. Verify a change
  by checking the drawn w÷h against the glyph's declared ratio **in both
  renderers** — "it got bigger" is not a check.
- **`elementFromPoint` / `elementsFromPoint` cannot tell you paint order.** They
  skip `pointer-events: none` elements — tables, merge overlays and float bands
  all are. Two hit-tests this session gave confident wrong answers.
- **`.table-shape` is `opacity: .8` on the editing grid, on purpose.** Everything
  under a table shows through it. A faint seam "over" a table is usually *through*
  it. Recolour the suspect element and see if the line follows.
- **Suppressing a box under a table is the wrong fix in the GRID.** It was tried
  and made a covered merge the only thing with no outline ring. The EXPORT is the
  one that drops boxes, because there a table is solid.
- **Never give a merge/split wrapper a `z-index`.** It both ties with the table
  (z 1) and opens a stacking context that traps its own content underneath. Three
  separate bugs came from exactly that. Order by DOM instead.
- **Verify the scene you claim to verify.** A "byte-identical export" check was
  once cited for a case the test scene did not contain.
- **Send the user images, do not describe them.** They have had to ask twice.
- **Test-scene gotchas that read as bugs:** a freshly created merge starts
  **filled** (a tap empties it), and an editor pane left open by an earlier case
  will sit over the hover point of a later one.
- **The user's uploaded `.seatchart` holds real workplace data** (room CR47, staff
  role names, CBS asset tags). It stays in the scratchpad — never commit it as a
  repo fixture.
