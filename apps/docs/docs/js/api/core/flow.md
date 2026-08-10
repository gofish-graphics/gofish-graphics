# flow

Applies one or more operators to the data pipeline. Operators are composed left-to-right.

## Signature

```ts
.flow(...operators)
```

## Parameters

| Parameter   | Type         | Description                                |
| ----------- | ------------ | ------------------------------------------ |
| `operators` | `Operator[]` | One or more operators to apply to the data |

Returns a new `ChartBuilder` — `flow` is immutable.

## Example

```ts
chart(data)
  .flow(
    derive((d) => d.filter((row) => row.year === 2020)),
    spread({ by: "category", dir: "x" })
  )
  .mark(rect({ h: "value" }));
```

## Reusable flow fragments

Use `compose` to package a sequence of operators as one reusable operator.
The operators retain the same left-to-right order they have in `.flow()`:

```ts
const waffle = compose(
  derive((rows) => rows.flatMap((row) => repeat(row, "count"))),
  derive((rows) => chunk(rows, 10)),
  spread({ dir: "y", reverse: true }),
  spread({ dir: "x", alignment: "end" })
);

chart(batches)
  .flow(spread({ by: "category", dir: "x", alignment: "end" }), waffle)
  .mark(bottleUnit);
```

Composed fragments may be nested. `compose()` with no arguments is an identity
operator. When a fragment is added to `.flow()`, GoFish expands it into its
constituent operators so serialization preserves the original operator IR.
