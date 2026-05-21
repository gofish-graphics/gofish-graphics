# ellipse

Draws an ellipse for each data item. Like [`circle`](/python/api/marks/circle),
but with independent width and height.

::: starfish example:balloon-chart hidden
:::

```python
from gofish import ellipse

ellipse(w=24, h=30, fill="#e15759")
```

## Signature

```python
ellipse(w=None, h=None, fill=None, stroke=None, strokeWidth=None,
        debug=None) -> Mark
```

## Parameters

| Parameter     | Type           | Description                                 |
| ------------- | -------------- | ------------------------------------------- |
| `w`, `h`      | `int` \| `str` | Width / height — a constant or a field name |
| `fill`        | `str`          | Fill color — a constant or a field name     |
| `stroke`      | `str`          | Stroke color                                |
| `strokeWidth` | `int`          | Stroke width in pixels                      |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Examples

```python
# Data-driven size
chart(data).flow(scatter(x="x", y="y")).mark(ellipse(w="width", h="height"))

# A circle is an ellipse with equal axes
ellipse(w=20, h=20, fill="#4e79a7")
```

## Notes

- Use [`circle`](/python/api/marks/circle) when width and height are always
  equal — its single `r` option is simpler.
