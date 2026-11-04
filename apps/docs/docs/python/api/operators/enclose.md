---
order: 75
---

# enclose

Draws an outline around a set of nodes, under them. The outline is a member of
the [`Shape`](/python/api/shape) family: the padded bounding box
(`Shape.box()`, the default), the smallest ellipse around them
(`Shape.oval()`), the padded members with arc corners (`Shape.fillet()`), or a
smooth region (`Shape.blob()`, `Shape.hull()`, `Shape.spine()`). Like
[`line`](/python/api/marks/line) and [`ribbon`](/python/api/marks/ribbon), it
reads geometry from nodes that are already placed, and it has a combinator form
and a bag form. It also has a flow-step form.

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

# Flow-step form: around each group's subtree.
chart(data).flow(op1, enclose(**options), op2).mark(mark)
```

In the combinator form, a fresh child (a mark or an operator) is laid out the
way [`layer`](/python/api/operators/layer) lays out its children, and the
outline is drawn around it. A `ref(...)` child, or an operand of a
[`.relate()`](/python/api/constraints/relate) callback, is enclosed where it
already is, without being moved.

In the bag form, the members are the refs of the chart's data. A
`flow(group(by=...))` before the mark draws one outline per group, and `fill`,
`stroke` or `padding` may name a field that is constant within each group.

In the flow-step form, `enclose(**options)` sits between two operators in
`.flow(...)`. Each group's subtree is its one fresh child, so the operator
before it lays out the outlined group: a `pack` packs the outline, and an outer
`enclose` hugs it. The paint and `padding` are read once per group, as in the
bag form. The same call is the bag form in `.mark(...)`.

```python
from gofish import Shape, chart, circle, enclose, pack

chart(seafood).flow(
    pack(by="lake", spacing=6),
    enclose(shape=Shape.fillet(), padding=4, fill="none"),
    pack(spacing=2),
).mark(circle(r=12, fill="species")).render(w=420, h=420)
```

```python
# Fresh children: the box is laid out with them.
enclose(
    [spread([circle(**d) for d in planets], dir="x", spacing=50, alignment="middle")],
    padding=20, fill="#252150", stroke="none", shape=Shape.box(rx=16),
)

# Operands of .relate(): a set that holds a and c but not b.
layer([a, b, c]).relate(lambda a, b, c: [
    enclose([a, c], shape=Shape.spine(), avoiding=[b], clearance=6, padding=22),
])
```

A member is read by its shape: a circle is a disc, a `line` is its segments at
its stroke width, and any other node is its bounding box. The outline paints
under the members.

`avoiding` lists the nodes the outline keeps out of, for every shape: a list
of marks (`ref(...)`, a `.relate()` operand), or one `select_all(name)`. The
outline is cut so that it stays `clearance` (by default, the `padding`) from
each of them. A box that avoids nodes is drawn as its cut outline, not as a
rectangle.

A fresh member with no size of its own, such as a `treemap` or a `region`,
fills the space it is given, so there is nothing to hug. Then `enclose` works
the other way round: the outline is the space itself (`Shape.box()`) or the
oval inscribed in it (`Shape.oval()`), and it hands the outline, drawn in by
`padding`, down to the member as the shape to fill. Inside a Voronoi cell of
a [`treemap`](/python/api/operators/treemap), the space is that cell, so
`Shape.box()` draws the cell and `Shape.oval()` the part of the oval inside
it. `Shape.fillet()` and `Shape.blob()` hug the members, so around a member
with no size they are an error that names `Shape.box()` and `Shape.oval()`.

```python
# A Voronoi treemap in a circle: the treemap fills the oval.
chart(country_populations, axes=False, w=480, h=480).flow(
    enclose(shape=Shape.oval, fill="none"),
    treemap(by="continent", size="pop", spacing=5, tile=Tile.voronoi),
    treemap(size="pop", spacing=1, tile=Tile.voronoi),
).mark(region(fill="continent"))
```

## Parameters

::: gofish-ref enclose
:::

`shape` takes a member of the [`Shape`](/python/api/shape) family.
