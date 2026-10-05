---
order: 80
---

# text

Draws a text label for each data item. Used for value labels on bars, point
annotations, node names in diagrams, and axis titles.

```python
from gofish import chart, text

chart([{"label": "GoFish"}]).mark(
    text(text="label", font_size=28, fill="steelblue")
).render(w=240, h=80)
```

## Signature

```python
text(*, text=None, fill=None, stroke=None, stroke_width=None, filter=None,
     font_size=None, font_family=None, font_style=None, font_weight=None,
     debug_bounding_box=None, rotate=None, text_anchor=None,
     x=None, cx=None, x2=None, w=None, em_x=None,
     y=None, cy=None, y2=None, h=None, em_y=None,
     dims=None, key=None) -> Mark
```

Keyword-only (matches every existing call site, which already passes
`text=...` by keyword).

## Parameters

::: gofish-ref text
:::

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Placement

A text is a box, and it is placed exactly as a rect of the same size would be.
`y` is the box's start edge: its top where y reads top-down (a free diagram, an
ordinal spread) and its bottom where y grows upward (a chart with a value axis).
`cy` is the box's center. Spreads, stacks, layers and `align`/`distribute`
constraints place it by its box, as they place a rect. In x, `x` is the
`text_anchor` point: the left edge for the default `"start"` (as for a rect), the
center for `"middle"`, the right edge for `"end"`.

`rotate` turns the glyphs about the point on their baseline at `text_anchor`; the
box is then the rotated glyphs' footprint.

## Encoding

The `text` option takes a **constant**, a **field name** (a string column in
your data), or a **callable** `(row) -> str` evaluated per row:

```python
text(text="Hello")               # constant string
text(text="name")                # content from a field
text(text=lambda row: f"{row['amount']}%")  # computed per row
```

## Examples

```python
# Static label
chart([{"label": "GoFish"}]).mark(text(text="label", font_size=24, fill="steelblue"))

# Value labels: layer text totals on top of bars
layer([
    chart(seafood)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count").name("bars")),
    chart(select_all("bars"))
        .flow(group(by="lake"))
        .mark(lambda d: spread(
            [d[0], text(text=str(sum(r["count"] for r in d[0].datum)))],
            dir="y", alignment="middle", spacing=10,
        )),
])

# Computed per-row label
chart(bottles).mark(text(text=lambda d: f"{d['amount']}%", font_size=35, fill="#666"))

# Italic label
text(text="note", font_style="italic")

# Light-weight label
text(text="caption", font_weight=300)
```
