# palette

```python
palette(values)
```

Creates a categorical color scale. Pass it to [`chart`](/python/api/core/chart)
as the `color` option.

| `values` type    | Behavior                         |
| ---------------- | -------------------------------- |
| `str`            | Named scheme, e.g. `"tableau10"` |
| `list[str]`      | Colors cycled by index           |
| `dict[str, str]` | Explicit field value → color map |

```python
from gofish import chart, spread, rect, palette

# Named scheme
chart(data, color=palette("tableau10")).flow(
    spread(by="category", dir="x")
).mark(rect(h="value", fill="category"))

# Explicit list
chart(data, color=palette(["#e15759", "#4e79a7", "#59a14f"]))

# Value → color map
chart(data, color=palette({"low": "#4e79a7", "high": "#e15759"}))
```

See also [`gradient`](/python/api/color/gradient) for continuous data.
