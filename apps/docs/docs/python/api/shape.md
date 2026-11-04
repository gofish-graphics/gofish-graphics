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
            shape=Shape.spine(),
            avoiding=[b],
            clearance=6,
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
Shape.oval()
Shape.fillet(radius=None, neck=None, holes=None)
Shape.blob(convexity=None, connection=None, neck=None, holes=None, separate=None)
Shape.hull(convexity=None, connection=None, neck=None, holes=None, separate=None)
Shape.spine(convexity=None, connection=None, neck=None, holes=None, separate=None)
```

Every member is a function call. Each returns a plain dict,
`{"kind": ..., **params}`, for example `{"kind": "box", "rx": 16, "ry": 16}`.
`Shape.hull()` and `Shape.spine()` are `Shape.blob()` with some params preset, so
their dicts have kind `"blob"`: `Shape.hull(**opts)` is
`Shape.blob(convexity=1, neck=1, **opts)`, and `Shape.spine(**opts)` is
`Shape.blob(convexity=0, **opts)`. Any option overrides the preset. The nodes an
outline keeps out of are `enclose`'s `avoiding`, not a shape option, so every
shape avoids them.

The family is also a module of its own:

```python
from gofish import Shape
from gofish.shape import hull  # the same function as Shape.hull
```

## Members

| Member           | Is exactly                                | What it draws                                                   |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `Shape.box()`    | its own kind                              | The members' bounding box, grown by `padding`, rounded corners. |
| `Shape.oval()`   | its own kind                              | The smallest-area ellipse around the padded members.            |
| `Shape.fillet()` | its own kind                              | The padded members, with every concave corner an arc.           |
| `Shape.blob()`   | the general region                        | Members, links between them and filled gaps, smoothed.          |
| `Shape.hull()`   | `Shape.blob(convexity=1, neck=1, **opts)` | The padded convex hull, rounded.                                |
| `Shape.spine()`  | `Shape.blob(convexity=0, **opts)`         | A tree of tubes that links the members, and nothing else.       |

`Shape.box()` is the default. A blob is a union of discs, tubes and triangles,
so no blob setting draws a box.

## `Shape.box()`

::: gofish-ref Shape.box
:::

## `Shape.oval()`

::: gofish-ref Shape.oval
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
    shape=Shape.oval(),
    padding=10,
    fill="#4c78a8",
    fill_opacity=0.15,
    stroke="#1f3b63",
).render(w=260, h=160)
```

## `Shape.fillet()`

::: gofish-ref Shape.fillet
:::

The outline is the members grown by `padding`, closed by a disc of `radius`:
every gap the disc cannot pass through is filled, and every concave corner is a
circular arc of `radius`. At radius 0 it is the padded members' union, and a
large radius nears the padded convex hull. Two pieces nearer than
`2 · radius` are joined by a link `neck` times as wide as the padded members it
joins, and each piece is closed on its own; `neck=0` draws no links. Holes
are filled unless `holes` is true. Around
circles, the outline is made of circular arcs only, which is the contour of a
bubble treemap (Görtler et al. 2018). Two discs of radius `a` whose padded edges
are `g` apart join only when `2 · a · radius ≥ a · g + g² / 4`.

```python
from gofish import Shape, circle, enclose, pack

enclose(
    [pack([circle(r=r, fill="#f2c14e") for r in (30, 18, 22, 10, 14, 8)], spacing=6)],
    shape=Shape.fillet(radius=12),
    padding=6,
    fill="#f2c14e",
    fill_opacity=0.25,
    stroke="#333",
).render(w=220, h=220)
```

## `Shape.blob()`

::: gofish-ref Shape.blob
:::

A blob is built in the enclosure's pixels, in these steps:

- Each member is grown by `padding` (a circle is a disc, a `line` is a tube
  along its segments, and any other node is its bounding box).
- The members are joined by a tree of links, the strongest first. A link
  whose padded members touch is always kept; `connection` is the share of the
  others that are kept, so below 1 the members split into pieces.
- Each piece's links are tubes that taper from one member to the other,
  `neck` times as wide as the members they join, and routed around the
  avoided nodes. The padded members and the tubes are the piece's spine.
- Each gap between the spine and the piece's padded convex hull is filled,
  from its walls out, to `convexity` of its area. Between 1 and 2 the hull
  is blended toward the oval.
- The outline is smoothed, then moved out just enough to hold every padded
  member again.

Each avoided node, grown by `clearance`, is cut out of the outline. With
`separate=True`, each piece is also cut by the set's other pieces, so two
pieces stay `clearance` apart; with `separate=False`, pieces may overlap, and
a piece wholly inside another is dropped. Holes are filled unless `holes` is
true; a blob keeps a hole only where its members close a loop. The
[Enclose](/internals/frontend/enclose) essay describes the construction.

## `Shape.hull()`

::: gofish-ref Shape.hull
:::

## `Shape.spine()`

::: gofish-ref Shape.spine
:::
