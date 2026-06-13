# How to create a glyph

A **glyph** is a composite visual element built from multiple shapes. Instead of
using a single mark like `rect()` or `circle()`, you can layer shapes together to
create custom visualizations.

## Basic pattern

Use `layer()` to compose multiple shapes at the same position:

```python
layer([shape1, shape2, shape3])
```

All children are placed at position `(0, 0)` relative to the layer. The layer's
size is computed as the union of all children's bounding boxes.

## Creating a simple glyph

Here's a simple "badge" glyph with a rounded rectangle and a dot:

```python
from gofish import layer, rect, ellipse

layer([
    rect(cx=0, cy=0, w=50, h=30, rx=8, fill="steelblue"),
    ellipse(cx=-15, cy=0, w=10, h=10, fill="white"),
]).render(w=100, h=100)
```

The shapes are rendered in order, so later shapes appear on top of earlier ones.

## Making glyphs reusable

Wrap your glyph in a function to make it reusable with different parameters:

```python
def badge(w=50, h=30, fill="steelblue"):
    return layer([
        rect(cx=0, cy=0, w=w, h=h, rx=8, fill=fill),
        ellipse(cx=-w / 2 + 10, cy=0, w=10, h=10, fill="white"),
    ])
```

Now you can create badges of different sizes and colors, laid out with the
[`spread`](/python/api/operators/spread) combinator (a positional list of marks):

```python
from gofish import spread

spread([
    badge(w=40, h=24, fill="steelblue"),
    badge(w=60, h=36, fill="coral"),
    badge(w=50, h=30, fill="seagreen"),
], dir="x", spacing=20).render(w=250, h=100)
```

For hygienic naming of a glyph's inner nodes (so they don't collide across
instances), promote the function to a component with the
[`@mark`](/python/api/howto/naming-and-scoping#scope-roots-with-mark) decorator.

## Using glyphs as chart marks

Build the glyph from shapes whose channels reference data **fields**, then pass
it to `.mark()`. Each shape's field channel resolves per row, so the glyph is
drawn once per data item:

```python
from gofish import chart, scatter, layer, ellipse, rect

def pin():
    return layer([
        ellipse(cx=0, cy=-8, w=16, h=16, fill="color"),
        ellipse(cx=0, cy=-10, w=6, h=6, fill="white"),
        rect(cx=0, cy=0, w=3, h=10, fill="color"),
    ])

locations = [
    {"id": "A", "x": 50, "y": 150, "color": "tomato"},
    {"id": "B", "x": 150, "y": 80, "color": "steelblue"},
    {"id": "C", "x": 280, "y": 120, "color": "seagreen"},
]

chart(locations).flow(scatter(by="id", x="x", y="y")).mark(pin()).render(
    w=350, h=200
)
```

Here `fill="color"` reads each row's `color` field, so every pin picks up its
own color.

::: tip
This differs from the JavaScript `.mark((d) => Pin({ fill: d[0].color }))`
per-datum function form. In Python a `.mark()` callable is the
**mark-as-function** pattern (it receives a data slice and returns a new
`ChartBuilder`), so for ordinary glyphs prefer **field channels** like
`fill="color"` to vary appearance per row.
:::

## Building complex glyphs

You can combine any shapes: rectangles, ellipses, text, and more. Here's a
labeled data point glyph that positions its parts with the `spread` combinator:

```python
from gofish import chart, scatter, spread, ellipse, text

def data_point():
    return spread([
        ellipse(cx=0, cy=0, w=12, h=12, fill="steelblue"),
        text(text="value", fontSize=10),
    ], dir="y", spacing=4, alignment="middle")

points = [
    {"id": 1, "x": 50, "y": 40, "value": 42},
    {"id": 2, "x": 150, "y": 120, "value": 87},
    {"id": 3, "x": 250, "y": 80, "value": 63},
]

chart(points).flow(scatter(by="id", x="x", y="y")).mark(data_point()).render(
    w=350, h=200
)
```

Passing `text="value"` makes the text read each row's `value` field.

## Summary

| Task              | Approach                                   |
| ----------------- | ------------------------------------------ |
| Compose shapes    | `layer([shape1, shape2, ...])`             |
| Make reusable     | Wrap in a function with parameters         |
| Use in chart      | Pass the glyph to `.mark()`, encode fields |
| Position elements | Use the `spread([...])` combinator         |
