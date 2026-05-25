# derive

Transforms data before it reaches the next operator or mark. The function receives the current data group and returns a new one.

::: starfish

```js
gf.Chart(seafood)
  .flow(
    gf.derive((d) => d.filter((row) => row.species === "Salmon")),
    gf.spread({ by: "lake", dir: "x" })
  )
  .mark(gf.rect({ h: "count", fill: "steelblue" }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
derive(fn);
```

## Parameters

| Parameter | Type                              | Description                       |
| --------- | --------------------------------- | --------------------------------- |
| `fn`      | `(d: T[]) => T[] \| Promise<T[]>` | Function that transforms the data |

## Examples

```ts
// Filter before spreading
.flow(
  derive(d => d.filter(row => row.year === 2020)),
  spread({ by: "category",  dir: "x" })
)

// Compute a per-group sum (after spread, d is scoped to one group)
.flow(
  spread({ by: "category",  dir: "x" }),
  derive(d => [{ ...d[0], total: sumBy(d, "value") }])
)

// Reshape wide-to-long
.flow(
  derive(d => d.flatMap(row => [
    { ...row, measure: "a", value: row.a },
    { ...row, measure: "b", value: row.b },
  ]))
)
```
