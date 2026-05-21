# Examples

::: warning Coming soon
The Python examples gallery is still being assembled.
:::

Every chart in the [JavaScript examples gallery](/js/examples/) can be built with
the Python API — the two produce identical output. Each example translates
directly: JavaScript option objects become Python keyword arguments.

```js
// JavaScript
Chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }));
```

```python
# Python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

Browse the [JavaScript examples](/js/examples/) for the full catalog, and see the
[API Reference](/python/api/core/chart) for the Python syntax of each operator and mark.
