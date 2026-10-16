---
order: 75
---

# enclose

Draws an outline around a set of nodes, under them. The outline is a member of
the [`Shape`](/python/api/shape) family: the padded bounding box
(`Shape.box()`, the default), the smallest ellipse around them
(`Shape.ellipse()`), or a smooth region (`Shape.blob()`,
`Shape.hull()`, `Shape.spine()`). Like [`line`](/python/api/marks/line) and
[`ribbon`](/python/api/marks/ribbon), it reads geometry from nodes that are
already placed, and it has a combinator form and a bag form.

```python
from gofish import Shape, chart, circle, enclose, group, scatter, select_all

beaks = [d for d in penguins if d["Beak Depth (mm)"] is not None]

(
    chart(beaks, axes=True)
    .flow(scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
    .mark(circle(r=2.5, fill="Species").name("points"))
    .layer(
        chart(select_all("points"))
        .flow(group(by="Species"))
        .mark(enclose(shape=Shape.hull(), padding=6, fill="Species", fill_opacity=0.2))
    )
    .render(w=420, h=320)
)
```

## Signature

```python
# Combinator form: around the given children.
enclose(children, *, padding=None, shape=None, fill=None, stroke=None,
        stroke_width=None, stroke_dasharray=None, opacity=None, fill_opacity=None) -> Mark

# Bag form: around the refs a chart's data holds.
chart(select_all(name)).mark(enclose(**options))
```

In the combinator form, a fresh child (a mark or an operator) is laid out the
way [`layer`](/python/api/operators/layer) lays out its children, and the
outline is drawn around it. A `ref(...)` child, or an operand of a
[`.relate()`](/python/api/constraints/relate) callback, is enclosed where it
already is, without being moved.

In the bag form, the members are the refs of the chart's data. A
`flow(group(by=...))` before the mark draws one outline per group, and `fill`
or `stroke` may name a field that is constant within each group.

```python
# Fresh children: the box is laid out with them.
enclose(
    [spread([circle(**d) for d in planets], dir="x", spacing=50, alignment="middle")],
    padding=20, fill="#252150", stroke="none", shape=Shape.box(rx=16, ry=16),
)

# Operands of .relate(): a set that holds a and c but not b.
layer([a, b, c]).relate(lambda a, b, c: [
    enclose([a, c], shape=Shape.spine(avoiding=[b], clearance=6), padding=22),
])
```

A member is read by its shape: a circle is a disc, a `line` is its segments at
its stroke width, and any other node is its bounding box. The outline paints
under the members.

## Parameters

::: gofish-ref enclose
:::

`shape` takes a member of the [`Shape`](/python/api/shape) family.
