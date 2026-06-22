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
polar();
```

## Parameters

None. The polar transform has no configuration options.

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
```

## See Also

- [clock](/js/api/coords/clock) — Similar to polar but with 0° at 12 o'clock
