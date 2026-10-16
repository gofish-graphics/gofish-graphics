---
title: Shape
---

# Shape

The `Shape` family holds the outlines [`enclose`](/js/api/operators/enclose)
draws around its members. A shape is the value of the `shape` option of
`enclose`. The padding and the paint stay on `enclose`.

::: gofish

```js
gf.layer([
  gf.spread({ dir: "x", spacing: 95, alignment: "middle" }, [
    gf.circle({ r: 5, fill: "#111" }).name("a"),
    gf.circle({ r: 5, fill: "#111" }).name("b"),
    gf.circle({ r: 5, fill: "#111" }).name("c"),
  ]),
])
  .relate(({ a, b, c }) => [
    gf.enclose(
      {
        shape: gf.Shape.spine({ avoiding: [b], clearance: 6 }),
        padding: 22,
        fill: "#ff2400",
        fillOpacity: 0.3,
      },
      [a, c]
    ),
  ])
  .render(root, { w: 380, h: 150 });
```

:::

## Signature

```ts
Shape.box({ rx?, ry? });
Shape.ellipse();
Shape.blob({ convexity?, holes?, roundness?, neck?, avoiding?, clearance? });
Shape.hull({ convexity?, holes?, roundness?, neck?, avoiding?, clearance? });
Shape.spine({ convexity?, holes?, roundness?, neck?, avoiding?, clearance? });
```

Every member is a function call. Each returns a plain object, `{ kind, ...params }`,
of type `Shape.Shape`, for example `{ kind: "box", rx: 16, ry: 16 }`.
`Shape.hull()` and `Shape.spine()` are `Shape.blob()` with some params preset, so
their objects have kind `"blob"`: `Shape.hull(opts)` is
`Shape.blob({ convexity: 1, neck: 1, ...opts })`, and `Shape.spine(opts)` is
`Shape.blob({ convexity: 0, ...opts })`. Any option overrides the preset. The same
object is the shape's wire form, except `avoiding`, which holds nodes in
JavaScript and their references on the wire.

The family is also a module of its own:

```ts
import { Shape } from "gofish-graphics";
import { hull } from "gofish-graphics/shape"; // the same function as Shape.hull
```

## Members

| Member            | Is exactly                                       | What it draws                                                   |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `Shape.box()`     | its own kind                                     | The members' bounding box, grown by `padding`, rounded corners. |
| `Shape.ellipse()` | its own kind                                     | The smallest-area ellipse around the padded members.            |
| `Shape.blob()`    | the general region                               | Members, links between them and filled gaps, rounded.           |
| `Shape.hull()`    | `Shape.blob({ convexity: 1, neck: 1, ...opts })` | The padded convex hull, rounded.                                |
| `Shape.spine()`   | `Shape.blob({ convexity: 0, ...opts })`          | A tree of tubes that links the members, and nothing else.       |

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

::: gofish

```js
gf.enclose(
  {
    shape: gf.Shape.ellipse(),
    padding: 10,
    fill: "#4c78a8",
    fillOpacity: 0.15,
    stroke: "#1f3b63",
  },
  [
    gf.layer([
      gf.position({ x: 10, y: 10 }, [gf.circle({ r: 6, fill: "#4c78a8" })]),
      gf.position({ x: 60, y: 30 }, [gf.circle({ r: 9, fill: "#4c78a8" })]),
      gf.position({ x: 110, y: 70 }, [gf.circle({ r: 6, fill: "#4c78a8" })]),
      gf.position({ x: 170, y: 90 }, [gf.circle({ r: 12, fill: "#4c78a8" })]),
    ]),
  ]
).render(root, { w: 260, h: 160 });
```

:::

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
