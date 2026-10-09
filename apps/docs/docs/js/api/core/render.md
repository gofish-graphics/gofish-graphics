# render

Renders the chart into a DOM element. To get the SVG out as a string or file
instead, see [export](/js/api/core/export).

## Signature

```ts
.render(container, options): Promise<View>
```

The low-level terminal for a bare node has the same result:

```ts
gofish(container, options, node): View                 // a node renders synchronously
gofish(container, options, () => node): Promise<View>  // a component thunk resolves first
```

## Parameters

| Parameter        | Type          | Description                                                                                                                                                      |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`      | `HTMLElement` | The DOM element to render into                                                                                                                                   |
| `options.w`      | `number?`     | Width in pixels. Optional — see [Inferred size](#inferred-size).                                                                                                 |
| `options.h`      | `number?`     | Height in pixels. Optional — see [Inferred size](#inferred-size).                                                                                                |
| `options.axes`   | `AxesOptions` | Auto-generate axes, labels, and legends. See [Axes](#axes) below.                                                                                                |
| `options.legend` | `boolean?`    | Whether to draw the color-scale legend. Default `true`; see [chart › Legend](/js/api/core/chart#legend). A `chart()` option of the same name wins over this one. |

## Returns

A `View`, the handle to the chart now mounted in `container`:

| Member      | Type          | Description                                                                                            |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `container` | `HTMLElement` | The element the chart was rendered into.                                                               |
| `unmount()` | `() => void`  | Removes the chart's DOM and detaches it from every input it read. See [Unmounting](#unmounting) below. |

`.render()` on a chart, a mark, or a combinator returns a `Promise<View>`, which
settles once the chart's first resolve is done.

## Unmounting

`view.unmount()` removes the chart from its container and detaches it from every
input it read (`pointer()`, `signal()`, `timer()`, …), so those inputs stop
re-rendering it. A `timer()` that no other chart reads stops sampling.

```ts
const view = await chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { w: 400, h: 300 });

// Later, when the chart goes away:
view.unmount();
```

`unmount()` is safe to call more than once. It only removes the chart it was
returned for: if another chart has since been rendered into the same container,
the old view's `unmount()` leaves the new chart alone. Rendering a new chart into
a container also unmounts the chart that was there, so you only need `unmount()`
when the chart goes away without a replacement.

## Inferred size

`w` and `h` are optional. When you omit one, GoFish computes that dimension during
layout, per axis, from what the axis encodes:

- An axis that **scales data into pixels** — a positional axis (e.g. a scatter's
  `x`/`y`), or a data-driven size like bar heights (`rect({ h: "value" })`) — has
  no intrinsic pixel extent, so it falls back to a default canvas size of **400px**.
- An axis with **nothing to scale** — a category axis, or fixed-size marks — keeps
  its marks at their natural size and **shrinks to fit** them.

So a bar chart rendered with no `w` gets default-width bars and a graphic only as
wide as it needs to be, while bar heights still scale to the 400px default if `h`
is also omitted. A bare fixed-size shape (or a `layer` of them) shrinks to its own
bounding box. A supplied `w`/`h` is always used as-is.

```ts
// Width inferred (default-width bars, shrink-to-fit); height = 300.
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { h: 300 });
```

### Explicit size makes a self-contained scale region

When you give a (sub)chart an explicit `w`/`h` on a dimension, its scale on that
dimension resolves against that pixel box rather than against any larger layout it
is composed into. The axis becomes self-contained: a chart sized this way can be
dropped into a bigger graphic without sharing — or polluting — the surrounding
axes with its own units.

This is what makes composed layouts like a marginal histogram work. The count
histograms are sized to a fixed pixel band (`chart(data, { h: 80 })` /
`chart(data, { w: 80 })`) and laid out alongside a center scatter; because each
histogram absorbs its own count scale, only the scatter's data units drive the
shared x/y axes.

## Axes

The `axes` option controls per-axis visibility and titles. It accepts a boolean, a
per-dimension object, or per-dimension title control:

```ts
axes: true                                     // both axes, titles inferred (the chart() default)
axes: false                                    // no axes (the default for a bare node)
axes: { x: true, y: false }                    // x only
axes: { x: { title: "Year" }, y: true }        // custom x title, inferred y title
axes: { x: { title: false }, y: true }         // suppress the inferred x title
axes: { x: { side: "end" } }                   // seat the x-axis on the far edge
axes: { x: { labelAngle: 45 } }                // rotate x tick/category labels 45°
axes: { x: { labelAngle: [45] } }              // rotate only the innermost tier
axes: { x: { labelAngle: "auto" } }            // rotate only if labels would collide
```

Each per-axis object also accepts `side: "start" | "end"`. By default a
**continuous/quantitative x-axis renders at the visual bottom** (and a continuous
y-axis at the left), whichever edge that is once the frame's y-orientation is
resolved — so a scatter, a horizontal bar, and a faceted small-multiple all place
their value axis at the bottom without any option. An explicit `side` overrides
that with the literal **frame-relative** seating: `"start"` is the start of the
axis order (the top of a y that reads top-down, the bottom of a continuous y, which
grows upward) and `"end"` is the far edge — e.g.
`{ x: { side: "end" } }` forces the x-axis onto the opposite edge from the default.

### Rotating tick and category labels

Each per-axis object also accepts `labelAngle: number | number[] | "auto"` — degrees,
**clockwise on screen**, matching Vega-Lite's `labelAngle`. It rotates both
continuous tick labels and ordinal category labels on that axis. This is useful
when category labels would otherwise overlap at small chart sizes:

::: gofish

```js
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, {
    w: 300,
    h: 210,
    axes: { x: { labelAngle: 45 }, y: true },
  });
```

:::

A **plain number** applies to every tier of a nested ordinal axis — e.g. a
two-level grouped bar chart's inner (year) and outer (city) category rows both
rotate the same amount. An **array** is per-tier instead, indexed from the
INNERMOST tier outward: `labelAngle: [45]` rotates only the innermost row and
leaves outer tiers unrotated; `[45, 0]` is the explicit two-tier form (same
result). An index past the end of the array means unrotated. A continuous axis
only ever has one tier, so it just uses the number, or `array[0]` for the array
form.

A rotated label is anchored at its **hanging point** — the point of the label
nearest the axis line — rather than at its bounding box's middle: `0°` and
`±90°` stay centered on the tick (unchanged from an unrotated label); any other
angle hangs the label from whichever end sits closest to the axis, matching
Vega-Lite's 45° look for a positive (clockwise) angle and matplotlib's
`ha="right"` look for a negative one.

```js
gf.chart(cityYear, { axes: { x: { labelAngle: [45] } } }) // year rotated, city upright
  .flow(
    gf.spread({ by: "city", dir: "x", spacing: 24 }),
    gf.spread({ by: "year", dir: "x", spacing: 0 })
  )
  .mark(gf.rect({ h: "visitors", fill: "year" }))
  .render(root, { w: 300, h: 210 });
```

#### Choosing the angle automatically

`labelAngle: "auto"` rotates only when it has to. Each row of labels gets its
own angle: GoFish tries 0°, then 45°, then 90°, and keeps the first angle at
which no two labels in that row overlap or come closer than 2px. If a row of
category labels collides at every angle, GoFish hides that row instead of
drawing labels on top of each other, and the rows and title outside it move in
to take its place. A row of numeric tick labels is never hidden, because
nothing else would show those values; if it collides at every angle, it keeps
the angle with the least overlap. A nested axis has one row
per tier, so in a grouped bar chart the crowded inner row can slant while the
outer row, which has plenty of room, stays upright. The check covers the whole
chart, so a year label under one city that runs into a year label under the
next city counts as a collision.

```js
gf.chart(sales, { axes: { x: { labelAngle: "auto" } } })
  .flow(
    gf.spread({ by: "region", dir: "x", spacing: 24 }),
    gf.spread({ by: "product", dir: "x", spacing: 0 })
  )
  .mark(gf.rect({ h: "sales", fill: "product" }))
  .render(root, { w: 400, h: 210 });
```

At `w: 900` the product names fit upright and stay at 0°. At `w: 400` they
would overlap, so they slant to 45°. At `w: 220` only vertical names clear each
other, so they turn to 90°. At `w: 90` they collide even vertically, so the
product row is hidden; the color legend still names each product. The region
names (North, South, West) stay at 0° at every one of these widths.

A few rules:

- `"auto"` applies to the whole axis and chooses per row. It cannot be an entry
  of a per-tier array; to fix one row's angle yourself, write the whole array.
- Each axis is chosen on its own, so `x` and `y` can both be `"auto"`.
- When a category row is hidden and no legend shows its field, GoFish logs a
  console warning, because nothing on the chart names those categories any
  more. That happens when the legend is turned off (`legend: false`), when the
  marks are colored by a different field, or when the color comes from a
  function (`fill: (d) => ...`), which does not tell GoFish which field it
  reads. Coloring by the same field (`fill: "product"`) with the legend on
  keeps the categories named, so there is no warning.
- GoFish lays the chart out once for each angle it tries. That needs a chart it
  can build again, which is what `chart(...)` and a component function passed to
  `gofish()` are. A node built ahead of time and passed to `gofish()` can be laid
  out only once, so `"auto"` there is an error.

`axes` is most naturally a `chart()`/`chart()` option (e.g.
`gf.chart(data, { axes: true })`); it is also accepted directly on `.render()`, as
the examples below show.

### Axes with inferred titles

When `axes: true` (or `{ title }` is omitted), each axis title is inferred from the
field that dimension encodes — `lake` on x, `count` on y here.

::: gofish

```js
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

### Only x-axis visible

::: gofish

```js
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: { x: true } });
```

:::

### Custom x-axis title, inferred y-axis title

::: gofish

```js
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, {
    w: 400,
    h: 250,
    axes: { x: { title: "Sampling Location" }, y: true },
  });
```

:::

### Suppress the inferred title on the x-axis

::: gofish

```js
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, {
    w: 400,
    h: 250,
    axes: { x: { title: false }, y: true },
  });
```

:::
