---
order: 70
---

# polygon

Draws a closed polygon from explicit local-coordinate points. Useful for
non-rectangular glyphs (trapezoids, arrows, custom shapes) that can't be
expressed by the standard shape primitives.

```python
from gofish import chart, polygon

chart([{}]).mark(
    polygon(
        points=[
            [0, 0],
            [60, 0],
            [50, 40],
            [10, 40],
        ],
        fill="steelblue",
    )
).render(w=100, h=60)
```

## Signature

```python
polygon(*, points=None, fill=None, stroke=None, strokeWidth=None, opacity=None,
        debug=None) -> Mark
```

Keyword-only (matches every existing call site, which already passes
`points=...` by keyword).

## Parameters

::: gofish-ref polygon
:::

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark). Call
[`.name()`](/python/api/core/mark) on the result to make it referenceable via
[`ref`](/python/api/marks/ref) / [`selectAll`](/python/api/selection/ref) or a
constraint.

## Coordinates

Points are interpreted in the local coordinate system of whatever places the
polygon — typically a `layer` or a constraint. The polygon's bounding box is
the axis-aligned extent of its points; the parent placement system translates
the whole polygon to position it.

GoFish is y-up internally, so a trapezoid whose wide edge sits at the bottom
and narrow edge at the top is written:

```python
polygon(
    points=[
        [0, 0],            # bottom-left (the wider edge)
        [width, 0],        # bottom-right
        [width - 10, h],   # top-right  (inset)
        [10, h],           # top-left   (inset)
    ],
)
```

## Examples

```python
# Trapezoidal weight glyph (from the pulley diagram)
polygon(
    points=[
        [0, 0],
        [width, 0],
        [width - 10, height],
        [10, height],
    ],
    fill="#545454",
).name("body")

# Triangle with stroke
polygon(
    points=[
        [0, 0],
        [40, 0],
        [20, 30],
    ],
    fill="transparent",
    stroke="black",
    strokeWidth=2,
)
```

## Data-driven fill

`fill` and `stroke` work as they do on [`rect`](/python/api/marks/rect). A
field name reads that field off each row and sends it through the chart's
color scale. Any other string is a literal color. When `stroke` is omitted it
follows the fill.

```python
chart(rows, color=gradient(["#fff5eb", "#7f2704"])).mark(
    polygon(points="ring", fill="n")
)
```

Here `points="ring"` names a field holding one ring per row, so the mark draws
one polygon per row, each colored by its own `n`.

## Notes

- The polygon is always closed — the last point connects back to the first
  automatically.
