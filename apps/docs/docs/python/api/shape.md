---
title: Shape
---

# Shape

The `Shape` family holds the outlines [`enclose`](/python/api/operators/enclose)
draws around its members. A shape is the value of the `shape` option of
`enclose`. The padding and the paint stay on `enclose`.

```python
from gofish import Shape, circle, enclose, layer, spread

(
    layer([
        spread(
            [
                circle(r=5, fill="#111").name("a"),
                circle(r=5, fill="#111").name("b"),
                circle(r=5, fill="#111").name("c"),
            ],
            dir="x",
            spacing=95,
            alignment="middle",
        )
    ])
    .relate(lambda a, b, c: [
        enclose(
            [a, c],
            shape=Shape.spine(avoiding=[b], clearance=6),
            padding=22,
            fill="#ff2400",
            fill_opacity=0.3,
        )
    ])
    .render(w=380, h=150)
)
```

## Signature

```python
Shape.box(rx=None, ry=None)
Shape.ellipse()
Shape.blob(convexity=None, holes=None, roundness=None, neck=None, avoiding=None, clearance=None)
Shape.hull(convexity=None, holes=None, roundness=None, neck=None, avoiding=None, clearance=None)
Shape.spine(convexity=None, holes=None, roundness=None, neck=None, avoiding=None, clearance=None)
```

Every member is a function call. Each returns a plain dict,
`{"kind": ..., **params}`, for example `{"kind": "box", "rx": 16, "ry": 16}`.
`Shape.hull()` and `Shape.spine()` are `Shape.blob()` with some params preset, so
their dicts have kind `"blob"`: `Shape.hull(**opts)` is
`Shape.blob(convexity=1, neck=1, **opts)`, and `Shape.spine(**opts)` is
`Shape.blob(convexity=0, **opts)`. Any option overrides the preset. `avoiding`
holds marks (`ref(...)`, `select_all(...)`, a `.relate()` operand); the chart
carries their references.

The family is also a module of its own:

```python
from gofish import Shape
from gofish.shape import hull  # the same function as Shape.hull
```

## Members

| Member            | Is exactly                                | What it draws                                                   |
| ----------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `Shape.box()`     | its own kind                              | The members' bounding box, grown by `padding`, rounded corners. |
| `Shape.ellipse()` | its own kind                              | The smallest-area ellipse around the padded members.            |
| `Shape.blob()`    | the general region                        | Members, links between them and filled gaps, rounded.           |
| `Shape.hull()`    | `Shape.blob(convexity=1, neck=1, **opts)` | The padded convex hull, rounded.                                |
| `Shape.spine()`   | `Shape.blob(convexity=0, **opts)`         | A tree of tubes that links the members, and nothing else.       |

`Shape.box()` is the default. A blob is a union of discs, tubes and triangles,
so no blob setting draws a box.

## `Shape.box()`

::: gofish-ref Shape.box
:::

## `Shape.ellipse()`

::: gofish-ref Shape.ellipse
:::

The ellipse holds every member grown by `padding` (a circle is a disc, a
`line` is a tube along its segments, and any other node is its bounding box),
and of all such ellipses it has the least area. It is not fit to the
bounding box, so it may be rotated: it follows the members, not the axes. A
single member gives a circle.

```python
from gofish import Shape, circle, enclose, layer, position

enclose(
    [
        layer([
            position([circle(r=6, fill="#4c78a8")], x=10, y=10),
            position([circle(r=9, fill="#4c78a8")], x=60, y=30),
            position([circle(r=6, fill="#4c78a8")], x=110, y=70),
            position([circle(r=12, fill="#4c78a8")], x=170, y=90),
        ])
    ],
    shape=Shape.ellipse(),
    padding=10,
    fill="#4c78a8",
    fill_opacity=0.15,
    stroke="#1f3b63",
).render(w=260, h=160)
```

## `Shape.blob()`

::: gofish-ref Shape.blob
:::

A blob is built from these pieces, in the enclosure's pixels:

- each member grown by `padding` (a circle is a disc, a `line` is a tube along
  its segments, and any other node is its bounding box);
- the links of the shortest tree that joins the members, as tubes that taper
  from one member's bulge to the other's, routed around the avoided nodes;
- the Delaunay triangles of the members' points, filled from the smallest gap
  up, until they hold `convexity` of the convex hull's area.

Each avoided node, grown by `clearance`, is cut out of the union. The outline
of the rest is traced exactly, pulled in by `neck` between members, and
rounded by `roundness`. `convexity` alone decides which gaps fill, so it
decides the pieces and the holes; `roundness` and `neck` never change them.
The [Enclose](/internals/frontend/enclose) essay describes the construction.

## `Shape.hull()`

::: gofish-ref Shape.hull
:::

## `Shape.spine()`

::: gofish-ref Shape.spine
:::
