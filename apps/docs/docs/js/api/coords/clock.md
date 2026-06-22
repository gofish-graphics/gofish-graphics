# clock

A polar coordinate system oriented like a clock face. 0° is at 12 o'clock (top) and angles increase clockwise. Ideal for pie charts, donut charts, and radial visualizations.

::: gofish

```js
gf.chart(seafood, { coord: gf.clock() })
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
clock();
```

## Parameters

None. The clock transform has no configuration options.

## Usage

Pass the coordinate transform to `chart()` via the `coord` option:

```ts
chart(data, { coord: clock() })
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
chart(data, { coord: clock() })
  .flow(stack({ by: "category", dir: "x" }))
  .mark(rect({ w: "value", fill: "category" }));

// Donut chart (with inner radius)
chart(data, { coord: clock() })
  .flow(stack({ by: "category", dir: "x", y: 50, h: 50 }))
  .mark(rect({ w: "value", fill: "category" }));

// Rose chart (radial bar chart)
chart(data, { coord: clock() })
  .flow(stack({ by: "month", dir: "x" }))
  .mark(rect({ w: (Math.PI * 2) / 12, emX: true, h: "value" }));
```

## See Also

- [polar](/js/api/coords/polar) — Standard polar coordinates with 0° at right
