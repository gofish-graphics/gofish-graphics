---
title: Underlying Space
section: Core
order: 10
status: draft
covers:
  - packages/gofish-graphics/src/ast/underlyingSpace.ts
  - packages/gofish-graphics/src/ast/extent.ts
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/alignment.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/channels.ts
  - packages/gofish-graphics/src/ast/data.ts
  - packages/gofish-graphics/src/ast/fieldExpr.ts
  - packages/gofish-graphics/src/ast/datumProjection.ts
  - packages/gofish-graphics/src/ast/schema.ts
  - packages/gofish-graphics/src/ast/calendar.ts
  - packages/gofish-graphics/src/ast/constraints/folds.ts
  - packages/gofish-graphics/src/ast/constraints/proposalPlan.ts
  - packages/gofish-graphics/src/ast/constraints/compose.ts
  - packages/gofish-graphics/src/ast/constraints/distribute.ts
  - packages/gofish-graphics/src/ast/constraints/align.ts
  - packages/gofish-graphics/src/ast/constraints/placementSolver.ts
  - packages/gofish-graphics/src/ast/constraints/differenceGraph.ts
  - packages/gofish-graphics/src/ast/constraints/placementLowering.ts
  - packages/gofish-graphics/src/ast/constraints/placementProgramLowerer.ts
  - packages/gofish-graphics/src/ast/constraints/placementFacts.ts
  - packages/gofish-graphics/src/ast/constraints/position.ts
  - packages/gofish-graphics/src/ast/constraints/nest.ts
  - packages/gofish-graphics/src/ast/constraints/nestPlan.ts
  - packages/gofish-graphics/src/ast/constraints/grid.ts
  - packages/gofish-graphics/src/ast/constraints/bbox.ts
---

# The underlying space tree

Every node in a GoFish scenegraph carries two pieces of information about
each of its two axes (x and y):

- its **type**: the kind of data space the node has established there, and
  for a continuous axis the data interval it covers. A type says what the
  axis _means_. It has no σ in it.
- its **size claim** (an `Extent`): how much room the node's content needs
  on that axis, as Monotonic functions of the scale factor σ. A claim says
  how big the content _is_.

The types form an intermediate representation called the **underlying space
tree**. The claims are computed by a second walk over the same tree, after
every type is known. The types live at `src/ast/underlyingSpace.ts`, and the
claims at `src/ast/extent.ts`. The two walks are `_node.ts`'s
`resolveUnderlyingSpace()` and `resolveExtent()`. Layout, axis rendering,
posScale construction, and ordinal scale building all consume both
afterwards.

This doc explains what the tree is, why it exists, what each space kind
means, and where to look in the code. If you're adding an operator that
introduces or transforms an axis, this is the abstraction you're working
with.

## What and why, in brief

A data-driven graphic maps data space to visual space. Typically data
space is described by a data schema like `{lake: string, count: number}`.
Visual space is typically described using shapes and screen positions
(i.e., SVG or Canvas attributes).

Most of the logic in GoFish lives in between data and visual space, for
example computing scales and performing layout. The underlying space tree
keeps that logic organized. Here are some kinds of things we need to
figure out about a graphic that underlying space helps us answer:

- If we overlay a scatterplot and a line chart in the same region of the
  screen (such as drawing a regression line), what should the axis
  domains be? What about when the two charts have different data spaces
  on one axis (like in a dual axis chart)?
- If we draw a bar chart with vertically centered bars, what is the
  y-axis?
- If we create faceted chart regions, how should those faceted regions
  relate to each other?
- What if an operator arranges shapes in free space, but those objects
  have data-driven sizes that need to be scaled to fit the available
  screen space? (As when using the spread operator.)

In all of these cases, we have some information about data spaces and
their encodings to positions and sizes of shapes. Operators compose this
information together to create more complex relationships between data
and visual space. Underlying space keeps track of this information
explicitly so that we can more easily write algorithms that resolve
scales and draw axes. For example, to resolve scale domains in the case
of the overlaid scatterplot and line chart, we first have to determine
whether the two charts' domains can be merged and then we can merge the
domains. This information is later used to draw axes for the combined
chart. We need to store intermediate results about these domains, and
that's basically the role of the underlying space data structure.

## The one equation, and three roles for one unknown

Every continuous axis is, in the end, one affine map — per **σ-scope** (the
region over which a single scale is shared):

```
px(d) = σ·d + originPx          σ = pixels per data unit
```

`σ` (sigma) is the slope: pixels per unit of data. `originPx` is the pixel of
data 0, the **baseline**: the screen coordinate of the node's local data-0, and
the one position unknown per node and axis. It is kept in pixels, so pixel
overhead before the data (padding or spacing on the low side) is simply part
of where data 0 lands, never a data value divided by σ. The origin state of an
axis is literally the status of `originPx`: **pinned** means something fixes it
(a data anchor, or a scope's box edge plus overhead), **free** means it is a
gauge the parent sets (a free node's local 0 is its baseline, and its parent
translates it), and **none** means there is no data 0, so there is no
`originPx` at all, only differences. Three things that the word "origin"
historically ran together must be kept distinct, because each lives at a
different stage of the pipeline:

- **alignment** is a _constraint_: equations between per-node baselines
  (`baseline_A = baseline_B`, and analogous relations for other anchors). It says
  nothing about pixels; it only records which baselines must agree.
- **the origin state** (`free | pinned | none`) is the _abstract value_: is the
  baseline under-determined, fixed, or impossible? This is all that bottom-up
  space resolution can know — it runs before pixels exist, so it computes the
  _determinacy_ of the baseline, not the baseline itself.
- **`originPx`** is the _concrete value_: the solved baseline of a σ-scope, in
  pixels. It exists only after σ and the frame anchor resolve, so it is always
  a **derived read**, never stored state.

A false friend to never conflate with that intercept: a claim's `width`
Monotonic carries its _own_ intercept — the σ-independent pixel part of an _extent_
(spacing, fixed chrome), the intercept of the size-vs-σ line `size = slope·σ +
intercept`. That is an intercept of the size equation, not of the data→screen
map; the two never mean the same thing.

**The single scale carrier.** Layout threads one per-axis record downward (see
[Layout dispatch](#layout-dispatch)): the `AxisScale` = `{ sigma?, map? }`
(`domain.ts`). `sigma` is the slope σ for _unanchored_ extents — a free magnitude
has no committed baseline, so its intercept is implicit in where its parent
places it (baseline placement + `transform.translate`) and never travels with the
scale. `map` is the _whole_ anchored map, with the intercept explicit as data
rather than closed over a function: `px(d) = sigma·d + originPx`, evaluated by
`pxOf`. So
"anchored" shows up operationally as "has a `map`"; "unanchored" as "has only a
`sigma`." This single record replaced the former two parallel
channels (`scaleFactors` = slope-only, `posScales` = whole map) in Stage 4 of
[the σ-affine plan](/internals/design/sigma-affine-simplification).

**One slope per σ-scope, and the two-scope carrier.** The carrier's two slopes —
its `sigma` and its `map.sigma` — are not independent numbers. Each is the σ of a
distinct σ-scope solved once by the scope registry (below):
`sigma` is the axis's **SIZE** scope (what a magnitude is scaled by), `map.sigma`
is the axis's **POSITION** scope (what an anchored coordinate is mapped by). No
site fabricates either — every scope root solves both from one call,
`solveScope` (or the equal-measure recentering). Within any one scope there is therefore exactly
one slope, by construction. When both halves are present and `sigma ≠ map.sigma`, the axis
genuinely carries **two scopes**, and each half is read by the channel it belongs
to — magnitudes read `sigma`, anchored positions read `map`. That happens when a
sub-budget layer scales size against a local extent but positions against an
inherited map (a sub-budget vs inherited split) — two honest scopes on one axis,
the multi-scale reading of the same equation, not a slope with a redundant,
drifting twin. A niced-ticks-vs-raw-content split is _not_ a sanctioned case:
that was the #659 bug (a self-scaled panel's stashed domain escaping the old
pre-layout nice walk), and since nicing moved onto the scope solve
([below](#nicing-is-a-scope-operation-applied-on-demand)) a scope's map and σ
read one domain by construction.

## Why an explicit IR

Conventional grammars of graphics treat a scale as a function from a data
domain to a visual range. Quantitative x-scale: `[30, 50] mpg → [0, 100] px`.
Color scale: species name → palette entry. Convenient — but too unstructured.
If scales are arbitrary functions, the system can change their domains and
ranges freely, slot them in anywhere, and inference doesn't know which
combinations are meaningful.

In practice every visualization system relies on stronger invariants than
"function from domain to range" can express. Domains can be merged only
when they're compatible. Spatial continuous ranges aren't independent
parameters at all — they're derived from available layout space. Some
extents have meaningful origins; others only have meaningful differences.
Some operators glue subspaces together; others separate them. Coordinate
transforms preserve, warp, or erase parts of the underlying structure.

Discrete position scales make the mismatch concrete. D3 and Vega-Lite use
point and band scales to handle categorical positions. Operationally, a
band scale gives each category a continuous position together with a
uniform bandwidth. That's already the abstraction carrying layout
information indirectly. It also breaks down for bar-like charts whose
elements have different widths, because the allocation of space is no
longer a uniform function of category.

This kind of richer semantics shows up in the implementation of every
serious grammar system, even when it isn't reified:

- **Vega-Lite** parses each child view recursively, assigns scale-resolution
  policies (shared vs independent), and conditionally merges child scale
  components when their types are compatible. Compatibility groups several
  scale types together (e.g. temporal + ordinal-position). The merged
  result is a flat record keyed by channel — the tree structure of view
  composition guides merging, then disappears.
- **Observable Plot** distributes inference across channels (`fill`, `stroke`,
  `opacity`, `symbol` first infer which named scale they should use), a
  scale-name registry, scale-type inference (using user-specified types,
  mark-imposed channel types, explicit domains, channel values, color
  schemes, special defaults like `r` getting a sqrt scale), domain-union
  inference, and range inference that depends on both domain and scale
  kind. Modular, but no single spatial IR owns the accumulated semantics —
  Plot's `stack` transform, for example, rewrites a length channel into
  `y1`/`y2` so they can later participate in ordinary scale inference.

Each piece can be clean in isolation, but without an explicit source of
truth for the inferred spatial semantics, scale and domain facts have to
be passed around and reconstructed across the implementation. That's
particularly limiting in GoFish, where users define new operators and new
spaces — not just new marks inside a fixed scale-resolution pipeline.

GoFish's solution is to give the inference an explicit shared
data structure to contribute to. Marks introduce local spatial facts;
operators merge or separate them; coordinate transforms annotate them; and
later passes consume the tree for layout, scale construction, and guide
generation.

## The three space kinds

Each axis (x and y) of each node has a type of one of three kinds:
`continuous`, `ordinal`, or `undefined`. A continuous type stores one data
fact in one shape for every continuous axis: a signed **`dataInterval`** in
data units about the axis's local origin, plus the state of that origin,
**`origin`**. The origin state is the whole _placement_ fact (is this extent
positioned?): `pinned` has committed a position, `free` can still be given
one, and `none` can never have one. Every such question is the one read
`originOf(space)` (or `originIs(space, "pinned")`, and `hasOrigin(space)` for
pinned-or-free):

```ts
// underlyingSpace.ts
type Origin = "pinned" | "free" | "none";

type CONTINUOUS_TYPE = {
  kind: "continuous";
  dataInterval: Interval; // signed data extent about the local origin
  origin: Origin; // where that origin sits
  measure?: Measure;
  mirrored?: true;
  calendar?: HasCalendar; // the data are instants on this calendar
};
type ORDINAL_TYPE   = { kind: "ordinal";   domain?: string[]; measure?: Measure; ... };
type UNDEFINED_TYPE = { kind: "undefined"; ... };
```

The three origin states are the old `POSITION` / `SIZE` / `DIFFERENCE`, and
there is one constructor for all of them, `CONTINUOUS(interval, origin,
measure?)`:

- **pinned**: the local origin _is_ data 0, so the interval is the absolute
  data domain. A scatter's x axis over `[30, 50]` is
  `CONTINUOUS(interval(30, 50), "pinned")`.
- **free**: the extent hangs from a baseline that nothing has placed yet, and
  the interval is `[−descent, ascent]` about it. A bar of value `v` is
  `CONTINUOUS(interval(0, v), "free")`, which is `[0, 30]` for 30 and
  `[−20, 0]` for −20. Marks build it with `magnitude(size)`, which also
  carries the datum's measure.
- **none**: there is no origin at all, only a width, so the interval is
  `[0, width]` and only differences along it mean anything. A middle-aligned
  overlay is one.

Because the three share one shape, **pinning a free extent is "shift the
interval and pin the origin"**: `anchorAt(space, at)` turns `free [−d, a]`
into `pinned [at − d, at + a]`. Every place that pins does exactly this, in
data: a glued stack shifts each part by the running sum of the parts before
it, and the `position` operator shifts by its datum offset. Alignment does not
pin: it establishes a shared baseline (see below). What places a free
baseline is placement: a parent constraint, a data anchor, or the scope root
(`placeBaseline`).

**The data interval has no σ in it.** Pixel overhead (a spread's spacing, a
nest's padding, a fixed pitch, a `transform.scale`) is never part of the data
interval. It lives only in the claim. So when bars 25 px apart are lined up
on a baseline, the data domain is the bars' data, not the bars plus 100 px of
spacing read as if it were data.

**Ascent and descent (#773).** An extent is measured from its data 0 on both
sides, like a font's ascent and descent. In the type the two sides are the two
ends of the interval: the ascent is `max` and the descent is `−min`. In the
claim they are two Monotonics. A rect of value 30 has data ascent 30 and
claims ascent `30σ`; a rect of value −20 has data descent 20 and claims
descent `20σ` (a rect length is signed, while a text, image, or treemap size
is a nonnegative magnitude). Most extents sit wholly above their data 0 and
never spell the descent. Every claim is measured from data 0, whatever its
origin state, so a side can be negative: a pinned `[30, 50]` claims ascent
`50σ` and descent `−30σ` (its low edge lies `30σ` above its 0), and its width
is `20σ`. An origin-less interval starts at 0, so its descent is 0. The
claim's `width` is `ascent + descent`, computed once by the `Extent`
constructor, and it is what a scope solves σ against. The places that read
the two sides:

- An overlay of free children (`unionChildSpaces`) is the union of their free
  intervals, so it takes the larger data extent on each side, and its claim
  (`unionChildExtents`) takes the larger claim on each side, which keeps the
  σ-affine intercepts. So a `group` of signed bars keeps both sides.
- Under `baseline` alignment, `resolveAlignmentSpace` (spread's cross axis)
  unions the children's intervals about the shared baseline, so a signed bar
  chart is pinned over a domain that includes its negative values. Under
  `start`, `end`, or `middle` alignment the children line up at a box edge or
  center instead, so each child counts as its whole box `[0, width]` and the
  union spans the widest.
- A nest pads its claim on each side: ascent + padding and descent + padding
  (`nestedExtent`). Its type keeps the inner's data interval.
- `anchorAt` puts the baseline at the given coordinate:
  `[at − descent, at + ascent]`.
- A scope root over a free extent (the chart root, or a layer's self-scaled
  free stash) fits the claim's `ascent + descent` to its box and seats the
  baseline at the scope's `originPx`: `descent·σ` above the box's low edge,
  overhead below the baseline included.
- A stack lays its parts end to end, in order, as vectors. Each part's
  baseline sits on the previous part's head, where the head is the baseline
  moved by `ascent − descent`, so a negative part goes back. The stack spans
  everything its parts cover, starting from its first part's baseline at 0:
  parts (30, −25, 10, −50) have running sums 0, 30, 5, 15, −35, so the stack
  spans `[−35, 30]`. Parts that cancel overlap. A diverging stacked bar (all
  positives up from 0, all negatives down from 0) is not a stack option: it is
  spelled by grouping by sign first, so that each stack holds one sign. The
  type lays out the parts' data intervals this way, and the claim lays out
  their claims the same way (`stackClaim`), measured from the stack's 0. A
  part's tail is where placement puts it (`tailSides`): a free part's tail is
  its baseline, and a pinned or origin-less part, which has no data baseline
  for placement, lies above its tail as a box.
- The 0 of a stack is its **origin**: its first part's tail by default, as
  above. A stack whose `by` column has `HasMidpoint` (see
  [Column types](#column-types-the-chart-schema)) puts its origin at the
  midpoint of the column's order instead, and the fold shifts the extent so
  the midpoint sits at 0: the parts before the midpoint (and the share of the
  level it falls in that lies before it) lie below 0, the rest above. Parts
  (5, 10, 20, 40, 25) centered on the middle of the 20 span `[−25, 75]`. The
  parts of a centered stack must be nonnegative (a negative one is an error
  naming `HasMidpoint`), and the space
  it builds is **mirrored** (the origin's `mirrored` flag, then
  `CONTINUOUS_TYPE.mirrored`; see `StackOrigin`): both sides of 0 hold
  amounts measured away from it, so an axis over it labels each tick with its
  distance from 0. A union stays mirrored only when every part is.
- A spread lays its parts by the same chain fold as a stack (`chainFold`),
  with a different step: an edge chain lays each part's box after the
  previous one's end plus the spacing, and a fixed-pitch chain lays each
  part's anchor one pitch from the previous one's. A baseline-pitched part
  keeps its signed sides about its baseline; any other part is a box.

With every descent 0, all of this reduces to a single width.

`ORDINAL` carries a `measure` too (the grouping field, e.g. `"lake"`) — the
discrete analogue of `CONTINUOUS`'s measure. It's set from the grouping operator
(`spread`'s `by`) when the ordinal space is built (`distributeSpaceFold` →
`ORDINAL(keys, measure)`) and preserved through `unionChildSpaces`. So
`spaceMeasure(space)` reads a measure off **both** continuous and ordinal kinds
(only `UNDEFINED` is measureless), which is what lets an axis name itself off its
own resolved space — a continuous axis by its unit, an ordinal axis by its
grouping field (see [the layout passes](/internals/layout/passes)).

A datum value can also carry a `field`: the data field it was read from, set
by `inferColor` when a color channel names one. That is provenance, not a
measure: it never enters `resolveMeasure` or unit unification, and only the
color scale reads it (see [Color Scale Resolution](/internals/layout/color-scales)).

A companion predicate, **`isPositioningSpace`**, folds the two axis-bearing
kinds together: it holds for `POSITION` (a data axis) and `ORDINAL` (a category
axis) but not for `SIZE` (a mark's own extent) or `UNDEFINED`. In other words it
answers "does this space lay marks _out along an axis_?" — the question you ask
when you want the axis a set of siblings is arranged on rather than each
sibling's own size. Its first consumer is the connector's `curve: "auto"`: a
`line` / `ribbon` reads the underlying space its endpoints resolved to and, when
that space is a _positioning_ one whose measure is continuous, smooths the path
(the monotone cubic) instead of drawing straight segments — so a line over
a continuous x auto-curves while one over discrete categories stays polylinear.
The same test picks the spline's knots when the run has no parameter of its
own (the times of the keyframes a line threads, or the path tier's key,
`inferred.along`, read through `projectBy`). On a continuous connection
axis, the points' positions along it are the knots when the points are in order
along it. A run with neither falls back to centripetal knots, which are
computed from distances on screen (`runKnots` in `connect.tsx`). When the
knots are the positions on the connection axis, that axis draws the run's
parameter; the `step` curve reads this (along with `inferred.parameterAxis`
for a parameter taken from the path tier) to hold every other coordinate.

The guide a space supports keys on the **origin state** (data-space), never
on the claim:

| type               | guide                        | `placement`  | example                       |
| ------------------ | ---------------------------- | ------------ | ----------------------------- |
| `pinned`           | quantitative (absolute) axis | `determined` | scatter x, stacked-bar y      |
| `none`             | magnitude / delta guide      | `conflict`   | streamgraph centered count    |
| `free`             | none (a legend, not an axis) | `free`       | a bar's height before placing |
| (kind `ordinal`)   | labels at laid-out keys      | —            | bars by category, facets      |
| (kind `undefined`) | no guide                     | —            | an aesthetic / literal-px dim |

These map directly onto the σ-affine layout solve (see
[the one equation](#the-one-equation-and-three-roles-for-one-unknown),
[Size resolution](#size-resolution), and the solver): the claim's `width` is
the abstract **SIZE** (slope·σ + intercept), and `placement` is the abstract
**value** of the baseline — its _determinacy_ (free / determined / conflict),
not its pixel intercept. The underlying-space pass is essentially an
_abstract interpretation_ of the solve: it computes the structure (which
extents are sized, which are positioned) bottom-up before the concrete pixels
— and therefore the concrete baseline intercept — exist. Reading `placement`
off the origin state is what lets alignment ask "is this child already
positioned?" directly (see [The contract](#the-contract)) instead of
reconstructing it.

This shape is the endpoint of issue #586's collapse and of the type/claim
split after it. The old `POSITION`/`SIZE`/`DIFFERENCE` were one semantic thing
— a data-driven extent — observed at three pipeline stages; carrying that as
three kinds baked a _stage_ distinction into the _type_. A first cut collapsed
them to a single overloaded `origin: number | "free" | "impossible"` scalar,
but that conflated the layout fact with the data fact (a baseline magnitude vs
a data axis anchored at 0 — which build no posScale vs a posScale). The next
form kept one `dataDomain` field (`Interval | "delta" | undefined`) next to
the claim in one record, so a free extent's data size existed only inside its
claim, and every fold that pinned a free extent had to read the claim at σ = 1
to find it, pixel overhead included. The current form gives every continuous
type one interval about its own origin and keeps the origin state separate
from it, so a free magnitude and a data axis pinned at 0 stay distinct
(`free [0, 10]` vs `pinned [0, 10]`) and pinning is a shift.

The pre/post-solve distinction is handled by _when_ σ is substituted, not by
_which kind_: σ is always the claim's `width.inverse(size)`, and the extent at
σ is always `width.run(σ)`. The one genuine state transition is
**`middle`-alignment drops the origin** — centering scrambles the children's
baselines, so the result is origin-less (the streamgraph). An origin-less
extent is absorbing: no fold gives it an origin back.

The pinned data interval is read back with `continuousInterval(space)`
(used by posScale construction and axis nicing), which is `undefined` for a
free or origin-less space. The folds that union extents regardless of
pinning read `space.dataInterval` directly.

These kinds map closely to Stevens's statistical data types, but not cleanly:
a pinned interval covers both interval and ratio, and an origin-less one is
_weaker_ than interval — only within-instance differences are defined. `ordinal`
isn't "a band scale"; it's a statement that the values are discrete keys whose
spatial allocation is the responsibility of layout. `undefined` represents
spaces with no data-driven information (the literal-pixel value is handled at
layout time by `computeAesthetic`).

### One continuous path, and the differences that remain

The three origin states share one interval shape, and the code runs one path
over it. One scope solve (`solveScope`) serves every continuous scope root:
σ from the claim, and, when the axis has an origin, `originPx` from where the
claim's baseline lands. One overlay fold (`overlay` in `alignment.ts`) serves
layers, Porter-Duff operators, alignments, and coords: the union of the
children's seated intervals. One chain fold serves every spread and stack
target. The folds no longer ask whether a child is a magnitude or a position
except where that question means something. These are the places it does,
each inherent to what the origin states are:

- **Who applies `originPx`**: one seating rule (`seatInScope` in
  `solver/scopes.ts`), used by the render root, a coord, and every layer
  (a self-scaled stash included). A pinned child shares its parent's frame,
  so it sits at 0 and places its data through the frame's map; a free child
  has a frame of its own whose 0 is its baseline (`{σ, 0}`, `frameOf`), so
  its parent places that baseline at the frame's `originPx`; a child with no
  data 0 sits at 0 and has no frame. This is the split between "a constraint
  fixes the baseline" and "the parent sets it". A scope root's frame is its
  solved scope (`scopeFrame`), whatever its type's origin.
- **Seating in a fold**: a pinned child sits at its own data coordinates; a
  free child sits there too when the fold seats children on their baselines
  (an overlay, a baseline alignment), and is a box from the aligned edge
  otherwise; an origin-less child is always a box, and adds nothing to a
  pinned result's data interval (it has no data 0 to give it). A stack seats
  each part by its tail, as placement does: a free part on its baseline, any
  other part as a box from its start.
- **A stack glues, a spread separates**: a stack glues its parts into ONE
  continuous space along its direction (positions are running data totals);
  a spread's result along its direction is a sequence of separate spaces,
  ORDINAL by its keys (anonymous for positional keys) or UNDEFINED, whatever
  its spacing or pitch, and each target keeps its own continuous space
  inside. Its room is its claim: a spread of magnitudes (free targets, or
  targets that are themselves spreads of magnitudes) shares the enclosing
  scope's σ, so it claims the chain of their claims plus spacing, on an
  ordinal or undefined type; a spread of pinned frames (facet panels) claims
  nothing, and each panel roots its own scope in its slice. A marimekko is a
  stack, so its widths still add up to one axis.
- **Alignment establishes a baseline; it does not pin**: aligning or
  overlaying free children gives a free result with one shared baseline
  (`overlayOrigin`: pinned only when a child is pinned, none when a child has
  no origin, and none for `middle`). The bars of a bar chart are one free
  magnitude until the scope root places its baseline.
- **Which axis renders** (`axisOver`): pinned renders an absolute axis, none
  a delta axis, free none, until placed. The render root places a free
  space's baseline at its `originPx` (`placeBaseline`; `GoFishNode.
placedSpace`), so a free root renders an absolute axis, niced about its 0;
  the axis's frame seats the free content's baseline at its data 0 (the
  content is left unpinned and the frame's map places it).

A coordinate space is a σ-scope root like any other, so it reports nothing
upward on either axis: to its parent it is a pixel box. It keeps its own type
for its own scope, solves that scope in `layout`, and draws its own axes and
their titles in `lower` (see
[Flattening the Scenegraph](/internals/layout/coord-flattening)). An UNDEFINED
child carries no opinion in every fold, alignments included.

## The contract

Each node implements two hooks, one per half. The type hook,
`_resolveUnderlyingSpace`:

```ts
type ResolveUnderlyingSpace = (
  childSpaces: Size<UnderlyingSpace>[], // one [x, y] tuple per child
  childNodes: GoFishAST[],
  shared: Size<boolean>, // [shared on x, shared on y]
  constraints: ConstraintSpec[] // this node's positioning constraints
) => FancySize<UnderlyingSpace>;
```

returns the node's own `[xSpace, ySpace]`, computed bottom-up from the
already-resolved child types. The claim hook, `_resolveExtent`:

```ts
type ResolveExtent = (
  childExtents: Size<Extent | undefined>[], // one [x, y] claim pair per child
  childSpaces: Size<UnderlyingSpace>[], // the children's resolved types
  spaces: Size<UnderlyingSpace>, // this node's own resolved types
  childNodes: GoFishAST[],
  constraints: ConstraintSpec[]
) => Size<Extent | undefined>;
```

returns the node's own claim pair, computed bottom-up from the children's
claims, with every type already resolved. Both traversals are memoized on the
node (`resolveUnderlyingSpace()` and `resolveExtent()`), and
`clearUnderlyingSpace()` drops both.

**Why two walks, and why this direction.** A type never depends on a claim:
the data interval a stack or an overlay covers is a sum or union of its
children's data intervals, not of their pixel sizes. A claim does depend on
types: a pinned overlay's claim is the width of the union of its children's
spans, and where a pinned child sits in that union is a type fact. So the
claim walk runs second and reads the types, and the type walk never sees a
claim. The direction is enforced, not just followed. `UnderlyingSpace` holds
no Monotonic and `underlyingSpace.ts` does not import `extent.ts`, the type
hook's arguments carry no claim, and `resolveExtent()` throws if it is called
while a type hook is running. One walk returning a pair would have let a type
fold reach into the claim half next to it, which is exactly the coupling the
split removes.

**Most nodes write only the type hook.** The claim hook is optional. A node
without one claims what its types imply (`impliedExtents`): each side of a
continuous axis is its data extent times σ, with no pixel overhead. That is
every leaf mark. The nodes that write a claim hook are the ones whose claim
is more than their data: the ones that add pixels (a spread's spacing or
pitch, a nest's padding, a `transform.scale`), the ones that compose their
children's claims (an overlay, an alignment, a stack), and the pass-throughs
that keep their child's claim as it is (`offset`, the `position` operator,
a `ref`). Every continuous axis has exactly one claim, and no other axis
has one; `resolveExtent()` checks this.

The `constraints` argument lets constraints participate in space resolution —
each positioning-constraint kind carries a **space fold**, a typing rule that
composes its targets' spaces into the layer's claim on that axis:

- `Constraint.position` contributes a _fragment_: the layer folds the _datum_
  coordinates into a POSITION domain on the constrained axis
  (`collectPositionDomains`), unioned with the children's spaces.
  (Literal-pixel coordinates are not data and don't contribute; neither do
  discrete scatter slots, which resolve directly from the already-known layer
  size.) That domain is what the layer later turns into a data→pixel scale to
  resolve those constraints.
- `Constraint.distribute` contributes the stack fold, as a type fold
  (`distributeSpaceFold`, `constraints/distribute.ts`) and a claim fold
  (`distributeExtentFold`). The chain moves every target to its place, so it
  reads each one, pinned or free, as a box. A spread separates: its type is
  ORDINAL of its keys, or UNDEFINED, and a spread of magnitudes claims the
  chain of the targets' claims with the spacing added (`chainFold`; for an
  edge chain, the sum of the widths plus `spacing·(n−1)`) for the enclosing
  scope to solve σ against (see
  [the differences that remain](#one-continuous-path-and-the-differences-that-remain)).
  With `glue: true` (stack semantics) the extents are laid end to end and
  pinned over the range of their running sums (`[0, Σ]` when no part has a
  descent), in data for the type and in claims for the claim, by the same
  chain fold (`chainFold`).
  A target with no origin (a difference or a non-continuous axis) leaves only
  the ORDINAL of the keys, if any.
- `Constraint.align` contributes the alignment fold (`resolveAlignmentSpace`)
  on its axis — but only for a point-anchor value;
  `"span"`/`"size"` (#726, below) contribute nothing to the space fold, since
  their target is UNDEFINED on that axis by construction.
- `Constraint.nest` contributes the nesting fold (`nestedSpace` for the type,
  `nestedExtent` for the claim, `constraints/nest.ts`) and a deterministic
  dependency plan
  (`constraints/nestPlan.ts`). It is the first _size-setting_ constraint: on
  each constrained axis `outer = inner + 2·padding`, with padding always known,
  so the unknown is _which_ side is derived. The nest plan dispatches on which
  side carries the size (an own `args.dims`, a composite that shrink-wraps, or
  any inside-out-derived outer from the same-axis nest graph): inner sized and
  outer not →
  **inside-out** (`outer = inner + 2·padding`); outer sized, or neither (the
  layer sizes outer) → **outside-in** (`inner = outer − 2·padding` — CSS
  padding). Only the **inside-out** direction folds here: outer's type is
  inner's type, whatever its origin (padding is pixels, so it is no part of
  the type), and outer's claim is inner's padded on both sides of its
  baseline, a `Monotonic.adds`, which stays monotone
  (hence invertible), so a nested pair participates in auto-fit exactly like a
  stack — a parent spread/layer solving a scale factor sees outer as inner
  shifted up by the constant padding. The layer derives these outer spaces in dependency order
  (source before derived) so chained nests compose (A⊇B⊇C: C's request feeds
  B's, B's feeds A's), then feeds them into the union below. The **outside-in**
  direction derives _nothing_ at space-resolution time — outer's own claim (or
  fill/undefined) flows through the union normally, and `inner = outer −
2·padding` is handled purely as a layout-time pixel proposal. (Likewise when an
  inside-out inner is not continuous — fixed-pixel content — there is no rule
  to fold; the proposal `inner.dims + 2·padding` sizes outer.) At most
  one nest may derive a given (node, axis), and a nest that resolves
  inside-out on one axis and outside-in on the other is rejected as mixed — the
  layer enforces both at constraint-collection time (see [[size-claims]]).

- The **interval form** of `Constraint.position` (`{ x: [min, max] }`, lowered
  by `constraints/position.ts` to two strong edge pins — a `start` pin at `min`
  and an `end` pin at `max`) is the second size-setting constraint: pin BOTH
  edges of a target on an axis and the **size falls out** — the relation
  `place()`'s position-only protocol cannot express. It is built on the
  **linear-system bbox** (`constraints/bbox.ts`, #39): a per-axis 2-unknown
  system in `(min, size)` where each box key (`min`/`max`/`center`/`size`) is one
  equation; two independent keys are rank 2, so the rest are inferred (two
  edges ⇒ a size), and a third, dependent write is a structured
  over-determination report rather than a silent last-writer-wins. An interval's
  datum endpoints feed the axis's POSITION domain via `collectPositionDomains`
  (like a point coordinate does), and `planConstraintComposition` treats an
  interval position as an **extent-establisher** (like a distribute), so the
  cross-axis `align` fold still runs — a histogram is an interval position on x
  plus an `align` on y, and it is that align fold (SIZE→POSITION) that makes the
  count axis. The solved `(min, size)` is bridged into GoFish's
  `(local box, translate)` split by stamping `[0, size]` into the local box and
  deriving the absolute `min` through the placement ledger. `scatter` uses both
  forms of `Constraint.position`: plain `x`/`y` → a point coordinate, range
  `xMin`/`xMax`/`yMin`/`yMax` → an interval coordinate (the operator no longer
  has a bespoke layout). A categorical
  scatter channel such as `x: "lake"` lowers to discrete placement coordinates
  `i / count · axisSize`; those are placement coordinates, not datum values, so
  they become numeric placement facts without affecting the layer's data domain.

- `align`'s `"span"`/`"size"` values (#726, `constraints/align.ts`) are the
  **third** size-setting mechanism — ships the unbound-target case from the
  "lingering open item" [[operators-vs-constraints]] flags (a bound target is
  still an ownership conflict, not a silent write; see
  [[operators-over-placed-nodes]] §3.5): `"span"` reads the source's
  already-solved `(min, size)` at lowering time and emits two strong
  `anchor-pin` facts on the target (`start`/`end`) — the same two-edge
  cell-closure route `position`'s interval form uses, so it reaches rank 2
  through the existing bbox machinery with no new solver phase. `"size"` needs
  a genuinely rank-1 write (a size with **no** position coupling), which the
  anchor-pin vocabulary can't express (every anchor maps to a `min`/`max`/
  `center` box key) — it gets its own `SizePinFact`/`emitter.pinSize` that
  writes the `size` box key directly. `closeSizes` reads a box's `size` key
  even when the box never reaches rank 2 (a direct pin, not just the solved
  system), so a size-pin with no companion anchor pin still surfaces a
  determined size with no solved position; the write-back for that case is a
  new rank-1 sibling of `setExtent`, `GoFishNode.setSizeOnly` (writes
  `intrinsicDims[dir].size` only — no ledger, no translate), so the target's
  position is left to whatever else determines it (a companion align, or the
  parent-seed `placeUnplacedChild` fallback). Both values are scoped to an
  **unbound** target — `spaceOn(axis)` is `UNDEFINED` (no `w`/`h`/data
  binding on that axis) — checked before any fact is emitted; a bound target
  is an ownership conflict, reported per the paragraph below rather than
  clobbered.

The layer composes these per axis — children not covered by a constraint
max-union in as overlay siblings. On an axis a constraint **does** cover, that
fold is authoritative and overrides the layer's default `unionChildSpaces` —
**even when the fold is UNDEFINED**. This matters for an `align` over ORDINAL
cross-axis children: the alignment fold is UNDEFINED (no anchored axis), and if
the default union were allowed to win it would resurrect an ORDINAL space and a
spurious axis (a waffle's chunked-row index leaking a row "axis"). The
composition is planned once from the constraints and the child nodes alone
(`planConstraintComposition`, `constraints/compose.ts`): which children each
distribute and align covers, on which axis. The type fold
(`composePlanSpaces`) and the claim fold (`composePlanExtents`) then evaluate
the same plan, so the two halves cannot disagree about which fold covers
which child. The covered-axis type fold — UNDEFINED included — is what
`composePlanSpaces` reports, along with the fold operands of each axis, and
`composePlanExtents` reads those operands back (it does not fold the types
again) and reports their claim and the layout budget. At layout time the layer then **solves the budget**:
a fold-produced claim (of any origin) is inverted against the layer's allotted size to
derive a local scale factor, and distribute-covered fill children are
proposed slices from the shared proposal plan (`buildDistributeSliceMap`,
`constraints/proposalPlan.ts`, using `sliceExtent` from
`constraints/folds.ts`). When distribute segments overlap on the same child
axis, they are treated as a placement-relation graph rather than a
spread-like flex slice, so the ambiguous size proposal is skipped instead of
picked by declaration order. This is what makes constraint-assembled layers
reach the same expressive ceiling as the spread pipeline, auto-fit included
(issue #475). Composition beyond one distribute (+ one align) per axis falls
back to `unionChildSpaces`; the general algebra is sketched in
[[constraints-as-core]].

`distribute`'s `anchor` option (`"edge" | "start" | "middle" | "end" |
"baseline"`, default `"edge"`) picks which pair of anchors the chain relates
between adjacent children: `"edge"` relates the facing edges
(`prev.end → cur.start`, spacing = the gap between them, content-dependent);
the fixed-pitch anchors relate the _same_ anchor on both sides
(`prev.anchor → cur.anchor`, spacing = anchor-to-anchor pitch,
content-independent) — `anchor[i+1] = anchor[i] + spacing`. A glued chain
(`glue: true`, i.e. `stack`) relates `prev.head → cur.tail` instead
(`distributePlacementAnchors`). A part's **tail** is where its baseline sits,
or its start when it is not a baseline magnitude; its **head** is the point as
far in from its end as the tail is from its start, which is the baseline moved
by `ascent − descent`. A positive bar's tail is its start and its head its
end, so with positive parts (or parts with no data baseline, such as text or
a nested stack) this is exactly the `"edge"` chain; a negative bar's tail is
its end and its head its start, so the next part starts where it ends.
`"middle"` is the
old `mode: "center"` under its new name; `"start"`/`"end"`/`"baseline"` are new
fixed-pitch siblings reusing the same anchor vocabulary `align` already uses
(`constraints/shared.ts`'s `AlignAnchor`). The claim is the one chain fold
(`chainFold` in `distribute.ts`) that also lays out a stack: each part sits
about its chain point by a seat, the next chain point is one step on, and the
claim is the highest reach above the chain's start plus the lowest reach
below it, over every part. Only the seat and the step differ. A pitched
chain's claim steps its anchors against its parts' growth one pitch at a
time, as a ridgeline reads (rows chained down a y that reads top-down, each
growing upward from its anchor, see
[Axis direction](/internals/layout/passes#axis-direction)), and each part
sits about its anchor:

- `"middle"`: half its width above the anchor, half below.
- `"baseline"`: its own signed sides, ascent above and descent below.
- `"start"`: its whole width above the anchor.
- `"end"`: its whole width below the anchor.

So with one-sided parts the claim is `(n−1)·s` plus the tallest reach past
the chain's end rows: `max_k(h_k − k·s)⁺ + (n−1)·s` for `"start"` (k in
chain order, the binding row being whichever peak clears the rows chained
above it; for a ridgeline that's usually the first row). A `"middle"` row
taller than both end rows binds too, and a `"baseline"` row's descent counts
below its anchor. The fold runs in Monotonics, so an all-linear chain's
claim is an exact envelope that a scope inverts exactly (before, a pitched
chain's claim was a closure, solved by a numeric search that could overshoot
its box by a fraction of a pixel). The fold's child order is the chain order
(compose.ts passes placement order).

The type fold has no data part of the chain: a spread separates, so its type
is ordinal (or undefined) whatever its pitch, and the chain lives only in the
claim.

A spread chain on y needs no paint-side handshake. The chain places each
target's anchor in the spread's own axis order, and the target is read through
that order like any child (see
[Axis direction](/internals/layout/passes#axis-direction)): a ridgeline row,
whose y is continuous, has its baseline placed at the chained anchor and grows
upward from it, so the painted anchors sit exactly at the solved pitch and the
layer's box is the rows' real pixel extent. (Before #681 the rows were laid out
growing down and mirrored about their anchors at paint, which needed a
`pitchAnchorY` stamp, a mirrored bbox fold and a swapped overhang attribution.)

`resolveLayerBaseSpaces` is the default bottom-up type resolver before composed
constraint overrides: union child spaces, and overlay datum-valued
position/span domains on that union as a pinned space (a free union seated at
data 0, where the layer places its free children), with constraint measures
taking precedence. It returns the children's union beside the result. Its
claim half, `resolveLayerAxisExtent`, takes both and overlays the claims the
same way and applies the layer's `transform.scale` to the result,
whatever its origin. A `transform.scale` is a pixel-space operation, like
translate, so it scales the claim and never the data interval.
`childLayoutSizeProposal` is the final per-child proposal priority before nest:
the cell's own track extent (grid), else distribute slice for that named child,
else the full layer box.
`buildLayerConstraintLayoutPlan` packages the per-layer execution plan — which
children skip baseline placement, nest source-before-derived order, and
datum-position target axes — so the layer executes deterministic artifacts
rather than recomputing them inline.
Nest sizing is split into a dependency plan and concrete layout arithmetic:
`buildNestPlan` decides, per constrained pair, whether the source size flows
inside-out (`outer = inner + 2·padding`) or outside-in
(`inner = outer − 2·padding`) and orders children so the source has been laid
out first. The bottom-up walks apply only the inside-out portion, the type
walk via `applyNestSpacePlan` and the claim walk via `applyNestExtentPlan`,
which reads the types the first one produced;
once the source has concrete dimensions,
`applyNestLayoutProposal` does the corresponding layout-time arithmetic on the
derived axes.
Grid is a **track equation** under the same unified sizing rule, not a separate
layout regime (Stage 6e). Per axis, `resolveGridTracks` sets

```
track claim = Monotonic.max(claims of the cells in that track)      (max, +)
grid claim  = Monotonic.add(track claims) + gaps                    (the σ-frame)
```

A claim-less ("fill") cell contributes nothing, so an all-fill grid has no track
claims and the tracks split the leftover (allocated − gaps) equally — bit-for-bit
the former `sliceExtent` box-division. Content-sized tracks emerge automatically
when cells carry size claims: a track sizes to its widest cell, and fill tracks
share whatever the claimed tracks leave. When every track carries a σ-dependent
claim (no fill to absorb the slack), the grid claim is inverted against the
allocated size by the same scope registry that solves any other frame equation.
Because a categorical track axis cannot simultaneously be a SIZE magnitude, the
grid's _reported_ space stays ORDINAL over the columns/rows (`gridSpaces`, for
axis rendering) while the size claim is consumed at layout time by the track
resolution. The layout budget sizes fill cells to their track extent; the
authoritative **placement tracks** are recomputed from the actual laid-out cell
sizes (`gridTracksFromSizes`) so each cell pins to the real geometry — one source
the placement and the solver shadow both read, so they cannot drift.

The grid now **genuinely composes** with sibling constraints: its per-track claim
participates in the fold and its cell-center pins solve jointly with any align /
position / z-order on the same layer (a `position` pin on a cell overrides its
track centering — the authoritative-pin pattern). The Stage-3 containment throw
is gone. `selectGridConstraint` keeps the one remaining rule: at most one grid
per layer (two track partitions would be source-order-sensitive) is still a
proposal conflict. Grid has no public factory; it is `table`'s private
elaboration target.
The same proposal plan marks datum-valued `position` targets
(`buildPositionTargetDims`) so the layer does not also forward the consumed
data→pixel scale to that child axis; literal pixel pins are not marked because
they do not consume a data scale. `buildPositionScalePlan` chooses the effective
scale the placement solver consumes: inherited/self-scaled base first, otherwise
a local scale from the layer POSITION space when the layer owns a datum-position
axis. Child scale forwarding itself is the same plan (`childPosScalesFor`):
unowned axes forward inherited/base scales, while owned axes forward the layer's
effective scale only to non-target children whose own space is POSITION.

After sizing, the layer emits placement constraints into a per-axis **rank-2
solve** (`constraints/placementSolver.ts`) that resolves each `(node, axis)`
box `(min, size)` — not just a single `min` unknown. The fact datatype lives in
`constraints/placementFacts.ts`: the **anchor program**
(`axes: [AnchorFact[], AnchorFact[]]`) of anchor pins, anchor relations, and
participants. A fact names a node anchor (`start`/`middle`/`end`/`baseline`)
directly, with **no numeric offset pre-evaluated at lowering-time** — the offset
from `min` is derived later, in the solver, once sizes are known. Named
constraints first lower to this inspectable program; solving consumes it rather
than mutating solver state during lowering. Constraint-specific lowerers live
with their constraints: `align.ts`, `distribute.ts`, `position.ts`, `nest.ts`,
and `grid.ts` own their policy choices, while `placementLowering.ts`
orchestrates them and `placementProgramLowerer.ts` emits anchor facts (guarding
only that the target exists). During lowering, `PlacementOwnershipPlan` records
pre-existing placements, authoritative position overrides, and axes claimed by
position facts (a point pin or an interval's edges) so legacy read-vs-write
policy is explicit data rather than scattered set checks.

The solve is two phases per axis. **Cell closure** feeds each node's STRONG
anchor pins into a per-axis linear-system bbox (`constraints/bbox.ts`): two
independent edges are rank 2, so the size falls out (the interval/span case) —
this is where a target's size is determined, with the node's own weak layout
size the default when no strong equation reaches it. A bbox over-determination
(two conflicting intervals on one target) is a named-owner conflict naming both
owners. Then the **difference graph** (`constraints/differenceGraph.ts`): with
sizes known, every anchor reduces to `min + offset` — `start`/`baseline`/`tail`
at 0, `middle` at `size/2`, `end`/`head` at `size` for a size-strong cell (read
off the closed box, `strongAnchorOffset`), else the node's local-frame anchor
offset (`anchorOffset`; a stack part's `tail` is its free baseline's offset,
or 0, and its `head` is `size − tail`). `position`, `align`,
`distribute`, `nest`, and `grid` pins/relations over those reduced `min` values
go through BFS components + pin offsets + free/distribute/normalized-origin
fallbacks. Every solved cell writes back through **one path**: a size-strong
cell sets its extent (`setExtent({min, max})`), a position-only cell pins its
`min` anchor, a rank-1 size-with-no-position cell (align `"size"`, above)
sets its size only (`setSizeOnly`) — replacing the old three-way branch and
the size side-channel. `solvePlacementConstraints` throws on a bbox conflict
(both intervals' owners named in the message) rather than the silent
last-writer-wins an ungoverned second write would otherwise produce
(#725/#726) — align `"span"`/`"size"` reuse this exact path for their
unbound-target check, and `lowerAlignPlacement` separately warns (not
throws) when a constraint ends up with nothing movable — every listed
operand already placed — except the deliberate `isDataPositionedAlignTarget`
skip (a self-scaled scatter facet), which stays silent.

Before any of this, the layer resolves every placement operand to a node
inside it (`resolveConstraintOperands`, `constraints/index.ts`). Every
operand is a name, and it goes through the same lookup as `ref("name")` (see
[Name Resolution & Scoping](/internals/core/names-and-scoping)), once per
distinct name. Operators such as `spread` and the axis, legend, and label
chrome name their own direct children, and the closest match rule makes a
direct child win over any deeper node with the same name. A missing, ambiguous, or
out-of-layer operand throws (#819), so a constraint can no longer bind nothing
in silence. An operand that is a direct child is its child's placeable, as
before. An operand nested inside a direct child is a `NestedOperand`
(`constraints/nestedOperand.ts`): its box is the container's box plus the
constant offset the container's own layout gave it, and the solve adds one
rigid `anchor-relation` (container `start` → operand `start`) per axis the
operand takes part in. Only a directly named child skips phase-1 baseline
placement, so an unnamed container stays put and the nested operand is a
fixed reference; a named container moves in the solve and carries the
operand with it. The container does the write-back; the stand-in's own
placement writes are no-ops, and its size writes throw, because a layer
cannot resize something another child already laid out.

The placement-coordinate compiler preserves the literal/datum distinction until
facts are emitted: literals are pixels, while datum coordinates elaborate
through the already-solved data→pixel scale plus any post-scale offset. This
keeps the unified constraint semantics without a generic dense linear solver:
strong facts win, relation cycles are checked for contradiction, and components
without an absolute pin are normalized so the minimum solved coordinate in that
component is `0`. Two kinds of component are the exception. One whose free nodes
share a baseline seats it at the layer's free-child origin (below). Ordered
`distribute` components are the other: their
directed chain source is a deterministic sequence origin, so negative spacing
remains authored overlap instead of being erased by min-normalization. If a
graphic needs a floating component to appear at a particular absolute
coordinate, that placement must be explicit.
A layer's `.relate()` can also hold drawing clauses (an `arrow`, a
`background` over refs), which are children of the layer that read positions
instead of writing them. The layer lays out its plain children and runs the
solve first, then lays out each drawing clause, in the order
`scheduleRelate` (`constraints/relate.ts`) computes from what each clause
reads; a clause is placed at the layer's baseline origin like any unconstrained
child. See [Name Resolution & Scoping](/internals/core/names-and-scoping).

The legacy per-constraint apply helpers have been retired from the constraint
path; spread, scatter, table, axes, and hand-written constraints all lower to
the same solver entrypoint. An incompatible same-solve interval + point
`position` on the same target/axis reports an over-determined placement instead
of letting one silently yield to the other.

Placement-time alignment dispatches on the same resolution. `align` emits
relations between child anchors and never pins. Where a floating component
lands is the solver's fallback, and its first rule is the **free-child
origin** (#773). A free child (a baseline magnitude, such as a rect with a data
`h`) has a baseline that stands for the measure's origin, the value a signed
`h`/`w` grows from. That origin is data 0 of the owning layer's frame, and
its pixel is the frame's `originPx`, by the one seating rule (`seatInScope`).
The layer computes this per axis (`freeOrigin`). It places unconstrained free children there itself (phase-1
placement, and `placeUnplacedChild` for a child the solve left unplaced on an
axis), and hands it to the solve as one input: in `solveAxisProblem`, a
component with no pin whose free nodes share one baseline is offset so that
baseline sits at the origin. Free nodes whose baselines differ (an `end` or
`middle` alignment) have no common baseline to seat, so that component falls
to the sequence or normalized origin as before. A `distribute` chain along the
axis places its members' baselines itself (its lowering marks those relations
`chain`), so the solver (`solveRank2Axis`)
does not list them as free. A stack puts each part's tail on the previous
head, so its one baseline is its origin, the 0 its running sums are measured
from. The stack's lowering names it: it includes the part that carries the
origin with how far from that part's tail to its head the origin lies
(`AnchorParticipantFact.origin`), and the solver lists that point whether or
not the part is a baseline magnitude, and whether or not it is size-strong (a
size-strong part's tail is its start). By default it is the first part's tail.
So a stack seats at the origin like a single bar, a negative first part hangs
below it, and two stacks of one sign each (grouped by sign) meet on the 0
tick. A stack over a `HasMidpoint` column carries its origin at the midpoint
of the order (a fraction of the way through the part it falls in, or the
tail of the first part past it), so every row of a Likert chart seats its
midpoint on the 0 tick
with no other code. A spread packs boxes from its first
member's start, which is not a baseline, so it lists none and keeps its
sequence origin, even when its members' baselines happen to coincide. Its
lowering marks its relations `chain: "spread"` (a stack's are `"stack"`), and
the difference graph gives a component that holds one no baseline at all, so
a free node aligned to one of its members does not seat it either. So a bar
with value −35 on an axis niced to `[−40, 50]` grows from the 0 tick, not from
the rounded −40. A free
layer is itself seated by its parent at its own baseline, so its frame has
that baseline at local 0 (`frameOf`), and so does its free-child origin:
applying the map again would count the offset twice, and letting the component
float would let min-normalization lift a descent off the baseline. A layer's
self-scaled stash roots its own σ-scope, so its frame is that scope's, with its
origin at the scope's `originPx` (`descent·σ`), the same rule as the chart
root. A layer with no data 0 on the axis has no frame, and its components
float. Anchored children share the layer's frame and stay at 0, as the next
paragraph explains. Data 0 stands for the additive identity of the measure's
algebraic structure, and measures do not carry that structure yet (a TODO on
`seatInScope`).

Otherwise, if no explicit `position` (point or interval), self-placement, or
other strong pin fixes a connected component and it has no shared free
baseline, the solver normalizes that component so its minimum solved
coordinate is `0`. A user who needs the aligned
system to appear at a particular place must say so explicitly with a placement
constraint.

That normalization is also what keeps data-positioned children safe. A faceted
scatter panel over `[1955, 2010]`, anchored to the shared y data scale, should
not be pulled to `posScale(0)` (data-zero, far below 1955). So `align` leaves it
alone: **a target anchored to a data (POSITION) scope on a posScale axis, with a
non-`middle` anchor, is not moved** — `align` shares the frame (it still unions
the children's data intervals) but supplies no baseline. Its baseline is already
`posScale(0)` of the shared scope, so all such panels co-locate by construction.

**The guard asks the solver, not the space pass (Stage 6f).** This is the
blindingly-obvious final form the whole design arc was reaching for. The question
"is this target already positioned?" is answered by the placement solve's own
authority record — the `PlacementOwnershipPlan` — through one predicate,
`isDataPositioned(axis, name)`. The fact it reads (which children are anchored to
a POSITION scope on each axis) is a pure **data/scope** fact — a child's type
on that axis has a data position (it is pinned or origin-less, anything but
free) — collected _once_ at the layer boundary and
handed to the solve as an explicit ownership input. The constraint path no longer
reconstructs the space pass's `free`/`determined`/`conflict` lattice by calling a
`placementOn` method on the target mid-lowering; there is no layout fact derived
from the space pass in the guards anymore. (The space folds themselves still read
the origin state — the `union`/`middle`/anchored decisions — which is where a
determinacy read belongs.)

When alignment does write an anchor relation, it asks
`Placeable.localAnchor(axis, anchor)` for the anchor's coordinate in the
target's local box. `GoFishNode.localAnchor()` derives that from the node's
intrinsic dimensions (including baseline/min/center/max), so relation solving
can handle asymmetric boxes such as text and negative bars without relying on
the display transform.

Because the fact is a single scope-membership input to the solve, this is the
_whole_ mechanism — no flag, no scoping. (Historically the same effect needed a
`guardDataPositioned` flag on spread/scatter aligns plus a per-axis `fromSize`
boolean reconstructed from the pre-fold child spaces in the layer; then a
`placementOn` method reconstructing the placement lattice per target during
lowering. All are gone — the ownership plan's per-child scope-membership read is
strictly more general, handling a mix of positioned and free children that the
old all-or-nothing axis guard could not.) See
[the spec](/internals/design/size-difference-unification) for the
"space as abstract interpretation" framing this falls out of.

Three patterns cover most operators:

**Leaf shapes** (`rect`, `ellipse`, `petal`, `text`, `image`) decide the
kind from their props. A rect with data-bound `h` emits
`CONTINUOUS(interval(0, value), "free")` on y (the value's positive part as
ascent, its negative part as descent); the same rect with literal `y` and `y2`
emits `CONTINUOUS(interval(y, y2), "pinned")`. Constants (no
data-bound dim) emit `UNDEFINED` — the literal pixel value is handled at
layout time by `computeAesthetic`, not via the underlying-space tree. (The
old anomaly where a literal-pixel `min` plus a data size made `DIFFERENCE`
while an absent `min` made `SIZE` is gone: both are `CONTINUOUS`, differing
only in their origin state — an off-scale pixel min is a difference, an
absent min is a `free` magnitude.) A leaf writes no claim hook: its claim is
the one its type implies.

**Compositional operators** (`spread`, `stack`, `layer`, `enclose`)
combine children's spaces. `spread({ glue: false })` keeps the magnitude
along the stack direction so a parent can solve for shared scale factors
via `Monotonic.inverse`. `spread({ glue: true })` (i.e. `stack`) lays
children's extents end to end into a `POSITION` over their running sums
(`[0, sum]` for positive parts) — the operator commits the data-driven
magnitudes to an anchored axis. Since the operator/constraint
unification, these folds have one home: spread's resolver _is_
`distributeSpaceFold` on the stack axis and `resolveAlignmentSpace` on the
cross axis — the same functions the constraint path uses (see
[The contract](#the-contract)), each with its claim half
(`distributeExtentFold`, `resolveAlignmentExtent`). `layer` and overlay-style
operators use `unionChildSpaces` (`alignment.ts`). All of them are the one
overlay fold: the union of the children's seated intervals (each on its
baseline for an overlay), with the result's origin pinned when any child is,
free when every child is, and none otherwise; its claim half,
`unionChildExtents`, overlays the claims the same way, keeping the symbolic
Monotonics (the per-side max of the ascent and descent claims) for a free
result. UNDEFINED children carry no opinion and are ignored throughout, so a
fixed-pixel (UNDEFINED) sibling never vetoes the magnitude-preserving path.

**Coordinate-transform operators** (`coord`) fold their children with the
same overlay fold (a category axis wins, a declared window pins), annotate the
result with the transform that will later map underlying positions to display
positions, and keep it for their own σ-scope; see
[Flattening the Scenegraph](/internals/layout/coord-flattening).

## Worked example: stacked bar chart

```js
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
```

Each `rect` starts with a data-driven height and no data-driven y
position: its type is `[UNDEFINED, free [0, count]]`, and its claim on y is the implied `count·σ`.

The vertical `stack` (which is `spread({ glue: true, dir: "y" })`) glues
each lake's species rects together. Its stack-direction children are all
free magnitudes, so it lays their data intervals end to end and pins the
result: `pinned [0, total_lake_sum]` on y, claiming the parts' claims end
to end (`total_lake_sum·σ`). The alignment direction (x) of the stack is
UNDEFINED because each rect's x is UNDEFINED.

The horizontal `spread` separates lakes. Its children are now stacks
with `[UNDEFINED on x, pinned [0, total] on y]`. Stack direction (x):
no children are continuous, but they're named (the "by" key produces lake
keys) → `ORDINAL(["Lake A", ..., "Lake F"])`. Alignment direction (y):
the children are pinned → `pinned unionAll([0, total_i])`
= `pinned [0, max_total]`. (Lining up unstacked bars instead gives a free
`[0, max]`: alignment shares a baseline, it does not pin. The render root then
places that baseline and renders the same absolute axis.)

So the root underlying space is `[ORDINAL(lakes), pinned [0, max_total]]`.
The y-axis renders quantitative ticks (POSITION); the x-axis renders
ordinal labels at laid-out positions (ORDINAL); both follow from the
tree, with no special "bar chart" rule.

The stack's `size → position` transition is the important step. A single
rect with a data-driven height doesn't by itself establish where that
height lives in a shared coordinate system — it only says it has a
quantitative extent. The stack gives those extents a common origin and
glues them edge-to-edge, producing a `position` space from zero to the
bar total. The spread doesn't glue; it separates.

## Size resolution

To map data to screen space, we need to figure out how to scale it to
fit. As a rule of thumb, we want all of underlying space to be visible.
As a consequence, bar charts should never be truncated, because each bar
is fully embedded in the underlying space. On the other hand, a
scatterplot's points may be truncated on the edges of the frame since
their sizes are not embedded in the underlying space of the graphic.

**Continuous space resolution.** For position and difference spaces, we
are basically mapping some interval of minimum and maximum values to
available physical space. This can be performed by a traditional scale
function. For now, we assume these scales are always linear and lean on
data pre-processing and coordinate transforms to introduce
non-linearities.

**Discrete space resolution.** Layouts like `spread`'s arrange things
using pixel-based spacing (like putting 8 pixels of spacing between bars)
so we can't compute a scale function right away. Instead, we assume we
are looking for some linear scale factor (data could be scaled using a
non-linear scale function before this) and we have to figure out how to
scale the shapes that are being placed by creating a function from the
scale factor to the output size if we use that scale factor. Then we
solve.

A shape can have three kinds of sizes:

- fixed (eg, `rect({w: 10})`)
- inferred (eg, `rect({w: undefined})`)
- data-driven (eg, `rect({w: 'foo'})`)

These correspond to three kinds of intrinsic sizes:

- fixed: constant, non-zero size, no dependency on scale factor
- inferred: constant, zero size, no dependency on scale factor (this
  seems a bit weird and may be changed later)
- data-driven: size depends on scale factor

In truth, data-driven sizes seem to act like the inferred case as well,
because they can take on any size given to them (although they sometimes
have a minimum size, such as a spread operator where even if the shapes
have 0 size, the spacing between the shapes yields some minimum overall
size).

## Layout dispatch

After both walks, layout proceeds on a single principle:
**a continuous extent's scale factor is its claim's `width.inverse(size)`, and
a pinned one _also_ builds a position scale** from its type. Before the [#586
collapse](#the-three-space-kinds) this was a three-way switch on the kind
(`SIZE` inverted a Monotonic, `POSITION` divided by an interval width,
`DIFFERENCE` divided by a width); a pinned or origin-less claim with no pixel
overhead is just `linear(dataWidth, 0)`, so `width.inverse(size) = size /
dataWidth` reproduces both divisions, and the switch folds away:

```
gofish.tsx (root):
  if root[axis] is a free magnitude     → sigma = claim[axis].width.inverse(canvas)
  if root[axis] is pinned               → map = an AxisMap over its data interval
  pass one `AxisScale` = { sigma?, map? } downward per axis — a child reads
  `sigma` for size, `map` for data position (they're mutually exclusive at root)

layer.layout, on an axis the node scopes (node.shared[axis] — set by
`spread`/`stack`'s `sharedScale` and on every chart's content; default
[false, false] is a no-op), when it roots the scope (no inherited σ, or a
self-scaled stash — a chart nested in another chart's mark inherits):
    if claim[axis] exists → claim[axis].width.inverse(size[axis])
    else → undefined (no σ-dependent room, e.g. an ordinal of fixed boxes)
```

**Every scope solves σ from its claim, and `originPx` from its baseline.** A
scope root, pinned or free, solves `claim.width(σ) = box` (`ScopeRegistry.
solveScope`). Pixel overhead in the claim (a spread's spacing, a nest's
padding) takes its pixels, and the data part gets the rest. When the axis has
an origin, the scope then fixes `originPx`: every claim is measured from data
0, so data 0 sits `claim.descent(σ)` above the box's low edge, and `originPx =
claim.descent(σ)`. For a pinned claim with no overhead that is `−σ·min`, the
domain filling the box as it always has. An origin-less scope solves σ and has
no `originPx`. For this to hold, a pinned child's claim must reach its
parent's union intact: `unionChildExtents` places a child at its own data
coordinates, reaching its own ascent above data 0 and its own descent below
it, the same layout the scope gives it. The `position` operator, which moves
its content's data by a datum offset `v`, moves its claim with it (`v·σ` goes
from the descent to the ascent). The `Position: outset-left` labels
story is the case that needs it: its rows are bars 25 px apart, pinned by a
baseline alignment, so the root's claim is `137σ + 100` and σ leaves exactly
100 px for the spacing.

Nicing widens only the data part of a claim: the niced claim is the claim
plus `σ·(nicedWidth − dataWidth)`, both widths in data units from the type
(`niceScope`). The widths are lengths, so this holds for a signed domain and
for a delta axis alike. The overhead keeps its pixels. Where the widening
goes follows the axis: an absolute axis's claim is measured from data 0, so
each side widens by its own niced end, while a delta axis centers its content
in the niced width, so half goes on each side.

Leaf shapes never need to compute their own scale factors — they receive the
per-axis `AxisScale` via the `scales` parameter and read its `sigma` in
`computeSize` (and its `map` via `pxOf` for data position).

`spread`/`stack` no longer have their own `layout` — they **elaborate to
`layer + align + distribute`** (`spread.tsx`), so the dispatch above lives
entirely in `layer.layout`. `buildChildScalePlan` is the shared layout-time
planner: explicit self-scaled axes first derive local maps/scale factors, a
layer whose constraints fold to a SIZE claim then inverts that fold against its
allotted size (`fold.inverse(size[axis])`) to derive a local scale factor for
its constrained children (returning failures so `layer` can warn before falling
back), and a `sharedScale` scope finally runs the per-axis solve in the
pseudocode above. `layer` recombines the per-axis σ and `map` into one
`AxisScale` per child at `child.layout`. The result is a **fresh `childScaleFactors`
array** handed to descendants — **no node ever mutates the inherited σ**. That is the
claim-hoisting form of `sharedScale` (#549): a scale solves at the lowest node
where its measure stops being shared, and the result flows to descendants only,
never leaking to siblings.

This dispatch is the practical embodiment of the underlying-space-kind
distinction. It also happens to make the rendering pipeline more readable:
once you know the kind, you know which arithmetic applies.

## The one solve site: the σ-scope registry

Every scale above resolves the same frame equation — `content(σ) = allocated`,
inverted once by `Monotonic.inverse` — but historically that inversion was
written out at four-plus places, each with its own pixel budget and fallback:
the render root (`gofish.tsx`), an explicit-pixel-size axis and a composed
distribute budget and a `sharedScale` scope (all three inside
`buildChildScalePlan`), and a coord boundary (`coord.tsx`'s `fitAxis`). Keeping
them consistent needed a hand-written guard (the #618 "an intermediate must
propagate the inherited σ, not re-root against its own budget" rule).

Stage 6b makes those a **single mechanism**. A `ScopeRegistry`
(`ast/solver/scopes.ts`), created once per render on the `RenderSession`, is the
one place σ / posScale is derived: `solveScope(space, claim, allocated)`
solves a scope root's σ and its `originPx`, and `solveSize(frame, allocated)`
inverts a bare claim (a grid's tracks). The
derivation sites are now **σ-scope roots** — the render root, an axis with an
explicit pixel size, a constraint budget that roots its own scope, a
`sharedScale` operator, and a coord boundary — and each calls the registry.
**Everyone else inherits**: the #618 guard is now the structural rule "not a root
→ don't call the solve", so the inherited σ propagates unchanged (in
`buildChildScalePlan`, an intermediate budget simply skips the solve — the
`inheritedScaleFactors[axis] !== undefined && selfScaledSpaces[axis] ===
undefined` test that _was_ the guard is now the "is this a scope root?"
predicate). Because the arithmetic is exactly what the sites ran inline, the
solved numbers are unchanged; the registry only adds the choke-point.

Within one layer the three roots are one decision per axis, solved once: an
explicit size roots a scope over the stashed type and claim; otherwise, when no
ancestor owns σ, a composed constraint budget or a `sharedScale` node roots one
over the layer's own type and claim. Each is niced at the solve on demand, so
a budget never re-solves a stash's σ from the raw claim (that split put bar
tops off their ticks, the #659 symptom).

Behind `GOFISH_DUMP_SCOPES` the registry prints every scope it solved as a
printable frame equation — the debuggability bar the σ-affine model was chosen
for. One line per scope, e.g. a stacked bar (root POSITION scope + a shared SIZE
scope on the same axis, agreeing on one slope) and a sunburst (a coord boundary
re-rooting σ on the angular axis):

```
[scope] root   key=root  axis=y [0,140]→[0,400] = 400  σ=2.857 map=yes
[scope] shared key=layer axis=y 140σ = 400            σ=2.857 map=no
[scope] coord  key=coord axis=x 16σ = 6.283           σ=0.393 map=no
```

That the root and shared scopes on one axis print the same σ is Stage 6's
invariant made visible: **one slope per σ-scope, by construction**, because the
frame equation is solved once and the posScale is a derived view of that solve.

Stage 6c makes the registry the _sole_ producer of every slope, so that "by
construction" holds everywhere the carrier flows. Two former exceptions closed:
a coord boundary's POSITION axis used to hand down a fabricated `σ = 1` alongside
its map (a scope-less slope that no consumer read) — it now hands down the one
σ its scope solves, which its map shares; and the #582 equal-measure
recentering (equating x and y when they share a unit of measure) used to rewrite
the root's σ inline in `gofish.tsx`, off the registry's books. It is now a named
`recenterEqualMeasure` operation _on_ the registry, so the dump records the FINAL
σ (a `recenter` entry per axis) rather than the pre-recentering root σ. With both
closed, the only way a carrier shows two different slopes on one axis is the
legitimate **two-scope** case above (a SIZE scope and a POSITION scope, e.g. a
sub-budget panel's local size scale vs an inherited position map) — each half
still a single registry-solved scope σ, never independent state.

### Nicing is a scope operation, applied on demand

Domain rounding — `d3.nice` stretching `[0, 44]` to `[0, 45]` so ticks land on
round numbers — used to be a **pre-layout tree walk** (`resolveNiceDomains`)
that mutated every node's POSITION domain in place. That per-node formulation
had two failure modes (issue #659): a self-scaled region's stashed space never
got walked, so a marginal panel's bars sized the _raw_ domain while its niced
width solved an orphan scope (two slopes for one space — a genuine dual-slope
bug, not the sanctioned two-scope case); and any node could in principle nice
its own _subset_ of a shared domain differently from the union.

The settled semantics, recorded on #659: **scale resolution is per-scope; axis
rendering is per-node. An axis is a view of a scope, drawn at whatever node
wants one.** Nicing is therefore an operation on the _scope's_ domain — applied
once, at the scope's solve, so every consumer in the scope (content sizes, the
position map, axis ticks) reads the same rounded domain. `niceContinuous`
(`underlyingSpace.ts`) is the one nicing function; the non-coord scope roots
apply it at their solve sites — the render root (`gofish.tsx`), the self-scaled
stash and the shared-scale step (`buildChildScalePlan`), and the layer-local
datum-position scale (`buildPositionScalePlan`). It nices exactly the spaces
that render an axis over their interval (`axisOver`), or will once placed: a
pinned domain's two ends, a free one's two ends about its 0 (the absolute
axis of the scope that places its baseline; each side of the claim widens by
its own end), and a delta axis's width from 0, so a delta axis steps evenly
(ticks 20, 40, …, 160 rather than 20, 40, …, 140 and a last step of 7). A
**coord scope never
nices** (its domains map into a fixed coordinate range; rounding them would
break the mapping).

A scope nices to **the ticks of the axis that demands it** (`AxisTicks`): a
tick count (10) on a numeric axis, rounded with `d3.nice`; on a **time**
space (`calendar` set, see the column types below) the calendar partition of
the axis's inner row, rounded outward to its cells (`niceToCells` in
`calendar.ts`), so both ends of the axis are ticks. A round number of
milliseconds means nothing on a calendar, so a time space branches on its
kind inside the one `niceContinuous`. The partition is the axis's explicit
inner row (`rows[0]` of the stamped `AxisTicks`: `layout` parses
`axes.x.rows` once, and the axis is drawn from the same rows), else the one
the domain picks for about the tick count
(`tickPartition`, like d3's time ticks). Both read the domain and the axis
options only, never pixels.

And it is **demand-driven**: a scope nices its domain **iff at least one node
in the scope renders an axis on that dim**. Nicing is a presentation
adjustment whose demand comes from axis views — with no axis there is no tick
grid to round for, so axis-less content stays at the honest raw scale; with an
axis, content and ticks share the one niced domain, which is the contract.
Mechanically, `resolveAxes` leaves a persistent `axisDemand` stamp on every
axis-owning node: the axis's `AxisTicks`, which the chart's `axes` option
sets per dim (undefined for no axis). The `axis` work flags are consumed and
cleared by elaboration; the stamps survive to layout. Each solve site asks
`GoFishNode.scopeAxisTicks(dim)`, which returns the ticks of an axis in the
scope, or undefined for none: a walk over the scope's **space-flow
region** — up from the scope root while neither a self-scaled stash nor a coord
boundary cuts the flow, then across that region's subtree, stopping at deeper
stashes and coords. The region is exactly the neighborhood whose axes all view
the same underlying domain (an inner shared scope under an axis-drawing root
inherits the root's demand, because its space is what bubbled up into the
domain that axis draws; a stashed panel does not, because its space never
reached the ancestor's axis). The walk scans the whole region, so the answer is
kept on the render session, per dim, keyed by the region's root: every scope in
a region shares it, and the region is scanned once per render however many
scopes ask. A layer asks only when it roots a scope the answer changes (most
layers, e.g. one per keyframe mark under a `time.sequence`, root none), so the
solve takes the demand as a per-axis read, `axisDemand(dim)`.
Tick elaboration nices node-locally with the same `niceContinuous`, applied to
the axis-owning node's space — the same union that bubbled to the scope root —
so elaboration and the solve cannot disagree.

The facet corollaries fall out of the one rule: shared-scale facets all render
the parent scope's identical niced axis, and free-scale facets are their own
scope roots and nice per-panel — iff they draw their own axis. The marginal
histogram's panels draw no count axis, so their scopes stay raw and the panel's
map and σ agree on the raw domain; give a panel a count axis and its one scope
nices once, keeping bars and ticks consistent by construction.

## Scales generalize flex factors

A size scale whose range resolves to the parent's extent is doing exactly
what CSS flexbox does with `flex` factors — and GoFish's version is strictly
more general.

In flexbox, `flex: 1` and `flex: 2` on two children split the container's
space in a 1:2 ratio. The numbers are weights; the container's extent is the
range; the layout normalizes the weights to fill it. That is a scale,
narrowly construed: a domain (the sibling weights) mapped onto a range (the
container box) so the pieces sum to the whole.

This is precisely SIZE resolution. A row of `datum(n)`-sized children under a
shared size scale composes into a Monotonic whose inverse against the
available extent solves for the scale factor that makes the siblings fill it
(see [Layout dispatch](#layout-dispatch)). `claim.width.inverse(size)` is
the normalization step; the `datum(n)` weights are the flex factors. The
`cut` operator's relative form, `cut(source, { size: [datum(1), datum(2)] })`,
slices a region in a 1:2 ratio by normalizing those weights over the source's
extent — flexbox, expressed as data.

So flex factors are the **degenerate case** of a size scale: weights that
happen to be literal layout constants rather than data. GoFish generalizes
them along three axes the CSS model can't reach:

- **The weights can be data.** `datum(n)` is a literal weight, but the same
  machinery takes a field name (`rect({ h: "count" })`) so the proportions
  come from the rows, not the spec.
- **The scale can be shared.** A `flex` factor is local to one container; a
  GoFish size scale can be shared across sibling charts or facets, so the same
  weight means the same pixels everywhere it appears — proportions that
  compose across the page, not just within one box.
- **Absolute sizing coexists.** Flexbox bolts `flex-basis` / fixed widths
  alongside the factors as a separate mechanism. GoFish folds both into one
  field/datum/literal trichotomy (issue #266): a literal `10` is absolute
  pixels, `datum(n)` is a relative weight, a field name is a per-row weight.
  Mixing the two in one `cut` is not a conflict but exactly flex resolution:
  the absolutes are fixed-basis claims, and the size scale's _range_ is the
  parent extent **minus** those fixed claims, so the `datum(n)` weights
  normalize over the remainder — `cut(source, { size: [100, datum(1), datum(2)] })`
  fixes a 100px cap and splits what's left 1:2. The mixed case makes the
  identification sharper, not weaker: "fixed widths next to flex items" is just
  a size scale whose range has been shortened by the fixed children.

The payoff is conceptual economy: "fill the container proportionally" is not
a bespoke layout mode, it is what a size scale already does once its range is
the parent's extent.

## Self-scaling regions: an explicit or data-valued size absorbs an axis

The root resolves its scales against the canvas: POSITION → a posScale onto
the pixel box, SIZE → invert the Monotonic against the canvas size. A
`layer` (or `frame`) given an **explicit size on a dim** — a literal pixel
number, or a data-valued claim (a field name, a `field(...)` expression, or a
per-entry array) — does the same thing one level down — "a chart embeds the
way it renders." On that dim it becomes a self-contained **scaling region**:
its data space is absorbed internally rather than contributed to whatever
shared space its parent is building.

The motivating case is a marginal histogram, seaborn-jointplot style: a
center scatter in data units, with a count histogram pinned along each edge.
The histograms are sized to a fixed pixel band (`chart(data, { h: 80 })`),
and their count axis must not union into the scatter's shared x/y domains —
counts and beak-length millimeters are foreign units. The explicit pixel
size is exactly the signal that this region carries its own scale.

The rule lives in `layer`'s resolver and layout
(`graphicalOperators/layer.tsx`), in two halves, and it branches on whether
the explicit size is a **literal** or a **data value**:

- **`resolveUnderlyingSpace` and `resolveExtent`.** Both hooks follow the
  same steps (the type hook keeps the layer's composed types from
  `composeLayerTypes`, and the claim hook reads them, since a node resolves
  its types before its claim and the two memos are cleared together), and
  each stashes its own half.
  - **Literal pixel size** (`w: 80`). After resolving each axis normally, for
    any dim that has an explicit pixel size and whose resolved space is
    continuous (any origin), the real type is **stashed** verbatim and
    `UNDEFINED` is reported upward; the claim hook stashes the matching claim
    and reports none. The stash keys on the claim, not on the type's kind:
    a spread of magnitudes has an ORDINAL (or UNDEFINED) type, which is
    still reported upward so its keys label the parent's axis, but its room
    depends on σ, so the layer stashes its type and claim, roots its own
    scope, and reports no claim. An ordinal axis with no claim has no scale
    to absorb, so it is left untouched.
  - **Data-valued size** (`w: "count"`, `w: field("count").normalize()`, an
    entry-flagged `size` array). This is the "DATA-DRIVEN operator extent"
    case (#4/#20 — nested mosaic): the layer's own `w`/`h` becomes a `SIZE`
    claim reported **upward**, so the _enclosing_ scale scope solves this
    layer's pixel extent — the layer is a leaf in its ancestor's scope,
    exactly like a leaf `rect({ w: "count" })`. But that leaves the layer's
    own _composed content_ (its children's real space) needing somewhere to
    go: if the composed space is continuous, it is stashed as it is,
    together with the composed claim, before being overridden by the new
    data-valued claim. (It used to be converted to a free magnitude first, so
    that its descendants would get a σ and not only a map; a pinned stash now
    solves both, so the conversion, which dropped the content's position, is
    gone.) This is what makes "data-valued size ⇒ self-scaling
    region" the **general** rule (fixed #651 smell 1: without the stash, a
    subtree under a data-valued size silently consumed the _ancestor's_ σ
    instead of getting its own local scope): the node's own box is solved by
    the ancestor scope, and its interior is a fresh scope resolved against
    that box.
  - A parent layer's `unionChildSpaces` ignores an axis reported `UNDEFINED`
    (no opinion — see [The contract](#the-contract)) instead of polluting a
    shared domain with the absorbed region's units.
- **`layout`.** The stashed space gets a **local** scope solved against the
  layer's own resolved box (`solveScope(stashed, stashedClaim, size[dim])`):
  σ for every stash, and, when the stash has an origin, the layer's frame
  (the scope's map), in which each child sits by the one seating rule
  (`seatInScope`): a pinned child places its data through it, and a free
  child's baseline sits at its `originPx`. These locals override the inherited posScale /
  scale factor on that dim — definitionally, since the inherited scale is in
  the parent's foreign units. If the size can't be resolved (NaN), the locals
  are left undefined and the dim degrades to the inherited path rather than
  producing NaN scales. The stashed domain participates in demand-driven
  nicing exactly like the root's
  ([above](#nicing-is-a-scope-operation-applied-on-demand), issue #659): if
  the region renders an axis on the dim, the stash is niced at this solve, so
  the local map, the local σ, and the ticks read one rounded domain; if not,
  it stays raw. (Before #659 the stash escaped the pre-layout nice walk
  entirely — the panel's content sized the raw domain while a niced width
  solved an orphan scope.)

Note that a histogram's count axis is **anchored, not origin-less**, at the
frame boundary. Under start/end/baseline alignment, `resolveAlignmentSpace`
(`alignment.ts`) folds the baseline magnitudes into `pinned [0, max]` — it
commits the data-driven extents to an anchored axis so they can be aligned.
Without the self-scaling rule, that count POSITION would union straight into
the shared axes as if it were data units; the rule is what keeps the absorbed
axis from leaking.

The space reported upward is plain `UNDEFINED` for now. Issue #508's
proposed CONSTANT kind — "this axis has a known fixed pixel extent" (a
genuinely _constant_ width Monotonic, `linear(0, w)`, with no inverse, as
opposed to the through-origin `linear(w, 0)` of a scaling extent) — is the
eventual, more honest home for what a self-scaling region contributes to its
parent.

### Space-filling spines: `normalize` self-scales a stacking axis

The **space-filling spine** — the conditional axis of a mosaic / marimekko —
is now a plain instance of the general data-valued-size rule above, with no
layout-side special case at all (#700 Phase 2; this replaced the earlier
`stack({ normalize: true })` layout flag and its bespoke `__normalizeAxis`
hint). Its segments should _fill_ the extent in proportion to their value,
showing a conditional distribution (each column of a mosaic runs 0–100%
locally): `stack({ by, dir, size: field("count").normalize() })`.

The split is: `.normalize()` is a **data** transform, evaluated once, up
front, by `applyChannels` (`marks/createOperator.ts`) via
`splitAtNormalize`/`applyEntryNormalize` in `fieldExpr.ts` — it has nothing to
do with layout. For each of the operator's own split entries it runs the
PRE-normalize expression exactly as any size accessor would (an aggregate op
like `.count()` if chained, else the channel's default sum), then replaces
those per-entry values with each entry's **share** of their sum,
`v_e / Σv_e` — a windowed data transform over the operator's own children,
tagged with a share [measure](#measures-units-are-types) (`"<base> share by <by>"`,
via `shareMeasure`) so a share axis can never silently union with the base
measure's own axis.

`spread`/`stack`'s `size` option (one value per split entry, computed this
way) then wraps **each child** in its own sized `layer({ [w|h]: size[i] },
[child])`, before the usual align/distribute elaboration (`spread.tsx`). Each
wrapper's `w`/`h` is a **data-valued size claim** like any other — an ordinary
instance of the rule above, not a special stacking-axis hint. The wrapper is
purely a sizing shim: it copies the wrapped child's key/datum/`__splitBy`
identity onto itself so downstream ordinal-axis labeling and
`resolve(..., { from })` still see the un-wrapped child's identity.

This is the whole trick behind **nested mosaics**. Each level plays two roles
on its two axes: its stacking axis's per-entry `size` shares (each child a
local, isolated self-scaling region, reporting `UNDEFINED` up from that
child's wrapper), while its cross axis reports its raw `Σcount` SIZE _up_ from
the operator as a whole (the ordinary data-driven-operator-extent path — the
operator is a leaf in its ancestor's scale scope). Because the per-entry
self-scaling regions are local and the raw count is never mutated, the
marginal × conditional × conditional factorization composes to any depth:
`class → sex → survived` alternates y → x → y, and every level reads `count`
raw. See the `stack` operator and the mosaic gallery examples.

An earlier iteration (the `stack({ normalize: true })` layout flag) needed a
bake-side escape hatch: because `resolveUnderlyingSpace` reports `UNDEFINED`
upward for a self-scaled axis, the bake's y-flip rule (since replaced by
[axis direction](/internals/layout/passes#axis-direction)) couldn't see that
the axis was _really_ CONTINUOUS, so a parallel `_selfScaledSpace` field on
`GoFishNode` carried the true kind alongside the reported `UNDEFINED`, purely so
the flip could still open over a normalized spine. The per-entry `size`-claim mechanism
doesn't need that: each entry gets its own wrapper wired through the ordinary
data-valued-size path above, and stacking now follows **data order** directly
at every level rather than needing a flip to correct it — so `_selfScaledSpace`
and its fallback were deleted outright, not generalized.

A differently-shaped side channel came back later for a different consumer.
`layer.tsx`'s self-scaling branch now also writes the real (anchored/
difference) space it's about to replace with `UNDEFINED` into
`GoFishNode.selfScaledSpace` — its presence (`!== undefined`) IS the "this
dim is self-scaled" marker, so there is no separate boolean field to keep in
sync. Nothing in layout reads it — `_underlyingSpace` is still
`UNDEFINED` there, so sizing is exactly as before. The reader is `resolveAxes`
(see [Axes](/internals/frontend/axes)'s "unifying duplicate axes across
self-scaled siblings" section): a `spread` whose per-group children are each
self-scaled to the same explicit pixel width over the same domain (a ridgeline
chart's per-month panels) collapses the union to `UNDEFINED` at the parent
exactly like the mosaic case above, but here the parent needs to tell "my
children all silently agree on one real scale" apart from "my children are
independently self-scaled" — a distinction the boolean alone can't make. The
stash makes that comparison possible without touching layout at all.

## Measures: units are types

The self-scaling region above is the heavy hammer — give a sub-chart an
explicit pixel size and its axis stops talking to the outside entirely. But
the marginal histogram has a subtler need at the _shared_ boundary. When the
top count histogram and the center scatter overlay on x, the union should
succeed (both are beak-length millimeters along x) and the count axis, folded
into a position interval, should _not_ pollute that millimeter domain. The
shared union has to tell "same units, merge" from "foreign units, refuse"
without a human reading the field names.

That distinction is a **measure**: a unit-of-measure tag carried on a space.
`CONTINUOUS` carries an optional `measure?: Measure` (`Measure` is just a
string — a field name like `"Beak Depth (mm)"`, or `"count"`). It is the dead
`source?` slot's replacement, but with teeth: spaces now **unify per
measure**.

```ts
// underlyingSpace.ts
export type CONTINUOUS_TYPE = { kind: "continuous"; dataInterval: Interval; origin: Origin; measure?: Measure; ... };
```

**Merging.** Two helpers in `underlyingSpace.ts` decide what happens when two
measures meet. `undefined` is always permissive — it means "no claim", unifies
with anything, and yields the other side (this is why `getMeasure` returns
`undefined` rather than a `"unit"`/`"unknown"` sentinel: a measureless value
must merge silently into a tagged one).

- `mergeMeasures(a, b, context)` — unify as **types**. Equal measures unify to
  themselves; two _different_ defined measures are a type error and it
  **throws**. This is the one policy for every continuous composition, and it
  is decided by the measures alone, never by the origin state: overlays and
  alignments (`alignment.ts`), spreads and stacks (`distributeSpaceFold`),
  coords, and a layer's datum domain all use it. So overlaying a count axis
  onto a millimeter axis fails loudly instead of corrupting the domain, and so
  does stacking or overlaying two magnitudes in different units.
- `forgetOnConflict(a, b)` — a conflict **forgets** (returns `undefined`)
  rather than throwing. Used only for ORDINAL axes, whose measure is the
  grouping field that names a category axis: categories set up no σ, so two
  grouping fields on one axis lose the name, not the scale. A grouping field
  is no unit, so it never enters `mergeMeasures`: a datum position in dollars
  beside a category spread on the same axis, or a spread whose targets mix a
  category spread with dollar bars, unifies only the continuous units.

Why one policy: the measures of an axis decide how many σ-scopes it needs,
which is part of setting up the layout problem, not of solving it. One axis
holds one measure and one σ. An axis that genuinely needs two (a dual-axis
chart) is multi-scale (#525), not a unit to forget. Two fields that are the
same unit (a movie's US and worldwide gross, both dollars) say so with
`field(name, measure)`; their field names alone are different measures.

**Where measures come from** is itself a small type system with three sources,
checked (not silently prioritized) in `resolveMeasure` (`channels.ts`):
the channel aggregators use lodash's per-helper entrypoints for native ESM
compatibility, but their semantics are still `sumBy` for size and `meanBy` for
position.

1. **Explicit annotation** — `field(name, measure)` / `datum(v, measure)`
   (`data.ts`). A real type claim about the channel's unit.
2. **Inferred provenance** — a transform tags its output array. `bin()`
   (`transforms.ts`) attaches a field→measure map under the well-known
   `MEASURE_PROVENANCE` symbol (`data.ts`): its `start`/`end`/`size` columns
   are still in the _source_ field's units (e.g. millimeters), and `count` is
   `"count"`. The symbol rides the array, not each row, so it survives
   `derive(...)`. Also a real type claim.
3. **Field-name default** — a bare string accessor's field name. A _weak_
   binding, not a claim; it yields to either of the above.

`resolveMeasure` reads annotation and provenance together: if both are present
and **disagree**, it throws immediately at the channel — before any space union
runs — naming the field and both measures. Otherwise annotation refines the
weak default, and with no annotation the result is `provenance ?? field-name`.
This completes the field/datum/literal trichotomy of issue #266: a literal has
no field identity (no measure), a bare field name is a weak default, and an
annotation or provenance is a hard claim. `inferSize`/`inferPos` tag the
`value(...)` they emit with this resolved measure, which is what eventually
lands on the space.

**Provenance must reach mark channels, not only operator channels.** An operator
resolves each channel's measure once from its whole input array (which carries
the `MEASURE_PROVENANCE` symbol), but a _mark_ channel runs per split leaf — and
a leaf is a fresh sub-array (groupBy/filter/slice) that doesn't inherit the
symbol. So the operator re-tags each array leaf with its parent's provenance at
the split site (`copyMeasureProvenance`, `data.ts`, applied in `createOperator`),
letting a mark bound to a transform-output field (e.g. a bin's `start`/`end`/
`size`) read the source measure off its own data instead of falling back to the
literal field name — which would otherwise turn a legitimate same-unit overlay
into a false conflict. (Residual, tracked in #534: single-`Datum` leaves and the
Python derive-RPC bridge still need a wrap-time / RPC-carried tag.)

This same size-vs-position measure comparison drives **embedding** (`baseEmbedded`,
`data.ts`): inside a coordinate space, a dim's size becomes a swept coord extent
only when its measure matches the dim's own position measure — a foreign-measure
size (a bubble's area) stays a flat point. See the embedding-resolution pass under
[layout passes](/internals/layout/passes#pass-8-5-embedding-resolution).

**Constraint-domain measures.** A `position` constraint's datum coordinate
carries the same resolved measure, and `collectPositionDomains` folds those per
axis with `mergeMeasures` — so a layer's own positioning constraints in clashing
units (an interval coordinate with one endpoint in `mm` and the other in `inch`)
throw at the source. The layer then unifies this constraint-domain measure with
its children's, as types, like any other composition. A child that a datum
position places (`datumPlacedChildren`, `compose.ts`) is left out of that
union altogether: it sits where its datum maps, so its own extent and measure
are in its own frame (a `scatter`'s circle sized in its own units, a pie glyph
in its angle), not in the axis's data. This restores the unit tag the scatter
operator's reduction onto constraints had dropped.

**Propagation through the baseline → anchored conversion.** A histogram's
count axis is all baseline magnitudes (origin 0) at the children, and
`resolveAlignmentSpace`'s start/end/baseline path folds them into
`pinned [0, max]`. That conversion carries the unified child measure forward —
it is load-bearing, because it is exactly how the count axis acquires its
`"count"` tag so a later overlay union can recognize it as foreign and refuse.

**The error and its remedies.** A clash from `mergeMeasures` is a
`MeasureClash`, and it reads, for a grouped bar chart over two gross columns:

> The y axis combines two different measures, "Worldwide Gross" and "US
> Gross" (where marks are lined up). One axis can show only one measure.
> If both are the same kind of quantity, give them the same measure, e.g. if
> both are dollars, field("Worldwide Gross", "dollars") and field("US Gross",
> "dollars"). To title the axis, use the axes option (its title).
> If they are different kinds of quantity, each needs its own axis: give the
> inner chart its own w and h so it scales on its own.

Each fold passes its axis index and a plain phrase for the composition (a
`MeasureSite`). The fold does not know what the axis is called, so the node
whose type hook raised the clash names it on the way out
(`GoFishNode.axisName`): `x` or `y`, or the name the innermost enclosing
coordinate space gives it (`r`, `theta`, `lon`, `lat`). It reads the same
axis scope the name pass uses (`axisScopeFor`), so a space that declares no
names leaves `x` and `y` even inside a polar one. The example is a unit,
because a measure says what kind of quantity a column holds; the axis title
is a separate choice, made with the `axes` option. `field(name, measure)` is
spelled the same in Python, so one message serves both.

The two remedies are the two escape hatches this essay already describes:
annotate to declare the units _are_ the same (collapsing them to one measure),
or wrap the foreign region in an explicit pixel size so it absorbs its own
axis (the [self-scaling region](#self-scaling-regions-an-explicit-or-data-valued-size-absorbs-an-axis)
above) and never reaches the shared union at all.

**Stage 2.** This is Stage 1: one measure per axis, unified or refused. The
sequel is a measure-keyed _family_ of underlying spaces per axis — true
multi-scale, where a single axis can host several measures at once (dual axes).
That is also the natural place for axis titles to read a measure off the space
they describe (cf. issues #452, #386).

## Column types: the chart schema

`chart(data, { schema })` (`schema.ts`, #984) declares, per column, the
classes the column's values have, in the style of typeclasses:

```ts
chart(survey, { schema: { response: Schema.ordered(LEVELS).diverging() } });
```

A column type is a record keyed by class name (`ColumnType`), and the engine
reads only the classes, never the builder words. Three classes exist:

- `HasOrder` (`Schema.ordered(levels)`): the values are the levels of a fixed
  order. `splitEntries` groups a `by` over the column in that order instead
  of first appearance, so every operator that splits (spread, stack, group,
  scatter, ...) follows it, and `field(...).sort(...)` and `.reverse()` still
  reorder from there. A value outside the levels is a loud error naming the
  column and the stray values (`strayLevelsError`), checked where the order
  is used (`orderByLevels`, at a split or a color scale), not when the chart
  types its data, so a `filter` in the flow can drop the stray rows first.
- `HasMidpoint` (`.diverging({ midpoint })`): the order has a midpoint, the
  point `{ at }` along it in edge coordinates. Level `i` spans `[i, i + 1]`,
  so 0 is the first level's leading edge, `n` the last level's trailing
  edge, and 2.25 a quarter of the way into the third level (the `cutoff` of
  ggstats' `gglikert`). `.diverging()` writes the default `n / 2` into the
  record, so the wire form always carries a number: the middle of the
  middle level when the count is odd, the boundary between the two middle
  levels when it is even. It requires `HasOrder`; the builder's `this` type
  makes `.diverging()` exist only after `.ordered(...)`, and `columnTypeOf`
  rejects a wire record that has one without the other. A midpoint that is
  not a finite number in `[0, n]` is an error from `checkMidpointOnOrder`,
  which `.diverging()` calls at once and `columnTypeOf` calls on a wire
  record; Python's `.diverging()` raises the same messages, word for word. A stack over the column takes the
  midpoint as its origin (`stackOrigin`, then the stack fold and the
  free-origin seat above): inside a present level, that fraction of its
  part; on a boundary, or inside a level the row lacks, the tail of the
  first part past it (or the last part's head). A stack laid out against the
  order measures the fraction from the other end, so the midpoint `at` sits
  at `n − at` along the layout. The midpoint comes from the order, not from
  the parts present: a row with no responses for some level keeps the same
  midpoint. So does the side of it each level lies on: the split applies its
  `field(...).sort()` and `.reverse()` to every level of the order
  (`orderEntries`), and `stackOrigin` reads the stack's direction off that,
  so a row with one part puts it where a full row does. A split order that
  is neither the order nor its reverse is an error.
- `HasCalendar` (`Schema.time({ zone })`, #1057): the values are instants,
  read on the calendar of the IANA zone `zone` (UTC by default). It is the
  one class that changes the data: `applySchema` (now async, because it
  loads Temporal; see `calendar.ts`) copies the rows and turns each value
  into epoch milliseconds (`toEpochMs`: an ISO date is the start of that day
  in the zone, a date-time without an offset is wall-clock time in the zone).
  It is also the one class that is inferred, and only locally: a column
  whose first non-null value is a JS `Date` is a UTC time. Strings and
  numbers never are. A pandas, polars or pyarrow datetime column crosses
  from Python as an Arrow timestamp or date column, unchanged, and the
  widget's decode (`widget-src/arrowDecode.ts`) attaches `HasCalendar` to
  the rows, as column types. A tz-aware timestamp is an instant: it decodes
  to epoch milliseconds, typed in its own zone. A naive timestamp or a date
  is a wall-clock value: it decodes to an ISO string without an offset,
  typed UTC, so `applySchema` reads it in the zone of a declared `schema`
  entry (which wins over the decoded type) exactly as it reads the same
  string from JS data, or in UTC without one. The decode only attaches
  types: whoever reads the rows converts them first with its own schema (a
  chart tier is chart data, and a callback's result goes through
  `applyLambdaTyped` in `serialize/registry.ts`, so a lambda accessor's or a
  single-datum `derive`'s result holds epoch milliseconds). No schema names
  a value inside a list or a struct, so a time there decodes to epoch
  milliseconds (a naive one read in UTC), and a list of structs, a list of
  rows, carries its own column types. An instant has no zero. A position read from the column carries the
  class on its `DatumValueImpl` (`fieldType`, which `inferNumeric` now sets
  for any typed column, with `createOperator` passing the column it resolved
  from the whole input, measure and type together, `resolveColumn`), and the point space it
  builds carries it as `CONTINUOUS_TYPE.calendar` (`positionCalendar`,
  `withCalendar`). The folds that build a continuous space from parts keep
  it (`mergeCalendars`: the overlay fold, a layer's datum-position domain in
  `compose.ts`, a rect's two ends, the `position` operator's offset), and
  two parts on different zones are an error, like two measures. A time space
  is niced to the cells of its axis's inner row (`niceToCells`: the
  smallest run of whole cells that covers the domain, so a domain of one
  instant, which `tickPartition` ticks at days, spans the day that holds
  it), and its axis is a time axis
  ([Axes](/internals/frontend/axes#the-three-kinds)). An empty domain (a
  column of nulls) or a non-finite one is not niced at all, for numbers and
  times alike. Calendar cells
  (`CalendarPartition`) live in `calendar.ts`, which runs all calendar math
  on Temporal, native or the polyfill it loads when the runtime has none.

The types ride the chart's data array under the `COLUMN_TYPES` symbol, the
same way a transform's measure provenance does: `ChartBuilder` copies the
array and tags it (`applySchema`, which keeps the measure provenance the
array already carries), `createOperator` copies the tag onto each
split leaf, and each data-transform operator (`mapOperator` in
`marks/chart.ts`) types its result by its own typing rule. A `derive`
(`typeLikeChartData`, also `resolve` and `join`) types its result with
`applySchema` too, passing the input's types as `applySchema`'s `inherited`
types, whether or not the function returned its input array. It keeps only
those that still fit the result's values: each class has one predicate for
the values it accepts as they stand (`ACCEPTS` in `schema.ts`: a time holds
instants, epoch milliseconds or `Date`s, and an order holds text or
numbers), and a type fits a value when every class it has accepts it, the
predicates built once per column. A `Date` is an instant, so a time column
of `Date`s keeps its inherited type, zone included, and its Dates become
epoch milliseconds; a string needs a zone to read, so it does not fit. The
inherited types never reinterpret or check values, so a date rewritten to
"Mar" is plain text, not an error. Fitting reads values, not meanings: a
derive that recodes a time to plain numbers (years) keeps `HasCalendar`,
since any finite number is epoch milliseconds (#1089), and
`derive(fn, { schema })` is the fix. The result's own types override the
inherited ones column by column, inference types a column of `Date`s as a
UTC time, and `derive(fn, { schema })` overrides all of that for the columns
it names and converts their values like a chart's schema (a datetime column
a Python callback returns arrives typed from the widget's decode). A result
that is one object, not an array (a derive over a single datum), is typed
as one row and converted the same way. The operator never tags the array its
function returned. `log` returns its input, types and all. A `filter`
returns a subset of its input's row objects, so its typing rule carries the
input's types over as they are, with no fit check (a predicate that changes
the rows it tests is not supported); a filter that keeps a value outside an
order keeps the order, so the stray-level error fires where the order is
used, and that error names `derive(fn, { schema })` as a fix for an order a
derive's renamed values inherited. `applySchema` copies
the rows only when some time value is not epoch milliseconds already;
otherwise it tags a shallow copy of the array. So the stack's split reads
its `by` column's type off the data it splits, and a color channel's
`DatumValueImpl` records the type of the field it read (`fieldType`), which
lets the categorical color scale list its domain in the column's order. A
later class (`HasZero`, `HasCycle`, ...) is one more key on the record.

TODO(#984): measure provenance is the unit part of the same per-column record
and could fold into it; it stays a separate symbol for now.

## Field expressions: a pipeline orthogonal to channel aggregation

`field(name)` (`fieldExpr.ts`, #700) returns a chainable expression — a
Polars-column-expression-style builder where each method appends one op to an
ordered pipeline (`field("age").bin().sort()` bins first, then sorts the
resulting bins). The pipeline is read off either a live `FieldExpr` instance
or its deserialized wire shape (`{ type: "field", name, measure?, ops? }`, what
the Python bridge/IR produce directly) by the same `getFieldOps` helper, so
every evaluation site handles both forms identically.

Two op families consume disjoint **slots**, and mixing them is a checked
error rather than silently doing the wrong thing:

- **Domain ops** (`.sort(by?, order?)`, `.reverse()`, `.bin({thresholds?})`,
  `.dropNulls()`) apply to a `by` grouping key. `splitEntries`
  (`datumProjection.ts`) is the shared split-plus-ops helper behind
  `spread`/`stack`/`group`/`scatter`/`treemap`'s `by` (and `time.sequence`'s,
  which splits keyframes the same way — its groups are laid out in one shared
  frame, so the space they occupy is the space of the whole dataset, which is
  what keeps a playing chart's axes still; the `TimeTier` it hands a
  `time.transition()` is declared in the same module and carries the clock,
  the keyframes, the cycle of the time axis when the sequence is `cyclic`, and
  the clock's milliseconds per unit of the field). A
  build-in stagger's `by` reuses `splitEntries` for the order of its groups
  (`src/animation/grouping.ts`). `dropNulls` filters out
  rows whose value at the field is `null`/`undefined` FIRST (so it composes
  the same regardless of where it sits in the chain — every other domain op
  re-derives its grouping from these filtered rows), then it groups the
  remaining rows (`Map.groupBy` via `splitKeyFn`, which reads a `field(...)`'s
  `.name` exactly like a bare string) in order of first appearance, or in the
  order of the column's levels when the data declares the column ordered
  (`HasOrder`, see [Column types](#column-types-the-chart-schema)), then
  applies each remaining domain op
  in pipeline order — `bin` **replaces** the base grouping entirely (re-groups
  the raw rows into numeric bins, dropping empty ones); `sort` reorders the
  resulting entries, either by the group key itself or by the SUM of another
  named field over each group's rows; `reverse` reverses the entries. An
  aggregate op or `normalize` reaching a `by` slot throws — a domain op
  describes _which groups exist_, not _what a group's value is_.
- **Aggregate ops** (`.sum()`, `.mean()`, `.count()`, `.distinct()`) apply to
  a _value_ channel slot (a mark's `h`/`w`/`x`/`y`, or an operator's
  entry-flagged `size`) and fold a group's rows to a single value —
  `evalFieldValues` in `fieldExpr.ts`. A domain op or a second aggregate
  reaching a value slot throws (the fold happens once).

`.between(lo, hi, { closed })` is deliberately **not** an op. It returns a row
predicate `(row) => boolean` for the `filter` flow operator, and a predicate
belongs to none of the three slots: it never decides which groups exist, never
folds a group to a value, and never scales anything. Giving it an op would mean
a fourth slot that every evaluation site had to learn to ignore. For the same
reason it THROWS when the expression carries ops: `field("x").bin(10).between(...)`
would have tested the raw `x`, silently. `closed` is polars' `is_between`
argument, comparing by value (SQL `RANGE`) rather than by row count (Vega's
window `frame`). The bounds are plain numbers; a window that follows a `timer()`
is a lambda around the bare-value form, exported as
`between(v, lo, hi, { closed })` — which is also the loose-ends spelling of
`contains` in `util/interval.ts`.

**Expression evaluation is orthogonal to the channel's own aggregation.**
`inferSize`/`inferPos`'s shared core (`inferNumeric` in `channels.ts`) always
called `sumBy`/`meanBy` over the raw per-row values; it now instead calls
`evalFieldValues(accessor, data)` first — running any pipeline ops (an
aggregate, if the accessor carries one) — and only _then_ applies its own
default aggregation to whatever that produced. Neither side knows about the
other: when the pipeline already folded the rows to a singleton, the
channel's own sum/mean is the identity over that singleton, so
`rect({ h: field("weight").mean() })` reports the mean, not
`mean-of-a-1-element-array`-nonsense. A bare string or plain function accessor
carries no ops, so this is a strict superset of the pre-#700 behavior, not a
new code path for the common case.

**Measure implications.** `count`/`distinct` report values that are counts,
not the source field's own units — `evalFieldValues` reports measure
`"count"` for them (an explicit `field(name, measure)` annotation still wins
over this pipeline-determined default, following the same precedence
[`resolveMeasure`](#measures-units-are-types) already applies to provenance
vs. annotation). Every other pipeline reports no measure of its own, leaving
resolution to the channel as before. `.normalize()`'s share values get their
own tag, `shareMeasure(base, byName)` — see
[Space-filling spines](#space-filling-spines-normalize-self-scales-a-stacking-axis)
above for why a share is a distinct unit (0–1, not the base measure's own
units) that must never silently union with it.

## Axis inference

Conceptually, axis inference splits into two independent questions:

1. **What guide could this space support?** Answered by the space's
   origin state. A pinned interval permits a quantitative axis. An
   origin-less one permits a magnitude guide but not an axis with a
   meaningful zero. A `free` magnitude wants a legend, not an axis.
   ORDINAL permits labels at laid-out keys. UNDEFINED contributes nothing.
2. **Should that guide be drawn here?** Independent of the kind. The root
   of a stacked bar may have a POSITION y-space that permits a
   quantitative axis; a nested stack inside a more complex diagram might
   have the same kind without deserving its own visible axis. Conversely,
   a facet operator might explicitly request labels for the ORDINAL
   spaces it creates.

Both questions are now answered by a tree walk. `resolveAxes` (`_node.ts`)
performs (2): a top-down pass that tags each node's `axis.x` / `axis.y` as
`true` (this node owns a visible axis on that dimension), `"budget"` (a layer
sibling owns it), or `false` (suppressed via an operator's `axes:` override).
It honors per-operator overrides and short-circuits coordinate-transform
subtrees (polar axes are handled separately by `coord.tsx`). The space then
answers (1): anchored `CONTINUOUS` → quantitative ticks, unanchored → delta
labels, ORDINAL → labels at laid-out keys.

Selection is no longer tied to the root. A faceted chart tags an axis on each
facet-owning node, and an outer operator can suppress an axis its child would
otherwise produce. The flags are consumed by the **axis elaboration pass**
(`elaborateChrome`, `src/ast/axes/elaborate.tsx`), which wraps each flagged node
in a `Layer` of ordinary tick/label shapes constrained to the inferred domain —
so axes are not a privileged node type and the layout engine carries no
axis-specific budget machinery. See [Axes](/internals/frontend/axes) for the
full elaboration story.

## Discrete non-position channels

The tree is for spatial channels (x and y). Discrete non-position
channels — color, symbol, texture, stroke pattern, marker shape — don't
create an underlying spatial structure and aren't represented here. They
still need shared resolution (categories should map consistently across
a graphic; users should be able to override defaults; operators should
be able to introduce or delimit scopes), but the right model may be closer
to a theming API than to axis inference: a discrete color or symbol
channel resolves by looking up a category in an inherited theme scope,
with local operators or marks able to override the palette.

The current code does this with a `unit.color` map on `scaleContext`
(seeded by `resolveColorScale` in `_node.ts`), which is enough for
GoFish today but is not yet a general theming system. Future work. See
[Color Scale Resolution](/internals/layout/color-scales) for what is
implemented today.

## Adding a new operator

Four things to consider:

1. **What kinds of children does it expect?** If your operator only ever
   sees anchored, data-positioned children, you don't need to handle the
   symbolic-magnitude path. If it can be the parent of a data-driven stack,
   you do.
2. **What kind does it produce?** Pick the most informative result that
   honestly describes the space. A spread-style operator that lays children
   out side-by-side without summing should keep the magnitude (a `CONTINUOUS`
   at origin 0, symbolic in σ) along its stack direction. An operator that
   fixes children to specific coordinates should produce an anchored
   `CONTINUOUS` (a `POSITION`). An operator that introduces a categorical axis
   should produce ORDINAL.
3. **Does it transform spaces or merely pass them through?** A coord
   transform annotates without changing the kind. `enclose` and `wrap`-
   style overlays use `unionChildSpaces`. `position` is a pass-through.
   Match the existing patterns in `graphicalOperators/` and don't
   reinvent the merge logic per-operator.
4. **Does it add pixels, or compose or pass through its children's claims?**
   If so, write a claim hook (`resolveExtent`) next to the type hook, using
   the claim half of the fold you used for the type (`unionChildExtents`,
   `distributeExtentFold`, ...). If not, leave it out: the node then claims
   what its types imply. Never put pixels into a type.

If your operator is layout-time-only (no contribution to the kind tree),
return `[UNDEFINED, UNDEFINED]` and rely on the children to drive
inference upward through your wrapper (e.g. via `unionChildSpaces` from
a parent layer).

## Prior art

The general lesson — that graphical structure determines scale
structure — is shared with Vega-Lite's resolver, Observable Plot's
distributed inference, and Atom's recursive layout (Park et al. 2017).
GoFish's contribution is generalizing that lesson into an explicit
per-node intermediate representation rather than a set of
operator-specific conventions. Anyone can add an operator that
contributes, transforms, or consumes underlying-space facts; nothing in
the layout, posScale, or guide pipelines is privileged.

The design also borrows from compiler architecture, especially typed
intermediate representations and the value of an explicit elaboration
pass that turns a convenient surface specification into a more precise
representation that later passes can consume without re-inferring the
same facts.

For a longer treatment, see the "Underlying Space Tree" section of
GoFish's thesis chapter (parts/theory/underlying-space.typ in the
companion thesis repo).

## Pointers

- The type definitions and constructors: `src/ast/underlyingSpace.ts`.
- The claim record and its helpers: `src/ast/extent.ts`.
- The traversal drivers: `_node.ts`'s `resolveUnderlyingSpace()` and
  `resolveExtent()`.
- Per-shape resolvers:
  `src/ast/shapes/{rect,ellipse,petal,text,image}.tsx`.
- Per-operator resolvers (each colocated with the operator):
  `src/ast/graphicalOperators/{spread,layer,scatter,enclose,porterDuff,position,connect,arrow,table,coord}.tsx`.
- Overlay union helpers: `src/ast/graphicalOperators/alignment.ts`.
- Constraint space folds + the shared slice allocator:
  `src/ast/constraints/{distribute,align,folds}.ts`.
- The Monotonic algebra used by continuous-extent composition: `src/util/monotonic.ts`.
- Layout consumption: `gofish.tsx`'s `layout()` for root-level dispatch;
  `layer.tsx`'s `layout` for the per-scope scale-factor solve and the
  constraint budget inversion (`spread`/`stack` elaborate to `layer`, so they
  have no `layout` of their own).
- Companion factory docs:
  [The Mark Factory](/internals/frontend/mark-factory),
  [The Operator Factory](/internals/frontend/operator-factory).
