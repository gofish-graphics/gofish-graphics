# gradient

```python
gradient(stops)
```

Creates a continuous color scale. Colors are interpolated across the numeric
range of the `fill` field.

| `stops` type | Behavior                                       |
| ------------ | ---------------------------------------------- |
| `str`        | Named scheme: `"viridis"`, `"blues"`, `"reds"` |
| `list[str]`  | Custom color stops interpolated in LAB space   |

```python
from gofish import chart, spread, rect, gradient

# Named scheme
chart(data, color=gradient("viridis")).flow(
    spread(by="category", dir="x")
).mark(rect(h="value", fill="temperature"))

# Custom stops
chart(data, color=gradient(["#f7fbff", "#08306b"]))
```

**Built-in schemes:** `"viridis"`, `"blues"`, `"reds"`

See also [`palette`](/python/api/color/palette) for categorical data, and
[`assign_gradient_color`](/python/api/color/assign-gradient-color) to
precompute a color from a gradient outside of a chart's `fill` channel.
