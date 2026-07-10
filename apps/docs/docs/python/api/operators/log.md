# log

Logs the data flowing through the pipeline to the browser console. A no-op
layout operator — it passes the data through unchanged — used purely for
debugging a `.flow()` chain.

```python
from gofish import chart, spread, log, stack, rect

chart(seafood).flow(
    spread(by="lake", dir="x"),
    log("after spread"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species"))
```

## Signature

```python
log(prefix=None) -> Operator
```

## Parameters

| Parameter | Type  | Description                            |
| --------- | ----- | -------------------------------------- |
| `prefix`  | `str` | Optional prefix for the console output |

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## Notes

- Insert `log()` between operators to inspect the data at that point in the
  pipeline. Open your browser's developer console to see the output.
- `log` does not change the data — remove it once you are done debugging.
- To inspect the chart specification itself rather than the data, use
  [`.to_ir()`](/python/api/core/render#inspecting-the-ir).
