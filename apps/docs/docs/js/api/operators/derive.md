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

`fn` (required, `(d: T) => U | Promise<U>`) receives the data at this point
in the flow (inside `.flow()`, the current group's rows) and returns what the
rest of the pipeline sees. It may be `async`. The options:

::: gofish-ref derive
:::

`schema` takes the same column types as [`chart`'s `schema`](/js/api/core/schema).

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

A result that is one object, not an array, is typed as one row the same way.
A column of `Date` values that had a time type in the input keeps it, time
zone included. Fitting reads the values, not what they mean: a `derive`
that turns a time column into plain numbers, such as years, keeps the time
type, because any number is a valid instant
([#1089](https://github.com/gofish-graphics/gofish-graphics/issues/1089)).
Give the column its type with `derive(fn, { schema })`.

[`filter`](/js/api/operators/filter) carries the input's types over as they
are, since its rows are the input's rows.

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

## Units: keeping axes shared across a transform

A channel that encodes a column carries the column's **unit**. GoFish uses
units to decide when two axes may share a scale. A column with no declared
unit has an unknown unit, which shares an axis with any column, so the
columns a `derive` computes (`lo`, `hi`, a box plot's quartiles) share an
axis with no annotation. Two different declared units on one axis are an
error. See [`Schema.unit`](/js/api/core/schema).

- **`bin()`** types its output: the edges `start`/`end`/`size` are amounts
  of the source column, so they title their axis as the source does and
  take its unit, and `count` is in the unit `"count"`. The types survive
  through `derive`.
- **An arbitrary `derive`** can declare the unit of a column it makes with
  its `schema`:

  ```ts
  derive(quartiles, {
    schema: { lo: Schema.unit("USD"), hi: Schema.unit("USD") },
  });
  ```

An axis is titled by the quantities of its columns (each column's name,
unless its schema declares a quantity), then a declared unit in parentheses:
`"Pay (USD)"`. See [`Schema.quantity`](/js/api/core/schema).

If an axis combines two different units, you have two remedies:

1. If the units really are the same, declare the same unit for both columns.
2. If the units really differ, give the inner chart an explicit `w`/`h` so it
   becomes a [self-contained scale region](/js/api/core/render#explicit-size-makes-a-self-contained-scale-region)
   and never shares that axis.
