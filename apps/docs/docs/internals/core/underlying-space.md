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
  - packages/gofish-graphics/src/ast/constraints/folds.ts
  - packages/gofish-graphics/src/ast/constraints/compose.ts
  - packages/gofish-graphics/src/ast/constraints/distribute.ts
  - packages/gofish-graphics/src/ast/constraints/align.ts
  - packages/gofish-graphics/src/ast/constraints/nest.ts
  - packages/gofish-graphics/src/ast/constraints/grid.ts
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

## The five space kinds

Each axis (x and y) of each node carries one of:

| kind         | meaning                                                                 | guide interpretation                                                | example source                                                  |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `position`   | absolute positions are meaningful; the space carries an interval domain | conventional quantitative axis (distances and positions both work)  | scatterplot x-position, y-axis of a stacked bar chart           |
| `difference` | relative differences meaningful; absolute positions not                 | magnitude guide; an axis with an arbitrary zero would be misleading | a streamgraph after baseline shifting                           |
| `size`       | data-driven extent, not yet placed in a shared position space           | legend / measurement guide; a position axis is premature            | a bar's height before stacking                                  |
| `ordinal`    | discrete keys; layout will assign positions                             | labels at laid-out keys; no continuous baseline necessarily implied | bars separated by category, facets                              |
| `undefined`  | no data-space contribution on this axis                                 | no guide                                                            | a purely aesthetic dimension or a decorative literal-pixel rect |

These kinds map closely to Stevens's statistical data types, which is
probably not a coincidence, but the relationship isn't clear yet. They
deliberately separate facts that a scale-as-function model collapses.
`size` and `position` may both eventually use numeric values and
continuous mappings, but they mean different things: `size` is an
unplaced extent; `position` is an extent embedded in a shared coordinate
space. `ordinal` isn't "a band scale"; it's a statement that the values
are discrete keys whose spatial allocation is the responsibility of
layout.

A few additional notes on the individual kinds:

- **POSITION** represents data-driven positions. Each position space has
  a domain (interval) that maps data values to screen positions.
- **DIFFERENCE** represents spaces where differences/distances are
  meaningful, but absolute locations are not. This is a weakening of
  POSITION — once a space is DIFFERENCE, it cannot be converted back to
  POSITION. (Speculative: DIFFERENCE may be aesthetic position +
  data-driven size, whereas POSITION is data-driven position. This is not
  yet confirmed and should not be used for implementation.)
- **SIZE** represents shapes with data-driven sizes but undetermined
  positions. SIZE tracks a single numeric value (which can be negative,
  e.g., for negative bars). Unlike DIFFERENCE, SIZE spaces can be merged
  into POSITION spaces when alignment is determined (e.g., when bars are
  aligned to a baseline). Example: individual bars in a bar chart have
  SIZE, but the stack operator merges them into POSITION space for
  baseline alignment.
- **ORDINAL** represents nominal/ordinal spaces where relative positions
  are meaningful (like above, below, left, right), but not quantitatively
  meaningful.
- **UNDEFINED** represents spaces with no data-driven information.

The data definitions:

```ts
// underlyingSpace.ts
export type POSITION_TYPE   = { kind: "position";   domain: Interval; ... };
export type DIFFERENCE_TYPE = { kind: "difference"; width: number;   ... };
export type SIZE_TYPE       = { kind: "size";       domain: Monotonic; ... };
export type ORDINAL_TYPE    = { kind: "ordinal";    domain?: string[]; ... };
export type UNDEFINED_TYPE  = { kind: "undefined";  ... };
```

`SIZE_TYPE.domain` is a `Monotonic` (`util/monotonic.ts`) — a function
that describes how the visual extent depends on a scale factor. For a
data-bound rect (`rect({ h: "count" })`), each rect emits
`SIZE(Monotonic.linear(value, 0))`. Operators compose them
(`Monotonic.add`, `Monotonic.adds(spacing)`, `Monotonic.smul(scale)`,
`Monotonic.max`). At layout time, a parent that needs a shared scale
factor calls `space.domain.inverse(canvas_size)` to solve for the scale
factor that makes the subtree fit.

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
  (Literal-pixel coordinates are not data and don't contribute.) That domain
  is what the layer later turns into a data→pixel scale to resolve those
  constraints.
- `Constraint.distribute` contributes the stack fold (`distributeSpaceFold`,
  `constraints/distribute.ts`): all-SIZE data-driven targets compose to
  `SIZE(Monotonic.add(...) + spacing·(n−1))`; with `glue: true` (stack
  semantics) the extents are committed to an anchored `POSITION([0, Σ])`;
  constant-sized keyed targets fall back to ORDINAL.
- `Constraint.align` contributes the alignment fold (`alignSpaceFold` →
  `resolveAlignmentSpace`) on its axis.
- `Constraint.nest` contributes the nesting fold (`nestedSpace`,
  `constraints/nest.ts`). It is the first _size-setting_ constraint: on each
  constrained axis `outer = inner + 2·padding`, with padding always known, so
  the unknown is _which_ side is derived. The layer's nest pre-pass dispatches
  on which side carries the size (an own `args.dims`, a composite that
  shrink-wraps, or an inside-out-derived outer): inner sized and outer not →
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

The layer composes these per axis — children not covered by a constraint
max-union in as overlay siblings — and at layout time **solves the budget**:
a fold-produced SIZE claim is inverted against the layer's allotted size to
derive a local scale factor, and distribute-covered fill children are
proposed slices from the shared allocator (`allocateSlices`,
`constraints/folds.ts`). This is what makes constraint-assembled layers reach
the same expressive ceiling as the spread pipeline, auto-fit included
(issue #475). Composition beyond one distribute (+ one align) per axis falls
back to `unionChildSpaces`; the general algebra is sketched in
[[constraints-as-core]].

Placement-time alignment dispatches on the same resolution. When an `align`
(the constraint or spread's cross-axis alignment) finds **no pre-placed
sibling**, its fallback baseline is computed from what the axis carries
(`alignFallbackBaseline`, `constraints/align.ts`): a posScale-carrying
POSITION axis falls back to the scale origin `posScale(0)` — SIZE-derived
bars hang from the zero line — while a pixel-pure axis falls back to the
layer-box edge for the anchor, so axis titles and chrome pin to the plot box.
`middle` is the box center either way (it resolves to DIFFERENCE, an extent
with no anchored origin). The fallback is a property of the axis's space, not
of which API assembled the layer (#552). One consequence worth knowing: a
coordinate transform's children are pixel-pure by construction (posScales
don't cross a nonlinear transform — children get scale _factors_ instead), so
an `end`-aligned spread inside `coord` seats flush at the box edge rather
than at a scale origin.

Three patterns cover most operators:

**Leaf shapes** (`rect`, `ellipse`, `petal`, `text`, `image`) decide the
kind from their props. A rect with data-bound `h` emits
`SIZE(Monotonic.linear(value, 0))` on y; the same rect with literal `y`
and `y2` emits `POSITION([y, y2])`. Constants (no data-bound dim) emit
`UNDEFINED` — the literal pixel value is handled at layout time by
`computeAesthetic`, not via the underlying-space tree.

**Compositional operators** (`spread`, `stack`, `layer`, `enclose`)
combine children's spaces. `spread({ glue: false })` keeps SIZE
composition along the stack direction so a parent can solve for shared
scale factors via `Monotonic.inverse`. `spread({ glue: true })` (i.e.
`stack`) sums children's SIZE values into a `POSITION([0, sum])` — the
operator commits the data-driven extents to a positional axis. Since the
operator/constraint unification, these folds have one home: spread's
resolver _is_ `distributeSpaceFold` on the stack axis and
`alignSpaceFold` on the cross axis — the same functions the constraint
path uses (see [The contract](#the-contract)). `layer`
and overlay-style operators use `unionChildSpaces` (`alignment.ts`),
which preserves SIZE when every child is SIZE and otherwise unions
intervals. UNDEFINED children carry no opinion and are ignored
throughout — including in the SIZE gate, so a fixed-pixel (UNDEFINED)
sibling never vetoes SIZE composition (it would otherwise degrade the
union to DIFFERENCE).

**Coordinate-transform operators** (`coord`) annotate the resulting
space with the transform that will later map underlying positions to
display positions, but otherwise pass the kind through.

## Worked example: stacked bar chart

```js
Chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
```

Each `rect` starts with a data-driven height and no data-driven y
position: `[UNDEFINED, SIZE(Monotonic.linear(count, 0))]`.

The vertical `stack` (which is `spread({ glue: true, dir: "y" })`) glues
each lake's species rects together. Its stack-direction children are
all-SIZE, so it sums their domains at scale 1 and emits
`POSITION([0, total_lake_sum])` on y. The alignment direction (x) of the
stack is UNDEFINED because each rect's x is UNDEFINED.

The horizontal `spread` separates lakes. Its children are now stacks
with `[UNDEFINED on x, POSITION([0, total]) on y]`. Stack direction (x):
no children are SIZE, but they're named (the "by" key produces lake
keys) → `ORDINAL(["Lake A", ..., "Lake F"])`. Alignment direction (y):
all children are POSITION → `POSITION(unionAll([0, total_i]))`
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

After `resolveUnderlyingSpace`, layout proceeds on the principle that
**SIZE space drives Monotonic composition; POSITION space drives
position scales**. The two pipelines are mutually exclusive on a per-node
per-axis basis:

```
gofish.tsx (root):
  if root[axis].kind === "position"  → build a posScale via computePosScale
  if root[axis].kind === "size"      → invert the Monotonic against the canvas
                                       to seed the root scale factor
  pass both downward as (scaleFactors, posScales)

spread.layout (each spread/stack node):
  if shared[axis]:
    if myUSpace[axis].kind === "size"       → space.domain.inverse(size[axis])
    if myUSpace[axis].kind === "position"   → size[axis] / Interval.width(domain)
    if myUSpace[axis].kind === "difference" → size[axis] / space.width
    else → undefined (ORDINAL/UNDEFINED don't need a continuous scale factor)
```

Leaf shapes never need to compute their own scale factors — they receive
them via the `scaleFactors` parameter and apply them in `computeSize`.

A `layer` whose constraints fold to a SIZE claim runs the same inversion
as spread's first branch — `fold.inverse(size[axis])` against its allotted
size — to derive a local scale factor for its constrained children (and
warns before falling back when the fold isn't invertible at that budget).
Unlike spread, the layer never mutates the inherited `scaleFactors`
array; sibling scale sharing via mutation is a spread-only behavior
(`sharedScale`).

This dispatch is the practical embodiment of the underlying-space-kind
distinction. It also happens to make the rendering pipeline more readable:
once you know the kind, you know which arithmetic applies.

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
(see [Layout dispatch](#layout-dispatch)). `space.domain.inverse(size)` is
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

## Self-scaling regions: an explicit pixel size absorbs an axis

The root resolves its scales against the canvas: POSITION → a posScale onto
the pixel box, SIZE → invert the Monotonic against the canvas size. A
`layer` (or `frame`) given an **explicit pixel size on a dim** does the same
thing one level down — "a chart embeds the way it renders." On that dim it
becomes a self-contained **scaling region**: its data space is absorbed
internally rather than contributed to whatever shared space its parent is
building.

The motivating case is a marginal histogram, seaborn-jointplot style: a
center scatter in data units, with a count histogram pinned along each edge.
The histograms are sized to a fixed pixel band (`Chart(data, { h: 80 })`),
and their count axis must not union into the scatter's shared x/y domains —
counts and beak-length millimeters are foreign units. The explicit pixel
size is exactly the signal that this region carries its own scale.

The rule lives in `layer`'s resolver and layout
(`graphicalOperators/layer.tsx`), in two halves:

- **`resolveUnderlyingSpace`.** After resolving each axis normally, for any
  dim that has an explicit pixel size and whose resolved space is
  POSITION-with-domain or SIZE, the real space is **stashed** and `UNDEFINED`
  is reported upward. A parent layer's `unionChildSpaces` then ignores that
  axis (UNDEFINED carries no opinion — see [The contract](#the-contract))
  instead of polluting a shared domain with the absorbed region's units.
  ORDINAL and DIFFERENCE unions are left untouched.
- **`layout`.** The stashed space gets a **local** scale built against the
  layer's own pixel box, applying the root's recipe: POSITION →
  `posScaleFromSpace(stashed, size[dim])`, SIZE → a local scale factor from
  `stashed.domain.inverse(size[dim])` (the Monotonic inverted against the
  box). These locals override the inherited posScale / scale factor on that
  dim — definitionally, since the inherited scale is in the parent's foreign
  units — for both the children and the layer's own constraint resolution. If
  the size can't be resolved (NaN), the locals are left undefined and the dim
  degrades to the inherited path rather than producing NaN scales.

Note that a histogram's count axis is **not** SIZE at the frame boundary.
Under start/end/baseline alignment, `resolveAlignmentSpace` (`alignment.ts`)
converts all-SIZE children into `POSITION([0, max], fromSize)` — it commits
the data-driven extents to a positional axis so they can be aligned. Without
the self-scaling rule, that count POSITION would union straight into the
shared axes as if it were data units; the rule is what keeps the absorbed
axis from leaking.

The space reported upward is plain `UNDEFINED` for now. Issue #508's
proposed CONSTANT kind — "this axis has a known fixed pixel extent" — is the
eventual, more honest home for what a self-scaling region contributes to its
parent.

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
POSITION, DIFFERENCE, and SIZE each gain an optional `measure?: Measure`
(`Measure` is just a string — a field name like `"Beak Depth (mm)"`, or
`"count"`). It is the dead `source?` slot's replacement, but with teeth:
spaces now **unify per measure**.

```ts
// underlyingSpace.ts
export type POSITION_TYPE = { kind: "position"; domain: Interval; measure?: Measure; ... };
```

**Merging.** Two helpers in `underlyingSpace.ts` decide what happens when two
measures meet. `undefined` is always permissive — it means "no claim", unifies
with anything, and yields the other side (this is why `getMeasure` returns
`undefined` rather than a `"unit"`/`"unknown"` sentinel: a measureless value
must merge silently into a tagged one).

- `mergeMeasures(a, b, context)` — unify as **types**. Equal measures unify to
  themselves; two _different_ defined measures are a type error and it
  **throws**. This is the guard on the shared union: `unionChildSpaces`'
  mixed/POSITION collection (`alignment.ts`) and `resolveAlignmentSpace`'s
  DIFFERENCE/POSITION branches use it, so overlaying a count axis onto a
  millimeter axis fails loudly instead of corrupting the domain.
- `forgetOnConflict(a, b)` — a conflict **forgets** (returns `undefined`)
  rather than throwing. Used where composing differently-measured spaces is
  legitimate: stacking two different fields' SIZEs produces a real extent that
  carries no single unit, so SIZE∘SIZE composition in `unionChildSpaces`
  forgets on conflict, and `resolveAlignmentSpace`'s all-SIZE reduce uses it
  too.

So the rule of thumb: **aligning/overlaying siblings throws on a unit clash;
composing them into a new extent forgets.**

**Where measures come from** is itself a small type system with three sources,
checked (not silently prioritized) in `resolveMeasure` (`channels.ts`):

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

**Propagation through the SIZE→POSITION conversion.** A histogram's count axis
is all-SIZE at the children, and `resolveAlignmentSpace`'s start/end/baseline
branch converts all-SIZE children into `POSITION([0, max])`. That conversion
now carries the merged child measure forward (a `forgetOnConflict` reduce) — it
is load-bearing, because it is exactly how the count POSITION acquires its
`"count"` tag so a later overlay union can recognize it as foreign and refuse.

**The error and its remedies.** A clash from `mergeMeasures` reads:

> Cannot unify underlying spaces with different measures: `"A"` and `"B"`. If
> these are the same units, assert that with `field(name, measure)` or
> `datum(v, measure)`. If they are different units, give the inner chart an
> explicit `w`/`h` so it becomes a self-scaling region.

The two remedies are the two escape hatches this essay already describes:
annotate to declare the units _are_ the same (collapsing them to one measure),
or wrap the foreign region in an explicit pixel size so it absorbs its own
axis (the [self-scaling region](#self-scaling-regions-an-explicit-pixel-size-absorbs-an-axis)
above) and never reaches the shared union at all.

**Stage 2.** This is Stage 1: one measure per axis, unified or refused. The
sequel is a measure-keyed _family_ of underlying spaces per axis — true
multi-scale, where a single axis can host several measures at once (dual axes).
That is also the natural place for axis titles to read a measure off the space
they describe (cf. issues #452, #386).

## Axis inference

Conceptually, axis inference splits into two independent questions:

1. **What guide could this space support?** Answered by the kind. POSITION
   permits a quantitative axis. ORDINAL permits labels at laid-out keys.
   DIFFERENCE permits a magnitude guide but not an axis with a meaningful
   zero. SIZE wants a legend or measurement guide; a position axis would
   be premature. UNDEFINED contributes nothing.
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
subtrees (polar axes are handled separately by `coord.tsx`). The space _kind_
then answers (1): POSITION → quantitative ticks, DIFFERENCE → delta labels,
ORDINAL → labels at laid-out keys.

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
   sees POSITION children, you don't need to handle SIZE composition.
   If it can be the parent of a data-driven stack, you do.
2. **What kind does it produce?** Pick the most informative kind that
   honestly describes the result. A spread-style operator that lays
   children out side-by-side without summing should keep SIZE composition
   along its stack direction. An operator that fixes children to specific
   coordinates should produce POSITION. An operator that introduces a
   categorical axis should produce ORDINAL.
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
- The Monotonic algebra used by SIZE composition: `src/util/monotonic.ts`.
- Layout consumption: `gofish.tsx`'s `layout()` for root-level dispatch;
  `spread.tsx`'s `layout` for the per-node `computeScaleFactor`.
- Companion factory docs:
  [The Mark Factory](/internals/frontend/mark-factory),
  [The Operator Factory](/internals/frontend/operator-factory).
