---
order: 75
---

# enclose

Draws a rounded rectangle around the union of its children's bounding boxes,
padded by `padding`. Use it to group elements of a diagram visually.

```python
from gofish import enclose, stack, rect

enclose(
    [
        stack(
            [rect(w=40, h=40, fill="#a0c4e8"), rect(w=40, h=60, fill="#e8a0a0")],
            dir="x",
        )
    ],
    padding=10,
    stroke="#4e79a7",
).render(w=160, h=120)
```

## Signature

```python
enclose(children, *, padding=None, rx=None, ry=None, fill=None,
        stroke=None, strokeWidth=None, strokeDasharray=None,
        opacity=None) -> Mark
```

The enclosure is the children's bbox union grown by `padding`, so it draws
nothing of its own beyond that box — reach for
[`position`](/python/api/operators/position) when one child needs a precise
absolute offset with its own styling instead.

## Parameters

::: gofish-ref enclose
:::
