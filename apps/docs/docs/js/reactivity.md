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

## Inputs

Import the inputs and `live` from `gofish-graphics`:

```ts
import { live, pointer, drag, wheel, timer, signal } from "gofish-graphics";
```

Each input is a small object of accessor functions. Reading an accessor during
a chart's resolve attaches the input to that chart and wires up its events.

### `pointer()`

```ts
const p = pointer();
p.pos(); // { x, y } in svg pixels, or undefined when off the chart
p.dataPos(); // { x?, y? } in data coordinates (needs a continuous axis)
p.datum(); // the datum of the mark under the pointer (hit-test)
p.down(); // true while the primary button is held over the chart
```

### `drag(options?)`

```ts
const d = drag({ hitTest: (pt) => pt.y > 40 }); // optional: where a drag may start
d.active(); // true while a drag is in progress
d.origin(); // pointer-down position (svg px)
d.current(); // latest position (svg px)
d.delta(); // current − origin (svg px)
d.originData(); // origin in data coordinates
d.currentData(); // current in data coordinates
```

The data-space variants (`originData`, `currentData`) convert pixels back to data
values using the chart's scales. See the [caveat below](#data-space-reads-need-an-attached-input).

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

### `timer(options?)`

```ts
const t = timer({ interval: 400 }); // ms per tick; default 16 (~60fps)
t(); // current tick count; lazy-starts the timer on first read
t.stop(); // pause
t.start(); // resume
```

Useful for animation and for exercising both regimes deterministically.

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

chart(null, { axes: true })
  .flow(
    derive(() => binRows(bins())), // re-bins on scroll → full re-run
    spread({ by: "bin", dir: "x" })
  )
  .mark(rect({ h: "count" }))
  .layer(
    chart(null).mark(
      text({
        x: 20,
        y: 290,
        text: live(() => `bins: ${bins()} (scroll to re-bin)`),
        fill: "#333",
      })
    )
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
createRoot(() => {
  createEffect(() => {
    const c = dr.currentData();
    if (c?.y != null) cut.set(c.y);
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
        dr.active();
        const total = sumBy(d, "count"); // d is the spread group — aggregate
        return total > cut() ? "#d62728" : "#6b9bd1";
      }),
    })
  )
  .layer(
    chart([{}]).mark(
      rect({ y: () => cut(), h: 3, w: 500, fill: "#333" }) // full re-run per frame
    )
  )
  .render(container, { w: 500, h: 360 });
```

### Timer pulse (either regime)

Read a `timer()` inside `live()` to pulse a fill without re-laying-out:

```ts
const t = timer({ interval: 400 });

chart(base, { axes: true })
  .flow(spread({ by: "cat", dir: "x" }))
  .mark(
    rect({
      h: "count",
      fill: live(() => (t() % 2 === 0 ? "#6b9bd1" : "#d62728")),
    })
  )
  .render(container, { w: 400, h: 300 });
```

…or read it inside `derive()` to grow the data each tick (a full re-run per tick,
coalesced to one per frame):

```ts
const t = timer({ interval: 500 });

chart(null, { axes: true })
  .flow(
    derive(() => rollingWindow(t())), // re-derives data every tick
    spread({ by: "t", dir: "x" })
  )
  .mark(rect({ h: "count", fill: "#6b9bd1" }))
  .render(container, { w: 500, h: 300 });
```

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
