---
order: 20
---

# Coord.clock

A polar coordinate system oriented like a clock face. 0° is at 12 o'clock (top) and angles increase clockwise. Ideal for pie charts, donut charts, and radial visualizations.

::: gofish

```js
gf.chart(seafood, { coord: gf.Coord.clock() })
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
Coord.clock(options?: {
  innerRadius?: number; // donut hole, fraction [0,1) of outer radius. Default 0
  centralAngle?: number; // total sweep in radians. Default 2π
  center?: [number, number]; // screen-space center offset. Default [0, 0]
});
```

`Coord.clock(options)` is a preset of [`Coord.polar()`](/js/api/coords/polar):
`Coord.polar({ baselineAngle: Math.PI / 2, direction: -1, ...options })`. It
fixes `baselineAngle` and `direction`, so the number 0 on the angular axis sits
at 12 o'clock and angles increase clockwise. It takes the other options of
polar. Passing `baselineAngle` or `direction` is a type error, and at run time an
error that names the `Coord.polar(...)` call to write instead. A clock space is
a polar space, and it crosses the wire as `{ type: "polar", baselineAngle, direction, ... }`.

## Parameters

::: gofish-ref Coord.clock
:::

See [polar's Parameters](/js/api/coords/polar#parameters).

## Usage

Pass the coordinate transform to `chart()` via the `coord` option:

```ts
chart(data, { coord: Coord.clock() })
  .flow(...)
  .mark(...)
  .render(container, opts);
```

## Coordinate Mapping

| Cartesian | Clock                               |
| --------- | ----------------------------------- |
| x         | angle (theta), 0° at top, clockwise |
| y         | radius from center                  |

## Examples

```ts
// Pie chart
chart(data, { coord: Coord.clock() })
  .flow(stack({ by: "category", dir: "x" }))
  .mark(rect({ w: "value", fill: "category" }));

// Donut chart (hollow center via inner radius)
chart(data, { coord: Coord.clock({ innerRadius: 0.6 }) })
  .flow(stack({ by: "category", dir: "x" }))
  .mark(rect({ w: "value", fill: "category" }));

// Rose chart (radial bar chart)
chart(data, { coord: Coord.clock() })
  .flow(spread({ by: "month", dir: "x", spacing: 0 }))
  .mark(rect({ h: "value" }));
```

## See Also

- [polar](/js/api/coords/polar) — The same transform with 0° at right, going counter-clockwise
