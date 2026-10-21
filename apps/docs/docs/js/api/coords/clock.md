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
  baselineAngle?: number; // angle (radians) where θ's 0 sits, from 3 o'clock. Default π/2 (12 o'clock)
  direction?: 1 | -1; // +1 CCW, -1 CW. Default -1 (clockwise)
  center?: [number, number]; // screen-space center offset. Default [0, 0]
});
```

## Parameters

::: gofish-ref clock
:::

`Coord.clock()` is the [`Coord.polar()`](/js/api/coords/polar) transform and accepts the same
options — `innerRadius`, `centralAngle`, `baselineAngle`, `direction`, `center`. Only the
`baselineAngle` and `direction` defaults differ: 0° at 12 o'clock, clockwise. See
[polar's Parameters](/js/api/coords/polar#parameters). As in polar, the number 0 on
the angular axis always sits at `baselineAngle`.

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
  .flow(stack({ by: "month", dir: "x" }))
  .mark(rect({ w: (Math.PI * 2) / 12, emX: true, h: "value" }));
```

## See Also

- [polar](/js/api/coords/polar) — The same transform with 0° at right, going counter-clockwise
