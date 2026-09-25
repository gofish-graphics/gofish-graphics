---
order: 10
---

# polar

Transforms Cartesian coordinates into a polar coordinate system. The x-axis maps to angle (theta) and the y-axis maps to radius.

::: gofish

```js
gf.chart(seafood, { coord: gf.polar() })
  .flow(gf.stack({ by: "species", dir: "x" }))
  .mark(gf.rect({ w: "count", fill: "species" }))
  .render(root, {
    w: 400,
    h: 300,
    transform: { x: 200, y: 150 },
  });
```

:::

## Signature

```ts
polar(options?: {
  innerRadius?: number; // donut hole, fraction [0,1) of outer radius. Default 0
  centralAngle?: number; // total sweep in radians. Default 2π
  startAngle?: number; // angle (radians) of θ=0. Default π/2 (12 o'clock)
  direction?: 1 | -1; // +1 CCW, -1 CW. Default -1 (clockwise)
  center?: [number, number]; // screen-space center offset. Default [0, 0]
});
```

## Parameters

All optional; the defaults reproduce a centered, full-circle disc starting at 12
o'clock and going clockwise.

::: gofish-ref polar
:::

## Axis names

In every coordinate space, `x`, `y`, `w`, and `h` refer to the first and
second axis. Under polar, the first axis is the angle and the second is the
radius, so `w` is an angular extent and `h` is a radial one.

Polar also declares its own names for the two axes: `theta` for the angle and
`r` for the radius. You can use them in two places:

- in a mark's `dims` option, which is keyed by axis name. A plain value is a
  position, like `x`. An object names the parts of the axis you want to set:
  `min`, `center`, `max`, `size`, and `embedded`.
- in an operator's `dir`, as in `stack({ dir: "theta" })`.

This chart is the one at the top of the page, written with the polar names:

::: gofish

```js
gf.chart(seafood, { coord: gf.polar() })
  .flow(gf.stack({ by: "species", dir: "theta" }))
  .mark(gf.rect({ dims: { theta: { size: "count" } }, fill: "species" }))
  .render(root, {
    w: 400,
    h: 300,
    transform: { x: 200, y: 150 },
  });
```

:::

The names only work inside a coordinate space that declares them. Outside
polar, `theta` throws an error that lists the names you can use there.

Each part of an axis can be set once. `w: 0.4` together with
`dims: { theta: { size: 0.4 } }` is an error, because both set the angular
size. `x: 0` together with `dims: { theta: { size: 0.4 } }` is fine, because
one sets the start and the other sets the size.

A circle's own `r` option is still its radius. The polar `r` axis only appears
as a key inside `dims`, so the two do not collide:

```ts
chart(trips, { coord: polar() })
  .flow(scatter({ by: "id", dims: { theta: "bearing", r: "distance" } }))
  .mark(circle({ r: 4 }));
```

## Usage

Pass the coordinate transform to `chart()` via the `coord` option:

```ts
chart(data, { coord: polar() })
  .flow(...)
  .mark(...)
  .render(container, opts);
```

## Coordinate Mapping

| Cartesian | Polar                  |
| --------- | ---------------------- |
| x         | angle (theta), 0 to 2π |
| y         | radius from center     |

## Examples

```ts
// Basic polar chart
chart(data, { coord: polar() })
  .flow(stack({ by: "category", dir: "x" }))
  .mark(rect({ w: "value" }));

// Polar with spread for radial segments
chart(data, { coord: polar() })
  .flow(spread({ by: "month", dir: "x" }))
  .mark(rect({ w: 1, h: "value" }));

// Donut: a hollow center (inner radius = 50% of the outer radius)
chart(data, { coord: polar({ innerRadius: 0.5 }) })
  .flow(stack({ by: "category", dir: "x" }))
  .mark(rect({ w: "value" }));

// Partial fan: a 270° sweep instead of the full circle
chart(data, { coord: polar({ centralAngle: (3 * Math.PI) / 2 }) })
  .flow(spread({ by: "month", dir: "x" }))
  .mark(rect({ w: 1, h: "value" }));
```

## See Also

- [clock](/js/api/coords/clock) — Similar to polar but with 0° at 12 o'clock
