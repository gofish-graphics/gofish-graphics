---
title: Underlying Space
section: Core
order: 10
status: draft
covers:
  - packages/gofish-graphics/src/ast/underlyingSpace.ts
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/alignment.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/channels.ts
  - packages/gofish-graphics/src/ast/data.ts
  - packages/gofish-graphics/src/ast/fieldExpr.ts
  - packages/gofish-graphics/src/ast/datumProjection.ts
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
its spatial structure: the kind of data space the node has established on
each of its two axes (x and y), and any per-axis Monotonic that captures
how visual size depends on a scale factor. Together these form an
intermediate representation called the **underlying space tree**.

The data structure lives at `src/ast/underlyingSpace.ts`.
The traversal that builds it lives at `_node.ts`'s `resolveUnderlyingSpace()`.
Layout, axis rendering, posScale construction, and ordinal scale building
all consume the tree afterwards.

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
px(d) = pxMin + σ·(d − domainMin)          σ = pixels per data unit
```

`σ` (sigma) is the slope: pixels per unit of data. `domainMin` is the low edge
of the data interval. Per node and axis there is exactly one position unknown —
the **baseline**, the screen coordinate of the node's local data-0. Three things
that the word "origin" historically ran together must be kept distinct, because
each lives at a different stage of the pipeline:

- **alignment** is a _constraint_: equations between per-node baselines
  (`baseline_A = baseline_B`, and analogous relations for other anchors). It says
  nothing about pixels; it only records which baselines must agree.
- **placement** (`free | determined | conflict`) is the _abstract value_: is the
  baseline subsystem under-determined, solvable, or inconsistent? This is all
  that bottom-up space resolution can know — it runs before pixels exist, so it
  computes the _determinacy_ of the baseline, not the baseline itself.
- **the intercept** is the _concrete value_: the solved shared baseline of a
  σ-scope, in pixels — `pxMin` above, read as `posScale(0)`. It exists only after
  σ and the frame anchor resolve, so it is always a **derived read**, never
  stored state.

A false friend to never conflate with that intercept: the `width` Monotonic
carries its _own_ intercept — the σ-independent pixel part of an _extent_
(spacing, fixed chrome), the intercept of the size-vs-σ line `size = slope·σ +
intercept`. That is an intercept of the size equation, not of the data→screen
map; the two never mean the same thing.

**The single scale carrier.** Layout threads one per-axis record downward (see
[Layout dispatch](#layout-dispatch)): the `AxisScale` = `{ sigma?, map? }`
(`domain.ts`). `sigma` is the slope σ for _unanchored_ extents — a free magnitude
has no committed baseline, so its intercept is implicit in where its parent
places it (baseline placement + `transform.translate`) and never travels with the
scale. `map` is the _whole_ anchored map, with the intercept explicit as data
rather than closed over a function: `px(d) = pxMin + sigma·(d − domainMin)`,
evaluated by `pxOf` (the old `posScale(0)` intercept is `pxOf(map, 0)`). So
"anchored" shows up operationally as "has a `map`"; "unanchored" as "has only a
`sigma`." This single record replaced the former two parallel
channels (`scaleFactors` = slope-only, `posScales` = whole map) in Stage 4 of
[the σ-affine plan](/internals/design/sigma-affine-simplification).

**One slope per σ-scope, and the two-scope carrier.** The carrier's two slopes —
its `sigma` and its `map.sigma` — are not independent numbers. Each is the σ of a
distinct σ-scope solved once by the scope registry (below):
`sigma` is the axis's **SIZE** scope (what a magnitude is scaled by), `map.sigma`
is the axis's **POSITION** scope (what an anchored coordinate is mapped by). No
site fabricates either — every `map` comes from `computePosScale` through
`solvePosition` (or the equal-measure recentering), every `sigma` from
`solveSize` (Stage 6c). Within any one scope there is therefore exactly one slope,
by construction. When both halves are present and `sigma ≠ map.sigma`, the axis
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

Each axis (x and y) of each node carries one of `continuous`, `ordinal`, or
`undefined`. The continuous kind stores two facts: a **`width`** (a σ-affine
_size_ Monotonic) and a **`dataDomain`** (a _data-space_ fact: the axis range, if
any). The **`placement`** (the _layout_ fact: is this extent positioned) is not a
third stored field — it is a **derived view** of `dataDomain`'s shape, a bare
determinacy lattice read via `spacePlacement(space)`:

```ts
// underlyingSpace.ts
type Placement = "free" | "determined" | "conflict";

type DataDomain = Interval | "delta" | undefined;

type CONTINUOUS_TYPE = {
  kind: "continuous";
  width: Monotonic;       // the σ-affine SIZE: slope·σ + intercept
  dataDomain: DataDomain; // data-space extent AND the sole placement carrier
  measure?: Measure;
};
type ORDINAL_TYPE   = { kind: "ordinal";   domain?: string[]; measure?: Measure; ... };
type UNDEFINED_TYPE = { kind: "undefined"; ... };

// placement is in bijection with dataDomain's shape:
const spacePlacement = (s: CONTINUOUS_TYPE): Placement =>
  s.dataDomain === undefined ? "free"        // sized, position not yet committed (a bar's height)
    : s.dataDomain === "delta" ? "conflict"  // no absolute position possible (a centered streamgraph band)
      : "determined";                        // committed to a DATA interval (a scatter point's x)
```

The committed coordinate itself (the old `placement.at`) is not a separate
payload: it is simply the `dataDomain` interval's `min`, read back with
`continuousInterval(space)?.min`. Storing it twice was redundant — it always
equaled `dataDomain.min` — so placement collapses to a bare lattice.

`ORDINAL` carries a `measure` too (the grouping field, e.g. `"lake"`) — the
discrete analogue of `CONTINUOUS`'s measure. It's set from the grouping operator
(`spread`'s `by`) when the ordinal space is built (`distributeSpaceFold` →
`ORDINAL(keys, measure)`) and preserved through `unionChildSpaces`. So
`spaceMeasure(space)` reads a measure off **both** continuous and ordinal kinds
(only `UNDEFINED` is measureless), which is what lets an axis name itself off its
own resolved space — a continuous axis by its unit, an ordinal axis by its
grouping field (see [the layout passes](/internals/layout/passes)).

A companion predicate, **`isPositioningSpace`**, folds the two axis-bearing
kinds together: it holds for `POSITION` (a data axis) and `ORDINAL` (a category
axis) but not for `SIZE` (a mark's own extent) or `UNDEFINED`. In other words it
answers "does this space lay marks _out along an axis_?" — the question you ask
when you want the axis a set of siblings is arranged on rather than each
sibling's own size. Its first consumer is the connector's `curve: "auto"`: a
`line` / `ribbon` reads the underlying space its endpoints resolved to and, when
that space is a _positioning_ one whose measure is continuous, smooths the path
(centripetal Catmull–Rom) instead of drawing straight segments — so a line over
a continuous x auto-curves while one over discrete categories stays polylinear.

The guide a space supports keys on **`dataDomain`** (data-space), never on
placement:

| `dataDomain`       | guide                        | typical `placement` | example                       |
| ------------------ | ---------------------------- | ------------------- | ----------------------------- |
| an `Interval`      | quantitative (absolute) axis | `determined`        | scatter x, stacked-bar y      |
| `"delta"`          | magnitude / delta guide      | `conflict`          | streamgraph centered count    |
| `undefined`        | none (a legend, not an axis) | `free`              | a bar's height before placing |
| (kind `ordinal`)   | labels at laid-out keys      | —                   | bars by category, facets      |
| (kind `undefined`) | no guide                     | —                   | an aesthetic / literal-px dim |

These map directly onto the σ-affine layout solve (see
[the one equation](#the-one-equation-and-three-roles-for-one-unknown),
[Size resolution](#size-resolution), and the solver): `width` is the abstract
**SIZE** (slope·σ + intercept), and `placement` is the abstract **value** of the
baseline — its _determinacy_ (free / determined / conflict), not its pixel
intercept. The underlying-space pass is essentially an _abstract interpretation_
of the solve: it computes the structure (which extents are sized, which are
positioned) bottom-up before the concrete pixels — and therefore the concrete
baseline intercept — exist. Deriving `placement` from `dataDomain` is what lets
alignment ask "is this child already positioned?" directly (see
[The contract](#the-contract)) instead of reconstructing it.

This shape is the endpoint of issue #586's collapse. The old
`POSITION`/`SIZE`/`DIFFERENCE` were one semantic thing — a data-driven extent —
observed at three pipeline stages; carrying that as three kinds baked a _stage_
distinction into the _type_. A first cut collapsed them to a single overloaded
`origin: number | "free" | "impossible"` scalar, but that conflated the layout
fact with the data fact (a baseline magnitude vs a data axis anchored at 0 —
which build no posScale vs a posScale). Keeping the layout fact _derived from_
`dataDomain` keeps them distinct while storing only one field. There is no
scalar "anchor" builder type either — a second spelling of the same three-way
split would just be `Placement` with a payload again. The three placement cases
ARE the three named constructors (`POSITION` anchored, `SIZE` free,
`DIFFERENCE` conflict), plus `anchorAt(space, min)` for re-anchoring an
existing space at a data coordinate (the domain min, not a zero point) while
preserving its σ-affine width. Each constructor fixes `dataDomain`, from which
placement falls out:

- a former `SIZE` (`rect({ h: "count" })`) has `dataDomain: undefined` → placement `free`;
- a former `POSITION([a, b])` has `dataDomain: [a, b]` → placement `determined` (at `a`);
- a former `DIFFERENCE(w)` has `dataDomain: "delta"` → placement `conflict`.

The pre/post-solve distinction is handled by _when_ σ is substituted, not by
_which kind_: σ is always `width.inverse(size)`, and the extent at σ is always
`width.run(σ)`. The one genuine state transition is **`middle`-alignment drops
the anchor** — centering scrambles the children's baselines, so the result has
`dataDomain: "delta"` (the streamgraph), which derives placement `conflict`. A
`conflict` placement is absorbing: no alignment re-anchors it.

`isDIFFERENCE` keys on `dataDomain === "delta"` — the same field placement
derives from — so the two never disagree. The anchored data interval is read
back with `continuousInterval(space)`, which is simply the `dataDomain` when it
is an interval (used by posScale construction and axis nicing) and `undefined`
otherwise; its `.min` is the committed baseline coordinate (the old
`placement.at`).

These kinds map closely to Stevens's statistical data types, but not cleanly:
an `Interval` `dataDomain` covers both interval and ratio, and `"delta"` is
_weaker_ than interval — only within-instance differences are defined. `ordinal`
isn't "a band scale"; it's a statement that the values are discrete keys whose
spatial allocation is the responsibility of layout. `undefined` represents
spaces with no data-driven information (the literal-pixel value is handled at
layout time by `computeAesthetic`).

## The contract

Each node implements `_resolveUnderlyingSpace`:

```ts
type ResolveUnderlyingSpace = (
  childSpaces: Size<UnderlyingSpace>[], // one [x, y] tuple per child
  childNodes: GoFishAST[],
  shared: Size<boolean>, // [shared on x, shared on y]
  constraints: ConstraintSpec[] // this node's positioning constraints
) => FancySize<UnderlyingSpace>;
```

Returns the node's own `[xSpace, ySpace]`, computed bottom-up from the
already-resolved child spaces. The traversal is memoized at `_node.ts`'s
`resolveUnderlyingSpace()`.

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
- `Constraint.distribute` contributes the stack fold (`distributeSpaceFold`,
  `constraints/distribute.ts`): data-driven continuous targets compose to
  `SIZE(Monotonic.add(...) + spacing·(n−1))` (a `free` magnitude); with
  `glue: true` (stack semantics) the extents are committed to an anchored
  `POSITION([0, Σ])`; constant-sized keyed targets fall back to ORDINAL.
  (A former POSITION's pixel extent at σ=1 is `width.run(1) = b−a`, so the
  unified `width`-based sum subsumes the old separate POSITION-sum branch.)
- `Constraint.align` contributes the alignment fold (`alignSpaceFold` →
  `resolveAlignmentSpace`) on its axis — but only for a point-anchor value;
  `"span"`/`"size"` (#726, below) contribute nothing to the space fold, since
  their target is UNDEFINED on that axis by construction.
- `Constraint.nest` contributes the nesting fold (`nestedSpace`,
  `constraints/nest.ts`) and a deterministic dependency plan
  (`constraints/nestPlan.ts`). It is the first _size-setting_ constraint: on
  each constrained axis `outer = inner + 2·padding`, with padding always known,
  so the unknown is _which_ side is derived. The nest plan dispatches on which
  side carries the size (an own `args.dims`, a composite that shrink-wraps, or
  any inside-out-derived outer from the same-axis nest graph): inner sized and
  outer not →
  **inside-out** (`outer = inner + 2·padding`); outer sized, or neither (the
  layer sizes outer) → **outside-in** (`inner = outer − 2·padding` — CSS
  padding). Only the **inside-out** direction folds a space here: outer's request
  is a `Monotonic.adds` of inner's, which stays monotone (hence invertible), so a
  nested pair participates in auto-fit exactly like a stack — a parent
  spread/layer solving a scale factor sees outer as inner shifted up by the
  constant padding. The layer derives these outer spaces in dependency order
  (source before derived) so chained nests compose (A⊇B⊇C: C's request feeds
  B's, B's feeds A's), then feeds them into the union below. The **outside-in**
  direction derives _nothing_ at space-resolution time — outer's own claim (or
  fill/undefined) flows through the union normally, and `inner = outer −
2·padding` is handled purely as a layout-time pixel proposal. (Likewise when an
  inside-out inner is not SIZE — fixed-pixel or position-pinned content — there
  is no rule to fold; the proposal `inner.dims + 2·padding` sizes outer.) At most
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
  (like a point coordinate does), and `composeConstraintSpaces` treats an
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
covered-axis fold — UNDEFINED included — is what `composeConstraintSpaces`
reports (`constraints/compose.ts`). At layout time the layer then **solves the
budget**:
a fold-produced SIZE claim is inverted against the layer's allotted size to
derive a local scale factor, and distribute-covered fill children are
proposed slices from the shared proposal plan (`buildDistributeSliceMap`,
`constraints/proposalPlan.ts`, using `allocateSlices` from
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
content-independent) — `anchor[i+1] = anchor[i] + spacing`. `"middle"` is the
old `mode: "center"` under its new name; `"start"`/`"end"`/`"baseline"` are new
fixed-pitch siblings reusing the same anchor vocabulary `align` already uses
(`constraints/shared.ts`'s `AlignAnchor`). The space fold
(`distributeSpaceFold`'s `composeSize`) is `(n−1)·spacing` of chain plus an
amplitude ALLOWANCE attributed to the side of the chain where children's
content actually extends relative to the chained anchor (the painted side —
fixed-pitch rows mirror about their anchor at paint, below):

- `"middle"`: half above, half below every anchor — the exact symmetric
  `h_first/2 + (n−1)·s + h_last/2` (the original center-mode form, unchanged).
- `"baseline"` / `"start"`: content rises entirely ABOVE each anchor, so the
  allowance sits above the chain head: `max_k(h_k − k·s)⁺ + (n−1)·s` (k in
  chain order — the binding row is whichever peak clears the rows chained
  above it; for a ridgeline that's usually the first row).
- `"end"`: the mirror image — allowance below the chain tail:
  `max_k(h_k − (n−1−k)·s)⁺ + (n−1)·s`.

The per-k max assumes each child's extent lies wholly on one side of its
anchor (true for SIZE claims — baseline magnitudes) and that the fold's child
order is the chain order (compose.ts passes placement order).

A fixed-pitch chain also has a PAINT-side handshake. The chain is an overlay,
not a tiling — its targets' allocated slices are just the leftover budget — so
if a chained target later opens its own y-up flip scope, mirroring about the
allocated band would displace every painted anchor away from where the solver
chained it. `lowerDistributePlacement` therefore stamps the chained anchor on
each y-chained target (`Placeable.pitchAnchorY`), and the bake's scope-band
decision (`scopeBox` in `coordinateTransforms/bake.ts`) mirrors such a scope
about that anchor pointwise (`y ↦ 2·anchor − y`), keeping the painted anchors
exactly at the solved pitch — see
[Flattening the Scenegraph](/internals/layout/coord-flattening). The same
stamp drives the layer's bbox fold (`paintedYBand` in layer.tsx): a
pitch-chained self-mirroring row's box is folded as the MIRROR of its layout
band about the chained anchor — the band it actually paints — so the layer's
box gains the amplitude allowance above the chain head (matching the fold
extent above) instead of phantom space below the tail where nothing paints,
and the x axis lands directly below the last baseline. The resulting negative
layer min reaches `render()` as a painted-TOP overhang: gofish.tsx attributes
the y overhang sides by painted truth — an unflipped root's negative min is
always the painted TOP and its max-past-`finalH` the painted bottom, with the
flipped mapping when the root mirrors as a whole (an exact no-op for
`"middle"`, whose mirror is the identity on its own band).
This all assumes the chained rows self-mirror — continuous y with no enclosing
y-up scope, the fixed-pitch-under-ordinal-spread case; inside a whole-plot
flip the rows would inherit that scope and the plain layout band would be the
honest one.

`resolveLayerBaseSpaces` is the default bottom-up axis resolver before composed
constraint overrides: union child spaces, apply `transform.scale` to free
magnitudes, and merge datum-valued position/span domains with constraint
measures taking precedence.
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
out first. The bottom-up space pass applies only the inside-out portion via
`applyNestSpacePlan`; once the source has concrete dimensions,
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
sizes known, every anchor reduces to `min + offset` — `start`/`baseline` at 0,
`middle` at `size/2`, `end` at `size` for a size-strong cell (read off the
closed box), else the node's local-frame anchor offset. `position`, `align`,
`distribute`, `nest`, and `grid` pins/relations over those reduced `min` values
go through BFS components + pin offsets + distribute/normalized-origin
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

The placement-coordinate compiler preserves the literal/datum distinction until
facts are emitted: literals are pixels, while datum coordinates elaborate
through the already-solved data→pixel scale plus any post-scale offset. This
keeps the unified constraint semantics without a generic dense linear solver:
strong facts win, relation cycles are checked for contradiction, and components
without an absolute pin are normalized so the minimum solved coordinate in that
component is `0`. Ordered `distribute` components are the exception: their
directed chain source is a deterministic sequence origin, so negative spacing
remains authored overlap instead of being erased by min-normalization. If a
graphic needs a floating component to appear at a particular absolute
coordinate, that placement must be explicit.
The legacy per-constraint apply helpers have been retired from the constraint
path; spread, scatter, table, axes, and hand-written constraints all lower to
the same solver entrypoint. An incompatible same-solve interval + point
`position` on the same target/axis reports an over-determined placement instead
of letting one silently yield to the other.

Placement-time alignment dispatches on the same resolution. `align` emits
relations between child anchors; it no longer chooses an absolute fallback
baseline for an otherwise-floating system. If no explicit `position` (point or
interval), self-placement, or other strong pin fixes a connected component, the
solver
normalizes that component so its minimum solved coordinate is `0`. A user who
needs the aligned system to appear at a particular place must say so explicitly
with a placement constraint.

That normalization is also what keeps data-positioned children safe. A faceted
scatter panel over `[1955, 2010]`, anchored to the shared y data scale, should
not be pulled to `posScale(0)` (data-zero, far below 1955). So `align` leaves it
alone: **a target anchored to a data (POSITION) scope on a posScale axis, with a
non-`middle` anchor, is not moved** — `align` shares the frame (it still unions
the children's `dataDomain`) but supplies no baseline. Its baseline is already
`posScale(0)` of the shared scope, so all such panels co-locate by construction.

**The guard asks the solver, not the space pass (Stage 6f).** This is the
blindingly-obvious final form the whole design arc was reaching for. The question
"is this target already positioned?" is answered by the placement solve's own
authority record — the `PlacementOwnershipPlan` — through one predicate,
`isDataPositioned(axis, name)`. The fact it reads (which children are anchored to
a POSITION scope on each axis) is a pure **data/scope** fact — a child's
`dataDomain` is present on that axis — collected _once_ at the layer boundary and
handed to the solve as an explicit ownership input. The constraint path no longer
reconstructs the space pass's `free`/`determined`/`conflict` lattice by calling a
`placementOn` method on the target mid-lowering; there is no layout fact derived
from the space pass in the guards anymore. (`spacePlacement` still computes that
lattice for the space folds themselves — the `union`/`middle`/anchored decisions —
which is where a determinacy read belongs.)

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
`SIZE(Monotonic.linear(value, 0))` on y (a `free` magnitude); the same
rect with literal `y` and `y2` emits `POSITION([y, y2])`. Constants (no
data-bound dim) emit `UNDEFINED` — the literal pixel value is handled at
layout time by `computeAesthetic`, not via the underlying-space tree. (The
old anomaly where a literal-pixel `min` plus a data size made `DIFFERENCE`
while an absent `min` made `SIZE` is gone: both are `CONTINUOUS`, differing
only in their `placement`/`dataDomain` — an off-scale pixel min is a
difference, an absent min is a `free` magnitude.)

**Compositional operators** (`spread`, `stack`, `layer`, `enclose`)
combine children's spaces. `spread({ glue: false })` keeps the magnitude
along the stack direction so a parent can solve for shared scale factors
via `Monotonic.inverse`. `spread({ glue: true })` (i.e. `stack`) sums
children's extents into a `POSITION([0, sum])` — the operator commits the
data-driven magnitudes to an anchored axis. Since the operator/constraint
unification, these folds have one home: spread's resolver _is_
`distributeSpaceFold` on the stack axis and `alignSpaceFold` on the cross
axis — the same functions the constraint path uses (see
[The contract](#the-contract)). `layer` and overlay-style operators use
`unionChildSpaces` (`alignment.ts`), which keeps the symbolic Monotonic
when every child is a baseline magnitude (`placement: free`) and otherwise
unions data intervals. UNDEFINED children carry no opinion and are ignored
throughout, so a fixed-pixel (UNDEFINED) sibling never vetoes the
magnitude-preserving path (it would otherwise degrade the union to an
unanchored extent).

**Coordinate-transform operators** (`coord`) annotate the resulting
space with the transform that will later map underlying positions to
display positions, but otherwise pass the kind through.

## Worked example: stacked bar chart

```js
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
```

Each `rect` starts with a data-driven height and no data-driven y
position: `[UNDEFINED, SIZE(Monotonic.linear(count, 0))]` — a magnitude
anchored at origin 0.

The vertical `stack` (which is `spread({ glue: true, dir: "y" })`) glues
each lake's species rects together. Its stack-direction children are all
continuous magnitudes, so it sums their widths at scale 1 and emits
`POSITION([0, total_lake_sum])` on y. The alignment direction (x) of the
stack is UNDEFINED because each rect's x is UNDEFINED.

The horizontal `spread` separates lakes. Its children are now stacks
with `[UNDEFINED on x, POSITION([0, total]) on y]`. Stack direction (x):
no children are continuous, but they're named (the "by" key produces lake
keys) → `ORDINAL(["Lake A", ..., "Lake F"])`. Alignment direction (y):
all children are anchored continuous → `POSITION(unionAll([0, total_i]))`
= `POSITION([0, max_total])`.

So the root underlying space is `[ORDINAL(lakes), POSITION([0, max_total])]`.
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

After `resolveUnderlyingSpace`, layout proceeds on a single principle:
**a continuous extent's scale factor is `width.inverse(size)`, and an
anchored one _also_ builds a position scale**. Before the [#586
collapse](#the-three-space-kinds) this was a three-way switch on the kind
(`SIZE` inverted a Monotonic, `POSITION` divided by an interval width,
`DIFFERENCE` divided by a width); a former POSITION/DIFFERENCE width is
just `linear(extent, 0)`, so `width.inverse(size) = size / extent`
reproduces both divisions, and the switch folds away:

```
gofish.tsx (root):
  if root[axis] is a free magnitude            → sigma = width.inverse(canvas)
  if root[axis].dataDomain is an interval       → map = an AxisMap over it
  pass one `AxisScale` = { sigma?, map? } downward per axis — a child reads
  `sigma` for size, `map` for data position (they're mutually exclusive at root)

layer.layout, on an axis the node scopes (node.shared[axis] — set by
`spread`/`stack`'s `sharedScale`; default [false, false] is a no-op):
    if myUSpace[axis].kind === "continuous" → space.width.inverse(size[axis])
    else → undefined (ORDINAL/UNDEFINED don't need a continuous scale factor)
```

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
one place σ / posScale is derived: `solveSize(frame, allocated)` inverts the σ
slope, `solvePosition(space, allocated)` builds the anchored `AxisMap`. The
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
its map (a scope-less slope that no consumer read) — it now carries no size σ at
all, since a POSITION-only axis has no SIZE scope; and the #582 equal-measure
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
datum-position scale (`buildPositionScalePlan`). It touches only anchored
POSITION domains — never SIZE magnitudes, never deltas — and a **coord scope
never nices** (its domains map into a fixed coordinate range; rounding them
would break the mapping).

And it is **demand-driven**: a scope nices its POSITION domain **iff at least
one node in the scope renders an axis on that dim**. Nicing is a presentation
adjustment whose demand comes from axis views — with no axis there is no tick
grid to round for, so axis-less content stays at the honest raw scale; with an
axis, content and ticks share the one niced domain, which is the contract.
Mechanically, `resolveAxes` leaves a persistent `axisDemand` stamp on every
axis-owning node (the `axis` work flags are consumed and cleared by
elaboration; the stamps survive to layout), and each solve site asks
`GoFishNode.scopeRendersAxis(dim)`: a walk over the scope's **space-flow
region** — up from the scope root while neither a self-scaled stash nor a coord
boundary cuts the flow, then across that region's subtree, stopping at deeper
stashes and coords. The region is exactly the neighborhood whose axes all view
the same underlying domain (an inner shared scope under an axis-drawing root
inherits the root's demand, because its space is what bubbled up into the
domain that axis draws; a stashed panel does not, because its space never
reached the ancestor's axis). Tick elaboration nices node-locally with the same
`d3.nice`, applied to the axis-owning node's domain — the same union domain
that bubbled to the scope root — so elaboration and the solve cannot disagree.

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
(see [Layout dispatch](#layout-dispatch)). `space.width.inverse(size)` is
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

- **`resolveUnderlyingSpace`.**
  - **Literal pixel size** (`w: 80`). After resolving each axis normally, for
    any dim that has an explicit pixel size and whose resolved space **has a
    baseline** (`hasBaseline` — `placement` is `free` or `determined`, i.e. not
    a difference), the real space is **stashed** verbatim and `UNDEFINED` is
    reported upward. ORDINAL and difference (`placement: conflict`) extents
    are left untouched.
  - **Data-valued size** (`w: "count"`, `w: field("count").normalize()`, an
    entry-flagged `size` array). This is the "DATA-DRIVEN operator extent"
    case (#4/#20 — nested mosaic): the layer's own `w`/`h` becomes a `SIZE`
    claim reported **upward**, so the _enclosing_ scale scope solves this
    layer's pixel extent — the layer is a leaf in its ancestor's scope,
    exactly like a leaf `rect({ w: "count" })`. But that leaves the layer's
    own _composed content_ (its children's real space) needing somewhere to
    go: if the composed space `hasBaseline`, it is stashed (in baseline-
    **magnitude** form, `SIZE(width, measure)`, not the anchored POSITION a
    fold might have returned) before being overridden by the new data-valued
    `SIZE` claim. This is what makes "data-valued size ⇒ self-scaling
    region" the **general** rule (fixed #651 smell 1: without the stash, a
    subtree under a data-valued size silently consumed the _ancestor's_ σ
    instead of getting its own local scope): the node's own box is solved by
    the ancestor scope, and its interior is a fresh scope resolved against
    that box.
  - A parent layer's `unionChildSpaces` ignores an axis reported `UNDEFINED`
    (no opinion — see [The contract](#the-contract)) instead of polluting a
    shared domain with the absorbed region's units.
- **`layout`.** The stashed space gets a **local** scale built against the
  layer's own resolved box: an anchored extent is _both_ a coordinate scale
  (`posScaleFromSpace(stashed, size[dim])`) _and_ a σ-magnitude (a scale factor
  from `stashed.width.inverse(size[dim])`), so the layer builds both and each
  child reads the one it needs. These locals override the inherited posScale /
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
(`alignment.ts`) folds the baseline magnitudes into `POSITION([0, max])` — it
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
upward for a self-scaled axis, `declaredYUp` (`coordinateTransforms/bake.ts`)
couldn't see that the axis was _really_ CONTINUOUS, so a parallel
`_selfScaledSpace` field on `GoFishNode` carried the true kind alongside the
reported `UNDEFINED`, purely so the [y-up flip scope](/internals/layout/coord-flattening)
could still open over a normalized spine. The per-entry `size`-claim mechanism
doesn't need that: each entry gets its own wrapper wired through the ordinary
data-valued-size path above, and stacking now follows **data order** directly
at every level rather than needing a flip to correct it — so `_selfScaledSpace`
and its `declaredYUp` fallback were deleted outright, not generalized.

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
export type CONTINUOUS_TYPE = { kind: "continuous"; width: Monotonic; dataDomain: DataDomain; measure?: Measure; ... };
```

**Merging.** Two helpers in `underlyingSpace.ts` decide what happens when two
measures meet. `undefined` is always permissive — it means "no claim", unifies
with anything, and yields the other side (this is why `getMeasure` returns
`undefined` rather than a `"unit"`/`"unknown"` sentinel: a measureless value
must merge silently into a tagged one).

- `mergeMeasures(a, b, context)` — unify as **types**. Equal measures unify to
  themselves; two _different_ defined measures are a type error and it
  **throws**. This is the guard on the shared union: `unionChildSpaces`'
  mixed/data-positioned interval collection (`alignment.ts`) and
  `resolveAlignmentSpace`'s non-baseline branch (not every child a `free`
  magnitude) use it, so overlaying a count axis onto a millimeter axis fails
  loudly instead of corrupting the domain.
- `forgetOnConflict(a, b)` — a conflict **forgets** (returns `undefined`)
  rather than throwing. Used where composing differently-measured magnitudes
  is legitimate: stacking two different fields' extents produces a real
  magnitude that carries no single unit, so the baseline-magnitude path
  (every child `placement: free`) in `unionChildSpaces` forgets on conflict,
  and `resolveAlignmentSpace`'s baseline reduce uses it too.

So the rule of thumb: **aligning/overlaying siblings throws on a unit clash;
composing them into a new extent forgets.**

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
throw at the source. The layer's `resolveAxis` (`layer.tsx`) then
treats this constraint-domain measure as the axis's unit: it **prefers** the
constraint measure and falls back to the children's POSITION measure only when
the coordinates are untagged (literal pixels). It deliberately does _not_
strict-unify the two — a self-scaling child (a `scatter`'s pie glyph) can leak
its own inner unit into the children's space, and that leak is not a competing
claim about the scatter's data axis. This restores the unit tag the scatter
operator's reduction onto constraints had dropped.

**Propagation through the baseline → anchored conversion.** A histogram's
count axis is all baseline magnitudes (origin 0) at the children, and
`resolveAlignmentSpace`'s start/end/baseline path folds them into
`POSITION([0, max])`. That conversion carries the merged child measure forward
(a `forgetOnConflict` reduce) — it is load-bearing, because it is exactly how
the count POSITION acquires its `"count"` tag so a later overlay union can
recognize it as foreign and refuse.

**The error and its remedies.** A clash from `mergeMeasures` reads:

> Cannot unify underlying spaces with different measures: `"A"` and `"B"`. If
> these are the same units, assert that with `field(name, measure)` or
> `datum(v, measure)`. If they are different units, give the inner chart an
> explicit `w`/`h` so it becomes a self-scaling region.

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
  `spread`/`stack`/`group`/`scatter`/`treemap`'s `by`: `dropNulls` filters out
  rows whose value at the field is `null`/`undefined` FIRST (so it composes
  the same regardless of where it sits in the chain — every other domain op
  re-derives its grouping from these filtered rows), then it groups the
  remaining rows (`Map.groupBy` via `splitKeyFn`, which reads a `field(...)`'s
  `.name` exactly like a bare string), then applies each remaining domain op
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

**A third family: `.map(mapping, {default?})`, elementwise rather than
folding.** `.map()` doesn't belong to either slot above — it's a VALUE op
(valid wherever an aggregate is, since it's a serializable alternative to a
function accessor on a label or `.zOrder()`, not just a value channel), but
it doesn't fold rows to a singleton. It's a partial discrete mapping keyed by
the field's own (stringified) values: an own-property lookup in `mapping`
(so `{}`'s inherited members never match), falling back to `opts.default`
when the option is present — even `default: null` counts as present — else
to `undefined`. `evalFieldValues`'s pipeline loop applies it in place before
any aggregate runs, so `field("site").map({...}).sum()` maps first and folds
second, and `getFieldOps`/the domain-vs-aggregate split (`isDomainOp`,
`isAggregateOp`) both treat `map` as neither, dispatching it through its own
branch. `splitEntries` (`datumProjection.ts`) rejects `map` on a `by` slot
with the same "value op, not a domain op" error as an aggregate.

## Axis inference

Conceptually, axis inference splits into two independent questions:

1. **What guide could this space support?** Answered by the space's
   `dataDomain`. An interval `dataDomain` permits a quantitative axis. A
   `"delta"` one permits a magnitude guide but not an axis with a meaningful
   zero. A `free` magnitude (no `dataDomain`) wants a legend, not an axis.
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
(`elaborateAxes`, `src/ast/axes/elaborate.tsx`), which wraps each flagged node
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

Three things to consider:

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

- The data definitions and constructors: `src/ast/underlyingSpace.ts`.
- The traversal driver: `_node.ts`'s `resolveUnderlyingSpace()`.
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
