---
order: 160
---

# log

Logs the current data to the console at the point it appears in [`.flow()`](/js/api/core/flow). Useful for debugging.

## Signature

```ts
log(prefix?)
```

## Parameters

::: gofish-ref log
:::

## Example

```ts
.flow(
  spread({ by: "category",  dir: "x" }),
  log("after spread"),   // logs each group
  derive(d => d)
)
```
