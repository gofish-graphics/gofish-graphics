---
handwritten: true
---

# Animation

An animated chart in GoFish is a chart with one extra axis: time. You already
know how to lay data out across x. `time.sequence` lays the same data out
across time instead, one frame per value of a field, and `time.transition`
draws the mark that travels between those frames.

::: warning JavaScript only
Animation is part of the [reactive layer](/js/reactivity), which is available
only from the JavaScript API. A sequence owns a clock, and a clock is a live
JavaScript signal that does not cross the Python bridge.
:::

## The two constructs

```ts
import { chart, circle, scatter, time } from "gofish-graphics";

chart(gapminder, { legend: false })
  .flow(
    time.sequence({ by: "year", duration: 5000 }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(circle({ r: 4, fill: "country" }))
  .layer(time.transition())
  .render(container, { w: 500, h: 400, axes: true });
```

This is the Gapminder animation: fifty years of every country's fertility rate
and life expectancy, played in five seconds, with each country one moving dot.

`time.sequence({ by: "year" })` goes in the flow, where a layout operator goes.
It splits the data by `year` the way `spread` would, but it gives each group no
room of its own, so all of the years are laid out on top of one another. That is
what keeps the axes still: the x and y domains are inferred over every row of
every year at once, so nothing rescales while the chart plays. The sequence also
owns the chart's clock, which sweeps the field's own range once per `duration`.

`time.transition()` goes in `.layer()`, where a `line` goes. It reads the run of
marks the sequence laid out and emits one mark per run, at the position the run
has reached. The keyframe marks themselves are not painted. They are the
scaffolding the moving mark is computed from, so they keep their boxes and their
data but draw nothing and cannot be hovered.

## Time is an axis

Every temporal construct is a spatial one read on time. The animation above has
a **spatial twin** that renders as a still picture:

```ts
chart(gapminder, { legend: false })
  .flow(
    spread({ by: "year", dir: "x", spacing: 12 }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(circle({ r: 2.5, fill: "country" }))
  .layer(line({ along: "year", stroke: "country" }))
  .render(container, { w: 1150, h: 280, axes: true });
```

Two words differ. The twin spreads the years across x and threads each country
through the panels with a line; the animation lays the years on top of one
another and walks that same thread instead of drawing it. The path is the same
path, evaluated at one point rather than drawn end to end.

| Temporal construct | Spatial construct, read on time                    |
| ------------------ | -------------------------------------------------- |
| `time.sequence`    | `spread` on t: one group per value of a data field |
| `time.transition`  | `line` on t: a connector through a run of marks    |

The spatial vocabulary stays spatial. There is no `dir: "t"` on `spread`, so
reading `spread` always means layout on the page.

## What splits, and what threads

A transition takes no options for this, and that is the point. The sequence's
field is the tier the transition threads, and the split is everything else,
which here is `country`. So the chart gets one moving dot per country without
saying so. This is the same rule that gives the spatial twin one line per
country, and it is what Animated Vega-Lite writes by hand as `key: "country"`.

## Holding the playhead still

`playing: false` starts the chart paused, and `at` puts the playhead where you
want it, in the field's own units. This is what a screenshot needs.

```ts
time.sequence({ by: "year", playing: false, at: 1975 });
```

## Between the keyframes

The knots of the interpolation are the data's own time values. Years five apart
take five years' worth of the clock, and years ten apart take ten, so an uneven
run plays at an even speed. Every keyframe is passed through exactly.

`curve` says how the run is read between them. The default, `"auto"`, smooths
the whole run with a Catmull-Rom spline, which is the same curve the spatial
twin's `line` draws through the same points. `"linear"` moves straight from each
keyframe to the next.

Numbers interpolate; paint does not. A dot's position and size move between
keyframes, and its fill is read off the keyframe it is nearest, because a
country's color is its color.

## Options

### `time.sequence(options)`

| Option     | Type      | Default | Meaning                                                    |
| ---------- | --------- | ------- | ---------------------------------------------------------- |
| `by`       | `string`  | none    | The field whose values are the keyframes. Must be numeric. |
| `duration` | `number`  | `5000`  | Milliseconds one pass through the field takes.             |
| `loop`     | `boolean` | `true`  | Start over at the end.                                     |
| `playing`  | `boolean` | `true`  | Start the clock. `false` holds the chart still.            |
| `at`       | `number`  | none    | Where the playhead starts, in the field's units.           |

### `time.transition(options?)`

| Option        | Type                                 | Default    | Meaning                                                |
| ------------- | ------------------------------------ | ---------- | ------------------------------------------------------ |
| `curve`       | `"auto" \| "linear" \| "catmullRom"` | `"auto"`   | How the run is read between keyframes.                 |
| `ease`        | `(u: number) => number`              | none       | A time warp inside one keyframe interval, on `[0, 1]`. |
| `fill`        | `string`                             | keyframe's | Paint for the moving mark.                             |
| `stroke`      | `string`                             | `fill`     | Outline color.                                         |
| `strokeWidth` | `number`                             | `0`        | Outline width.                                         |
| `opacity`     | `number`                             | `1`        | Opacity of the moving mark.                            |

## What is not built yet

This is a first version. A transition moves circles and rectangles, and it
throws a clear error for other shapes. There is no composition of animations
(playing one after another, or several at once), no staggering, and no
enter and exit behavior for marks that appear or leave partway through.

Each value the clock emits re-resolves the whole chart, which is honest but not
cheap. A few hundred marks play smoothly; a few thousand will not.
