---
title: Enclose and the Shape Family
section: Frontend
order: 26
status: stable
covers:
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/outline.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/prims.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/beyond.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/separate.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/smooth.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/oval.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/enclose/members.ts
  - packages/gofish-graphics/src/ast/geometry/ring.ts
  - packages/gofish-graphics/src/families/shape.ts
---

# `enclose` and the `Shape` family

`enclose` draws an outline around a set of nodes, under them. The outline is a
value of the `Shape` strategy family: the padded bounding box (`Shape.box()`),
the minimum-area enclosing ellipse (`Shape.oval()`), the padded members with
arc corners (`Shape.fillet()`), or a smooth region (`Shape.blob()` and its
two presets, `Shape.hull()` and `Shape.spine()`). Every shape keeps out of the
nodes in `enclose`'s `avoiding`. This essay explains how the node is built,
how an oval's, a blob's and a fillet's outline are computed, and which
decisions and shortcuts the design rests on.
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
alone, and tags the bag mark it returns as one that may stand in
`.flow(...)` (`withFlowStep`, `marks/compose.ts`). Every modifier carries the
tag, as it carries the mark's kind. When `.flow()` and `compose()` expand
their arguments (`expandComposedOperator`), a tagged mark becomes one
generic step (`flowStepOperator`): for each group, it builds the inner node,
gives it the group's rows as its datum when it has none, and applies the
final mark, modifiers and all, to that one node. So the step is the bag form
over one fresh operand, and its paint and `padding` are read off the
operand's rows with the same `resolveGroupPaint`. A `.label("region")` labels
each contour. On the wire the step is the mark's own IR in `operators`
(`LEAF_MARKS.enclose` has `flowStep: true`, which the validator and the JSON
Schema read), and the deserializer hands it to `mapMark`, so Python's
`enclose(**opts)` sends the same IR in both positions. A `.zOrder(fn)`
callback on a step gets the mark's input, the one operand, as the bag form's
gets its refs.

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
uses the union of the members' boxes grown by `padding`. An oval, a fillet
or a blob computes its outline in the same pass, in the frame the children's boxes
were read in, and the node's box is the outline's box. The outline is also
the node's geometry, stroke included: an enclose over fresh children answers
`outline` with its loops, thinned to the tolerance asked for
(`simplifyRing`), and `enclosingCircle` with the smallest circle around the
loops (`ringsEnclosingCircle`, which `polygon` uses too) grown by half the
stroke. So a `pack` that holds it packs the outline, and an
outer `enclose` hugs it. A box shape's outline is its padded box, so its
geometry is that box alone, and a `pack` packs the circle around the box. A
box with nodes in `avoiding` is cut like the other shapes: its outline is the
rounded box as a ring (`roundedBoxRing`), cut by the keep-outs, and it is
drawn as that path, not as a rectangle. Both are kept in `renderData`, and
`lower` maps them through `local` (the node's translate and y direction) and
`toPixel`. A curved outline is one SVG `path` over all its loops. Its outer loops and
its holes wind opposite ways, so the default nonzero fill rule leaves the
holes open, with no change to the display list.

In the claim walk, an outline whose members are all refs is placed from
them, as a label beside a ref is (`GoFishNode.placedFromRefs`; see
[Overview](/internals/layout/passes)). Its claim in the layer that holds it is
its members' boxes, each where `planPlacement` lands it there, grown by
`padding` and by half its stroke, which is drawn centered on the outline
(`GoFishNode.strokeOverhang`). It takes that room and is dressing: it is no part of the plot, so a
chart with a size of its own keeps its plot that size and the outline adds
around it, and its members never move for it. The box is exact for
`Shape.box()`, and a blob lies inside it. An oval can reach past it, and that
reach is ink. Where the claim walk cannot place a member (it is in a
coordinate space, or under a node with a size of its own), the whole outline
is ink. An outline over fresh children, each laid at the outline's origin,
claims their union grown by `padding`, as a part of the plot.

The outline paints under its members. Among a layer's children that is the
default `zBelow` every relational mark gets; as a `.relate()` clause it is
the same default, installed for the clause's operands (see
[Names and Scoping](/internals/core/names-and-scoping)).

## Around a member that fills its space

A fresh member that fills the room it is given on both axes (`fillsItsSpace`,
which reads the claim walk's `fillsRoom`: a `treemap` or a `region` with no size; not a `pack` of sized circles) has nothing to hug: laid
out, it would be as large as whatever it is given. So `enclose` turns the
layout around (`fillingLayout`). The outline comes first, from the space
the enclosure is given: `Shape.box()` is that space, and `Shape.oval()` is
the oval inscribed in its box (`ovalRing`, `geometry/ring.ts`). When the
enclosure's parent handed it a shape, such as a Voronoi cell of a treemap,
the space is that shape, so `Shape.box()` is the cell and `Shape.oval()` is
the oval cut to the cell (`intersectRings`). The outline drawn in by
`padding` (`insetConvex`) is the shape each member is laid out in: its size
is the shape's box and its shape the ring (see
[The shape a parent gives a child](/internals/layout/passes#the-shape-a-parent-gives-a-child)),
so a `treemap` tiles it and a `region` draws it. The enclosure's box is the
whole space it was given, as a member's would have been.

`Shape.fillet()` and `Shape.blob()` are built from the members' outlines, so
around a member with no size they are an error that names `Shape.box()`,
`Shape.oval()`, and giving the member a size. `avoiding` is an error there
too: the outline is the given space, which a cut would leave unfilled. Both outlines here are convex,
which is what `insetConvex` and the Voronoi tiling need.

## Reading members

`members.ts` reads a placed node as outline geometry (`Member`, `prims.ts`)
through its outlines
(the `outline` geometry query; see
[Layout Calculation](/internals/layout/passes)). It reads them with
`placedOutlines` from the view of the child that the enclosure's layout got
back, so the geometry and the child's `dims` are both in the enclosure's
frame, and it reads each outline by its exact form where it has one:

- An outline that gives an `ellipse` (an `ellipse` node) is a disc. An
  ellipse that is not a circle is the disc of its larger radius, carrying its
  two semi-axes as well. The fillet and the blob read only the disc, so they
  pad the ellipse
  a little more along its short axis (a declared shortcut, below). The oval
  reads the semi-axes and samples the ellipse itself.
- An outline that gives a `box` (a `rect`'s with square corners, or the fallback of a node with
  no outline of its own) is its box. The closing measures the distance to it
  exactly, as a rectangle.
- An open outline (a `line`, an `arrow` to the tip of its head) is its
  pieces, each a tube as wide as the stroke `width` the outline carries. A curve is cut into
  pieces that stray at most 0.5 px from it.
- A closed outline that is not `filled` (a `polygon` with fill `"none"`) is
  the pieces of its loop, each a tube as wide as its stroke: a ring. Its
  inside is not ink, so it is not part of the member.
- Any other closed outline, which is filled (a `polygon`, a `ribbon`'s band,
  a `rect` with rounded corners, a rotated `text`'s glyph box), is its bounding box, a declared shortcut
  (below).

The curved outlines need these exact forms. The closing grows a disc, a tube
and a box exactly, and the join tree measures the gap between two members
from their edges. A disc read as its sampled edges would be many members with
no width, which changes every outline around circles. The `Enclose/Members`
stories show one blob per kind.

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

## The exact closing

`arcs.ts` holds the engine the fillet and the blob share: `closingRings(members,
padding, radius, holes)`, the morphological closing, by a disc of `radius`, of
the members grown by `padding`. This is the bubble treemap contour of Görtler
et al. (2018). Each member is grown by padding + radius into a convex shape
bounded by arcs and lines (a disc, a tapered capsule for a segment, a rounded
box for a box): `grownPrim` in `prims.ts`, whose signed distance (`primD`) is
the cover test, with its boundary as exact edges. The union's boundary is
traced exactly, by cutting every edge where another shape's edge crosses it
(each crossing solved once for the pair) and keeping the parts no other shape
covers. That boundary is then shrunk by radius: arcs keep their centers, lines
move inward, and each corner becomes an arc of `radius`. Where the shrunk
boundary crosses itself, only the points a full radius from the union's
boundary are kept, and the cut points are found by bisection on the exact
curves. Every output point lies on the exact curve, sampled at most 0.2 px off
it and at most 4 px apart. With `holes` off, only the outer loops are kept.

At radius 0 the outline is the padded union, and as radius grows it nears the
padded convex hull. Two members join when the disc cannot pass between them:
two discs of radius a whose padded edges are g apart join only when
2·a·radius ≥ a·g + g²/4, and two flat members join when g < 2·radius.
`src/tests/enclose.test.ts` checks these, and checks the outline against an
independent version of the paper's construction on packed discs.

## How a fillet is built

`Shape.fillet({ radius, neck, holes })` is the closing of the padded members
and their links. The links come first (`filletLinks`, `outline.ts`): two
pieces of the padded union nearer than 2 · radius are joined by a link along
the spanning tree of the padded gaps, a tapered tube `neck` times as wide as
the padded members it joins. `neck: 0` draws none. The closing of members and
links together gives the pieces, and each piece is closed again on its own
members (`filletPieces`): where two padded members are near enough for their
discs to overlap but too far apart to join, closing them together leaves a
horn with a cusp at its tip, and closing each piece without the other leaves
none. The fillet is not smoothed. `radius` defaults to `padding`, so an inside
corner is as round as the padding makes an outside one; `neck` to 0.5.

## How a blob is built

`Shape.blob({ convexity, connection, neck, holes, separate })` is built in
`outline.ts` (`blobOutline`), in screen pixels after layout, so it works the
same way under any coordinate transform.

1. **Pieces.** The members' join tree is HDBSCAN's: the minimum spanning tree
   of every pair in mutual reachability, the larger of the pair's distance and
   each member's core distance (to its 4th nearest other member), with the
   pairs whose padding touches taken first. `connection` keeps that share of
   the tree's other links, the strongest first; touching links are always
   kept. The kept links split the members into pieces: 1 (the default) is one
   piece, and 0 joins only members whose padding touches. The pieces change
   only where `connection` crosses a link's entry, so it is discrete. The
   tree is exactly the one over every pair, but it is found without measuring
   most of them (`spanningForest`, by Borůvka on a grid of the members'
   boxes): two boxes' gap is at most the members' gap and their distance, so
   a search around a member stops once nothing farther can come first.
2. **Spine.** Inside each piece, the links run along the spanning tree of the
   padded gaps between that piece's members (the closing's own merge order).
   Each is a tube that tapers from one member's width to the other's, `neck`
   times as wide as the padded members it joins, and bent around the
   keep-outs (`routeAround`). The padded members and the links, closed at
   radius `padding`, are the piece's spine.
3. **Convexity.** Each piece is filled on its own. Between 0 and 1 the fill
   is the per-bay blend (`meshBlend.ts`): every pocket of the padded hull less
   the spine fills `convexity` of its own area. In a pocket with a mouth on
   the hull, a harmonic field u is 0 on the spine and 1 on the mouth, solved
   with finite elements on a constrained Delaunay mesh of the pocket; the
   outline is u's level set at the level that holds that share of the area,
   which is closed form per triangle. On a Delaunay mesh the field has no lake
   and no island at any level. Behind a narrow channel u is exponentially
   small (under 1e-5 between the line and dots of the test below), and a
   pocket's level can sit there, so the area is summed per triangle in a form
   that keeps its digits at any level, and the solve runs to a relative
   residual of 1e-10. At 1
   the fill is the padded hull. Between 1 and 2 the hull is the Minkowski
   combination (2 − c)·H ⊕ (c − 1)·E of the hull, its ends rounded, and the
   `Shape.oval()` outline (`beyond.ts`), so it grows with c and is near the
   oval at 2.
4. **Separate.** With `separate: false` (the default), the pieces may
   overlap, and a piece wholly inside another is dropped. With `separate:
true`, each piece keeps out of the set's other pieces, as of an avoided
   node: their padded members and links grown by padding + clearance, so two
   outlines stay `clearance` apart.
5. **Smoothing.** The outline is smoothed by a Gaussian along its length
   (σ = 6 px), then moved out by the least uniform offset that holds every
   padded member and link again (`smooth.ts`).

A blob keeps a hole only where its members close a loop (a ring of touching
members): the per-bay blend fills each pocket from its walls, so a bay that is
open to the hull stays open at every `convexity` below 1, and is filled at 1.

## Avoiding

Every outline, the box and the oval included (`cutOutline`), is cut last by
its keep-outs: each node in `avoiding` grown by `clearance`, and for a
separate blob piece the set's other pieces. `clearance` defaults to `padding`.
The cut (`separate.ts`, `cutRings`) is one field on a grid over the outline's
box: the outline may be drawn where its own padded members are, or outside
the keep-out region, the union of the keep-out discs closed by a 3 px disc so
that no sliver between two keep-outs survives. The members win over every
keep-out, so the cut never enters a padded member, and the corners it leaves
are rounded inward (`roundCut`). An avoided node is kept out as the disc that
holds it. The cut comes after the smoothing, so neither the smoothing nor its
offset moves the outline back across it. `src/tests/enclose.test.ts` checks
that no outline point is within an avoided node's clearance, and that
separate pieces stay `clearance` apart.

## The `Shape` family

`families/shape.ts` is a strategy family like `Curve` or `Overlap`. Each
member returns a plain object, `{ kind, ...params }`. `Shape.oval()` has
no params: the minimum-area ellipse is one fixed construction, and `padding`
and the paint are already on `enclose`. `Shape.hull()` and
`Shape.spine()` are presets of `Shape.blob()`, declared in the `STRATEGIES`
table the way `sina()` and `jitter()` are presets of `noise()`, so they make
kind `"blob"`. The wire form is the same object. `avoiding` is `enclose`'s, so
a shape holds no nodes: it holds nodes in JavaScript and their references on
the wire (`NodeSelectionIR`; see [Frontend IR](/internals/frontend/serialization)).

## Decisions and declared shortcuts

Settled:

- One construct, `enclose`. The old `background` alias is deleted, and the
  corner radii moved from `enclose` to `Shape.box({ rx, ry })`.
- `padding`, the paint, `avoiding` and `clearance` stay on `enclose`, so every
  shape avoids; the shape's own options stay on the shape.
- One engine for the curved outlines: the fillet and the blob are built on
  the exact closing. The old blob (Delaunay triangles, a traced field,
  `roundness`) and `Shape.arcs` are deleted; `Shape.fillet` is the arcs
  outline, renamed, with links and `holes`.
- `clearance` defaults to `padding`, and is measured outline to outline
  between separate pieces.
- `Shape.oval()` is the minimum-area enclosing ellipse, not a mark drawn
  in the bounding box (see above). No `curve` option, no plot-area rule.
- The flow step and the bag mark are one call, `enclose(opts)`, told apart
  by position: in `.flow(...)` it wraps each group's subtree, in `.mark(...)`
  it outlines each group of refs. An enclose over fresh children is a layout
  node whose geometry is its outline (#1221).
- `padding` may be a field, read once per group in pixels, as `fill` and
  `stroke` are, in the flow step and the bag form alike.
- `avoiding` takes a list of nodes or refs, or one `selectAll(name)` as the
  whole value, in JS as on the wire (`NodeSelectionIR`): a single ref and a
  `selectAll` inside a list are errors. A listed node that is also a member
  is ignored, so the user never computes a set difference. The value is read
  into fresh refs by `avoidedRefs` (`ast/nodeRefs.ts`), which `.label()`'s
  `avoiding` shares (see [Labels](/internals/frontend/labels)).
- A blob's `neck` is above 0 and at most 1: a link of no width would split
  the piece it joins, which is `connection`'s job. A fillet's `neck` is 0 to
  1, and 0 draws no links.

Shortcuts, each a known approximation:

- In a fillet and a blob, an ellipse that is not a circle is read as its
  enclosing circle (its larger radius), so it gets a little more padding along
  its short axis. The oval samples the ellipse itself.
- A curved `line` piece (a Bezier segment) is cut into straight segments
  that stray at most 0.5 px from it.
- A filled closed outline with no exact form (a polygon, a ribbon's band) is
  read as its bounding box, so the outline hugs the box, not the shape (#1207).
- An avoided node is kept out as the disc that holds it, so an avoided box
  keeps out its circumscribed disc.
- The smoothing's keep-ins hold a box member by its four sides, grown by the
  padding.
- A fillet's links appear at full `neck` width once `neck` leaves 0, so the
  outline jumps between 0 and a small `neck`.
- With `holes` on, a fillet at `neck: 0` can leave a horn at a hole's mouth.
- The closing samples its arcs at most 0.2 px off the exact curve; at a
  radius near 12 on loose dots the outline was measured up to 0.46 px off.
- A blob over a 1,000-point line and 300 dots takes about 0.11 s at
  convexity 0 and 0.35 to 0.4 s at 0.5 and 0.9 (in Node),
  against about 0.15 s for the old blob. Most of it is the exact closing of the members and links and the
  blend's mesh of the pockets (about 50,000 vertices there). The work is
  cached only within one call, so changing only the convexity recomputes the
  join tree and the mesh.
- There is no `members` option and no list-taking `resolve` yet; members are
  the children or the refs of the chart's data.
