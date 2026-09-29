---
title: "Shape Geometry Beyond Boxes: Dodge, Pack, and Richer Layouts"
section: Speculative Notes
order: 64
status: speculative
---

# Shape geometry beyond boxes

> **Status: design proposal (2026-09-29).** Nothing here is implemented. It grew out of the
> LLM benchmark pilot ([#955](https://github.com/gofish-graphics/gofish-graphics/issues/955)),
> where GoFish was the only library without a `dodge` (beeswarm) layout, and out of the
> earlier survey of foreign layouts (`notes/design/modular-layout-algorithms.md`, §2.3 on
> circle packing). It builds on the silhouette note (`notes/design/silhouette-interface.md`,
> [#784](https://github.com/gofish-graphics/gofish-graphics/pull/784)), which covers a
> different half of the same problem. Surface syntax is sketched but not proposed for
> sign-off.

## 1. The question

Every node in the layout engine reports an axis-aligned bounding box (AABB), and nothing
else. A parent reads a child only through `Placeable.dims` and `localAnchor`
(`_node.ts`). This is enough for spread, stack, scatter, and treemap, because those only
separate boxes. It is not enough for several layouts we want next:

- **Dodge (beeswarm)** needs each mark as a circle. Two dots of radius 3 whose x positions
  differ by 4 pixels must sit about 4.5 pixels apart in y, not 6.
- **Circle packing** needs each child's enclosing circle, and produces a new enclosing
  circle for its parent.
- **Tidy trees** need the left and right contour of each subtree.
- **Label placement** strategies need either a boundary curve or a pixel occupancy bitmap.
- **Pretty printing** needs a box with an odd last line, which is a union of two or three
  boxes.
- **Edge routing** would like a connector to end on a circle's boundary, not on its box.

Today a circle is `Ellipse({w: 2r, h: 2r})` and reports only its box. Its exact shape
appears only at lowering, as an `EllipseItem`. A polygon keeps its whole ring in a closure
at layout time but reports only the ring's extent. So the exact data already exists during
layout, and nothing exposes it.

The naive fix is to derive every richer form from the box, e.g. the circle that encloses
the box. That is wrong for the shapes that need it most. A circle's enclosing circle is
itself, not a circle 41% larger. So a shape must be able to override the derivation. At
the same time we do not want to compute or store any of these forms unless some layout
asks for them.

## 2. Three kinds of geometry

The list in §1 looks like one problem, "store more representations per node". It is three
problems, and they have different owners and different lifetimes.

**Shape queries.** These are questions about one node's boundary, asked by the operator
that places it. Examples are "what is your enclosing circle" and "where does this ray leave
you". A shape answers exactly when it knows how, and a default answers from the box
otherwise. This is the only kind that needs a new per-node API.

**Subtree summaries.** These are values combined bottom-up through an operator's joins, so
a parent can compose children without looking inside them. A tidy tree's contour and the
pretty printer's (height, max width, last-line width) are both summaries. The silhouette
note already defines them. It gives each summary a combine operation per join, a
projection back to a box, and three laws. Its main integration rule is that a summary
stays inside the operator that declares it and only the projected box leaves. This note
does not change that design.

**Scene indexes.** These are search structures that one run of one layout builds over many
nodes and then throws away. Examples are the interval tree in Plot's dodge, the quadtree in
d3's `forceCollide`, the front chain in d3's `packSiblings`, and the occupancy bitmap in
vega-label. The layout owns the index. No node stores one.

Here is where each item from the original list falls.

| representation              | kind               | built from                         |
| --------------------------- | ------------------ | ---------------------------------- |
| circle, for dodge and pack  | shape query        | the shape's own radius, or its box |
| boundary curve, for labels  | shape query        | the shape's outline, sampled       |
| boundary curve, for routing | shape query        | a ray hit on the outline           |
| pixel occupancy bitmap      | scene index        | boundaries of the obstacle nodes   |
| rotated box                 | neither (see §4.4) | local geometry plus a rotation     |
| union of two or three boxes | subtree summary    | the silhouette note's paragraph    |
| contour for tidy trees      | subtree summary    | the children's boxes               |

This split answers the cost question by construction. Scene indexes exist only while their
layout runs. Summaries exist only inside the operator that declares them. Only shape
queries touch every node, and §4.2 makes them free until someone calls one.

## 3. Related work

I read the source for each of these. The details are in the research log on the PR. This
section keeps what bears on the design.

**Graphics and physics engines.** Engines such as Box2D and Bullet keep two or three forms
per body, and each has a different job.

1. The broad phase keeps a padded AABB per body in a dynamic tree (Box2D's
   `b2DynamicTree`).
2. A complex body such as a triangle mesh keeps its own bounding volume hierarchy (BVH)
   over its parts.
3. The narrow phase uses the exact shape.

In the narrow phase, pairs with a closed form (circle and circle, box and box) use it, and
every other convex pair falls back to GJK. GJK is a general distance algorithm that needs
only the shape's support function, the farthest point in a given direction. Box2D v3
reduces every shape to one proxy, a list of at most 8 points plus a rounding radius. Ray
tracers are smaller still. A user shape in Embree or OptiX supplies two callbacks,
`bounds()` and `intersect()`, and the renderer builds the BVH from the boxes alone. So the
answer to "do they keep many representations at once" is no. They keep a box, an exact
query or two, and indexes that the algorithm builds over the scene.

**tldraw.** `Geometry2d` is an abstract class with two required methods, `getVertices` and
`nearestPoint`. Every other query has a default derived from the vertices, e.g. bounds, hit
tests, distance, intersections, area, and length. `Circle2d` overrides bounds, distance,
and hit tests with closed forms. Results are memoized in private fields, and a geometry
object is immutable, so it never needs invalidation. Geometry lives in the shape's
unrotated local frame. Page bounds are the AABB of the hull vertices after the page
transform. The editor caches geometry per shape and recomputes it only when `props`
changes, so moving or rotating a shape costs nothing. tldraw is an editor that asks the same
questions many times per second, which is why it caches at the editor level.

**Observable Plot `dodge`.** It supports circles only, with a radius per point. For each
point in order, it queries an interval tree for earlier points whose x range overlaps. Each
neighbor j rules out the y interval `Yj ± sqrt(dr² - dx²)`, where `dr = ri + rj + padding`.
It tries every interval endpoint as a candidate, nearest to the anchor first, and keeps the
first one outside all ruled-out intervals. The square root is a ray cast. It finds where a
vertical line at offset dx leaves the circle of radius `ri + rj`, which is the Minkowski sum
of the two circles.

**d3-hierarchy `pack`.** Its only input is a radius per child. `packSiblings` places circles
along a front chain (Wang et al., CHI 2006) and returns the radius of the enclosing circle.
`packEnclose` finds that circle with a randomized Welzl algorithm. So the only geometry an
internal node gives its parent is its enclosing circle. d3-force's `forceCollide` also needs
only a radius, and its quadtree stores the largest radius per cell.

**Tidy trees.** Reingold and Tilford, Walker, and Buchheim et al. keep implicit left and
right contours with threads. van der Ploeg's version for variable node sizes keeps a
staircase of vertical bands. Both need only a box per node. The contour is built by the
algorithm, which makes it a subtree summary.

**Penrose.** `shapeDistance` is a hand-written table of exact kernels per pair of shape
types, e.g. circle and circle, or polygon and polygon. Polygons are split into convex
pieces and compared with a Minkowski signed distance, which is the separating axis test.
Any pair missing from the table falls back to AABB distance and emits a
`BBoxApproximationWarning`, so the approximation is declared, not hidden.

**Haskell diagrams.** Every diagram carries an Envelope and a Trace. The Envelope is a lazy
support function. It combines under union by taking the maximum, and under a transform by
changing the query direction. `beside` uses it to place two diagrams so their separating
lines touch. The Trace returns every point where a ray crosses the boundary, so it gives
exact contact where the envelope is conservative. Both are cached per subtree in the
diagram tree, and a user can replace either one with `withEnvelope`.

**Vega.** Each mark type has a `bound` function. The default one runs the mark's own draw
code against a fake canvas that records extremes, so bounds and drawing share one source.
vega-label builds its occupancy bitmap by drawing the obstacle marks into a canvas, but a
label's anchor mark contributes only its box.

**What recurs.** Four patterns appear in most of these systems.

- A small set of queries, each with a default from a coarse form and a closed form that a
  shape can override (tldraw, Penrose, diagrams, Vega).
- Geometry stored in the shape's local frame, with transforms applied at query time
  (tldraw, diagrams, Box2D).
- A cheap search over boxes first, then the exact test on the pairs it returns (Plot,
  d3-force, Box2D, WebCola).
- Search structures that belong to the algorithm, not to the shapes (every layout above).

## 4. Proposal

### 4.1 One lazy method, `geometry()`, with optional queries

A node gets one new method, `geometry()`. It returns an immutable object in the node's
local layout frame, the same frame as `intrinsicDims`.

```ts
type Circle = { cx: number; cy: number; r: number };

interface Geometry {
  // Always present. Equal to the node's intrinsicDims as a plain box.
  box: Box;
  // Optional queries. A missing query means "derive it from the box".
  enclosingCircle?: () => Circle;
  boundary?: (tolerance: number) => Point[]; // closed outline, sampled
}
```

Consumers never call the optional fields directly. They call helpers that fall back to the
box:

```ts
function enclosingCircle(g: Geometry): Circle {
  return g.enclosingCircle?.() ?? circleAroundBox(g.box);
}
function boundary(g: Geometry, tolerance: number): Point[] {
  return g.boundary?.(tolerance) ?? boxCorners(g.box);
}
```

This is the tldraw pattern without a class hierarchy. A shape supplies a query when it has
a better answer than the box, and every node answers every query.

**Decided (2026-09-29): one file per query, joined with `extends`.** Each query lives in
its own file under `ast/geometry/`, with its type, its box fallback, and its helper. One
index file lists every query:

```ts
// ast/geometry/enclosingCircle.ts
export interface HasEnclosingCircle {
  enclosingCircle?: () => Circle;
}
export const enclosingCircle = (g: Geometry): Circle =>
  g.enclosingCircle?.() ?? circleAroundBox(g.box);

// ast/geometry/index.ts
export interface Geometry extends HasBox, HasEnclosingCircle {}
```

We rejected declaration merging (`declare module` from the layout that uses a query). The
merge is global, so it gives no real modularity. It also puts the query inside a layout,
and then a shape that implements the query has to import that layout. A typed registry of
query keys would let users add their own queries, and we can move to one if that need
arrives.

A query joins the interface only together with its first consumer. `enclosingCircle` enters
with dodge and pack. `boundary` enters with the first bitmap labeler or hull enclosure. A
ray hit (`rayHit(origin, dir)`) would enter when `connect` learns to end on a circle's
outline. A support function would enter only if some layout needs "extent along an
arbitrary direction". None of the layouts in §1 does.

**One law.** Every answer must lie inside the box. The enclosing circle may extend past the
box, because it encloses the shape, but the shape it describes must lie inside the box.
This is the geometric form of the silhouette note's Law 2. Parents that read only `dims`
stay correct, so every existing operator works unchanged.

### 4.2 Where it is computed, and what it costs when unused

A node definition today is three functions: `resolveUnderlyingSpace`, `layout`, and
`lower`. The proposal adds an optional fourth, `geometry`, next to `lower`:

```ts
new GoFishNode(
  {
    type: "ellipse",
    resolveUnderlyingSpace,
    layout,
    lower,
    geometry: ({ intrinsicDims }) => ({
      box: toBox(intrinsicDims),
      enclosingCircle: () => ({ cx: w / 2, cy: h / 2, r: Math.max(w, h) / 2 }),
    }),
  },
  children
);
```

`GoFishNode.geometry()` calls this function the first time someone asks, stores the result
on the node, and `layout()` clears the stored result, since layout already overwrites
`intrinsicDims`. When no layout asks, the cost is one field that stays undefined. There is
no per-props cache like tldraw's, because GoFish runs layout once per spec and has no
incremental layout yet (see [[incremental-layout]]). If incremental layout arrives, the
geometry memo keys off the same thing the layout memo does.

Shapes that override something:

- **circle** returns itself as its enclosing circle.
- **ellipse** returns the circle of its larger radius. This is exact for the smallest
  enclosing circle of an ellipse. Its boundary is a sampled ellipse.
- **polygon** runs Welzl's algorithm over its ring for the enclosing circle, and returns
  the ring as its boundary.
- **rect** and **text** keep the defaults, which are exact for a box.

### 4.3 Nodes with children

A node with children gets a default geometry built from its children, placed by their
translates.

- `box` is the union, which is what `layer` computes today.
- `enclosingCircle` is the smallest circle around the children's enclosing circles. This
  is d3's `packEnclose`, which we already have through `d3-hierarchy`.
- `boundary` is the list of the children's boundaries. A hull enclosure can override it
  with a single hull.

Pack needs no special case for this reason. The enclosing circle of a pack node is the
smallest circle around its children's circles, which is the default above. So a pack whose
children are packs composes with no extra code. The pack operator may still supply the
circle it already computed, as an optimization.

This default is lazy too. A group computes its enclosing circle only if its parent asks.

### 4.4 Frames, rotation, and coordinate transforms

Geometry is local. A consumer that needs the child in the parent's frame applies the
child's translate, which is the only transform a node has today (`Transform` is translate
plus scale). If rotation is added to `Transform` later, it composes the same way. Under that
design a rotated box is a box in the local frame with a rotation applied, which is how
tldraw handles it, and it needs no new representation. Rotated text today folds its rotated
corners into an AABB (`rotateRelBBox`). With local geometry it could report the rotated
rectangle as its boundary instead, which is what `autoLabelAngle` on the auto-label-angle
branch ([#961](https://github.com/gofish-graphics/gofish-graphics/pull/961)) reconstructs by
hand.

Layout inside a `coord` happens in the data plane, and only a sampled AABB crosses the
transform. Geometry follows the same rule, so a dodge inside a polar chart would dodge in
the data plane. Whether that is right is an open question (§6). A circle in polar
coordinates is drawn as a point with a pixel radius, so its data-plane circle is not the
circle on screen.

### 4.5 The layouts that consume it

Dodge and pack both follow the pattern treemap already uses (`treemap.tsx`). The operator
lays out its children, reads their geometry, runs its algorithm, and places each child with
`place(axis, value, anchor)`. Neither one goes through the placement constraint solver,
because non-overlap between circles is not a difference constraint.

**Dodge.** The x position of each child comes from the scale, as in `scatter`. Dodge
chooses y.

1. Lay out the children and read `enclosingCircle` for each one.
2. Sort by the chosen priority, e.g. data order or largest radius first as in Plot.
3. Build a uniform grid over x with a cell width of twice the largest radius plus the
   padding. This is the broad phase. It is simpler than Plot's interval tree and has the
   same cost when points are spread out, because each query looks at three cells.
4. For each child, collect the ruled-out y intervals from its grid neighbors with Plot's
   formula, pick the first free candidate nearest the anchor, and add the child to the
   grid.
5. Place each child so its enclosing circle's center lands on the chosen point.

For shapes other than circles, this dodges their enclosing circles, which is what Plot
does. A Penrose-style table of exact kernels (circle and box, box and box) is a later
option. If we add one, it should declare its fallback the way Penrose does.

**Pack.** Read each child's enclosing circle and call `packSiblings` from `d3-hierarchy`.
This adds no new algorithm code. Packing scales linearly with the radii, so the size of the
result is linear in the radius scale, and the fit to the available size is a one-unknown
solve of the kind the σ pass already does. The survey (§2.3) calls this linear scaling the
condition a foreign layout must meet to join the engine's sizing. Padding in pixels breaks
the linear scaling. d3 handles this by packing twice, and we would need the same
workaround or a different padding rule.

**Decided (2026-09-29): the first version is a declared shortcut.** Geometry is available
only after layout, which is exact for placement, because pack and swarm read their
children's geometry inside their own `layout()`. It is not enough for sizing. Pack works
bottom up, so to report its size in the space pass it needs its children's enclosing
radii before layout. So the first `circlePack` keeps radii in pixels, does not fit itself
to the available size, and has no padding. It carries a TODO and an issue. The right fix is
a sizing-time form of the query, where a child reports its enclosing radius as a
`Monotonic` in σ next to the width and height it already reports. When every radius comes
from data, R(σ) = R(1) × σ, so the pack's size is linear. When pixel and data radii mix,
the greedy front chain is not even guaranteed to be monotone, and that case needs a
decision.

**Tidy tree.** The input is a box per node, and the contour is a silhouette. So this layout
needs the silhouette note's contour instance, not this note's shape queries.

**Bitmap labels.** The labeler builds a bitmap as a scene index by drawing each obstacle's
`boundary` into it, and uses boxes for the labels themselves. This is vega-label's approach
with `boundary` in place of the draw code. Vega draws the real mark, which we cannot do
during layout, because lowering happens later and depends on the coordinate transform.

## 5. Alternatives considered

**Store every representation on every node, eagerly.** This is simple to read, but it pays
for bitmaps and contours on charts that never use them. It also makes every new shape
implement every form.

**A tagged union per shape, e.g. `{kind: "circle", ...} | {kind: "polygon", ...}`, with a
switch in each query.** This is plain data, easy to print, and the compiler checks each
switch. The cost is that every query must handle every kind, and a new shape must be added
to every switch. The capability object in §4.1 lets a shape answer only what it knows. The
two are close, and if the set of shapes stays small the tagged union is a reasonable choice.

**One universal form, the support function (Haskell diagrams, Box2D).** Its algebra is the
cleanest. The union is a max, padding is a sum, and a transform only changes the query
direction. It does not give dodge what dodge needs. Dodge needs the contact offset along a
fixed line, which is a ray query, and a support function is conservative for that. It also
treats every shape as its convex hull.

**Derive geometry from the draw code at lowering, as Vega does.** This keeps one source of
truth for bounds and drawing. It does not work for GoFish, because layout runs before
lowering, and lowering depends on the coordinate transform.

**tldraw's editor-level geometry cache.** It is built for an editor that asks the same
questions every frame. Our layout runs once, so a memo on the node is enough.

## 6. Open questions

- **Dodge's cross-axis size.** How tall a beeswarm is depends on the pixel spacing of the
  x scale, and the space pass reports one scalar size per axis. This is the gap the survey
  lists in §4 ("scalar-per-axis claim carrier"), and the one the silhouette note calls the
  real remaining pinch. The simplest option is to treat dodge like text, which measures
  itself at the proposed width in a second pass.
- **Which frame to dodge in under a coordinate transform.** The two choices are the data
  plane or the screen.
- **Dodge for shapes other than circles.** The options are the enclosing circle, as in Plot,
  a table of exact kernels, or boxes.
- **Pixel padding in pack.**
- **Leaf sizes for pack.** Pack wants area proportional to the value, which is a
  square-root radius. That depends on data-driven circle radii in pixels on a square-root
  scale ([#851](https://github.com/gofish-graphics/gofish-graphics/issues/851)).
- **Names.** `geometry`, `shape`, and `outline` are all candidates for the method.
  `enclosingCircle` follows d3's `packEnclose` and tldraw's plain naming.
- **Surface syntax.** Precedent to check before proposing anything:
  - Plot's `dodgeY({anchor, padding, r})`.
  - ggbeeswarm's `geom_beeswarm(method, side, priority)`.
  - seaborn's `swarmplot`.
  - d3's `pack().size().padding()`.

  The current leaning (2026-09-29, not signed off) is below.
  - Swarm and jitter are both strategies on `scatter`. They are strategy objects, so
    users can add their own, the way ggplot2 packages add `position_*` functions.
  - The name `dodge` is out, because ggplot2's `position_dodge` means grouped bars.
  - Swarm has no anchor option of its own. Today `scatter` emits
    `Constraint.align(alignment)` on every axis that no data field places
    (`scatter.tsx`). An overlap strategy takes the place of that align on the free axis
    and reads `alignment` as the line it grows from. `"middle"` gives a centered swarm,
    and `"start"`, `"end"`, and `"baseline"` give a swarm on one side. With no strategy,
    every dot sits on the alignment line, which is today's strip plot.
  - The unit violin in `stories/atom/Violin.stories.tsx` becomes
    `spread(pclass) → scatter({ y: "age", alignment: "middle", overlap: swarm() })`. We
    accept that this is not literally the same chain as the binned version, because a
    swarm has to see all of its siblings at once.
  - The circle packing name is open. The two options that stay consistent with earlier
    choices are `pack` with a strategy option, like `treemap`'s `tile`, and a
    verb plus noun such as `packCircles`, which would also mean `binHex`.

  ```ts
  // swarm: x from data, y left free, overlap resolved on y around the middle
  chart(films)
    .flow(
      scatter({
        x: "year",
        alignment: "middle",
        overlap: swarm({ padding: 1 }),
      })
    )
    .mark(circle({ r: 3 }));
  ```

A first slice, if we go ahead, would be:

1. Add `geometry()` with `enclosingCircle` only, plus the overrides for circle, ellipse,
   and polygon, and the default for nodes with children.
2. Add `pack` on `packSiblings`.
3. Add `dodge`.

Each of the three is testable on its own, and the second and third are the first consumers
the first one needs.
