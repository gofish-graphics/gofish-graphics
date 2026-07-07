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

| Option         | Default  | Description                                                   |
| -------------- | -------- | ------------------------------------------------------------- |
| `innerRadius`  | `0`      | Donut hole as a fraction `[0,1)` of the outer radius.         |
| `centralAngle` | `2π`     | Total angular sweep in radians (use `<2π` for a partial fan). |
| `startAngle`   | `π/2`    | Angle (radians) where θ=0 sits (`π/2` = 12 o'clock).          |
| `direction`    | `-1`     | `+1` counter-clockwise, `-1` clockwise.                       |
| `center`       | `[0, 0]` | Screen-space center offset.                                   |

## Axis aliases

Inside a polar `coord`, dimensions can be named by their polar axis: `theta` (= `x`,
angular position) and `r` (= `y`, radius), with extents `thetaSize` (= `w`) and
`rSize` (= `h`). They coexist with `x`/`y` and are **scope-bounded** — valid only
inside a coord that declares them (using one outside throws). The operator `dir`
accepts the angular/radial aliases too.

```ts
chart(data, { coord: polar() })
  .flow(spread({ by: "category", dir: "theta" }))
  .mark(rect({ thetaSize: 0.4, rSize: "value", emX: true, emY: true }));
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
