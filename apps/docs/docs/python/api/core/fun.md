# fun

Makes a function value: a function of `t` over an interval. In JavaScript,
the shape form of `ribbon` and `line` reads it in a channel. Python does not
support function values yet: `fun` always raises `NotImplementedError`.

## Signature

```python
fun(at, domain=(min, max), knots=None)
```

## Why it raises

A mark reads a function value at many values of `t` while it lays itself
out, and layout is synchronous. A Python function can only be called across
the bridge to the Python kernel, which is asynchronous. Until the bridge can
answer a call in the middle of layout, give the function's values at sample
points as rows instead:

```python
import math

rows = [{"t": t / 10, "value": math.sin(t / 10)} for t in range(0, 63)]
chart(rows).mark(ribbon(x="t", h="value"))
```

For the same reason, a Python
[`reduce`](/python/api/operators/spread#map-and-reduce) that returns a
function raises. A reduce that returns a number or a dict of numbers works.

See [`fun` in JavaScript](/js/api/core/fun).
