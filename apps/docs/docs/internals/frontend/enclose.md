---
title: Enclose and the Shape Family
section: Frontend
order: 26
status: stable
covers:
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/members.ts
  - packages/gofish-graphics/src/families/shape.ts
---

# `enclose` and the `Shape` family

`enclose` draws an outline around a set of nodes, under them. The outline is a
value of the `Shape` strategy family: the padded bounding box (`Shape.box()`)
or a smooth region (`Shape.blob()` and its two presets, `Shape.hull()` and
`Shape.spine()`). This essay explains how the node is built, how a blob's
outline is computed, and which decisions and shortcuts the design rests on.
The user-facing reference is [`enclose`](/js/api/operators/enclose) and
[`Shape`](/js/api/shape).

## A relational mark

`enclose` is built with `createRelationalMark`, beside `line` and `ribbon`
(`marks/chart.ts`; see [The Mark Factory](/internals/frontend/mark-factory)).
So it has their forms for free:

- the combinator form `enclose(opts, children)`, over fresh children,
  `ref(...)` children, or the operands of a `.relate()` clause;
- the bag form `chart(selectAll(name)).mark(enclose(opts))`, where a
  `flow(group({ by }))` draws one outline per group and `fill` or `stroke`
  may name a field that is constant within the group.

`createRelationalMark` hands `produce` the members, and `encloseNode`
(`graphicalOperators/enclose.tsx`) builds the node. Its children are the
members followed by one fresh ref per avoided node. An avoided ref draws
nothing; it is a child only so that it is resolved and laid out like any ref,
which gives its box in the enclosure's frame. Only the members count toward
the enclosure's own box.

Layout places a fresh member the way `layer` places a child
(`placeUnplacedChild`), and leaves a ref where its target is. The box shape
uses the union of the members' boxes grown by `padding`. A blob computes its
outline in the same pass, in the frame the children's boxes were read in, and
the node's box is the outline's box. Both are kept in `renderData`, and
`lower` maps them through `local` (the node's translate and y direction) and
`toPixel`. A blob is one SVG `path` over all its loops. Its outer loops and
its holes wind opposite ways, so the default nonzero fill rule leaves the
holes open, with no change to the display list.

The outline paints under its members. Among a layer's children that is the
default `zBelow` every relational mark gets; as a `.relate()` clause it is
the same default installed by name (see
[Names and Scoping](/internals/core/names-and-scoping)).

## Reading members

`members.ts` reads a placed node as blob geometry, in the enclosure's frame:

- A circle (a node of type `ellipse` with equal sides) is a disc.
- A `line` is its segments, each a tube as wide as its stroke. The connector
  records its stroke width in `renderData.centerline`; a `ribbon`, whose
  paths are a band's outline, does not, so it is read as a box.
- Anything else is its bounding box, with an exact distance to a rectangle.

This reader is internal. There is no `members` option and no public geometry
protocol for it yet.

## How a blob is built

`blob.ts` is pure geometry: `blobOutline(members, opts)` returns the outline's
loops. It runs in screen pixels, after layout, so it works the same way
under any coordinate transform.

1. **Sites and triangles.** Each member contributes its sites: a disc its
   center, a segment its two ends. The sites are triangulated (Delaunay, by
   `d3-delaunay`).
2. **Convexity as a share of the hull.** The triangles are taken in order of
   circumradius, the radius of their empty circle, which is how wide a gap
   the triangle spans. A triangle is filled when the midpoint of its area,
   along the running total, is within `convexity` of the hull's area.
   Triangles with the same circumradius count together. So 0 fills nothing
   (the spine), 1 fills every triangle (the hull), and the filled share
   follows `convexity` to within one triangle, at any chart size.
3. **Links.** The links are the edges of the filled triangles, plus the
   minimum spanning tree over the members, so the set is always one piece. A
   tree link runs between the closest points of two members, so members that
   touch join at no cost. It is routed around the avoided nodes: a visibility
   graph over their keep-out polygons, searched with A\*, then snapped onto
   the keep-out circles, so a route is straight lines tangent to the circles
   and arcs of them. Every link is chosen at full width, so `neck` never
   changes which links there are.
4. **Region.** The pieces are each member grown by `padding`, each link as a
   tube that tapers from the bulge at one end to the bulge at the other (the
   convex hull of the two end discs, a tapered capsule with a closed-form
   distance; with equal ends it is the plain capsule), and the filled
   triangles. A routed link tapers along its length, and an arc of it around
   an avoided node keeps the larger of its two ends' half-widths. A link is
   routed at its larger half-width, so the narrower part keeps more than the
   clearance.
   Each avoided node grown by `clearance` is a keep-out zone. The region is
   the union of the pieces minus the union of the zones.
5. **Exact trace.** Every piece and zone has a closed-form signed distance (a
   disc, a capsule, a box, a triangle, or a tube bent around an arc). A
   quadtree over a 1 px grid keeps, per cell, only the primitives that can be
   nearest there, marching squares joins the cells the outline crosses into
   loops, and each crossing is found to a ten-thousandth of a pixel. Each
   traced point records the circle it lies on, if any, and whether it is on a
   member's bulge.
6. **Holes.** With `holes: false` (the default, as in PostGIS and Shapely),
   every hole of the traced region is filled, and the keep-out zones it held
   are traced again on their own and put back as holes. So an avoided node
   inside the set is always exactly its clearance circle. A hole made only of
   keep-out circles stays as it is.
7. **Neck.** Every outline point not on a member's bulge moves inward by
   `1 - neck` times the region's half-width there (the largest disc inside the
   region that touches the outline at that point, capped at the link's own
   half-width), along its own piece's normal. Where two pieces meet in a
   corner the moved sides are carried on until they meet, so the pull never
   rounds anything. A point that would move into a bulge stops on its edge.
   Small knots where the pull changes quickly are cut out, and where two
   parts of the outline would still cross, the pull is halved near that
   crossing only.
8. **Roundness.** The outline is smoothed along its own length by a Gaussian
   of width `roundness / 2`. Smoothing pulls a circle of radius _r_ inward by
   a known factor, so each point on a circle is first moved out by that
   factor: circles and straight sides come back where they were, and only
   corners round. Inlets narrower than 1.5 σ are closed first, and points near
   a keep-out zone are pushed out by a smooth maximum, so the outline never
   enters a zone. Rounding is capped at the smallest circle in the region. If
   two loops would cross, σ is narrowed by bisection until they do not.

`convexity` alone decides which gaps fill, so it decides the pieces and the
holes. `roundness` changes only curvature and `neck` only how far the outline
pulls in; neither changes the pieces or the holes. `src/tests/enclose.test.ts`
checks this over sweeps of both on two point sets, and checks that the hull
preset is within half a pixel of the true padded convex hull.

## The `Shape` family

`families/shape.ts` is a strategy family like `Curve` or `Overlap`. Each
member returns a plain object, `{ kind, ...params }`. `Shape.hull()` and
`Shape.spine()` are presets of `Shape.blob()`, declared in the `STRATEGIES`
table the way `sina()` and `jitter()` are presets of `noise()`, so they make
kind `"blob"`. The wire form is the same object, except a blob's `avoiding`,
which holds nodes in JavaScript and their references on the wire
(`NodeSelectionIR`; see [Frontend IR](/internals/frontend/serialization)).

## Decisions and declared shortcuts

Settled:

- One construct, `enclose`. The old `background` alias is deleted, and the
  corner radii moved from `enclose` to `Shape.box({ rx, ry })`.
- `padding` and the paint stay on `enclose`; the shape's own options stay on
  the shape.
- No `Shape.ellipse`, no `curve` option, no plot-area rule.
- `avoiding` takes nodes or a `selectAll(name)` selection, and a listed node
  that is also a member is ignored, so the user never computes a set
  difference.

Shortcuts, each a known approximation:

- An ellipse that is not a circle is read as its enclosing circle (its larger
  radius), so it gets a little more padding along its short axis.
- A curved `line` piece (a Bezier segment) is cut into 8 straight segments.
- A segment member keeps its own padding band at every `convexity`: a filled
  triangle's side along a member edge is that edge's band, and only the
  enclosure's own links thin under `neck`.
- An avoided segment's keep-out is routed as a capsule polygon whose ends are
  plain corners, not snapped to arcs.
- There is no `members` option and no list-taking `resolve` yet; members are
  the children or the refs of the chart's data.
- The paths of a `line` member are assumed to share the axis order of its
  placed box; this has only been exercised in canvas-oriented frames.
