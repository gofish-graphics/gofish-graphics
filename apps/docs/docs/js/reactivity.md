---
handwritten: true
---

# Reactivity & Interaction

GoFish visualizations are usually a pure function of your data: you describe a
chart and it renders once. This page covers the **reactive layer** — a way to
make a visualization respond to the pointer, the wheel, a drag, a timer, or your
own state, so a hover recolors a bar, a scroll re-bins a histogram, or a dragged
line moves a threshold.

::: warning JavaScript only
The reactive layer is available only from the JavaScript API. It uses live
JavaScript callbacks and signals that do not cross the Python bridge, so these
constructs are not (yet) available from Python.
:::

A quick vocabulary note. A **signal** is a value that can change over time and
that notifies whatever reads it when it does (GoFish uses SolidJS signals under
the hood). **Resolve** is the phase where GoFish evaluates your spec — running
your `derive()` callbacks, reading your channel values — to build the chart
before it lays out and paints.

## Three kinds of channel value

Any mark channel (`fill`, `h`, `text`, `x`, …) accepts one of three kinds of
value:

| Kind                       | Example                                               | When it is evaluated                                                        |
| -------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| **Aesthetic literal**      | `fill: "#6b9bd1"`                                     | Never re-evaluated — a constant.                                            |
| **Data accessor**          | `fill: (d) => d.hot ? "red" : "gray"`                 | **Once, at resolve.** Feeds layout, measurement, and scale inference.       |
| **Reactive — `live(...)`** | `fill: live((d) => d === p.datum() ? "red" : "gray")` | **Re-evaluated reactively at paint,** every time a signal it reads changes. |

The first two are the ordinary ways to set a channel. The third, `live()`, is
what makes a channel _reactive_.

### The `live()` contract

`live((d) => value)` wraps an accessor and marks it reactive. The callback still
receives the mark's datum `d`, exactly like an ordinary accessor. Three rules
govern what it can do:

- **Layout, measurement, and scales see the resolve-time snapshot.** A `live()`
  value is evaluated once at resolve to get a static value that the pipeline
  measures and lays out with. The reactive re-evaluation only patches the painted
  output.
- **Reactive fills return literal CSS colors.** A `live()` color bypasses the
  color scale (and therefore the legend). Return a concrete color string
  (`"#d62728"`), not a data category to be mapped.
- **Live text patches content, not size.** `text: live(...)` updates the string
  shown, but the text box keeps the size it was measured at during resolve — so
  live text should not grow past its measured room.

## The tier rule: where you read decides what re-runs

There are two execution regimes, and which one you get depends only on **where**
you read a signal — not on any flag:

| Where you read the signal                                                                                | What happens on change                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Inside a `live()` channel                                                                                | **Paint patch only.** One SVG attribute updates; layout is untouched. Cheap enough for per-frame interaction.                |
| Anywhere else during resolve — inside `derive()`, in a layout channel like `h`/`y`, in data construction | **Full pipeline re-run.** The whole chart re-resolves, re-lays-out, and repaints (coalesced to one run per animation frame). |
| In your own code outside the chart (e.g. an external readout)                                            | Nothing registers — it is just a plain read.                                                                                 |

The same input can drive both regimes in one chart: read it in a `live()` fill
for a cheap recolor _and_ in a `derive()` to re-shape the data.

## Components, not just charts

The reactive layer is not tied to the `chart()` builder. It works just as well
for **components** — low-level compositions built from raw shapes and graphical
operators (`rect`, `text`, `stackX`, `layer`, …) with no data binding. The same
read-location rule applies.

Render a component with the low-level terminal, `GoFish(container, options,
child)`. The `child` can be a node **or a thunk** — `() => node` — and the thunk
form is what makes a component reactive:

```ts
import { GoFish, spreadX, rect, live, wheel, timer } from "gofish-graphics";

const n = wheel({ range: [1, 8], initial: 3, round: true });
const t = timer({ domain: [0, 1], step: 1, duration: 1000 }); // 0, 1, 0, 1, …

// A thunk: reading n() here (outside live) makes it a pipeline dependency, so a
// scroll re-runs the whole component and re-lays-out.
GoFish(container, { w: 460, h: 260 }, () => {
  const count = n();
  return spreadX(
    { spacing: 16 },
    Array.from({ length: count }, (_, i) =>
      rect({
        w: 48,
        h: 70 + i * 18,
        fill: live(() => (t() === 0 ? "#6b9bd1" : "#3a6ea5")),
      })
    )
  );
});
```

Why a thunk? A raw node is built once and cannot re-evaluate its spec, so a
component needs a thunk the scheduler can re-invoke — exactly the role the
`chart()` builder's rebuild plays. Read a `signal()`/`wheel()`/`timer()` outside
`live()` in the thunk and each change re-runs it; a `pointer()` read inside a
`live()` needs the thunk too, because hit-testing is wired only when the runtime
is attached (which happens once an input registers during the thunk's resolve).

**Paint-only usage needs no thunk — and no runtime.** A `live()` channel patches
at paint whether or not a runtime exists, so a plain node works:

```ts
import { createSignal } from "solid-js";
import { GoFish, rect, live } from "gofish-graphics";

const [hot, setHot] = createSignal(false);

// A plain NODE (not a thunk). No InteractionRuntime is created and no event
// listeners are attached, yet the live() fill still patches when `hot` changes —
// even over a RAW Solid signal, since paint reactivity is runtime-independent.
GoFish(
  container,
  { w: 120, h: 80 },
  rect({
    w: 40,
    h: 40,
    fill: live(() => (hot() ? "#d62728" : "#6b9bd1")),
  })
);
```

A component mark carries no datum of its own (there is no data binding). For the
reference-equality hover trick (`live((d) => d === p.datum())`), give each mark a
datum by _invoking_ it with an object: `rect({ … })(box)`.

## Inputs

Import the inputs and `live` from `gofish-graphics`:

```ts
import {
  live,
  pointer,
  drag,
  click,
  wheel,
  timer,
  signal,
} from "gofish-graphics";
```

Each input is a small object of accessor functions. Reading an accessor during
a chart's resolve attaches the input to that chart and wires up its events.

### `pointer()`

```ts
const p = pointer();
p.pos(); // { x, y } in svg pixels, or undefined when off the chart
p.dataPos(); // { x?, y? } in data coordinates; per-axis
p.datum(); // the datum of the mark under the pointer (hit-test)
p.isDown(); // true while the primary button is held over the chart
p.nodeBox(id); // { x, y, w, h } in svg px: where that node landed on screen
```

### `drag(options?)`

```ts
const d = drag({ hitTest: (pt, hit) => pt.y > 40 }); // optional: where a drag may start
d.isActive(); // true while a drag is in progress
d.origin(); // pointer-down position (svg px)
d.current(); // latest position (svg px)
d.delta(); // current − origin (svg px)
d.originData(); // origin in data coordinates
d.currentData(); // current in data coordinates
d.nodeBox(id); // { x, y, w, h } in svg px: where that node landed on screen
```

`hitTest` receives the pointer-down position **and** the display item under it
(`hit.id` is the node's `data-gf-id`, `hit.datum` its datum), so a control can
claim drags that start on its own nodes and ignore everything else.

`nodeBox(id)` answers the other half of that question — not "what did I press?"
but "where is my own node?". Give it a node's uid (`hit.id`, or the uid of a node
you built yourself) and you get that node's box in svg pixels, read off the frame
the chart last published, so a control can map a pointer position onto its own
geometry without measuring anything in the DOM. This is how the
[slider](/js/controls) turns a press on its track into a value. It is general
frame state, not drag state, so `pointer()` and `click()` expose the same
accessor. Three things to know: the box **is not a signal** (it is frame state,
replaced wholesale by each render, so a new box wakes nothing on its own — read it
from an effect that a pointer or drag signal already woke); it needs the input to be
[attached](#data-space-reads-need-an-attached-input), like the data-space reads;
and it returns `undefined` for a node that is not in the current frame or whose
primitive carries no box of its own (a `text` or a `path`).

The data-space variants (`dataPos`, `originData`, `currentData`) convert pixels
back to data values using the chart's scales, **per axis**: each returns
`{ x?, y? }` where an axis is present only when it carries a continuous position
scale — an ordinal/band axis (e.g. a category axis) has no data coordinate, so
that axis comes back `undefined`. The whole result is `undefined` only when no
axis converts (or the pointer is off the chart). See the
[caveat below](#data-space-reads-need-an-attached-input).

### `click(options?)`

A click is neither a pointer state nor a drag: it is the pair press-then-release
on the same target. `click()` counts them.

```ts
const picks = click(); // optional: { hitTest: (pt, hit) => boolean }
picks.count(); // how many clicks so far — enough to drive a button
picks.isArmed(); // true between a press and its release (the "held" state)
picks.nodeBox(id); // as on pointer()/drag(): where that node landed on screen
```

It counts rather than accumulating a table of clicks. Treating an input as a
dataset you could chart is a real design, tracked as issue #830, and is not
guessed at here.

`hitTest` decides which targets count, from the pointer position and the display
item under it (`hit.id` is the node's `data-gf-id`, `hit.datum` its datum). It is
also the acceptance test on release, so a control made of several nodes (a box
plus its caption) reads as one target. Without it, a click commits only when the
release is over the very node the press hit.

### `wheel(options)`

```ts
const bins = wheel({
  range: [3, 40],
  initial: 12,
  round: true,
  sensitivity: 1,
});
bins(); // current value, a clamped accumulator over scroll delta
bins.set(20); // set it directly
```

`range` is the output range the wheel maps onto; `initial` seeds it (defaults to
the midpoint); `round` snaps to integers (for bin/item counts); `sensitivity`
scales raw scroll delta.

### `timer(options?)` {#timer-options}

A timer is a **scale from a data domain onto wall-clock time, read backward**.
You say which values you want and how long one pass through them should take,
and reading the timer gives you a value of your data — a day, a year, a
category — rather than a count of ticks:

```ts
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });
day(); // a day number: 1, 2, 3, … 365 over ten seconds, then round again
day.set(200); // seek, in days
day.pause();
day.play();
day.isPlaying(); // true while it is running
day.domain; // [1, 365]
day.step; // 1
```

The whole behavior is one equation:

```ts
t() = scale(domain → [0, duration]).invert(elapsed)
```

| Option     | Meaning                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`   | `[lo, hi]` (two numbers) is continuous; any other array is a band over those values, emitted one at a time. Omitted: `[0, duration]`. |
| `duration` | Milliseconds for one pass through the domain. Default 5000.                                                                           |
| `step`     | Quantize a continuous domain to `lo + k*step`, rounding down. Ignored for a band domain.                                              |
| `loop`     | Wrap at the end (default `true`). When `false` the clock stops at the end of the domain.                                              |
| `playing`  | Start playing (default `true`). `false` starts paused at the domain's start.                                                          |

A band domain is the shape Observable's Scrubber uses, and the one Animated
Vega-Lite gives a time encoding by default:

```ts
const season = timer({ domain: ["spring", "summer", "fall", "winter"] });
season(); // "spring", then "summer", …
```

With no domain at all you get the degenerate case, a plain elapsed-milliseconds
clock: `timer({ duration: 1000 })` counts 0 to 1000 and repeats.

`.set(v)` seeks in domain units and does **not** change whether the clock is
playing — a scrubber decides that for itself, usually by pausing on pointer-down.

A value that does not change writes nothing, so a quantized clock costs one
re-render per step, not one per frame.

A quantized domain — a band, or `[lo, hi]` with a `step` — gives every one of its
values an equal share of the loop, the last one included: a 365-day year over ten
seconds spends the final 1/365 of each pass on day 365, and `set(365)` then reads
back as 365. A continuous domain with no `step` is the one case where the ends
meet: `lo` and `hi` are the same instant of a looping sweep, the way 0° and 360°
are the same angle, so `hi` is approached at the instant before the wrap rather
than emitted. Give the domain a `step` if you need the high end as a value of its
own.

A `timer()` is **not** tied to any chart's lifetime: it runs until you call
`.pause()`. Re-rendering a chart (or replacing it in its container) does not stop
a timer you started, so pause it yourself when you no longer need it.

::: tip Naming
Methods that do something are verbs (`play`, `pause`, `set`); boolean readables
are `isX` (`timer().isPlaying()`, `drag().isActive()`, `pointer().isDown()`).
:::

### `signal(init)`

```ts
const cut = signal(60);
cut(); // read the current value
cut.set(90); // write it
```

`signal()` is a writable parameter you drive from your own code. Unlike a raw
SolidJS `createSignal`, reading a gofish `signal()` during resolve registers it
as a pipeline dependency, so `.set()` can trigger a full re-run.

::: tip Use `signal()`, not a raw Solid signal, for layout params
A raw `createSignal` works fine _inside_ `live()` (Solid tracks it at paint), but
it is **invisible** to the pipeline: reading it in a `derive()` or a layout
channel will not schedule a re-run. If a parameter affects layout, use gofish's
`signal()`.
:::

## Controls

`slider` and `button` are controls built out of these inputs, as ordinary marks
you lay out with the ordinary operators. See [Controls](/js/controls).

## Examples

### Hover to highlight (paint-only)

Reading `pointer()` inside a `live()` fill recolors the hovered bar with zero
layout re-runs. The bar's datum is compared by reference (`===`) against the
datum under the pointer.

```ts
const p = pointer();

chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(
    rect({
      h: "count",
      fill: live((d) => (d === p.datum() ? "#d62728" : "#6b9bd1")),
    })
  )
  .render(container, { w: 400, h: 400 });
```

### Semantic-zoom histogram (pipeline re-run + live readout)

Reading `wheel()` inside `derive()` makes it a pipeline dependency: each scroll
re-bins the data and re-runs the whole pipeline. The `live()` text readout patches
at paint time only.

```ts
const bins = wheel({ range: [3, 40], initial: 12, round: true });

chart(penguins, { axes: true })
  .flow(
    derive((rows) => binRows(rows, bins())), // re-bins on scroll → full re-run
    spread({ by: "bin", dir: "x" })
  )
  .mark(rect({ h: "count" }))
  // A component-level annotation tier — a bare mark; live content patches at
  // paint time only.
  .layer(
    text({
      x: 20,
      y: 290,
      text: live(() => `bins: ${bins()} (scroll to re-bin)`),
      fill: "#333",
    })
  )
  .render(container, { w: 500, h: 300 });
```

### Draggable threshold (both regimes at once)

A `signal()` holds the threshold in data units. It is read in two places: the
threshold rule's `y` (a plain accessor → full re-run per drag frame) and the
bars' `fill` (inside `live()` → paint patch). A `drag()` writes the signal in
data coordinates.

```ts
const cut = signal(60);
const dr = drag();

// Convert the drag position to data units and write `cut`, in ordinary code.
// Clamp the write to the data's range: a spec value dragged past the data
// (say, a rule at count −20) extends the axis domain, so every drag frame
// would move the very scale the drag is reading — a feedback loop that reads
// as a jarring rescale.
const maxCount = Math.max(...data.map((d) => d.count));
createRoot(() => {
  createEffect(() => {
    const c = dr.currentData();
    if (c?.y != null) cut.set(Math.min(maxCount, Math.max(0, c.y)));
  });
});

chart(data, { axes: true })
  .flow(spread({ by: "cat", dir: "x" }))
  .mark(
    rect({
      h: "count",
      // Reading `dr` here also attaches the drag input to this chart, so
      // currentData() can use the chart's scales.
      fill: live((d) => {
        dr.isActive();
        const total = sumBy(d, "count"); // d is the spread group — aggregate
        return total > cut() ? "#d62728" : "#6b9bd1";
      }),
    })
  )
  // The threshold rule is a component-level annotation tier (a bare rect).
  .layer(
    rect({ y: () => cut(), h: 3, w: 500, fill: "#333" }) // full re-run per frame
  )
  .render(container, { w: 500, h: 360 });
```

### Timer pulse (either regime)

Read a `timer()` inside `live()` to pulse a fill without re-laying-out:

```ts
// Two states, 400ms each
const t = timer({ domain: [0, 1], step: 1, duration: 800 });

chart(base, { axes: true })
  .flow(spread({ by: "cat", dir: "x" }))
  .mark(
    rect({
      h: "count",
      fill: live(() => (t() === 0 ? "#6b9bd1" : "#d62728")),
    })
  )
  .render(container, { w: 400, h: 300 });
```

…or read it inside `derive()` to re-shape the data as it advances (a full re-run
per new value, coalesced to one per frame):

```ts
const WINDOW = 20;
// The window's right edge, in the series' own index units.
const head = timer({
  domain: [0, series.length - 1],
  step: 1,
  duration: series.length * 500,
});

chart(series, { axes: true })
  .flow(
    // slide a rolling window over the real series → full re-run
    derive((rows) => rows.slice(Math.max(0, head() - WINDOW + 1), head() + 1)),
    spread({ by: "t", dir: "x" })
  )
  .mark(rect({ h: "count", fill: "#6b9bd1" }))
  .render(container, { w: 500, h: 300 });
```

### Animating a filter

Because the timer's value is a value of your data, playing a chart through time
is an ordinary [`filter`](/js/api/operators/filter):

```ts
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

chart(birds)
  .flow(
    filter((d) => d.day === day()),
    scatter({ x: "lon", y: "lat" })
  )
  .mark(circle({ r: 3, fill: "species" }))
  .render(container, { w: 600, h: 600 });
```

A trail is the same thing over a window. The clock read goes in the predicate
itself, so the window follows the playhead:

```ts
.flow(
  filter((d) => between(day() - d.day, 0, 20, { closed: "left" })),
  scatter({ x: "lon", y: "lat" })
)
.mark(circle({ r: 3, fill: "species", opacity: (d) => (d.day === day() ? 1 : 0.1) }))
```

Note that the filtered rows are the ones the scales see; see
[filter › Domains are inferred from what survives](/js/api/operators/filter#domains-are-inferred-from-what-survives).

## Caveats

### Under `spread()`, a mark's datum is the whole group

When you `spread()` (or otherwise group) the data, each mark stands for a **group
of rows**, not a single row — so a mark's datum `d` is an _array_. A field
predicate inside a `live()` callback or an accessor must **aggregate** it, not
read a field off it:

```ts
// ✗ wrong: d is an array; d.count is undefined
fill: live((d) => (d.count > cut() ? "red" : "gray"));

// ✓ right: aggregate the group
fill: live((d) => (sumBy(d, "count") > cut() ? "red" : "gray"));
```

Getting this wrong **fails silently** — the comparison just evaluates against
`undefined` and every mark takes the same branch. If a `live()` predicate looks
like it "isn't firing", check whether its datum is a group.

### Data-space reads need an attached input

An input's data-space accessors (`pointer().dataPos()`, `drag().currentData()`,
`drag().originData()`) convert pixels to data using the chart's scales — which
means the input must first be **attached** to a chart. Attachment happens when the
input is _read during that chart's resolve_ (in a channel, a `live()`, or a
`derive()`).

If you only read an input from outside code — say, a bare `createEffect` that
watches `drag().currentData()` — the input never attaches, and its data-space
reads return `undefined`. The fix is to also read the input somewhere in the
chart's spec (as in the draggable-threshold example, where the drag is read inside
the bar's `live()` fill). A screen-pixel read (`pos()`, `current()`) does not need
attachment; only the data-space conversions do.
