# Tooltip prototype notes (#1395)

Throwaway prototype. The stories live in
`packages/gofish-graphics/stories/_proposals/tooltips/`, under the Storybook
title `Proposals/Tooltips/`. There are no library edits. Every reach past the
public API is in the stories and is listed under "Private hooks" below.

The idea under test: `.tooltip()` is sugar for one more layer of the same
chart, `.layer(chart(<the focused mark of selectAll(name)>).mark(<a box beside it>))`.
There is no overlay tier. The box must stay inside the chart and must not take
room in the layout.

The sugar lines below are illustrative spellings, not a decided API. The
expanded code is what the stories run.

## The live demos on the page (`demo/`)

The proposal page mounts the Interactive stories live from one bundle,
`demo/tooltip-demos.js`. The stories export `mountInteractive...(container)`
functions, and both Storybook and the bundle call them, so there is one
implementation. Build from the repo root:

    pnpm --filter gofish-graphics exec vite build --config ../../proposals/tooltips/demo/vite.config.mjs

The entry is `demo/src/entry.ts`. It exposes
`window.TooltipDemos.mount(name, element)`. Publish `demo/tooltip-demos.js`
beside `page.html`, with `img/`. The page keeps each picture until its demo
mounts, so a blocked bundle leaves the pictures.

Story-side fixes made for the live demos:

- No render sizing. `pointer().dataPos()` is undefined in a chart with its
  own `w`/`h` (a library bug), and render sizing clipped the axes. The line
  and scatter charts keep their own size, and the focus is read off the drawn
  marks (below). The axes are no longer clipped.
- Touch (now `touchHold` in `focusRuntime.ts`): a tap ends with
  `pointerleave`, which clears the pointer. So after a touch the pointer is
  held where it tapped until the next tap.
- `noPointer` (now `floatingOutOfTheWay` in `focusRuntime.ts`) also turns off hits for everything painted after the box, so a
  chart inside a tooltip does not take the hit and flicker.
- The line rule is always drawn and hidden with no focus, so the y axis keeps
  0 whether the box is open or not.
- A `live()` opacity on a `line` did not register the pointer. The rule's live
  opacity reads it instead.
- `sideOf` opens the box to the left for the last lakes. Past the right edge
  the box widened the canvas and moved the axis labels.
- `EdgeCases` has a new `InteractiveFlipped` story.

## The focus: direct hit, then nearest by position

Every live demo picks its focus with one rule. It was `focusAt` in
`helpers.ts`. It is now `defaultFocus` in `focus.ts`, written as user code
(see "Focus behaviors in user space" below):

1. A pointer inside a mark's drawn box (inside a scatter dot's circle) picks
   that mark.
2. Otherwise the focus is the mark nearest by position, its size ignored.
   Each mark is one point. Along an axis where the layout or a position
   channel places the mark (a `spread` slot, a `stack` place, a scatter's
   `x`/`y`) the point is the mark's center. Along an axis where the mark only
   has a size from a shared baseline (a bar's length) the axis drops out. Each
   story passes the placing axes as data (`position: ["y"]` for the issue
   bars, `["x", "y"]` for segments and scatter points, `["x"]` for stacks,
   the edge bars and the years) with a comment saying which operator or
   channel places the mark.
3. The current focus has a head start of `stickiness` px (default 4) in rule 2. A direct hit on another mark always switches.
4. Rule 2 applies while the pointer is within `radius` px of the convex hull
   of the drawn marks (8 for bars and years, 30 for the scatter). Once there
   is a focus it is kept out to `radius + 4` px. Farther out there is no
   focus. The lines' hull is over the year dots and the drawn lines.

This is Declarative Dragging's rule (#1294): `closest` over one point per
state with a stickiness bonus, and `whenFar` with in and out thresholds. Here a
mark's placed position is its point, and the direct hit is added, which
dragging does not need.

PRIVATE HOOK (3), removed: `snapToNearest` re-targeted each real
`pointermove` and `pointerdown` to the element of the focused mark, so
`pointer().datum()` was that mark's datum. `snap` in `focusRuntime.ts` now
writes the focus key directly, so nothing reads the DOM hit. The lines'
hull is now over the year dots alone, which cover the lines.

Measured in the headless browser with the real mouse (probe page, client px):

- **a. Issue bar, level with a short bar, to its right.** Bar 6 (INF→VO) at
  x 273, 288, 328 and 388: INF→VO each time. Bar 10 (other→VO) at x 208:
  other→VO. Bar 13 (INF→PK) at x 166: INF→PK. The pointer's row decides
  with no `axis` option.
- **b. Issue bar, slow sweep across all 15 bars** (x 92, 0.5 px steps). Down:
  16 focus changes, 2 closed states (before the first bar and after the
  last), 16 layout re-runs. Every switch is 2.0 to 2.5 px past the middle of
  the 4 px gap (bar pitch 26.9 px). Up: the same counts, and every switch is
  2.0 to 2.5 px past the middle the other way. So the hysteresis band is
  about 4 to 5 px wide, from the 4 px head start.
- **c. Stacked segments.** In Lake A, a 66.3 px Catfish segment under a 27.4
  px one: 1, 2 and 4 px inside Catfish's top edge the focus is Catfish (a
  direct hit), though the short segment's center is nearer (14.7 px against
  32.1 px at 1 px). In the 8 px gap between Lake B and Lake C, swept in 0.5
  px steps: at y 326 one switch at 4.5 px into the gap (Bass to Bass), at y
  216 one switch at 3.0 px (Lake B Trout to Lake C Catfish, the nearer
  center), at y 58 one switch at 8.0 px (on reaching Lake C, a direct hit).
  At y 48 and 33, above Lake C's top, Lake B's Salmon stays: its center is
  nearer than Lake C's.
- **d. Scatter, the old switching spot** (svg 180.71, 307.5 and 183.04,
  307.5). Six 1 px moves: no switch. Approached from below, the focus is
  #141 throughout (its center 9.05 and 9.11 px away, against #119 at 5.83 and
  #79 at 7.01, inside the 4 px head start). Approached from 3 px left, it is
  #119 throughout (5.83 and 8.16 px, against #79 at 7.01). From #119 at
  (180.71, 307.5) the focus changes after moving 4 px right (to #79), 5.5 px
  down (to #141), 8 px up (to #31) or 14.75 px left (to #59).
- **e. Leaving the marks.** Issue bar, down from the last bar's bottom edge:
  the box closes at 12.5 px out and reopens at 8 px coming back. Scatter,
  down from the lowest dot: closes at 34.5 px, reopens at 30 px.

### Before (box distance)

Measured in the headless browser with the real mouse, with the old rule (distance to each mark's box, and `axis`):

- **Issue bar, level with a short bar, to its right.** With `axis: "y"` the
  pointer's row decides. At bar 6 (INF→VO, ends at x 268, row y 172 to 195),
  the pointer at y 183 and x 273, 288, 328 and 388 picks INF→VO every time.
  With plain distance, x 288 and 328 pick VO→VO→VO (the bar above) and x 388
  picks VO→INF (three rows up). At bar 10 (other→VO, ends at x 188), x 208
  picks INF→INF→INF by plain distance. At bar 13 (INF→PK), x 166 picks
  PK→INF. So `axis` is the default for banded layouts. The hull's right side
  runs from the end of the longest bar to the end of the shortest, so level
  with a short bar the hull ends some way right of it: at bar 13 the box
  closes 60 px right of the bar's end, and at bar 10, 120 px right.
- **Stacked bar segments, the 8 px gap between Lake B and Lake C.** Swept
  in 0.5 px steps at five heights: one change each, at 4.5 px into the gap,
  from a Lake B segment to the Lake C segment at the same height. Above Lake
  C's top (but inside the hull) the column decides: Lake C's top segment.
  Before, the box closed for the whole gap.
- **Scatter, 1 px moves over the box.** The switching is real nearest-point
  picking. At svg (180.71, 307.50) point #119 is 2.83 px away and #26 3.20 px.
  At (183.04, 307.50) point #79 is 2.81 px away and #119 5.17 px. The two
  points are about 2 px apart, so a 1 px move crosses between them.
- **Issue bar, slow sweep down across all 15 bars** (x 92, 1 px steps).
  Before: 30 focus changes, 16 closed states, 30 layout re-runs. After: 16
  focus changes (open on the first bar, one per boundary between bars, close
  8 px below the last bar), 2 closed states (before and after), 16 layout
  re-runs, and no closed state between bars.

## The helpers (`helpers.ts`)

- `table(pairs, {title})`: two `spread`s in y side by side. Names are gray and
  right-aligned, values are dark, bold and left-aligned.
- `box(content)`: an `enclose` with a white fill, a light stroke and `rx: 4`.
- `rowTooltip(row, {fields, format})`: `box(table(entries(row)))`.
- `beside(anchor, content, {side, align, gap, ink})`: one `spread` of the
  anchor and the box. With `ink` on (the default) the box is marked ink (private
  hook 1), so it takes no room.
- `focusFrom(read)` (kept for the Measure stories only): the focus split. A Solid effect outside the spec maps the
  pointer to a key and writes a `signal` only when the key changes.
- `floatingOutOfTheWay(container)` (in `focusRuntime.ts`, was `noPointer`): private hook 2, CSS that takes the box out of the
  hit test.

## 1. Issue bar chart

![](img/issue-bar.png)

Sugar:

```js
chart(pathTypes, { w: 520, h: 400 })
  .flow(spread({ by: "path", dir: "y", spacing: 4 }))
  .mark(rect({ w: "share" }).name("bars"))
  .tooltip("bars", { focus, format: { share: percent1, n: thousands } });
```

Expanded:

```js
  .layer(
    chart(selectAll("bars"))
      .flow(filter((bar) => bar.datum[0].path === focus()), group({ by: "path" }))
      .mark((bar) =>
        beside(bar[0], rowTooltip(bar[0].datum[0], { format }),
          bar[0].datum[0].share > 0.09
            ? { side: "bottom", align: "end", gap: 4 }
            : { side: "right" })))
```

Stories: Pinned (VO→VO), Closed, Interactive.

Flaws: the data are invented (15 rows, 91,554 paths in total). The "Top 15
path types" title is missing because charts have no title. The top bar touches
the top edge of the image. The side is chosen from the datum (see "Keep
inside").

## 2. Stacked bar: one segment and the whole stack (#802)

![](img/stack-segment.png)
![](img/stack-whole.png)

Sugar:

```js
chart(seafood, { w: 420, h: 320 })
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }).name("segments"))
  .tooltip("segments", { focus })                 // one segment
  .tooltip(<the stack>, { focus, body: stackTable }) // the whole stack, see #802
```

Expanded, whole stack (the segment form is story 1's with
`filter(lake && species)` and `group({by: "species"})`):

```js
  .layer(
    chart(selectAll("segments"))
      .flow(filter((s) => s.datum[0].lake === focus()), group({ by: "lake" }))
      .mark((s) =>
        beside(
          enclose({ padding: 2, fill: "none", stroke: "#111827" }, s).zOrder(1),
          box(table([...speciesRowsTopFirst, ["total", total]], { title: lake })))))
```

Stories: PinnedSegment (Lake C / Trout), PinnedWholeStack (Lake C), Closed,
InteractiveSegment, InteractiveWholeStack.

Wall (#802): the stack's group cannot be named, so there is no ref to the
stack. The stand-in is an `enclose` of the segment refs, which draws an outline
I would want anyway. `layer(refs)` as a stand-in throws "layer: axis 1 has a
continuous type but no size claim". A relational mark paints under the marks it
references by default, which put the box under the next lake's bars, so the
anchor is raised with `.zOrder(1)`.

## 3. Multi-series line, shared tooltip

![](img/lines-shared.png)

Sugar:

```js
chart(yearly, { w: 520, h: 300 })
  .flow(group({ by: "series" }))
  .mark(line({ x: "year", y: "count", stroke: "series" }))
  .tooltip({ by: "year", focus: nearestX, rule: true, dots: true });
```

Expanded (three layers, a rule, dots and the box):

```js
  .layer(chart(YEARS.filter((y) => y === focus()).map((year) => ({ year, top: TOP })))
    .flow(scatter({ by: "year", x: "year" }))
    .mark(rect({ w: 1, h: "top", fill: "#9ca3af" })))
  .layer(chart(yearly).flow(scatter({ x: "year", y: "count" }))
    .mark(circle({ r: 4, fill: "series", stroke: "white",
                   opacity: (d) => (d.year === focus() ? 1 : 0) }).name("pts")))
  .layer(chart(selectAll("pts"))
    .flow(filter((pt) => pt.datum[0].year === focus()), group({ by: "year" }))
    .mark((pts) => beside(
      enclose({ padding: 6, fill: "none", stroke: "none" }, pts).zOrder(1),
      box(table(rowsSortedByCount, { title: year })),
      { side: year > 2005 ? "left" : "right" })))
```

Stories: Pinned (2003), Closed, Interactive (the nearest year to
`pointer().dataPos().x`).

Flaws: the dots are drawn for every row at opacity 0 and shown only at the
focused year, which is a trick. A filtered data layer would be cleaner but
then needs its own name for `selectAll`. The box covers the lines under it, as
any tooltip does.

## 4. Scatter: nearest point within a radius, with a ring

![](img/scatter-nearest.png)

Sugar:

```js
chart(penguins, { w: 440, h: 360 })
  .flow(scatter({ x: "Flipper Length (mm)", y: "Body Mass (g)" }))
  .mark(circle({ r: 3, fill: "Species" }).name("pts"))
  .tooltip("pts", { focus: nearest({ radius: 30 }), ring: true, fields });
```

Expanded:

```js
  .layer(chart(selectAll("pts"))
    .flow(filter((pt) => pt.datum[0].id === focus()), group({ by: "id" }))
    .mark((pt) => beside(
      enclose({ shape: Shape.oval(), padding: 3, fill: "none", stroke: "#111827" }, pt).zOrder(1),
      rowTooltip(pt[0].datum[0], { fields }),
      { side: pt[0].datum[0][X] > 215 ? "left" : "right" })))
```

The pinned story draws the virtual pointer as a red "+" that is not on a point.
The nearest point within 30 px (Adelie, 184 mm, 4,650 g) gets the ring and the
box.

Wall (#849): `Pointer` gives data coordinates but no data-to-px map, so
`nearest` approximates pixel distance from the chart size over the data
extent. It ignores the axis padding.

## 5. A chart in a tooltip

![](img/chart-in-tooltip.png)

Expanded (the box holds a title and a whole chart):

```js
box(
  spread({ dir: "y", spacing: 6, alignment: "start" }, [
    text({ text: lake, fontWeight: 700 }),
    chart(
      rows.map((r) => ({ species: r.species, n: r.count })),
      { w: 200, h: 70, axes: { x: { title: false } } }
    )
      .flow(spread({ by: "species", dir: "x", spacing: 6 }))
      .mark(rect({ h: "n", fill: "species" }).label("n")),
  ])
);
```

Stories: Pinned (Lake B), Interactive.

Wall: the inner chart is not its own world. Measure-keyed domains are shared
across tiers, so with the field named `count` the inner bars used the outer
chart's `count` scale and came out tiny. Putting count on x instead made the
outer chart warn about mixed data-driven and flexible sizes. The story renames
the field to `n`, which is a workaround. Ink stops the box from taking room. It
does not separate scales or type inference.

## 6. Edge cases

![](img/edge-flip.png)

`Flipped`: tall bars open their box to the right, flush with the bar's top
(`{side: "right", align: "end"}`). The last lake opens to the top, aligned to
its right edge. The rest open to the top. All are chosen from the datum.

![](img/edge-naive.png)

`Naive` (`ink: false`, side top) shows what happens without the ink flag. The
canvas grows from 471×353 to 497×437 and the plot moves down 84 px.

The layout check stories, against `Closed`, compare the normalized DOM. The
table counts elements of the closed render that are missing or moved in the
open render.

| Story                                     | Render size | Moved   | Canvas                                     |
| ----------------------------------------- | ----------- | ------- | ------------------------------------------ |
| Naive (no ink)                            | none        | 45 / 45 | grows                                      |
| InkOnly                                   | none        | 45 / 45 | grows (ink above the plot shifts the root) |
| NaiveFixedCanvas                          | 480×360     | 45 / 45 | same, plot squeezed, warning               |
| InkOnlyFixedCanvas                        | 480×360     | 0 / 45  | same, box draws past the canvas, warning   |
| Flipped (ink, kept inside by side choice) | none        | 0 / 45  | +0.5 px wide (stroke overhang)             |

## Measurements

The measurements were run in headless Chromium with a real clock. The capture
harness uses a fake clock, so its times are meaningless. The driver is
`proposals/tooltips/measure.ts`, which opens the "Proposals/Tooltips/Measure/Run"
story. To rerun:
`cd tests && CAPTURE_ONE_PORT=4793 pnpm exec tsx ../proposals/tooltips/measure.ts`.

### Does layout re-run on every pointer move?

Yes, when the spec reads the pointer. A read during resolve is a pipeline
dependency, and the pointer changes on every move. Can the focus be split from
the pointer position with today's API? Yes. `focusFrom` maps the pointer to a
key in a Solid effect outside the spec. It writes a `signal` only when the key
changes, and the spec reads only that signal.

The `<svg>` replacements were counted with a MutationObserver during a sweep
of synthetic pointer moves:

| Sweep                         | Moves | Pointer read in spec | Focus split               |
| ----------------------------- | ----- | -------------------- | ------------------------- |
| issue bars, 3 bars × 10 moves | 30    | 30 re-runs           | 3 re-runs                 |
| lines, left to right          | 40    | 40 re-runs           | 10 re-runs (one per year) |

The pointer must still be registered with the chart's runtime. Only a read
inside a spec does that, so each interactive story reads it once in a `live()`
channel, a paint patch that does not re-run layout. In the bar stories that
read is a hover fill. In the lines story it is `live(() => (p.pos(), 1))` as the
line opacity, which is a trick.

### Cost of one re-run

The median of 15 full renders (resolve, layout and paint), after 2 warm-ups,
with a tooltip open:

| Story                                 | ms   |
| ------------------------------------- | ---- |
| 1. issue bar, open                    | 8.0  |
| 1. issue bar, closed                  | 4.6  |
| 2. stacked bar, whole-stack box       | 10.9 |
| 3. shared lines (4 series × 10 years) | 12.2 |

Three runs agreed within about 1.5 ms. These are on an M-series Mac. The
tooltip layer about doubles the cost of the issue bar chart (4.6 to 8.0 ms).

### Does an open tooltip change the layout?

With the ink box, no. The normalized DOM of each pinned story was diffed
against its closed story:

| Story            | Elements moved                                               |
| ---------------- | ------------------------------------------------------------ |
| issue bar        | 0 / 60                                                       |
| stack segment    | 0 / 79                                                       |
| stack whole      | 0 / 79                                                       |
| chart in tooltip | 0 / 79                                                       |
| scatter          | 0 / 398                                                      |
| shared lines     | 85 / 95, a 0.75 px vertical shift (canvas 331.75 → 331 tall) |

The shared-lines shift is in the Closed render, not the box. A diagnostic run
(since deleted) showed that a tier with no marks at all (the closed rule and
tooltip tiers) moves the plot. In a render-sized chart it moved the x axis by
46 px. A tier with marks that is not ink moved nothing. So an empty layer
changes the layout, which is a library issue in its own right and not a
tooltip one.

### Does the box steal the pointer?

Yes. The pointer was held still inside the open box of the top bar, over the
second bar:

- Without CSS: `VO→VO → (none) → INF→INF → …`. The box became the hit, the
  datum turned undefined, the focus cleared, and the box closed for one frame.
  That frame is the flicker.
- With the `noPointer` CSS: `VO→VO → INF→INF → …`. The move goes through to
  the bar under the box, with no closed frame.

Paint never sets `pointer-events`. The fix here is story-side CSS that finds
the box by its stroke color. A real `.tooltip()` would paint its box with
`pointer-events: none`.

## Keep inside (a declared shortcut)

The ink flag keeps the box from taking room. It does not keep the box inside
the canvas. Keeping it inside needs the mark's placed position, which exists
only after the solve. That is the job of a post-solve chooser like the label
chooser: `applyLabelPlacement` in `src/ast/labels/placeStep.ts` already keeps
labels in the frame and hides a label with no spot. In this prototype the
caller picks the side from the datum (`share > 0.09`, `year > 2005`,
`x > 215`). This is a shortcut. The right fix is to run the tooltip's side and
alignment through that chooser, with a list of candidate sides.

## Walls

The issue column below was matched by topic and several numbers are wrong. The checked matches are in `proposal.md` under Findings.

| Wall                                                                                                                                                                                                                                                                                       | Issue      | Where                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------ |
| No name for a stack group, so no ref to the whole stack. Enclose of the segment refs as a stand-in. `layer(refs)` throws.                                                                                                                                                                  | #802       | stories 2, 5             |
| `Pointer` has no data-to-px map, so "nearest within N px" is approximated.                                                                                                                                                                                                                 | #849       | story 4                  |
| `pointer().dataPos()` returns undefined when the chart has its own `w`/`h`. It converts only when the size goes to `render()`.                                                                                                                                                             | #849       | stories 3, 4 Interactive |
| A render-sized chart with a tier that has no marks or an ink box draws its axes past the canvas (59 px left, 25 to 46 px below). So the Interactive lines and scatter stories keep chart sizing and map the pointer with `drawnScales` instead of `dataPos()`. Their axes are not clipped. | #849, #850 | stories 3, 4 Interactive |
| An empty layer tier moves the plot.                                                                                                                                                                                                                                                        | #850       | story 3 Closed           |
| The pointer registers only through a read inside the spec, so a focus split needs a dummy `live()` read.                                                                                                                                                                                   | #830, #673 | all Interactive          |
| No `pointer-events` control in paint; the box steals the hit test.                                                                                                                                                                                                                         | #674       | story 1 Interactive      |
| A tooltip chart shares the parent's measure-keyed domains and type inference. Ink covers room, not scales.                                                                                                                                                                                 | #803       | story 5                  |
| The color scale is not reachable outside resolve, so a `live()` fill must spell its palette as literals, and a tooltip cannot draw a series swatch.                                                                                                                                        | #673       | stories 3, 4             |
| A relational mark paints under its operands by default, so an anchor needs `.zOrder(1)`.                                                                                                                                                                                                   |            | stories 2 to 5           |
| `filter` with no match still calls the mark with `[]`. Adding `group({by})` after it avoids the call.                                                                                                                                                                                      |            | all                      |
| Nothing formats numbers beyond `String()`. The helpers carry formatters.                                                                                                                                                                                                                   |            | all                      |
| No drop shadow among the filters. No chart title.                                                                                                                                                                                                                                          |            | all                      |

I matched the issue numbers from the brief's list by topic. I did not reread
the issues, so check the matches before citing them.

## Private hooks and library edits

Library edits: none. `src/ast/gofish.tsx` was instrumented during the work and
restored. `git status` shows only the two new folders.

Private hooks, all in the stories:

1. `GoFishNode.inkOn = [true, true]` on the box (`beside` in `helpers.ts`). It
   must be on the content node. On the `spread` it is lost, because the spread
   elaborates into a new layer.
2. `noPointer`: story CSS that sets `pointer-events: none` on the box and its
   text, found by the box's stroke color.

Workarounds that use public API:

- `.zOrder(1)` on every enclose anchor.
- An enclose of refs as the stand-in for a stack (#802).
- `group({by})` after every `filter`.
- A dummy `live()` read to register the pointer.
- The side chosen from the datum, the keep-inside shortcut.
- The field renamed to `n` in the nested chart.

3. `focusRuntime.ts`: every piece the runtime would have to provide for a
   focus behavior (candidates read off the drawn DOM with rows from the
   chart's private id-to-item map, the pointer, `current`, the click, the
   re-run on a new key, the touch hold). Listed in "What the runtime must
   provide" below.

## Focus behaviors in user space

The focus rule is now user code: `focus.ts` holds the types and the `Focus`
family as pure functions (no DOM, no Solid, no GoFish internals), and
`focusRuntime.ts` holds everything the runtime would have to provide. Every
interactive story mounts through `snap(container, marks, focus)` in
`focusRuntime.ts`. The default:

```js
Focus.first([Focus.hit(), Focus.closest({ stickiness: 4 })]).within(8);
```

A call (`Focus.hit`, `Focus.closest`, `Focus.first`, `Focus.from`) starts a
behavior or joins several; a chained method (`.within`, `.onClick`)
transforms one.

### Line counts

Prettier-formatted, code lines only (no blank or comment lines).

| What                                                                   | Lines |
| ---------------------------------------------------------------------- | ----: |
| `focus.ts`, all of it (types, family, geometry)                        |   137 |
| of which the types                                                     |    23 |
| of which the family (`from`, `hit`, `closest`, `first`, the default)   |    54 |
| of which the geometry (box, outline and hull distances, the hull)      |    60 |
| `focusRuntime.ts`, the missing runtime API                             |   101 |
| Default behavior                                                       |     1 |
| Hit only                                                               |     1 |
| Closest center within 40 px                                            |     1 |
| Closest outline, no stickiness                                         |     1 |
| No hull limit                                                          |     1 |
| Click to pin                                                           |     3 |
| A plain function (largest share within 60 px), plus one line to use it |     6 |

### What each behavior did under the mouse

The switcher on the page (story "Proposals/Tooltips/Focus Behaviors",
`FocusSwitcher.stories.tsx`), the issue bar chart, driven with the real mouse
in headless Chromium at 1280 px (`focus.mjs` in the live-check folder). Each
point was approached from inside INF→VO, so stickiness had a current focus.

| Pointer                                      | Default     | Hit only | Center 40 px | Outline | No hull limit | Plain function |
| -------------------------------------------- | ----------- | -------- | ------------ | ------- | ------------- | -------------- |
| Inside INF→VO (bar 6)                        | INF→VO      | INF→VO   | INF→VO       | INF→VO  | INF→VO        | PK→PK          |
| Gap under INF→VO, 10 px from the bars' start | INF→VO      | closed   | closed       | INF→VO  | INF→VO        | PK→PK          |
| Level with INF→PK, 20 px right of its end    | INF→PK      | closed   | closed       | PK→INF  | INF→PK        | VO→other       |
| Level with INF→PK, 70 px right               | closed      | closed   | closed       | closed  | INF→PK        | closed         |
| Level with INF→PK, far right of the plot     | closed      | closed   | closed       | closed  | INF→PK        | closed         |
| Level with other→other, 30 px right          | other→other | closed   | closed       | INF→INF | other→other   | VO→VO          |
| 20 px under the last bar                     | closed      | closed   | VO→INF→VO    | closed  | VO→INF→VO     | INF→PK         |

- A slow sweep down across bars 5 to 8 at 10 px from their start: hit only
  went VO→VO→VO, closed, INF→VO, closed, PK→VO, closed, VO→PK (three
  closes, the flicker). The default went VO→VO→VO, INF→VO, PK→VO, VO→PK.
- Outline picks the bar above when level with a short bar and right of it
  (PK→INF for INF→PK, INF→INF for other→other): the box-distance rule that
  picked the wrong bar.
- Center within 40 px: on a long bar only the middle counts, and a short
  bar's center is reachable from 20 px under it.
- Click to pin: moving over a bar opened nothing. A click on INF→VO pinned
  it; it stayed while the pointer moved to bar 2, left the chart, and moved
  onto the box. A click right of INF→PK moved the pin there. A click far
  right, outside the hull, cleared it. A click outside the chart's `<svg>`
  is not seen, because the listener is on the chart.
- Every one of them is the same `snap` call with a different behavior value;
  the switcher itself is one more user function, `(f) => behaviors[name](f)`.

### Against the old prototype

`compare.mjs` runs the same pointer paths on the bundle at HEAD and on the
new one and prints the focus at each step. Issue bar (four offsets right of
bar 6, bar 10, bar 13; a slow sweep; leaving down and coming back),
stacked segments (three gap sweeps), stacks, scatter (leaving down; a
diagonal sweep), edge and chart-in-tooltip: identical. The shared lines
differ, by design: the old hull was over the year dots plus the lines'
bounding boxes; the new hull is over the year dots only, which is the convex
hull of the drawn lines. A sweep across opens 8 px later at the left end
(x 96 against 88), and a sweep down at 2006 opens 32 px lower (y 376.5
against 344.5) and closes 3 px sooner.

### What the runtime must provide

| Piece                                          | The prototype, by hand                                                                                  | Public API that replaces it                                  | Issue |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| Candidates                                     | CSS selector and count over the drawn SVG; boxes measured; rows from the chart's private id-to-item map | `snap(selectAll(name))` builds them from the layout frame    | #830  |
| Placed position                                | Each story passes the placing axes                                                                      | The layout reports them (the kind of space)                  | #849  |
| Stable key                                     | Each story passes a key function; marks with one key are one candidate                                  | Keys from spec position and data key                         | #673  |
| The current focus, and re-running on a new key | The chosen key in a `signal`, set only on change; `current` found by key in each new frame              | `snap`'s result changes only when its key changes            | #830  |
| The pointer                                    | Container listeners and the screen CTM; a tap holds the pointer until the next tap                      | `pointer()` as the frame's pointer, holding a tap on touch   |       |
| The click                                      | A DOM `click` listener                                                                                  | A click in the frame; `click()` counts only clicks on a mark | #830  |
| The box out of the pointer's way               | CSS found by the box's stroke                                                                           | A floating layer is never a pointer target                   |       |
| Registering the pointer                        | `ping()` read in a `live()` channel                                                                     | `snap` registers its input                                   | #830  |
