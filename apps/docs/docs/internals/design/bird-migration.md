---
title: "Plan: the Animated Vega-Lite bird migration example, one spec at a time"
status: steps 1-5 implemented (uncommitted)
date: 2026-09-21
covers: []
---

# Plan: the Animated Vega-Lite bird migration example, one spec at a time

This note plans a GoFish replication of the running example from _Animated
Vega-Lite_ (Zong, Pollock, Wootton, Satyanarayan, IEEE VIS 2022). The paper
walks an ornithologist through five specs, Fig. 1 panels A to E. Each panel
adds one feature. The plan mirrors that: one story per panel, and before each
story the smallest library addition that story needs.

All five steps (panels A to E, and the library work they needed) are
implemented and uncommitted. Each step below says so.

## Sources

- Paper: <https://arxiv.org/abs/2208.03869>, camera-ready at
  <https://vis.csail.mit.edu/pubs/animated-vega-lite.pdf>.
- Implementation and example specs: <https://github.com/mitvis/vl-animation>,
  `src/specs/animated/birds-{A-line,B-line-hover,C-circle-no-trail,D-circle,E-slider}.json`.
- Data: `bird_data.csv` (gist `jonathanzong/5f4fa36e8c2cd04639bc550540264dc6`).
  Columns `day,lon,lat,species`. 72 species x 365 days = 26,280 rows, no gaps.
  `day` runs 1 to 365. Basemap is vega-datasets `world-110m.json`, feature
  `countries`. Projection is `equalEarth` with a pixel `clipExtent` that frames
  the Americas.
- The repo specs differ from the figure in small ways: the trail selection is
  called `window_frame` and is 20 days (the figure says `spread_window`, 5
  days); every spec has a `geoshape` basemap layer the figure crops; `n_day`
  comes from a `toNumber(datum.day)` calculate step.

## What the paper's constructs are, in GoFish terms

| Animated Vega-Lite                                                          | GoFish reading                                                                                      | status                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| `projection: {type: "equalEarth"}` + `longitude`/`latitude` channels        | a `geo(...)` coordinate transform, `scatter({ x: "lon", y: "lat" })` under it                       | new                         |
| `geoshape` basemap layer                                                    | `polygon({ points: <field> })` rows under the same transform                                        | half new                    |
| `time` encoding channel (keyframes, band time scale)                        | `timer({ domain, duration, step })` — a scale from the field's domain onto wall time, read backward | implemented (uncommitted)   |
| default timer selection + filter transform                                  | `timer()` plus the `filter` flow operator; no elaboration, the two are written out                  | implemented (uncommitted)   |
| `anim_value`                                                                | the timer's own read, e.g. `day()`                                                                  | implemented (uncommitted)   |
| timer selection with a window `predicate`                                   | `filter((d) => between((day() - d.day + 365) % 365, 0, 20, { closed: "left" }))`                    | implemented (uncommitted)   |
| conditional encoding on `current_frame`                                     | a channel callback reading `day()`                                                                  | exists (read-location rule) |
| `select: {type: "point", on: "mouseover", fields: ["species"]}` + condition | `pointer().datum()` read in `live()` channels                                                       | exists                      |
| `tooltip`                                                                   | `chart(pointer())` text layer (issue #830 step 1) or a `live()` readout                             | half new                    |
| `bind: {input: "range"}` + auto play/pause checkbox                         | `slider({ value, onInput, … })` and `button({ label, onClick })`, ordinary marks                    | implemented (uncommitted)   |
| `highlight` on `click` with shift multi-select                              | `click()` input rows (#830); the input shipped, multi-select did not                                | half new                    |
| `key` tweening                                                              | must reconcile with #831; no spelling yet                                                           | deferred                    |

## Precedent survey for the new spellings

- Projection: Observable Plot `projection: "equal-earth"` (a top-level chart
  option, like GoFish's `coord`), ggplot2 `coord_sf()` / `coord_map()`, Vega-Lite
  `projection`. All three put the projection where GoFish puts `coord`, so
  `coord: geo("equalEarth")` follows precedent exactly.
- Window relative to the playhead: Vega's window transform `frame: [-20, 0]`.
  Same shape, same inclusive-ends reading.
- Keyframes: Rhombus pict `switch` (ICFP 2026 pearl, see #831), After Effects
  keyframes, the paper's own "keyframes". `keyframes` is the plain-language
  term and reads as temporal without a namespace. The namespace question in
  #831 is real for `stagger`/`sequence` (spatial homonyms) and is not decided
  here.
- Controls: Observable `Inputs.range` / `Inputs.toggle` / `Inputs.bind`,
  ipywidgets `Play` linked to an `IntSlider` (the exact play-plus-scrub pair
  the paper auto-generates), Vega-Lite `bind`. GoFish already spells writable
  inputs as `(): T` plus `.set(v)` (`signal`, `wheel`), so a control is "a DOM
  view over a `.set`-able input".

## Step 0: data and worktree

- Vendor `bird_data.csv` into `packages/gofish-graphics/src/data/birds.ts`,
  coordinates rounded to 3 decimals (about 700 KB instead of 1.5 MB). Type
  `day` as a number at load, so the `toNumber` calculate step disappears.
- Decode `world-110m.json` (`countries`) once with `topojson-client` in a
  script (dev dependency only, not a library dependency) to
  `src/data/world110m.ts`: one row per ring, `{ country, ring: [lon, lat][] }`.
  Holes are emitted as ordinary rings. That is a declared shortcut: a lake
  inside a country paints over the country instead of cutting it out. The
  right fix is a polygon mark with holes, which nothing else needs today.
- One story file, `stories/animated-vega-lite/BirdMigration.stories.tsx`, one
  story per panel, tagged `gallery` with the paper's panel captions as
  descriptions.

## Step 1: cartography, then panel A (static lines)

**Status: implemented (uncommitted).**

Library addition: `geo(projection, opts?)` as a `CoordinateTransform`.

```ts
geo("equalEarth" | "mercator" | ((lonLat: [number, number]) => [number, number]),
    { lon?: [number, number], lat?: [number, number] })
```

- `transform` projects `[lon, lat]` degrees to the plane. Equal Earth and
  Mercator are short closed forms, so no `d3-geo` dependency. Passing a function
  accepts any d3 projection (they are callable) if someone wants one.
- `domain` is the lon/lat window. Default: the union of the data extents in
  the scope. `lon`/`lat` opts override it. That replaces the paper's pixel
  `clipExtent`, which is a hack to frame the Americas; a degree window is the
  honest version.
- `aliases: { x: "lon", y: "lat" }`, like polar's `theta`/`r`.
- Position scales under a geo transform are identity in degrees: no nicing, no
  zero inclusion. Measures are types: a degree is a unit, and the transform
  consumes degrees. This is the one piece of the geo work touching layout code.
- `polygon` in the v3 API takes `points` as a field name, so a data row can
  carry a ring. Adaptive resampling under the transform already exists
  (`src/adaptive-resampling.ts`) so curved edges look right under Equal Earth.

Panel A:

```ts
const basemap = chart(world, {
  coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
  legend: false, // added in step 3; see there
}).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));

basemap
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" })
      )
      .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
  )
  .render(container, { w: 600, h: 600 });
```

The basemap is the base chart and the birds are a layer over it, which is
also the order the Vega-Lite spec lists them. The per-species split relies on
the #752 rule: the path tier threads along `day`, the complement (`species`)
splits. To verify on a render: that `.layer()` places the bird chart inside
the geo coordinate scope, and that the 72-way categorical color cycles
acceptably.

## Step 2: panel B (hover to highlight a path)

**Status: implemented (uncommitted).**

No library addition for the highlight. The paper's `mouseover` point selection
on `species` plus two conditional encodings is `pointer()` read in `live()`:

```ts
const hover = pointer();
const hot = (d: Bird) => hover.datum()?.species === d.species;

chart(birds)
  .flow(group({ by: "species" }), scatter({ by: "day", x: "lon", y: "lat" }))
  .mark(
    line({
      stroke: "species",
      strokeWidth: live((d) => (hot(d) ? 3 : 0.1)),
      opacity: live((d) => (hot(d) ? 1 : 0.5)),
    })
  );
```

Both channels are paint-only, so hover costs no relayout. To verify: a line
mark's stamped datum is its group (homogeneity collapse gives `species`).

Tooltip, two options:

- **Recommended:** the pointer is a dataset, which is step 1 of #830's staging.
  A one-row chart places a text mark at the pointer and relays out on move:

  ```ts
  .layer(
    chart(hover)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(text({ text: (d) => d.datum?.species ?? "" }))
  )
  ```

  Cost: a full relayout of 72 lines per pointer move. Measure it. If it is
  too slow this becomes the first concrete case for incremental layout (#674).

- Fallback: a `text` mark in a fixed corner with `text: live(() => hover.datum()?.species ?? "")`.
  Paint-only, but not a tooltip that follows the cursor.

## Steps 3 to 5, revised (2026-09-21, after review)

Josh's review of the first draft: no `keyframes` primitive; a timer that
follows what UI component libraries do; the current day as ordinary data
filtering driven by a timer scaled from wall-clock time into dataset time;
trails as plain filtering, not baked into an animation primitive; controls
inside GoFish's own layout, at the low-level node tier rather than as
`chart()` builders, DOM only in rendering. Tweening and multi-select are out.
The table above has been updated to the spellings that shipped; the precedent
survey's "keyframes" bullet still describes the first draft, which no longer
exists.

A precedent survey (d3-timer, @solid-primitives, VueUse, Motion `useTime`,
Svelte motion, GSAP Timeline, the Web Animations API, Observable's Scrubber,
mafs `useStopwatch`, Manim `ValueTracker`) produced two findings that changed
the plan:

- Every library that exposes a readable clock exposes **elapsed milliseconds**
  (Web Animations `currentTime`, Motion `useTime`, mafs `time`). The near
  unanimous transport is `play`, `pause`, a `playing` readable, and a seek.
  Rate and easing are minority features.
- The first draft said Vega's window transform spells a trail the same way.
  It does not: Vega `frame: [-20, 0]` counts **rows**, the paper's predicate
  counts **values** (`n_day > anim_value - 20 and n_day <= anim_value`). They
  coincide only because the bird data has one row per species per day. The
  right precedents are SQL `RANGE` and polars `is_between(closed="right")`.

### Step 3: `timer()` as a scale read backward, then panel C

**Status: implemented (uncommitted).**

`timer()` is the only animation primitive, and its model is a scale from a data
domain onto wall-clock time, used in the inverse direction:

```ts
timer({ domain?, duration, step?, loop?, playing?, interval? })
  (): T                 // invert(elapsed): a DOMAIN value, not milliseconds
  .set(v)               // seek, in domain units
  .play() .pause()
  .isPlaying(): boolean
  .domain               // the resolved [lo, hi] or values array
  .step
```

The equation is `t() = scale(domain → [0, duration]).invert(elapsed)`.

- `domain: [lo, hi]` (two numbers) is continuous, and `step` quantizes it to
  `lo + k*step`, rounding down. Any other array is a band over those values and
  emits `values[i]` — Observable's Scrubber shape, and Animated Vega-Lite's
  default time scale. With no domain the scale is the identity onto
  `[0, duration]`, so a plain elapsed-milliseconds clock is the degenerate case
  rather than a separate mode.
- `duration` is milliseconds for one pass; `loop` (default true) wraps elapsed,
  and without it the clock clamps at the end of the domain and pauses itself.
- `playing` defaults to true and the clock lazy-starts on the first read, with
  the old rule kept: a read never resurrects a clock that was explicitly paused.
- Elapsed is accumulated `performance.now()` deltas, not a tick count, so pause,
  resume and seek are exact. `setInterval(interval ?? 16)` only samples the
  clock; a sample that lands on the same domain value writes nothing, so a
  quantized clock costs one re-render per step instead of one per frame.
- `.set(v)` is the same scale forward. It does not change the playing state: a
  scrub widget decides that for itself.

Naming convention, decided here: verbs mutate, `isX` reads a boolean. So
`isPlaying()`, and `drag().active()` / `pointer().down()` were renamed to
`isActive()` / `isDown()` everywhere.

The deferred "reverse-scale sugar" of the first draft is gone: the timer IS the
reverse scale, so there is nothing left to sugar. The remaining wish is that the
domain could come from inference instead of a literal `[1, 365]`; nothing needs
it yet.

Panel C is then the clock plus an ordinary filter:

```ts
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

basemap() // chart(world110m, { coord: geo(...), legend: false })
  .layer(
    chart(birds)
      .flow(
        filter((d) => d.day === day()),
        scatter({ x: "lon", y: "lat" })
      )
      .mark(circle({ r: 3, fill: "species" }))
  )
  .render(container, { w: 600, h: 600 });
```

Two smaller additions came with it:

- **`legend: false`** as a chart option (default true), mirroring `axes`. It
  suppresses legend elaboration; the color scale still paints the marks. Without
  it a 72-species swatch column takes more of the canvas than the map.
- **`circle({ opacity })`**, which the mark simply did not have. It accepts a
  number, an accessor evaluated per datum at resolve, or a `live()` value.

**Domain inference, measured rather than guessed.** `filter` runs before
inference, so the scales see only the rows that survive. Under `geo` with an
explicit `lon`/`lat` window that does not matter at all: rendering one row, two
rows and all rows puts the shared row at exactly the same pixel. For a non-geo
chart it matters completely — filtering to a single day collapses the x and y
domains to that day's extent, so the chart rescales every frame. That is the
paper's `rescale: true`; its default is `rescale: false`, and GoFish has no
spelling for it yet. Open question, not redesigned here.

### Step 4: panel D, trails as a filter

**Status: implemented (uncommitted).**

No animation primitive. The trail is a value window anchored at the playhead,
half-open on the left exactly as the paper writes it, and the spelling is polars'
`is_between`:

```ts
between(v, lo, hi, { closed }); // a bare value test
field("day").between(lo, hi, { closed }); // a row predicate for filter
```

`closed` is `"both"` (default), `"left"`, `"right"` or `"none"`. Bounds may be
numbers or accessors (`() => number`), which is what lets a window follow a
clock; a constant anchor makes it "the 20 days before June 1", so the predicate
is not tied to a timer at all. The comparison is by value (SQL `RANGE`), never by
row count (Vega's window `frame`).

`between` is **not** a field-expression op. It returns a predicate, and a
predicate belongs to none of the three op slots (domain, aggregate, normalize):
it decides no groups, folds no rows, scales nothing. A method returning a plain
function keeps the pipeline free of a fourth slot every evaluation site would
have to ignore.

`filter(pred)` itself is the flow operator beside `derive`: it keeps the rows the
predicate accepts, and it takes either a hand-written predicate or a field
predicate. Like `derive`, it is JS-only — the predicate is a live callback, so
`toJSON` emits the opaque `{ type: "derive" }` an untagged operator gets. A field
predicate could serialize one day; it does not today.

Day-of-year is cyclic, so the window the story ships is on the WRAPPED distance
back from the playhead — otherwise the trail collapses to three days at the loop
boundary and grows back over the next three weeks. The bare `between` predicate
expresses that directly; `field("day").between(lo, hi)` stays the spelling for an
ordinary, non-cyclic window (see the `filter` docs). A `period` option on
`between` was considered and rejected: the modulo is one honest expression, and a
cyclic domain is not `between`'s business.

```ts
basemap()
  .layer(
    chart(birds)
      .flow(
        filter((d) =>
          between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })
        ),
        scatter({ x: "lon", y: "lat" })
      )
      .mark(
        circle({
          r: 3,
          fill: "species",
          opacity: (d) => (d.day === day() ? 1 : 0.1),
        })
      )
  )
  .render(container, { w: 600, h: 600 });
```

### Step 5: panel E, controls at the low-level tier

**Status: implemented (uncommitted).** The spellings below are the ones that
shipped.

The timer is the single source of truth (Vega and the paper, and the rule
already in `animation.md` 2.2: a scrub write wins over the clock until playback
explicitly resumes). A slider displays the timer in one direction and writes it
in the other. A button toggles `playing`. Both are ordinary marks, laid out
under the map with `spreadY`/`spreadX`, and both follow the Solid/React
controlled-input shape, `value` plus `onInput`, one way each. There is no
two-way binding construct.

```ts
slider({ value, onInput, domain, step?, w?, wrap?, format? }); // w defaults to 300
button({ label, onClick, w?, h? }); // 24x24 by default
```

Panel E, in full:

```ts
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

const map = basemap({ padding: 0 }).layer(
  chart(birds)
    .flow(
      filter((d) =>
        between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })
      ),
      scatter({ x: "lon", y: "lat" })
    )
    .mark(
      circle({
        r: 3,
        fill: "species",
        opacity: (d) => (d.day === day() ? 1 : 0.1),
      })
    )
);

const timeSlider = slider({
  value: day,
  onInput: (v) => {
    day.pause(); // the drag takes ownership (the paper's delegation rule)
    day.set(v);
  },
  domain: day.domain,
  step: day.step,
  w: 300,
  wrap: true, // day-of-year is a cycle, like the trail filter above
  format: (d) => `day ${d}`,
});
const playButton = button({
  label: () => (day.isPlaying() ? "pause" : "play"),
  onClick: () => (day.isPlaying() ? day.pause() : day.play()),
});

GoFish(container, { w: 600, h: 660, legend: false }, () =>
  spreadY({ spacing: 12 }, [
    Frame({ w: 600, h: 600 }, [map]),
    spreadX({ spacing: 8 }, [playButton, timeSlider]),
  ])
);
```

(The story's real captions are the glyphs the paper uses, U+2759 U+2759 and
U+25B6.)

What it needed from the library, and what each turned into:

1. **`click()`** - an input beside `pointer()`/`drag()`, rows
   `{ x, y, datum, id, t }` accumulating per click, plus `count()` and
   `isArmed()`. A click is the PAIR press-then-release on one target, which is
   neither a pointer state nor a drag; the release is accepted by the same test
   the press passed, so a two-node control (a box plus its caption) reads as one
   target. The `shift` field of the #830 sketch is not here: multi-select is out
   of scope.
2. **`timer` transport** from step 3, unchanged.
3. **A builder as a child of a low-level operator.** `createNodeOperator`
   already resolved a `ChartBuilder` child; it now resolves a `LayerBuilder`
   too, through the builder's OWN `resolve()` (which is where a root `coord` is
   hoisted over every tier). So `spreadY([map, controls])` works for a layered
   chart, the mirror of `.layer(node)`.
4. **Handle geometry is a pipeline-tier read** of `value()` (geometry cannot be
   `live()` - paint patches attributes, it does not move a node), so the control
   relays out with the map.
5. **`drag({ hitTest })` sees the hit**, not just the point, so a control claims
   exactly the drags that start on the nodes it drew.
6. **`drag().nodeBox(uid)`** - the on-screen box (svg px) of a node in the frame
   the chart last published. `publishFrame` records one box per uid in the same
   walk that builds the hit-test map, folding in any enclosing `group`
   transform; primitives with no box of their own (`path`, `text`) are left out.
   This is what makes the slider's pixel to value map absolute (see below), and
   it is the geometric counterpart of the frame conversions: the interaction
   layer reads off what layout computed, it never re-derives or re-measures.

Three shape decisions worth recording:

- **A control is a MARK, not a node.** The pipeline is tree-consuming: a node
  laid out twice keeps its first placement, so a control whose geometry depends
  on `value()` has to be rebuilt per resolve - which is exactly what a mark is.
  The `drag()`/`click()` input and the write effect are created ONCE, when the
  widget is made. So the widget is constructed outside the render thunk and its
  node inside it, and a composition with no `chart()` at its root needs the
  THUNK form of the terminal, `GoFish(container, opts, () => node)`.
- **The pixel to domain map is absolute, through the frame.** The pointer's
  position along the handle's travel IS the value: `valueAt((x - (track.x + r)) /
(track.w - 2r))`, quantized by `step`. Track and handle are both drag targets,
  so a press on the bare track puts the handle under the pointer and the handle
  then follows it. The track's box comes from `nodeBox` above, not from the DOM,
  so layout still owns placement. The travel is inset by the handle radius, which
  keeps the control's bbox independent of the value and makes the handle's center
  coincide with the pointer. (The first version mapped `delta.x` from the press,
  with the declared cost that clicking the bare track did nothing; `nodeBox`
  removed the reason for it.)
- **`wrap` is a cycle length.** With `wrap: true` the fraction is not clamped and
  the quantized value is folded modulo the cycle, which is `span` for a continuous
  domain (`hi` and `lo` are one point, as for an angle) and `span + step` for a
  quantized one (365 distinct days, so day 365 is followed by day 1 instead of
  being identified with it). Panel E sets it, since day-of-year is as cyclic for
  the scrub as it already is for the trail filter. Precedent: Qt's `wrapping`
  property (`QAbstractSpinBox`, `QDial`).

The readout beside the track (`format`, default `String`) is a `text` node with
`textAnchor: "end"` at a fixed x. For text, `x` is the anchor and the box runs
leftward from it, so the widget's width does not depend on the label and a value
change never jostles its siblings; the reserved slot width is only an estimate of
the widest end label, deciding how close a long readout comes to the track.

Declared shortcut, to be replaced by #830 work, not by more widget code:

- The write is a Solid `createEffect` (inside the widget, so no spec sees it),
  the repo's existing precedent. The principled replacement is one declarative
  write primitive such as `bind(t, () => ...)`, evaluated after event dispatch
  against the previous frame's conversions. That is the one genuinely new
  mechanism controls need and it should be designed under #830, not here.

`drag().within(ref("track"))` from #830 is still the spelling this wants: it
would make the handle's x live in day units, with `nodeBox` as the mechanism
underneath it rather than a widget-private arithmetic step.

Rendering stays SVG; nothing here is a DOM widget.

**Composition gotcha, found on the render.** A chart's `padding` (30 by default)
is drawn OUTSIDE the node's box, so a padded chart paints past the box its
siblings are stacked against - in panel E the controls first landed inside the
map. `padding: 0` on a composed chart is the fix, and the spacing then belongs
to the composition. Related: under a low-level operator the geo coord's box
follows the proposal it gets rather than its lon/lat window, so panel E wraps
the map in `Frame({ w: 600, h: 600 })` to say how big the map is. Both deserve a
follow-up: a composed chart should report the box it actually paints.

### Sequencing

| PR  | library                                                                                         | story |
| --- | ----------------------------------------------------------------------------------------------- | ----- |
| 1   | `geo()`, degree-identity scales, `polygon({ points: field })`, data                             | A     |
| 2   | none, or `chart(pointer())` for the tooltip                                                     | B     |
| 3   | `timer()` as a scale read backward, `filter`, `between`, `legend: false`, `circle({ opacity })` | C, D  |
| 4   | `click()`, `slider`/`button` marks, builder-inside-operator composition                         | E     |

Deferred: `bind`, `.within`/`.lock`, tweening (#831), multi-select (#830),
a `rescale: false` spelling for domains that must ignore a filter.

### Risks and open questions

1. ~~Whether filtering before domain inference shrinks the domains (paper's
   `rescale`).~~ Answered: it does, exactly, for any chart without an explicit
   domain; under `geo` with a lon/lat window it cannot. No spelling for
   `rescale: false` yet.
2. ~~Whether a `chart()` builder composes inside a low-level operator.~~
   Answered: it does, once the operator's child reification knows about
   `LayerBuilder` as well as `ChartBuilder` (step 5). What it exposed is that a
   composed chart's box does not cover what it paints — its padding is drawn
   outside the box — so a composed chart wants `padding: 0` and an explicit
   `Frame({ w, h })`. That is the real open question now.
3. Basemap relayout every frame. Josh: ignore performance for now.
4. Holes in the basemap drawn as filled rings (declared shortcut).
5. `circle({ r })` takes a number only, so panel E has no hover-size highlight
   (the paper's E enlarges the hovered species). It needs `r` widened to the
   same accessor/`live()` shape `opacity` already accepts.

### Follow-up: fuzzy hover on panel B (deferred to the Meros port)

Hovering panel B needs a pixel-exact hit on a thin path. UI toolkits enlarge
the target (44pt touch targets, `hitSlop`, a fat invisible stroke);
visualization libraries pick the nearest item instead (Vega-Lite `nearest:
true` via Voronoi, Observable Plot `pointer` with `maxRadius: 40`, Plotly
`hovermode: "closest"`, Bokeh `line_policy: "nearest"`). In GoFish that is a
Meros Match projection, `pointer().snap(selectAll("paths"))` with a radius,
dispatched on the underlying space (point distance for circles, polyline
distance for connectors, band for ordinal). Decided 2026-09-21: not a one-off
option on `pointer()`; panel B becomes a probe example for that port.
