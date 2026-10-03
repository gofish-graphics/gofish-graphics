---
order: 40
---

# scatter

Positions children at per-group means (when `by` is given) or per-item (when `by` is omitted).

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.chart(locations, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle({ r: 8 }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
scatter({ by?, x?, y?, xMin?, xMax?, yMin?, yMax?, dims?, alignment?, overlap? })
```

## Parameters

::: gofish-ref scatter
:::

At least one of `x`, `y`, the `xMin`/`xMax` pair, or the `yMin`/`yMax` pair is required.

## Placing by axis name with `dims`

`x` and `y` mean the first and second axis in any coordinate space. To use the
names the enclosing coordinate space declares, put them in `dims`: a plain
value is the point, like `x`, and `{ min, max }` is the span, like
`xMin`/`xMax`.

```ts
// Under polar(): the same as scatter({ by: "id", x: "bearing", y: "distance" })
.flow(scatter({ by: "id", dims: { theta: "bearing", r: "distance" } }))
.mark(circle({ r: 4 }))

// Under geo(): the same as scatter({ by: "name", x: "lon", y: "lat" })
.flow(scatter({ by: "name", dims: { lon: "lon", lat: "lat" } }))
```

A scatter only places its children, so a `size` inside `dims` is an error; size
the mark instead. Placing an axis twice, such as `x` together with
`dims.theta`, is an error too. The two ends of a span may come from either
spelling (`xMin` with `dims: { x: { max: "hi" } }`), but one end without the
other is an error. Each value in `dims` is read like its top-level
counterpart: a point like `x`, a `min` like `xMin`. The circle's `r` above is
its radius, not the polar axis: axis names only appear as keys of `dims`.

## Keeping dots apart with `overlap`

When a field places only one axis, every child sits on one line on the other
axis, at the scatter's `alignment`. Dots with close values then cover each
other. `overlap` moves each child along that free axis so the children no
longer overlap. A strategy only ever moves children along the free axis: each
child keeps the position its field gives it on the data axis, which `scatter`
alone places. You make the strategy with a function call.

- `swarm({ padding? })` makes a beeswarm. Each dot keeps its position on the
  data axis. Then, in data order, it moves to the free spot nearest the line.
  `padding` is the number of pixels kept between neighboring dots. The default
  is 0. This is the same placement as Observable Plot's `dodge`.

::: gofish

```js
gf.chart(
  penguins.filter((p) => p["Body Mass (g)"] !== null),
  { axes: true }
)
  .flow(
    gf.spread({ by: "Species", dir: "y", spacing: 16 }),
    gf.scatter({
      x: "Body Mass (g)",
      alignment: "middle",
      overlap: gf.swarm({ padding: 1 }),
    })
  )
  .mark(gf.circle({ r: 3, fill: "Species" }))
  .render(root, { w: 560, h: 320 });
```

:::

The swarm grows from the `alignment` line:

- `"middle"` grows on both sides of the line.
- `"start"` and `"baseline"` grow on the positive side. Each dot's start edge
  is on the line or past it.
- `"end"` grows on the negative side.

Shapes other than circles are kept apart by their enclosing circle, the same
circle [`pack`](/js/api/operators/pack) uses.

The swarm is as tall as its dots need. It does not shrink to fit the space it
is given, so a dense swarm can grow past it. To make it smaller, use smaller
dots or less padding.

Some cases are errors:

- `overlap` when both `x` and `y` come from fields, because then no axis is
  free.
- `overlap` inside a coordinate space that is not linear, such as `polar()`.
  The swarm keeps dots apart in the layout frame, and a polar space bends that
  frame, so dots could still overlap on screen. See
  [#1002](https://github.com/gofish-graphics/gofish-graphics/issues/1002).

## Example

```ts
.flow(scatter({ by: "species", x: "bill_length", y: "flipper_length" }))
.mark(rect({ w: 8, h: 8, rx: 4 }))

// Histogram with range form: each rect spans its bin in data space
.flow(derive(bin("rating")), scatter({ xMin: "start", xMax: "end" }))
.mark(rect({ h: "count" }))
```

## Discrete scatter and translation

When `x` or `y` is categorical, `scatter` uses discrete point placement: each
group is placed at the center of its allotted position. Use this for cases that
need center placement without treating child edges as a band layout.

If you need a fixed offset around the arranged scatter, chain
`.translate({ x?, y? })` on the operator instead of putting that value in
`scatter({ x, y })`. The `x` and `y` options on `scatter` are placement
channels; `.translate()` is an outer pixel translation that preserves the
scatter-computed axis.

```ts
chart(seafood, { coord: clock() })
  .flow(
    scatter({
      by: "lake",
      x: "lake",
      w: 2 * Math.PI,
      axes: { x: false, y: true },
    }).translate({ y: 50 }),
    stack({ by: "species", dir: "y", label: false })
  )
  .mark(rect({ w: 0.1, h: "count", fill: "species" }));
```

In that example, `x: "lake"` chooses the discrete angular centers and
`.translate({ y: 50 })` adds the radial offset. Writing `y: 50` inside
`scatter(...)` would instead mean "use scatter's y-channel semantics."
