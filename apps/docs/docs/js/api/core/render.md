# render

Renders the chart into a DOM element. To get the SVG out as a string or file
instead, see [export](/js/api/core/export).

## Signature

```ts
.render(container, options)
```

## Parameters

| Parameter      | Type          | Description                                                       |
| -------------- | ------------- | ----------------------------------------------------------------- |
| `container`    | `HTMLElement` | The DOM element to render into                                    |
| `options.w`    | `number?`     | Width in pixels. Optional — see [Inferred size](#inferred-size).  |
| `options.h`    | `number?`     | Height in pixels. Optional — see [Inferred size](#inferred-size). |
| `options.axes` | `AxesOptions` | Auto-generate axes, labels, and legends. See [Axes](#axes) below. |

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
axes: true                                     // both axes, titles inferred
axes: false                                    // no axes (the default)
axes: { x: true, y: false }                    // x only
axes: { x: { title: "Year" }, y: true }        // custom x title, inferred y title
axes: { x: { title: false }, y: true }         // suppress the inferred x title
axes: { x: { side: "end" } }                   // seat the x-axis on the far edge
axes: { x: { labelAngle: 45 } }                // rotate x tick/category labels 45°
axes: { x: { labelAngle: [45] } }              // rotate only the innermost tier
```

Each per-axis object also accepts `side: "start" | "end"`. By default a
**continuous/quantitative x-axis renders at the visual bottom** (and a continuous
y-axis at the left), whichever edge that is once the frame's y-orientation is
resolved — so a scatter, a horizontal bar, and a faceted small-multiple all place
their value axis at the bottom without any option. An explicit `side` overrides
that with the literal **frame-relative** seating: `"start"` is the near/origin edge
(top in a y-down frame, bottom in y-up) and `"end"` is the far edge — e.g.
`{ x: { side: "end" } }` forces the x-axis onto the opposite edge from the default.

### Rotating tick and category labels

Each per-axis object also accepts `labelAngle: number | number[]` — degrees,
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

```js
gf.chart(cityYear, { axes: { x: { labelAngle: [45] } } }) // year rotated, city upright
  .flow(
    gf.spread({ by: "city", dir: "x", spacing: 24 }),
    gf.spread({ by: "year", dir: "x", spacing: 0 })
  )
  .mark(gf.rect({ h: "visitors", fill: "year" }))
  .render(root, { w: 300, h: 210 });
```

There is currently no "auto" mode that rotates only when labels would collide —
`labelAngle` is a manual, always-on rotation (auto-rotation is tracked in
[#486](https://github.com/gofish-graphics/gofish/issues/486)).

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
