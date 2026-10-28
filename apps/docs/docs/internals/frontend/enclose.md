---
title: Enclose and the Shape Family
section: Frontend
order: 26
status: stable
covers:
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/oval.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/members.ts
  - packages/gofish-graphics/src/families/shape.ts
---

# `enclose` and the `Shape` family

`enclose` draws an outline around a set of nodes, under them. The outline is a
value of the `Shape` strategy family: the padded bounding box (`Shape.box()`),
the minimum-area enclosing ellipse (`Shape.oval()`), the padded members with
arc corners (`Shape.arcs()`), or a smooth region (`Shape.blob()` and its two
presets, `Shape.hull()` and `Shape.spine()`). This essay explains how the
node is built, how an oval's, a blob's and an arcs outline are computed, and
which decisions and shortcuts the design rests on.
The user-facing reference is [`enclose`](/js/api/operators/enclose) and
[`Shape`](/js/api/shape).

## A relational mark

`enclose` is built with `createRelationalMark`, beside `line` and `ribbon`
(`marks/chart.ts`; see [The Mark Factory](/internals/frontend/mark-factory)).
So it has their forms for free:

- the combinator form `enclose(opts, children)`, over fresh children,
  `ref(...)` children, or the operands of a `.relate()` clause;
- the bag form `chart(selectAll(name)).mark(enclose(opts))`, where a
  `flow(group({ by }))` draws one outline per group and `fill`, `stroke` or
  `padding` may name a field that is constant within the group.

It has one form of its own, the flow step: `enclose(opts)` between two
operators in `.flow(...)`, as in
`.flow(pack({ by: "region" }), enclose(opts), pack())`. Each group's subtree
becomes the one fresh child of a combinator-form enclose, so the operator
above lays out the outlined group. The same call is a bag mark in
`.mark(...)` and a flow step in `.flow(...)`, and only its position tells
them apart. `createRelationalMark` takes `flowStep: true` for `enclose`
alone: the bag mark it returns also carries a step (`withFlowStep`,
`marks/compose.ts`), which `.flow()` and `compose()` take in place of the
value when they expand their arguments (`expandComposedOperator`). The step
wraps the inner mark's result and reads the group's paint and `padding` with
the same `resolveGroupPaint` the bag form uses. On the wire it is an
operator, `{ type: "enclose", ...opts }` (`OPERATORS.enclose`, which shares
its fields with the mark), and the deserializer builds it with the same
`enclose` factory, so Python's `enclose(**opts)` needs no other channel: it
returns a `_FlowStepMark`, whose IR is the same in both positions. A
modifier (`.name()`, `.label()`, `.zOrder()`, `.translate()`) keeps the step
in both languages, and applies to each group's outline: `.label("region")`
labels each contour. On the wire the step then carries the mark's `name` and
`zOrder` too (the descriptor's `base` fields).

`padding` is a raw channel (`ch.raw("number")` in the descriptor table): a
number, or a field name or accessor read once per group and used as pixels.
`resolveGroupPaint` passes a raw channel's value through as it is, where it
maps a color channel through the color scale. `encloseNode` then checks that
`padding` is a finite number at least 0, so a field that names no column, or
holds no number, is an error naming `padding`.

`createRelationalMark` hands `produce` the members, and `encloseNode`
(`graphicalOperators/enclose.tsx`) builds the node. Its children are the
members followed by one fresh ref per avoided node. An avoided ref draws
nothing; it is a child only so that it is resolved and laid out like any ref,
which gives its box in the enclosure's frame. Only the members count toward
the enclosure's own box.

Layout places a fresh member the way `layer` places a child
(`placeUnplacedChild`), and leaves a ref where its target is. The box shape
uses the union of the members' boxes grown by `padding`. An oval or a
blob computes its outline in the same pass, in the frame the children's boxes
were read in, and the node's box is the outline's box. The outline is also
the node's geometry, stroke included: an enclose over fresh children answers
`outline` with its loops, thinned to the tolerance asked for
(`simplifyRing`), and `enclosingCircle` with the smallest circle around the
loops (`ringsEnclosingCircle`, which `polygon` uses too) grown by half the
stroke. So a `pack` that holds it packs the outline, and an
outer `enclose` hugs it. A box shape's outline is its padded box, so its
geometry is that box alone, and a `pack` packs the circle around the box. Both are kept in `renderData`, and
`lower` maps them through `local` (the node's translate and y direction) and
`toPixel`. A blob is one SVG `path` over all its loops. Its outer loops and
its holes wind opposite ways, so the default nonzero fill rule leaves the
holes open, with no change to the display list.

In the claim walk, an outline whose members are all refs is placed from
them, as a label beside a ref is (`GoFishNode.placedFromRefs`; see
[Overview](/internals/layout/passes)). Its claim in the layer that holds it is
its members' boxes, each where `placementIn` lands it there, grown by
`padding` and by half its stroke, which is drawn centered on the outline
(`GoFishNode.strokeOverhang`). It takes that room and is dressing: it is no part of the plot, so a
chart with a size of its own keeps its plot that size and the outline adds
around it, and its members never move for it. The box is exact for
`Shape.box()`, and a blob lies inside it. An oval can reach past it, and that
reach is ink. Where the claim walk cannot place a member (it is in a
coordinate space, or under a node with a size of its own), the whole outline
is ink. An outline over fresh children has no claim yet: the claim walk
reads no size for it. It should claim its children's union grown by
`padding`, as a part of the plot.

The outline paints under its members. Among a layer's children that is the
default `zBelow` every relational mark gets; as a `.relate()` clause it is
the same default installed by name (see
[Names and Scoping](/internals/core/names-and-scoping)).

## Reading members

`members.ts` reads a placed node as blob geometry through its outlines
(the `outline` geometry query; see
[Layout Calculation](/internals/layout/passes)). It reads them with
`placedOutlines` from the view of the child that the enclosure's layout got
back, so the geometry and the child's `dims` are both in the enclosure's
frame, and it reads each outline by its exact form where it has one:

- An outline that gives an `ellipse` (an `ellipse` node) is a disc. An
  ellipse that is not a circle is the disc of its larger radius, carrying its
  two semi-axes as well. The blob reads only the disc, so it pads the ellipse
  a little more along its short axis (a declared shortcut, below). The oval
  reads the semi-axes and samples the ellipse itself.
- An outline that gives a `box` (a `rect`'s, or the fallback of a node with
  no outline of its own) is its box. The blob measures the distance to it
  exactly, as a rectangle.
- An open outline (a `line`, an `arrow` to the tip of its head) is its
  pieces, each a tube as wide as the stroke `width` the outline carries. A curve is cut into
  pieces that stray at most 0.5 px from it.
- A closed outline that is not `filled` (a `polygon` with fill `"none"`) is
  the pieces of its loop, each a tube as wide as its stroke: a ring. Its
  inside is not ink, so it is not part of the member.
- Any other closed outline, which is filled (a `polygon`, a `ribbon`'s band,
  a rotated `text`'s glyph box), is its bounding box, a declared shortcut
  (below).

The blob needs these exact forms. A disc is one Delaunay site and links to
its neighbors by its radius, and a stroke is a tube of its width. A disc read
as its sampled edges would be many sites with no width, which changes every
blob around circles. The `Enclose/Members` stories show one blob per kind.

This reader is internal. There is no `members` option and no public geometry
protocol for it yet.

## How an oval is built

`oval.ts` is pure geometry too: `ovalOutline(members, padding)` returns
one loop.

1. **Discs.** Each member grown by `padding` is held by the convex hull of
   a few discs: a disc grown by `padding`; a box's four corners, each a disc
   of radius `padding`; a segment's two ends, each a disc of half its width
   plus `padding`; an ellipse that is not a circle, the vertices of the
   64-gon drawn around it, each a disc of radius `padding`. For a disc, a
   box and a segment the hull is the padded member itself, so an ellipse
   holds the member exactly when it holds these discs. An ellipse grown by
   `padding` is not an ellipse (its ends are blunter), and its hull of discs
   is a little larger than it: by at most 0.12% of the ellipse's radius,
   plus the 24-gons' 0.86% of `padding` (step 2).
2. **Samples.** Each disc is sampled as the 24-gon drawn around it (its
   vertices at `r / cos(π / 24)`), so the samples' convex hull holds every
   padded member. Only that hull goes on.
3. **Khachiyan's algorithm.** It finds the minimum-area ellipse around the
   hull's points to a tolerance of 1e-4, after moving the points to their
   mean so the 3 × 3 system stays well conditioned. Its answer can leave a
   point outside by up to the tolerance, so the ellipse is scaled about its
   center until every point is inside.
4. **Outline.** The loop is the 128-gon drawn around the ellipse (the image
   of the 128-gon around the unit circle), so the path holds the ellipse
   too. The ellipse may be rotated, and the loop is drawn like a blob's: one
   path, through `local` and `toPixel`, so it is right in a y-up frame.

If every sample lies on or within a hair of one line (members with no size
and no padding), the least ellipse is flat and its matrix cannot be
inverted. The hull counts as flat when its area is under 1e-6 of its
extent's diagonal squared, a test with no scale in it; the outline is then
the hull itself, a sliver or a segment, and nothing for a single point. `src/tests/enclose.test.ts` checks
that every padded dot, box and segment of a mixed set is inside the ellipse
and its loop, that points along a diagonal tilt it to 45°, that one member
gives a circle, that members on a line give a thin ellipse with no NaN, that
zero-size members a hair off one line give their hull with no NaN, and
that the three penguin species take well under 100 ms.

The ellipse is computed from the members, not fit to their bounding box.
Fitting was prototyped while the shape was being designed: an ellipse
inscribed in the padded box clips the members near its corners, and one
circumscribed through the corners (TikZ's `fit`) is √2 times the box on each
axis, so it balloons well past the members and over a chart's axes. Only the
minimum-area ellipse both holds the members and stays close to them. Using
any mark as the outline is left to #1167.

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
   changes which links there are. The tree's candidates are the Delaunay
   edges, plus, for a segment member, every other member, since its closest
   point may lie anywhere along it. Those pairs join the queue a distance
   band at a time (touching pairs, then 16 px, doubling), found through a
   grid over the members, and only while the set is in more than one piece,
   so a 1,000-point line does not pair every segment with every member. Each
   keeps the place in the order it would have had in the full list, so the
   tree is the same.
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

## How arcs are built

`arcs.ts` builds `Shape.arcs({ radius })`, the bubble treemap contour of
Görtler et al. (2018). The region is the morphological closing, by a disc of
`radius`, of the members grown by `padding`, with holes filled. Each member
is grown by padding + radius into a convex shape bounded by arcs and lines (a
disc, a capsule for a segment, a rounded box for a box): the blob's own
primitive for it (`grownPrim`), whose signed distance (`primD`) is the cover
test, with its boundary as exact edges. The union's boundary
is traced exactly, by cutting every edge where another shape's edge crosses
it (each crossing solved once for the pair) and keeping the parts no other
shape covers. Only the outer loops are kept.
That boundary is then shrunk by radius: arcs keep their centers, lines move
inward, and each corner becomes an arc of `radius`. Where the shrunk boundary
crosses itself, only the points a full radius from the union's boundary are
kept, and the cut points are found by bisection on the exact curves. Every
output point lies on the exact curve.

At radius 0 the outline is the padded union, and as radius grows it nears
the padded convex hull. Two members join when the disc cannot pass between
them: two discs of radius a whose padded edges are g apart join only when
2·a·radius ≥ a·g + g²/4, and two flat members join when g < 2·radius. The
default radius is 12. Holes are always filled, as the paper's contours have
none, so `Shape.arcs` has no `holes` option. `src/tests/enclose.test.ts`
checks these, and checks the outline against an independent version of the
paper's construction on packed discs.

## The `Shape` family

`families/shape.ts` is a strategy family like `Curve` or `Overlap`. Each
member returns a plain object, `{ kind, ...params }`. `Shape.oval()` has
no params: the minimum-area ellipse is one fixed construction, and `padding`
and the paint are already on `enclose`. `Shape.hull()` and
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
- `Shape.oval()` is the minimum-area enclosing ellipse, not a mark drawn
  in the bounding box (see above). No `curve` option, no plot-area rule.
- The flow step and the bag mark are one call, `enclose(opts)`, told apart
  by position: in `.flow(...)` it wraps each group's subtree, in `.mark(...)`
  it outlines each group of refs. An enclose over fresh children is a layout
  node whose geometry is its outline (#1221).
- `padding` may be a field, read once per group in pixels, as `fill` and
  `stroke` are, in the flow step and the bag form alike.
- `Shape.arcs({ radius })` always fills holes.
- `avoiding` takes a list of nodes or refs, or one `selectAll(name)` as the
  whole value, in JS as on the wire (`NodeSelectionIR`): a single ref and a
  `selectAll` inside a list are errors. A listed node that is also a member
  is ignored, so the user never computes a set difference. The value is read
  into fresh refs by `avoidedRefs` (`ast/nodeRefs.ts`), which `.label()`'s
  `avoiding` shares (see [Labels](/internals/frontend/labels)).
- `neck` is above 0 and at most 1. At 0 a link would have no width: its two
  pulled-in sides meet, the crossing check gives the pull back, and the
  outline comes out fuller than at a small `neck`. Any value above 0 is
  honored as asked (there is no hidden floor).

Shortcuts, each a known approximation:

- In a blob, an ellipse that is not a circle is read as its enclosing
  circle (its larger radius), so it gets a little more padding along its
  short axis. The oval samples the ellipse itself.
- A curved `line` piece (a Bezier segment) is cut into straight segments
  that stray at most 0.5 px from it.
- A filled closed outline with no exact form (a polygon, a ribbon's band) is
  read as its bounding box, so the blob hugs the box, not the shape. Reading it
  as its edges at no width hugs the shape, but only through hole filling:
  with `holes: true` a large polygon's inside stays a hole, and an avoided
  polygon keeps out only a band along its edges. The fix is a filled-ring
  member kind in `blob.ts` (#1207).
- A segment member keeps its own padding band at every `convexity`: a filled
  triangle's side along a member edge is that edge's band, and only the
  enclosure's own links thin under `neck`.
- An avoided segment's keep-out is routed as a capsule polygon whose ends are
  plain corners, not snapped to arcs.
- There is no `members` option and no list-taking `resolve` yet; members are
  the children or the refs of the chart's data.
