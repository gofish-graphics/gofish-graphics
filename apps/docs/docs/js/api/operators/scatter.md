# scatter

Positions children at per-group means (when `by` is given) or per-item (when `by` is omitted).

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.Chart(locations, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle({ r: 8 }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
scatter({ by?, x?, y?, xMin?, xMax?, yMin?, yMax?, alignment? })
```

## Parameters

| Option                      | Type                                         | Description                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `by`                        | `string \| (item) => string`                 | Field, lodash path, or accessor to group by; omit for per-item scatter. Path-aware (use `"datum.field"` after a [selection](/js/api/selection/ref)) — see [`spread` → path-aware `by`](/js/api/operators/spread#path-aware-by) |
| `x`, `y`                    | `string \| number`                           | Field name for position, or fixed pixel value                                                                                                                                                                                  |
| `xMin`/`xMax`/`yMin`/`yMax` | `string`                                     | Range form — children span `[xMin, xMax]` (or y) in data space                                                                                                                                                                 |
| `alignment`                 | `"start" \| "middle" \| "end" \| "baseline"` | Alignment on axes scatter doesn't position                                                                                                                                                                                     |

At least one of `x`, `y`, the `xMin`/`xMax` pair, or the `yMin`/`yMax` pair is required.

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
