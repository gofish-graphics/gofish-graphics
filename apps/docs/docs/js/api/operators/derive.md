---
order: 130
---

# derive

Transforms data before it reaches the next operator or mark. The function receives the current data group and returns a new one.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.derive((d) => d.filter((row) => row.species === "Salmon")),
    gf.spread({ by: "lake", dir: "x" })
  )
  .mark(gf.rect({ h: "count", fill: "steelblue" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
derive(fn);
derive(fn, { schema });
```

## Parameters

| Parameter | Type                           | Description                                                                                                                                                               |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fn`      | `(d: T) => U \| Promise<U>`    | **Required.** Receives the data at this point in the flow (inside `.flow()`, the current group's rows) and returns what the rest of the pipeline sees. It may be `async`. |
| `schema`  | `Record<string, ColumnSchema>` | Column types of the result, keyed by column name, as in [`chart`'s `schema`](/js/api/core/schema): `Schema.ordered(levels)` or `Schema.time({ zone })`.                   |

## Column types of the result

Each column of the returned rows is typed like chart data:

- A column whose values still fit the type it had in the input keeps that
  type. A time column of unchanged instants stays a time, and an ordered
  column whose values are still text or numbers keeps the order, so a
  value outside its levels is an error where the order is used.
- A column of `Date` values is a time in UTC.
- Any other column has no type. A `derive` that rewrites a date to `"Mar"`
  makes the column plain text.
- A `schema` entry overrides these for its column and converts the values
  as a chart's schema does: an ISO 8601 string in a `Schema.time()` column
  becomes an instant.

[`filter`](/js/api/operators/filter) keeps the input's types, since its rows
are the input's rows.

```ts
// Monthly highs, months in calendar order
derive(monthlyHighs, { schema: { month: Schema.ordered(MONTHS) } });
```

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

## Measures: keeping units across a transform

A channel that encodes a field carries that field's **measure** — its
unit-of-measure, like `"Beak Depth (mm)"` or `"count"`. GoFish uses measures to
decide when two axes may share a scale: overlaying or aligning marks whose axes
have the _same_ measure merges their domains, while mixing _different_ measures
(say, a count axis with a millimeter axis) is refused with an error rather than
silently corrupting the shared domain.

By default the measure is just the field name, which is usually right. Two
things change it:

- **`bin()` and other built-in transforms** tag their output automatically — a
  histogram's `start`/`end`/`size` columns keep the _source_ field's units, and
  `count` becomes `"count"`. You don't annotate anything; the tag survives
  through `derive`.
- **An arbitrary `derive`** can lose that connection — once you compute a new
  column, GoFish only knows its name, not its unit. When the new column is
  really in some existing unit (and you want its axis to share with that unit's
  axis), annotate the channel with the second argument to `field`:

  ```ts
  import { field } from "gofish-graphics";

  // `depthMm` was derived but is still millimeters:
  .mark(rect({ y: field("depthMm", "Beak Depth (mm)") }))
  ```

  `datum(v, measure)` does the same for a literal value.

If you hit **"Cannot unify underlying spaces with different measures"**, you
have two remedies:

1. If the units really are the same, say so with `field(name, measure)` /
   `datum(v, measure)` so the axes collapse to one measure and merge.
2. If the units really differ, give the inner chart an explicit `w`/`h` so it
   becomes a [self-contained scale region](/js/api/core/render#explicit-size-makes-a-self-contained-scale-region)
   and never shares that axis.

Annotating a channel whose measure contradicts a transform's provenance (e.g.
calling `field("count", "mm")` on a `bin()` output) is itself an error — the
annotation and the provenance are contradictory claims.
