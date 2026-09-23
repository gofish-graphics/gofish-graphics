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

## A sequence on its own

A sequence animates without a transition. A `spread` gives each group a band of
x, and a sequence gives each group a band of time, so a keyframe holds from its
own year until the next year arrives and then the chart jumps to the next
frame. Only the keyframe whose band the playhead is in is drawn. The rest keep
their boxes and their data, which is what holds the axes still, and draw
nothing.

```ts
chart(gapminder, { legend: false })
  .flow(
    time.sequence({ by: "year", duration: 5000 }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(circle({ r: 4, fill: "country" }))
  .render(container, { w: 500, h: 400, axes: true });
```

That is the animation Animated Vega-Lite gets from a band scale on time, and it
is all a sequence means. What a transition adds is the movement between the
frames: instead of holding a country's 1955 dot for five years and then moving
it to 1960 in one jump, it walks the dot there.

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

## Sharing a clock

A sequence builds its own clock, which is enough when the chart is the only
thing that needs to know what time it is. When something else needs the same
playhead, build the clock yourself and hand it to the sequence with `on`.

```ts
const year = timer({ domain: [1955, 2005], duration: 5000 });

chart(gapminder, { legend: false })
  .flow(
    time.sequence({ by: "year", on: year }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(circle({ r: 4, fill: "country" }))
  .layer(time.transition())
  .layer(
    chart([{ fertility: 7.5, life_expect: 83 }])
      .flow(scatter({ x: "fertility", y: "life_expect" }))
      .mark(
        text({
          text: live(() => String(Math.floor(year()))),
          fontSize: 48,
          fill: "#ccc",
        }).zOrder(-1)
      )
  )
  .render(container, { w: 500, h: 400, axes: true });
```

The readout is a tier of its own holding one row, whose fields are the position
the label sits at, so the chart's own x and y scales place it and it stays put
when the chart is resized. A raw `timer` has to be told its domain, which is
the one thing a sequence would have read off the field itself.

Several charts on one clock play in lockstep the same way. The clock owns its
domain, its duration and whether it is running, so `duration`, `loop`,
`playing` and `at` are errors alongside `on`.

## Between the keyframes

The knots of the interpolation are the data's own time values. Years five apart
take five years' worth of the clock, and years ten apart take ten, so an uneven
run plays at an even speed. Every keyframe is passed through exactly.

`curve` says how the run is read between them. The default, `"auto"`, smooths
the whole run with a Catmull-Rom spline, which is the same curve the spatial
twin's `line` draws through the same points. `"linear"` moves straight from each
keyframe to the next. `"step"` does not move at all: the mark holds one
keyframe's value until the next keyframe's own time arrives, and then jumps.

Numbers interpolate; paint does not. A dot's position and size move between
keyframes, and its fill is read off the keyframe it is nearest, because a
country's color is its color. Under `"step"` the fill comes from the previous
keyframe rather than the nearest one, so the whole mark is the frame the curve
is holding.

A mark's labels move with it. The text a `.label()` adds is part of its mark,
so the transition carries it along. Text moves without changing size: its
position is interpolated, and its string, font and color are read off the same
keyframe as the mark's fill.

## Comparing curves

The three curves are easiest to read side by side, at one moment, on one clock.

```ts
const year = timer({ domain: [1955, 2005], duration: 10000 });

const panel = (curve) =>
  chart(gapminder, { legend: false, padding: 0 })
    .flow(
      time.sequence({ by: "year", on: year }),
      scatter({ by: "country", x: "fertility", y: "life_expect" })
    )
    .mark(circle({ r: 4, fill: "country" }))
    .layer(time.transition({ curve }));

GoFish(container, { w: 1160, h: 400, legend: false, axes: true }, () =>
  spreadX({ spacing: 16 }, [
    Frame({ w: 240, h: 280 }, [panel("step")]),
    Frame({ w: 240, h: 280 }, [panel("linear")]),
    Frame({ w: 240, h: 280 }, [panel("catmullRom")]),
  ])
);
```

Held halfway between the 1955 and 1960 keyframes, a country's dot sits at its
1955 position under `"step"`, exactly halfway between the two under `"linear"`,
and a little off that straight line under `"catmullRom"`, where the spline is
already bending toward 1965.

`"step"` therefore draws the same picture as no transition at all. A sequence
already holds each keyframe until the next one's time arrives, and a step curve
asks the transition to do exactly that, so the transition has nothing left to
add. It is worth having as a curve anyway, because it is the reading the other
two are measured against.

## What a frame costs

An animated chart is laid out once, however long it plays, and that is true of
both constructs.

Everything that depends on the year is settled while the chart is being laid
out: every keyframe is placed, so the run a transition walks is known, and so is
where each frame's dots sit. The clock is read afterward, while the chart is
being painted. A new value from it moves the dots a transition draws and changes
which keyframe a sequence shows, and both of those are changes to attributes of
marks that are already on the page. Nothing is measured again and nothing is
placed again.

The one cost worth knowing is what a sequence keeps: it draws every keyframe,
and hides all but the one it is holding, so a chart of fifty years of data has
fifty years of marks in the page even though you see one year. They are cheap to
hide and cheap to show, but they are there, and a pointer can still find them.

## What the sugar expands to

`time.sequence` and a bare `time.transition()` are short for a longer spec. The
longer spec is worth reading once, because it says out loud what the short one
is inferring.

The chart at the top of this page is level 0. Level 1 writes out the key and the
field the keyframes are keyed by. It is the same expansion a bare `line()` gets:
name the marks, select them back into a tier of their own, group by the field
you want one moving mark per, and name the time field with `along`.

```ts
chart(gapminder, { legend: false })
  .flow(
    time.sequence({ by: "year", duration: 5000 }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(circle({ r: 4, fill: "country" }).name("kf"))
  .layer(
    chart(selectAll("kf"))
      .flow(group({ by: "country" }))
      .mark(time.transition({ along: "year" }))
  )
  .render(container, { w: 500, h: 400, axes: true });
```

Level 2 writes out the clock. Once `along` and `at` are both spelled out there
is nothing left of `time.sequence` to keep, because laying the keyframes on top
of one another is what `group({ by: "year" })` already does, and the clock the
sequence owned is now a `timer` you hold yourself.

```ts
const year = timer({ domain: [1955, 2005], duration: 5000 });

chart(gapminder, { legend: false })
  .flow(
    group({ by: "year" }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(circle({ r: 4, fill: "country" }).name("kf"))
  .layer(
    chart(selectAll("kf"))
      .flow(group({ by: "country" }))
      .mark(time.transition({ along: "year", at: year }))
  )
  .render(container, { w: 500, h: 400, axes: true });
```

Level 3 gives up the moving mark altogether. `interpolate` reads the whole table
at the playhead's moment and hands back one row per country, and an ordinary
scatter draws those rows. The keyframes stay, drawn as `blank()`, because they
are what the axes get their domains from. Without them the scales would be
inferred from one moment's rows and the chart would rescale as it played.

```ts
const year = timer({ domain: [1955, 2005], duration: 5000 });

chart(gapminder, { legend: false })
  .flow(
    group({ by: "year" }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(blank())
  .layer(
    chart(gapminder)
      .flow(
        derive((rows) =>
          interpolate(rows, { along: "year", key: "country", at: year() })
        ),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
  )
  .render(container, { w: 500, h: 400, axes: true });
```

The first three levels are one computation with different amounts of it
inferred, so they draw the same picture down to the pixel. The fourth is a
different computation. It interpolates the data and runs the whole pipeline over
the result, where the others interpolate the geometry the pipeline already
produced. It agrees with the others here because the path from a row to a placed
circle is a straight-line map once the domains are fixed. It stops agreeing when
that path bends, for example when a scale's domain is read off one moment's rows
instead of all of them, or when a mark's size comes from a count of them.

## Bar chart race

A bar chart race is the Gapminder spec with the scatter swapped for a sorted
bar chart. Each brand is one bar, the bars are ranked by value with the largest
on top, and every year the bars trade places.

```ts
chart(brands, { legend: false })
  .flow(
    time.sequence({ by: "year", duration: 20000 }),
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      spacing: 2,
    })
  )
  .mark(
    rect({ w: "value", fill: "category" }).label("name", {
      position: "outset-right",
    })
  )
  .layer(time.transition({ curve: "linear" }))
  .render(container, { w: 600, h: 600, axes: { x: true, y: false } });
```

Apart from the mark itself, two lines differ from Gapminder. The inner `spread`
sorts its groups with `field("name").sort("value", "desc")`, so each year's
bars are placed in order from largest to smallest. The transition uses
`curve: "linear"`, so a bar slides to its new rank and grows or shrinks at a
steady rate between two years, the way the bars in Mike Bostock's D3 version
move. Each brand's name is a label just past the end of its bar, and it moves
with the bar.

The data is 37 brands: the ones that have a value in every year of the run,
from 2000 through 2019. Every bar is then on screen for the whole run, so the
chart only ever moves bars and never has to add or remove one.

The value axis is fixed over the whole run. Like Gapminder's axes, it is
inferred from every year at once, so it reaches the largest value of any year,
and in the early years every bar is short. Animated Vega-Lite calls this
`rescale: false`. The bar chart race in the Animated Vega-Lite paper uses
`rescale: true` instead, where each year gets an axis of its own and the
longest bar always spans the plot. GoFish cannot do that yet. It is a known
gap.

### Marks that enter and leave

A race usually shows only the top ten brands of each year, out of all 173.
Then brands come and go, because a brand can rank one year and drop out the
next. The spec does not change. It is handed rows that hold only each year's
top ten.

```ts
const years = Array.from(new Set(allBrands.map((d) => d.year)));
const top10 = years.flatMap((y) =>
  allBrands
    .filter((d) => d.year === y)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
);
```

The transition reads each stretch of time between two neighboring keyframes,
here two years in a row, by which of the two have a row for the brand.

- If the brand is in both years, its bar moves, as before.
- If it is only in the later year, its bar fades in over the stretch. It does
  not move while it fades. It sits where the later year puts it.
- If it is only in the earlier year, its bar fades out over the stretch, held
  where the earlier year put it.
- If it is in neither year, its bar is not drawn.

A bar's label fades with it. A brand that drops out and later comes back fades
out and then, when it returns, fades in again.

This is the default, and for now it is the only behavior. Options to restyle
how a mark enters and exits, such as sliding in from the bottom, are not built
yet.

## Options

### `time.sequence(options)`

| Option     | Type      | Default | Meaning                                                    |
| ---------- | --------- | ------- | ---------------------------------------------------------- |
| `by`       | `string`  | none    | The field whose values are the keyframes. Must be numeric. |
| `duration` | `number`  | `5000`  | Milliseconds one pass through the field takes.             |
| `loop`     | `boolean` | `true`  | Start over at the end.                                     |
| `playing`  | `boolean` | `true`  | Start the clock. `false` holds the chart still.            |
| `at`       | `number`  | none    | Where the playhead starts, in the field's units.           |
| `on`       | `Timer`   | own     | A clock to play on. Rules out the four options above.      |

### `time.transition(options?)`

| Option        | Type                                           | Default    | Meaning                                                         |
| ------------- | ---------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `along`       | `string`                                       | inferred   | The field the keyframes are keyed by in time.                   |
| `at`          | `(() => number) \| number`                     | inferred   | The playhead, in `along`'s units. A `timer`, or a fixed number. |
| `curve`       | `"auto" \| "step" \| "linear" \| "catmullRom"` | `"auto"`   | How the run is read between keyframes.                          |
| `ease`        | `(u: number) => number`                        | none       | A time warp inside one keyframe interval, on `[0, 1]`.          |
| `fill`        | `string`                                       | keyframe's | Paint for the moving mark.                                      |
| `stroke`      | `string`                                       | `fill`     | Outline color.                                                  |
| `strokeWidth` | `number`                                       | `0`        | Outline width.                                                  |
| `opacity`     | `number`                                       | `1`        | Opacity of the moving mark.                                     |

### `interpolate(rows, options)`

Reads a table of keyframes at one moment and returns one row per key, with its
numeric fields evaluated at that moment and `along` set to it. Fields that are
not numbers are copied from the nearest keyframe, for the same reason a
transition does not blend paint.

| Option   | Type                                 | Default        | Meaning                                                        |
| -------- | ------------------------------------ | -------------- | -------------------------------------------------------------- |
| `along`  | `string`                             | none           | The field the rows are keyed by in time.                       |
| `key`    | `string`                             | none           | The field saying which rows are the same thing at other times. |
| `at`     | `number`                             | none           | Where to read the run, in `along`'s units.                     |
| `method` | `"step" \| "linear" \| "catmullRom"` | `"catmullRom"` | How a run is read between its keyframes.                       |
| `fields` | `string[]`                           | every number   | Which fields to interpolate.                                   |

## What is not built yet

This is a first version. A transition moves rectangles, circles and text, and
marks built out of those, such as a bar with a label. It throws a clear error
for other shapes. There is no composition of animations (playing one after
another, or several at once), no staggering, and no options to restyle how
marks enter and exit. The value axis cannot rescale from one keyframe to the
next.

The chart is laid out once. The playhead is read while the chart is painted, so
each tick of the clock changes attributes of marks already on the page and
does not lay the chart out again. What does grow with the data is the number of
marks on the page, because a sequence without a transition keeps every
keyframe's marks there, even the hidden ones.
