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
