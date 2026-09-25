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
scatter({ by?, x?, y?, xMin?, xMax?, yMin?, yMax?, dims?, alignment? })
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
`dims.theta`, is an error too. The circle's `r` above is its radius, not the
polar axis: axis names only appear as keys of `dims`.

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
