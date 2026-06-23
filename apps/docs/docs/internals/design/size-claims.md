---
title: "Design Space: What May Set a Size, in What Units"
section: Speculative Notes
order: 32
status: speculative
---

# Design Space: What May Set a Size, in What Units

**Question.** Positions in GoFish have an ownership rule: `place()` writes a
position once per axis, and a second write is ignored. Sizes have no such
rule — they are either _solved_ (the auto-fit machinery) or _scribbled_
(scatter's interval channels write a child's dimensions directly; treemap
imposes rectangles computed by d3). Several pending features all reduce to
"something other than the child itself decides the child's size." This note
maps the design space for doing that once, with clear ownership and clear
units, instead of once per feature. It is the design round for
[#545](https://github.com/gofish-graphics/gofish-graphics/issues/545)
(size-setting constraints) and
[#553](https://github.com/gofish-graphics/gofish-graphics/issues/553)
(flex shares as data), the first two residuals of [[constraints-as-core]].

**Verdict, in one paragraph.** Sizes should be set **by proposal, before or
during the child's layout — never by mutating a subtree that has already laid
itself out**. Positions compose by translation, which is why a post-layout
`place()` is safe; sizes participate in layout (a resized box must re-lay-out
its contents), which is why every safe size-setting path in the codebase and
in the prior art flows through the size the parent hands the child. Concretely:
a size-setting constraint contributes (1) a _size rule_ — the target's extent
as a function of other extents — applied at space-resolution time when the
inputs are scale-dependent, and (2) a _proposal_ at layout time, computed in
dependency order. The write-once discipline then has a natural home: **at most
one constraint may own a target's proposal per axis**, and the
linear-system bounding-box model from
[#39](https://github.com/gofish-graphics/gofish-graphics/issues/39) is the
right ledger for detecting when writes over- or under-determine an axis. An
empirical spike (below) confirms the companion claim from #553: flex sharing
is not a separate mechanism but an ordinary size request in a dedicated unit,
and the `weights` arrays that used to approximate it were deleted outright in
this round.

## Terminology

Defined once, used throughout. Where a term of art exists outside GoFish (CSS,
SwiftUI), we lean on it.

- **Scale factor** — pixels per data unit. A bar encoding the value 50 at
  scale factor 2 is 100px tall. (Code and earlier essays sometimes write σ.)
- **Size request** — what a node reports upward before layout: "my extent is
  _this function_ of the scale factor" — e.g. `50 × scaleFactor` for a
  data-driven bar, or the constant `40` for a fixed-pixel one. In code this is
  a `SIZE` underlying space carrying a `Monotonic` function
  (`underlyingSpace.ts:91`).
- **Auto-fit solve** — running a size request backwards: given the container
  is 400px, find the scale factor at which the children's combined request
  equals 400. One equation, one unknown (`Monotonic.inverse`).
- **Size proposal** — the pixel size a parent hands a child when calling
  `child.layout(size, …)`. A fallback: a child with its own size request
  ignores it.
- **Fill child** — a child with no size request on an axis. It stretches to
  whatever is proposed, like a CSS flex item.
- **Leftover space** — container minus spacing minus the space taken by
  children that did request sizes. What fill children should split.
- **Measure** — a unit-of-measure tag (a string such as `"Fare (USD)"`)
  carried by values and spaces so the layout does not silently mix
  incompatible units. Two merge policies exist: strict (`mergeMeasures`,
  throws on mismatch) and permissive (`forgetOnConflict`, drops the tag).

## The problem, concretely

Today there are three different answers to "who sets a size," none of them a
discipline:

1. **The solve.** Data-driven requests are combined bottom-up (sum for
   side-by-side via `distributeSpaceFold`, max for overlay via the align fold)
   and inverted top-down. Principled, but it only covers sizes that are
   functions of the scale factor.
2. **The proposal.** Fill children adopt whatever `allocateSlices`
   (`constraints/folds.ts`) hands them — an equal share of the **full** budget
   split over **all** distribute targets, sized-or-not. A fixed child's unused
   share is simply lost (measured below: a `[50px, fill, fill]` row in a 300px
   container comes out 256px wide).
3. **The scribble.** `scatter`'s `xMin`/`xMax` channels write the child's
   translate _and_ its `intrinsicDims` directly (`scatter.tsx:227-248`);
   `treemap` does the same with d3's rectangles. Both work because their
   targets are leaves or layout-once subtrees; neither records ownership, and
   a second writer would silently win or silently lose depending on order.

And four pending features each need a fourth answer unless we design one:

| consumer                                                                                                 | direction | where the number comes from                        | units                                                                             |
| -------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `nest` (outer := inner + padding; [#461](https://github.com/gofish-graphics/gofish-graphics/pull/461))   | bottom-up | another child's measured extent, plus a constant   | px (padding) over whatever inner's units are                                      |
| treemap slots ([#541](https://github.com/gofish-graphics/gofish-graphics/issues/541))                    | top-down  | an external algorithm                              | **area** — d3 owns each rectangle's aspect ratio; weights are not per-axis shares |
| equal-width (Bluefish §6.2's unsolved case)                                                              | sideways  | the max of the targets' requests, pushed back down | the targets' shared units                                                         |
| interval channels (`xMin`/`xMax`; [#546](https://github.com/gofish-graphics/gofish-graphics/issues/546)) | derived   | two placed anchors on one axis                     | the position scale's units                                                        |

Plus the flex question (#553): a fill child's share of leftover space is
conceptually a _per-child datum_ ("this child gets 2 shares"), yet until this
round it was spelled as a positional `weights` array riding next to the
children.

## Prior art

**PiCCL** (`equal`, one of its four constraint kinds — connect / align /
equal / rotate). `Glyph.equal(source, target, {channel: "width"})` is a
_unidirectional copy_: source's width is assigned target's already-solved
width, constraints are applied in dependency (DAG) order, and a per-node
`keepAspectRatio` flag back-propagates the other dimension
(`PiCCL_core/src/solver/solverNodes.ts:189-212`). Two lessons: directional +
topologically ordered means conflicts are impossible by construction (a node's
channel has exactly one upstream writer), and an aspect-ratio flag is how a
1-D size write becomes a 2-D one without a 2-D solver.

**Bluefish** never sizes children from relations (the paper's §6.2 lists
width/height alignment as future work), but its bounding-box bookkeeping is
the strongest ownership model in this space: each axis is a 2-unknown linear
system in (center, size), and _every_ anchor or dimension write is one linear
equation — `left = center − width/2` contributes coefficients `[1, −0.5]`,
`width` contributes `[0, 1]` (`bluefish/packages/bluefish-solid/src/util/bbox.ts`,
`createLinSysBBox`/`solveSystem`). Fewer than two equations: only what was
written can be read. Exactly two: the 2×2 system solves and the remaining
properties become readable, marked _inferred_, with owners recorded per
equation. More than two: the new equation is checked for consistency against
the solved values. This is [#39](https://github.com/gofish-graphics/gofish-graphics/issues/39)'s
"stronger bbox model," and it subsumes write-once: "write-once per axis" is
just "the equation count is capped by the rank."

**The gotree branch** (PR #461) carries a working pre-unification
prototype of this constraint (named `Constraint.contain` there): a layer pre-pass topologically sorts children so inner
precedes outer, lays inner out, then _proposes_ `inner + 2·padding` to outer
as its layout size; a post-pass centers inner in outer. No post-layout
mutation anywhere — the size flows through the proposal. Its one gap is the
other half of the unification lesson ("the crux is the fold, not the walk"):
the derived outer size never enters the layer's upward size request, so a
nested pair inside an auto-fit context doesn't participate in the solve.

**CSS flex/grid.** `fr` units and `flex-grow` numbers are the precedent for
"shares of leftover as a unit distinct from absolute units" — a grid track of
`1fr` and one of `100px` never get added in the same unit; the engine
subtracts the absolute tracks first. This is exactly the measure distinction
GoFish already has machinery for.

## Dimension A — the mechanism

Four candidate mechanisms for letting something other than the child set the
child's size.

**(a) A write-once size facet on `Placeable`.** Mirror `place()`: a
`placeSize(axis, px)` that writes once and no-ops after. Honest about
ownership, but it inherits `place()`'s timing: it runs _after_ the target laid
out. That is safe for positions because positions compose by translation — the
parent moves a finished subtree. It is not safe for sizes: a leaf rect can be
restamped, but a subtree's internal layout depended on the size it was
proposed. A post-layout size facet either silently restricts itself to leaves
(today's scatter hack, generalized) or demands re-layout machinery that
nothing else in the architecture needs. Rejected as the primary mechanism.

**(b) The linear-system bounding box (#39).** Adopt Bluefish's per-axis
2-unknown system as the node's dimension state: anchors and sizes are all
linear equations in (center, size); two anchors on one axis _imply_ the size
(rank 2), formalizing what scatter's interval channels do by hand; a third
write becomes a detected inconsistency rather than a silent no-op; owners ride
the equations. This is the right **ledger** — it answers "what is known, who
wrote it, what is derivable, what conflicts" better than anything else on the
table, and #39 additionally wants aspect ratio as a cross-axis equation
(circles, images, waffle layouts), which couples the x and y systems and is
expressible in the same algebra. But it is bookkeeping, not timing: it does
not by itself say _when_ a size equation may arrive. A size equation that
reaches a subtree after layout has the same re-layout problem as (a). So (b)
is adopted _as the record_, with the rule that size-determining equations must
be resolved by the time the target's proposal is computed.

**(c) Size rules resolved inside the solve.** The constraint contributes the
target's extent _as a function of other extents_, at space-resolution time:
nest is `outer = inner + 2·padding` (a `Monotonic.adds` on inner's
request); equal-width is `each = max(requests)`; flex is `share × scaleFactor`
in its own unit. The combined request stays invertible (sum, max, +constant,
and scalar multiples of monotone functions are closed under composition — the
max-plus algebra of [[constraints-as-core]]), so auto-fit keeps working with
size-set children inside it, including under coordinate transforms. At layout
time the target's proposal is its rule evaluated at the solved scale factor.
This is the only mechanism of the four that keeps the parent's solve _aware_
of the derived size.

**(d) Proposal override in dependency order.** The gotree mechanism: compute
the source's extent first (topological order), then propose the derived size
to the target — no fold participation. Strictly weaker than (c): it is what
(c) does at layout time, minus the upward claim. Its virtue is that it also
covers inputs that exist only as pixels (an inner subtree whose extent is not
a function of any scale — text, images, position-pinned content), where there
is no rule to fold.

**Evaluation against the consumers.**

|                   | (a) post-layout facet | (b) linsys ledger          | (c) rule in the solve               | (d) proposal in dep. order            |
| ----------------- | --------------------- | -------------------------- | ----------------------------------- | ------------------------------------- |
| nest              | leaves only           | ledger only                | ✓ auto-fit-compatible               | ✓ but invisible to auto-fit           |
| treemap slots     | leaves only           | ledger only                | n/a (algorithm, not a rule)         | ✓ (this is what treemap already does) |
| equal-width       | leaves only           | ledger only                | ✓ (max pushed down)                 | ✓ for px-only targets                 |
| interval channels | = today's hack        | ✓ (two equations → rank 2) | ✓ (interval width is scale-derived) | ✓                                     |
| flex shares       | ✗                     | ledger only                | ✓ (spike below)                     | n/a                                   |

The reading: **(c) and (d) are one mechanism at two binding times** — derive
the size as a rule when the inputs are scale-dependent (then it folds, and
auto-fit sees it), and as a measured-pixel proposal when they are not (then it
is computed in dependency order). (b) is the bookkeeping both bind into. (a)
adds nothing the others don't do more safely.

So the recommended shape of a size-setting constraint is a triple:

1. **size rule** (optional) — folds into the layer's space resolution when
   the input extents are scale-dependent;
2. **proposal step** — at layout time, in dependency order, the target is
   proposed its derived size (rule at the solved scale factor, or measured
   pixels);
3. **placement step** — the existing post-layout walk (e.g. nest centers
   inner in outer; nothing new).

with the layer topologically sorting child layout by constraint dependency
(gotree's pre-pass, kept; cycles rejected with an explicit error, as z-order
already does).

## Dimension B — ownership and conflicts

Positions today: second `place()` on an axis is a **silent no-op**
(`_node.ts:550`). Sizes today: no rule at all. The design:

- **One owner per (node, axis, kind)** where kind ∈ {position, size}: at most
  one constraint may compute a target's proposal per axis, and at most one
  may place it. The recognizer/layer enforces this at constraint-collection
  time — two nest constraints claiming one outer on the same axis is a
  spec error, reported with both writers named (Bluefish's `bboxOwners`
  pattern, PiCCL's by-construction uniqueness).
- **Over-determination is a check, not a crash.** Two anchors + an explicit
  size on one axis is rank 3 on a 2-unknown system; following Bluefish, the
  third equation is verified against the solved values within tolerance and
  reported when violated. (The "two of three" budget rule of
  [[constraints-as-core]] is this same statement one level up.)
- **Upgrade the silent no-op** to a structured warning naming both writers.
  Cheap (one owner record per write) and turns the most common constraint
  authoring mistake from invisible to visible. This piggybacks on the linsys
  adoption (#39) and can ship with it rather than with nest.
- **Imposed size vs own request:** a child that carries its own size request
  on an axis cannot also be a size-setting target on that axis — error, not
  precedence. (Precedence is how the scatter hack behaves today, and it is
  exactly the silent-shadowing this round exists to remove.)

## Dimension C — flex is data, not machinery

The `weights`/`stackWeights` arrays were **deleted in this round** (the
maintainer's call: a wart — nothing real used them; their only callers were
the parity stories built to test them). What remains is the principled
question: when proportional sharing _is_ wanted, what is it?

The #553 answer, now empirically grounded: **a flex share is an ordinary size
request in a dedicated unit.** A fill child asking for 2 shares requests
`2 × scaleFactor` tagged with a reserved flex measure. Then:

- the existing distribute fold sums the requests (+spacing) exactly as it
  sums data-driven ones;
- the existing inversion solves the flex scale factor — "pixels per share" —
  against the budget;
- each child's proposal is its request at that factor. `allocateSlices`
  _is_ this computation specialized to slope-1 requests; no separate fill
  policy exists.

There is no need for a `flex()` wrapper type: `datum` already carries a
number plus a measure, and the flex measure is what distinguishes "2 shares
of leftover" from "2 data units." The eventual surface is a channel value
(`w: …` on the mark), consistent with the v3 philosophy that per-child layout
inputs are channels — the same judgment that retired the weights array.

**The unit boundary is the entire design.** The flex solve must run over
_leftover_ space. Two consequences, both confirmed by the spike:

1. **Fixed-pixel siblings need no special casing.** A constant request (a
   40px child) has slope zero — it consumes no scale factor — so folding
   constants and flex requests into one inversion _is_ the leftover
   arithmetic: `50 + w₁·σ + w₂·σ + spacing = budget` solves σ over exactly
   the leftover. CSS's "subtract absolute tracks first" falls out of the
   algebra instead of being a rule.
2. **Data-driven siblings must not unify.** Folding a `value(50)` request and
   flex requests into one Monotonic makes 1 share = 1 data unit — a category
   error with comically wrong output (measured below). Flex and data are
   different measures on the same axis, which is precisely the measure-keyed
   multi-space design ([#547](https://github.com/gofish-graphics/gofish-graphics/issues/547),
   multi-scale-per-axis): per axis, one scale factor _per measure_, with the
   flex measure's budget defined as the leftover after the data measures'
   spans. Flex-as-data therefore **waits for #547**; shipping it on a single
   per-axis scale would bake the category error in.

A structural finding from the spike worth recording: a fill child and a
fixed-pixel child are indistinguishable in the space tree — `rect.tsx:140-144`
deliberately reports UNDEFINED for both ("literal pixel sizes are handled at
layout time"). Flex-as-claims needs that distinction to be first-class:
either fixed-pixel extents also become (constant) size requests, or fill
becomes its own space kind. The former is the natural move — it is what made
consequence (1) work — but it touches every shape's space resolution, so it
belongs to the #547 round.

Treemap is explicitly **not** a flex variant: its weights scale _area_, and
the tiling algorithm owns each rectangle's aspect ratio (and effectively the
scale). Treemap stays a consumer of size _imposition_ — mechanism (d),
proposals from an algorithm — plus the ownership ledger; its weights never
enter a per-axis solve. (If aspect-ratio equations arrive with #39, the
area/linear distinction is also expressible as a unit: px² is not px.)

## Units, summarized

| size write     | unit it carries              | merge policy on contact                                           |
| -------------- | ---------------------------- | ----------------------------------------------------------------- |
| nest padding   | px (constant)                | constants are measure-free; outer inherits inner's measure        |
| treemap slot   | px (algorithm output)        | none — proposals, not claims                                      |
| equal-width    | the targets' shared measure  | strict — equalizing differently-measured widths is a type error   |
| interval width | the position scale's measure | permissive today (`forgetAllMeasures`, scatter.tsx:147-154); keep |
| flex share     | reserved flex measure        | never unifies with data measures (#547); constants are free       |

## Empirical evidence

A throwaway spike (branch `flex-spike`, not for merge; stories
`FlexSpike.stories.tsx` + the existing `ConstraintParity` pairs, measured via
`capture-one` normalized DOM) implemented flex-as-size-requests in the layer's
constraint path: fill children substituted with `weight × scaleFactor`
requests in a reserved measure, fixed-pixel children with constant requests,
proposals computed as request-at-solved-factor.

| case                                                             | result                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| all-fill, equal (`ConstraintFill`, 300px, spacing 8)             | widths **94.6667 / 94.6667 / 94.6667** at x = 0 / 102.67 / 205.33 — bit-for-bit what `allocateSlices` produced |
| all-fill, weighted 1:2:3 (the since-deleted `ConstraintWeights`) | **47.33 / 94.67 / 142** = leftover 284 × (1⁄6, 2⁄6, 3⁄6) — exact                                               |
| fixed 50px + two fills, today's path                             | **50 / 94.67 / 94.67** — row totals ≈256 of 300; the fixed child's unused equal-share is lost                  |
| fixed 50px + two fills, spike path                               | **50 / 117 / 117** — totals exactly 300; one inversion, no leftover special-casing                             |
| `value(50)` + two fills, naive unification                       | **273.08 / 5.46 / 5.46** — 1 share = 1 data unit; the predicted category error, measured                       |

Three sentences of interpretation. The collapse is real: the fill policy is
the standard inversion over flex-measured requests, and the deleted weights
arrays were a hand-rolled special case of it. The leftover rule costs nothing:
constants flow through the same solve. And the one thing that breaks is
exactly the thing the measure system exists to forbid — so flex-as-data is
gated on #547, not on new layout machinery.

> The order story, the algebra, and the proposal/scope picture sketched in the
> next three sections are developed fully — with traced examples — in the
> companion note [[layout-synthesis]].

## Where order lives (a clarification)

"Do we topologically sort?" has three different answers because there are
three different kinds of order in play, and only one of them is a sort over
the spec:

- **The scale dimension needs no ordering at all.** It is two global passes:
  fold size requests bottom-up, solve and propose top-down. The "three ways a
  distribute can be solved" (solve the scale factor; solve the container;
  solve the spacing — the "two of three" rule of [[constraints-as-core]]) are
  _not_ three dependency directions that need sorting. They are one budget
  equation per axis with one designated unknown; _which_ variable is unknown
  is determined by what is already pinned, and the same two passes handle all
  three cases. This is what keeps the system out of general-solver territory:
  there is never a graph of simultaneous equations, only one inversion per
  axis (per measure, after #547).
- **Pixel-level sibling dependencies do sort.** When one child's number
  depends on another child's _measured_ result — nest's outer needs
  inner's laid-out extent; every PiCCL constraint works this way — the layer
  topologically sorts the affected children and rejects cycles with an
  explicit error. Implemented for nest in this round; z-order has used the
  same recipe (Kahn) all along.
- **Placement is relational and confluent once sizes are known.** Align,
  distribute, position, span, nest-centering, and grid placement emit per-axis
  equalities over box facets. Span first resolves its two pixel endpoints into
  an extent fact, so its target has a known `size` for anchor offsets before the
  graph is emitted. The layer solves each connected component as a batch,
  validates contradictory cycles/pins, chooses one deterministic weak origin
  only when a component has a free translation, then commits every position
  atomically. Nest/grid proposal sizing remains outside this pass: it determines
  sizes before the placement solve.

## What the algebra is (and what "complete" could mean)

The fold layer is a **max-plus (tropical) algebra lifted to monotone
functions of the scale factor**: the operations the constraints generate are
sum (distribute), max (align/overlay/equal-width), plus-a-constant (spacing,
nest padding), and scalar multiples (data values). Monotone functions are
closed under all four, which is the entire feasibility argument: any
constraint network built from these has a monotone composite extent, hence
one-unknown invertible, hence auto-fittable. The `Monotonic` module _is_ the
term representation of this algebra — `Linear` is the closed-form normal form
for the affine fragment (where `add`/`adds`/`smul` fold symbolically and
inversion is O(1)), and `unknown` is the general monotone closure (center
mode, max of different intercepts) where inversion falls back to bisection.

Two remarks worth recording. First, the affine-plus-max fragment has a known
shape: max-plus polynomials over linear terms are exactly the **convex
piecewise-linear** functions, which suggests a normal form (and an O(pieces)
exact inversion) for every claim built from linears, `add`, `adds`, `smul`,
and `max` — i.e. `unknown` with its bisection could in principle be reserved
for genuinely non-PL cases only. Second, this gives the completeness question
a crisp formulation that Bluefish never had: the constraint set
{align, distribute, position, nest} is _complete relative to the algebra_
if every extent expressible as a max-plus combination of child extents is
realizable by some constraint network — align supplying max, distribute
supplying sum(+constant), nest supplying unary +constant, position
supplying anchors. Custom layout nodes (treemap) then sit _outside the
generators but inside the language_: arbitrary computation that emits
claims/proposals in the same algebra, which is exactly the
structure-plus-expressiveness trade UI frameworks give up by having no
algebra to emit into.

## Aspect ratio: three candidate homes (open)

#39 wants aspect ratio as a first-class constraint (circles, images, waffle
cells). There are three places it could live, and the choice is deliberately
deferred to the #39/#547 round:

1. **A cross-axis equation in the linear-system bbox** (Bluefish's
   experiment): `width = k·height` joins the x and y 2-unknown systems into
   one 4-unknown solve. Correct and general, but it grows the solve and it
   lives at the pixel layer — it cannot say "make the _scales_ square."
2. **Today's hack**: `rect`'s `aspectRatio` transfers the size-request slope
   across axes at space-resolution time (`rect.tsx:113-127`). Free, but only
   covers the one-axis-data-driven case; it has nothing to say when both
   axes carry scales.
3. **Scale-level coupling**: aspect ratio as an equation between the two
   axes' scale factors (`σ_y = k·σ_x`), substituted before solving so each
   axis still inverts with one unknown. Stays O(1), expresses waffle-style
   square cells (both axes scaled, cells square), and becomes natural once
   scales are measure-keyed (#547). The pixel-layer ledger (option 1) and
   this are complementary, not competing: one constrains boxes, the other
   constrains scales.

## Recommendation and staging

1. **This round** — implement `Constraint.nest` as the first size-setting
   constraint, in the recommended shape: dependency-ordered layout pre-pass
   and centering walk (ported from PR #461), **plus** the size rule
   (`outer = inner + 2·padding` as a `Monotonic.adds` transform of inner's
   request) folded into the layer's space resolution so nested pairs
   auto-fit. Single-owner enforcement for nest targets (two nests on
   one outer/axis = named error). The gotree branch then rebases onto the
   core primitive (its `__contain-outer`/`__contain-inner` wrapper trick
   becomes unnecessary).
2. **With #39** — adopt the linear-system bbox as `Placeable`'s dimension
   ledger: anchors and sizes as owned equations, rank-2 inference (interval
   channels stop being a hack), consistency checks for over-determination,
   structured conflict reports replacing the silent no-op. Aspect-ratio
   equations ride here. [#546](https://github.com/gofish-graphics/gofish-graphics/issues/546)'s
   scatter reduction should land on top of this ledger rather than before it.
3. **With #547** — flex-as-data: fixed-pixel extents become constant size
   requests, fill children get a datum-valued share channel in the reserved
   flex measure, and the per-axis measure-keyed solve runs data measures
   first, flex over the leftover. `allocateSlices` is deleted the same day.
4. **Treemap (#541)** — once 1–2 exist: the algorithm emits proposals +
   position constraints through the same ownership ledger; no new mechanism.

What this note deliberately does _not_ propose: any post-layout size
mutation, any second fill policy, or any weights-like positional side channel.

A note on the epic's finish line. The spread recognizer in the layer
(`resolveSpreadShape`) is _scaffolding_, not architecture: it pattern-matches
one operator image instead of composing constraints generally, and it is the
kind of inessential complexity this program exists to remove. The agreed
simplicity metric for the composition round (#547+#548) is that the general
per-axis algebra replaces recognition with composition and
**`resolveSpreadShape` is deleted** — at which point the core is the fixed
layer pipeline (fold → solve → propose → place → measure) over four
constraint kinds, with operators as guaranteed-faithful sugar and custom
layouts as algorithm nodes emitting into the same algebra.

## Source pointers

Current machinery: `Placeable`/`place()` (`_node.ts:77-83`, `523-563`; silent
no-op at 550), size-request folds (`constraints/distribute.ts:89-156`,
`constraints/align.ts`), the budget solve (`layer.tsx` "Layer budget solve",
`spread.tsx` scale solve), the fill policy (`constraints/folds.ts`), the
scatter interval hack (`scatter.tsx:227-248`), treemap's slot assignment
(`graphicalOperators/treemap.tsx`). Prior art: the gotree `nest` prototype (PR #461, named `contain` there:
`constraints/contain.ts` + layer pre-pass), Bluefish
`createLinSysBBox` (`packages/bluefish-solid/src/util/bbox.ts`), PiCCL
`equal` (`PiCCL_core/src/solver/solverNodes.ts`).
