# Drag prototypes: findings

These prototypes drive drags on GoFish charts with a small drag engine that
copies the main ideas of Dragology ("Declarative Dragging", UIST 2026). The
engine does not use the `dragology` package, React, or react-dom. It is built
from GoFish's own pieces: `toDisplayList` lays out each state, and GoFish's
display-list painter draws the result.

- Engine: `packages/gofish-graphics/stories/drag/engine.ts` (916 lines with
  comments).
- Demos: `packages/gofish-graphics/stories/drag/demos.ts`, shared by the
  stories (`stories/drag/Drag.stories.tsx`, titles "Drag/Reorder Bars",
  "Drag/Move Segment", "Drag/Scheduler", "Drag/Treemap Reparent") and by the
  standalone bundle (`proposals/dragology/demo/demos.js`).
- Measurements: `proposals/dragology/demo/results.json`, written by
  `proposals/dragology/demo/drive.mjs`. That script drives real pointer drags
  through Playwright on the bundle, with no network access.

## What the engine reproduces from Dragology, and in how many lines

| Dragology idea                                                                                         | Engine part                                                                                                                           | Lines                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| A view is a function of state; a drag moves between states                                             | `spec(rows)` plus `toDisplayList` per state, with a cache keyed by the rows                                                           | in mount, about 25          |
| Elements are matched across states by `id`                                                             | Key join over display items: `key(row)` on an item's `datum`; chrome keyed by its text, or by the nearest text for ticks and swatches | 80                          |
| `lerp` of rendered SVG, fading elements that exist in one state only, never blending different strings | `blendValue` and `blendLayouts`: numbers, colors (through culori), path data with the same commands; text content is part of the key  | 153                         |
| `d.closest`, `.withFloating()`, `d.between` (Delaunay weights, projection onto the hull)               | `closestWeights`, floating offset, `betweenWeights`                                                                                   | 102                         |
| The author lists the reachable states                                                                  | `candidates`: derived from the data by `edit`, `reorder`, or a `states` function                                                      | 74                          |
| `d.vary` for continuous parameters                                                                     | Two layouts per discrete state and an inverse of the affine pixel map (see below)                                                     | in the frame loop, about 30 |
| `.withBranchTransition`                                                                                | Weights ease over 150 ms when `closest` switches state                                                                                | 20                          |
| Drop animation                                                                                         | 200 ms ease-out tween from the preview to the dropped layout                                                                          | 20                          |
| Debug overlay                                                                                          | The targets, the slide segment of a continuous field, and lines from the pointer to the weighted targets                              | 30                          |

The pointer loop, panel, hit test, and the rest of mount make up the remaining
lines.

### Continuous fields (the scheduler's `start`)

The engine needs no optimizer. For each discrete state (each room), it lays out
two corner states: `start` at its minimum and at its maximum. While the axis
domain stays fixed, layout is affine in `start`. So the two layouts give the
field's pixel map. The engine projects the pointer onto the segment between the
two dragged-mark positions, which gives `t`, and blends the two layouts with
weights `1 - t` and `t`. With k continuous fields there are 2^k corners and the
weights are multilinear. Only k = 1 was tested.

I checked the affine claim at every continuous drop. The engine compares the
blended preview with a real layout of the dropped rows, box by box, over every
item. The largest gap was **0 px** (`blendErrPx` in `results.json`).

**Axis domain.** It is held fixed, by the data and not by the engine. Each room
has a `day` row (9 to 17) that draws the track, and those rows set the time
axis to the whole day. While dragging, `start` is clamped to
`[9, 17 - length]`, so the domain never changes during or after a drag. If a
drag could widen the domain, layout would no longer be affine in the field, and
the two-layout blend would be wrong. In that case the engine would need a real
layout per frame. That costs about 9 to 15 ms each (see below), which is close to
a 16 ms frame and has to run asynchronously. I did not build that path.

I did not use `src/interaction/frameScales.ts` either. Its `posScales` and
`toPixel` come from the interaction runtime's published frame, which
`toDisplayList` does not return. The two-layout method reads the same affine
map straight from layout output, with no internal access.

## GoFish internals used

| What                                                     | Where                                    | Public?                               |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `toDisplayList` (through `ChartBuilder`)                 | `src/lib.ts:82`, `src/ast/_node.ts:3495` | yes                                   |
| `paintDocument`, the display-list to SolidJS SVG painter | `src/ast/displayList/paintSVG.tsx:64`    | **no**, imported by path from a story |
| Display-list types                                       | `gofish-ir` `DisplayList`                | yes                                   |
| `render` from `solid-js/web`, `d3-delaunay`, `culori`    | existing dependencies                    | n/a                                   |

No library source was changed. The only repository changes outside the
prototype folders add the built bundle to `.prettierignore` and to the ESLint
ignores, so the pre-commit hook does not reformat 830 KB of minified code.

I looked at the key join on branch `worktree-animation-grammar-proposal`
(`src/animation/identity.ts`). I did not borrow it, because it works on the
resolved node tree and not on display items, and its own header says that
chrome added after resolve (axes, legends) has no identity. A drag needs
exactly that chrome to blend. I did not use `tween.tsx` or `interpolate.ts`
either: they interpolate geometry channels of nodes, not display items.

## What Dragology does that this engine does not

- Natural-neighbor interpolation (`between` with `interpolation:
"natural-neighbor"`). The engine has only Delaunay barycentric weights and
  hull projection.
- `.whenFar`, `.withSnapRadius`, `.withDropTransition` options, `.onDrop`,
  `.during`, `.withOverlay`, and chaining specs into a tree
  (`d.closest([d.vary(...), ...])`). The engine has one fixed shape: a product
  of discrete states and continuous corners, with one feel per chart.
- `d.vary` with COBYLA constraints over arbitrary parameters. The engine only
  handles fields whose layout is affine with a fixed domain, and clamps them to
  a `[min, max]` range.
- `d.dropTarget`, `d.custom`, user operators, and the spec tree view.
- Coincident targets: Dragology throws. The engine merges targets closer than
  0.5 px into the first one.
- Layering control (`dragologyZIndex`). The engine always lifts the dragged
  mark to the top.
- Drags on chrome and on marks without a box. `path` and `text` items have no
  box in the display list, so they cannot be grabbed.
- Several marks per row. The hit test picks the topmost box.

## Measured numbers

These come from Playwright in headless Chromium on an Apple Silicon Mac, one
drag per demo. "Lazy" lays out the candidates at pointer-down. "Eager" lays out
every candidate of every draggable mark after mount and after each drop.

| Demo             | Candidates per drag     | Lazy: ms per layout | Lazy: pointer-down latency | Eager: layouts | Eager: precompute per drop | Blend + paint per frame (avg / max) |
| ---------------- | ----------------------- | ------------------- | -------------------------- | -------------- | -------------------------- | ----------------------------------- |
| Reorder Bars     | 6                       | 12.5                | 37 ms                      | 46             | 124 ms, then 78 ms         | 0.7 / 1.4 ms                        |
| Move Segment     | 6                       | 15.1                | 48 ms                      | 296            | 904 ms, then 807 ms        | 1.1 / 1.8 ms                        |
| Scheduler        | 8 (4 rooms x 2 corners) | 9.0                 | 46 ms                      | 106            | 217 ms, then 158 ms        | 1.1 / 1.6 ms                        |
| Treemap Reparent | 4                       | 11.9                | 15 ms                      | 70             | 110 ms, then 90 ms         | 1.0 / 1.5 ms                        |

The eager runs report 3.2 to 5.9 ms per layout, because the JIT warms up over
many layouts. The prototypes use **lazy** mode. Pointer-down latency stays
under 55 ms, and eager mode spends up to 0.9 s after every drop laying out
states the user never visits. Eager mode remains an option
(`precompute: "eager"`).

"Per frame" covers blending the cached layouts and building the SVG through
`paintDocument` with a fresh Solid `render`. It does not cover the browser's
own style, layout, and raster work.

The standalone bundle (`proposals/dragology/demo/demos.js`, one IIFE with
GoFish, solid-js, d3-delaunay, culori, the engine, and the data) is **832,648
bytes** (296 KB gzipped). It contains no React and no dragology code. It ran
from `test.html` through a plain `<script>`, with every non-`file:` request
aborted, and logged no errors. The bundle keeps one dead `import("node:fs/promises")`
from GoFish's file-save helper. It is never called in a browser.

## Line count against Dragology's scheduler

I counted only the comparable part of Dragology's `src/demos/scheduler.tsx`:
the types and initial data, the constants those parts use, the tracks with room
labels, and the bars with the drag between rooms. I left out the imports, the
demo wrapper, the endpoint dots with their `d.vary` resize, and the conflict
graph. Blank lines and JSX comments are not counted. That comes to **70
lines**: 17 lines of types, data, and constants, and 53 lines of rendering and
drag spec.

The GoFish scheduler in `demos.ts` is **57 lines**, formatted by Prettier
without blank or comment lines. Of those, 28 are data (7 meetings, 4 day rows,
and a color list that Prettier spreads over 9 lines), and **29 are the spec and
the drag**, against Dragology's 53.

The two do not draw the same thing. The GoFish version also slides meetings
along time, and it gets a time axis and room labels from GoFish. Dragology's
bar only changes rooms (its dots resize), and it also draws a conflict graph,
which I left out. This version has no resize and no conflict graph.

## Walls and shortcuts, declared

1. **Category order comes from the data, so editing data reorders scales.**
   GoFish orders categories by first appearance. When a drag edits the first
   row of a lake (Move Segment) or of a group (Treemap), that category moves in
   every candidate layout, and the dragged mark lands in slot 0 in every state.
   The fix is in the spec, not the engine: Move Segment declares a lake `Unit`
   with `Domain.discrete`, and Treemap declares a group `Unit`. A drag engine
   needs every categorical domain pinned. A proposal could make
   `edit: [field]` require (or infer) a pinned domain.
2. **GoFish bug: declaring a `Unit` for one column makes the color scale
   ignore another column's levels.** With
   `schema: { lake: Unit(...), species: Unit({ domain: Domain.discrete(SP) }) }`,
   the species colors and the legend follow first appearance, not `SP`. The
   same happens with `spread({ by: field("lake").sort(LAKES) })` and no lake
   unit. Without either, the species levels are honored. I reproduced this in
   a `tsx` script against `src/lib.ts`; the check is in `resolveColorScale`
   (`src/ast/_node.ts:1234-1258`, the `oneOrder` test over the collected
   `orders`). Workaround in the demo: an explicit
   `color: Color.palette({...})` as well as the species unit. This should be
   filed as a GoFish issue.
3. **Stacking groups merge.** `stack({ by: "species" })` merges two rows of the
   same species in one lake into one segment. A moved segment then loses its
   identity, and its key no longer matches. Move Segment therefore stacks by
   `id`. That is a spec choice, and it is honest: a moved catch is still its own
   catch.
4. **Treemap tiling sorts by weight.** With the default sort, a moved leaf
   always lands in the top-left of the largest group. The targets nearly
   coincide, so `between` has nothing to blend. The demo uses
   `sort: "none"` on both treemap levels. Even so, the mid-drag picture blends
   three tilings, and the tiles overlap and leave gaps (frames 2 and 3). That
   is what Dragology's `between` does too; it is not a bug.
5. **Labels carry no datum.** `.label("id")` text has no `datum`, so it is
   keyed as chrome by its text. It does not travel with its tile as part of the
   dragged mark, and it is hidden under the lifted tile during a treemap drag.
   GoFish should put the subject's datum (or a reference to the subject) on its
   label.
6. **Chrome has no stable identity.** Tick labels and legend labels are keyed
   by their text. Ticks, swatches, and axis lines are keyed by the nearest
   text item. That is a heuristic. It is fine here, but a tick whose label
   disappears is re-paired with a neighbor. GoFish should give chrome items a
   stable id (for example, the tick value and axis).
7. **Collinear targets.** d3-delaunay jitters collinear points into sliver
   triangles, and barycentric weights in a sliver land on the far ends of the
   line. In the scheduler the pointer sat on Room 3 while the weights went to
   Rooms 1 and 4. The engine now treats targets within 0.5 px of one line as a
   line, with piecewise-linear weights. This is a numeric tolerance, not a
   special case. Near-collinear targets (Move Segment, where stack heights
   differ) still give sliver triangles that mix three states. That is why Move
   Segment uses `floating` with branch transitions instead of `between`.
8. **Overlapping meetings.** A meeting dropped on top of another is painted in
   data order, so it can be hidden. The scheduler has no conflict handling.
9. **Treemap panel.** At `h: 300` the treemap fills about 220 px and leaves
   empty space below. I did not investigate this.

## What GoFish would need to expose to make this trivial

- **Stable keys on display items.** Today `id` is a per-resolve uid
  (`node-17`). A `key` taken from the datum through a user key function, and a
  structural id for chrome (axis, tick value, legend entry), would remove the
  whole key-join section and its heuristic.
- **Datum on labels.** A label should carry its subject's datum, or a reference
  to the subject, so the label moves with its mark.
- **A public painter.** `paintDocument` (or a `paintDisplayList(items, svg)`)
  exported from `lib.ts`, so a host can paint a blended display list.
- **Boxes for every item.** `itemBox` and `walkItems` in
  `src/interaction/runtime.ts` are private, and text and path items have no box.
  A name or datum to box index on the display list would make hit-testing and
  target lookup one call.
- **The pixel map with the display list.** Returning each axis's data to pixel
  map (the `posScales` legs from `frameScales.ts`) with `toDisplayList` would
  make continuous drags exact without the second corner layout, and would show
  when a drag would change the domain.
- **Pinned categorical domains by default for interactive charts,** and the
  color-scale bug above fixed.
- **Faster or synchronous layout.** At 9 to 15 ms per layout, lazy precompute
  is fine for up to about 10 candidates. A synchronous layout path would let the
  engine lay out per frame when a domain must change.
