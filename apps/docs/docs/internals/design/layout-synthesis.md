---
title: "A Synthesis of UI, Diagram, and Chart Layout"
section: Speculative Notes
order: 33
status: speculative
---

<!-- TODO(diagrams): the fenced ASCII diagrams below should become GoFish
     figures (internal-*.ts examples) per the internals convention — GoFish
     drawing its own layout theory is half the point. Kept as ASCII for now so
     the content lands first. -->

# A Synthesis of UI, Diagram, and Chart Layout

**Claim.** UI layout (SwiftUI, Flexbox), diagram layout (Bluefish, PiCCL), and
chart layout (grammars of graphics, GoFish) are one engine seen from three
angles, and each tradition holds a piece the others are missing. UI brings the
**proposal protocol** (parents hand children sizes); diagrams bring **explicit
relations** (alignment and spacing as first-class constraints rather than
operator internals); charts bring **scales and units** (sizes as functions of
pixels-per-data-unit, tagged with what they measure). Put together, the engine
is small: sizes flow **up** as functions, get **inverted once per scope**, and
flow **down** as constants; positions are a separate, equally simple system.
Both halves are instances of the same kind of algebra, which is why the same
layout phenomena keep reappearing across all three domains.

This note develops the synthesis with worked examples. It is the theory
companion to [[size-claims]] (the size-setting design round) and
[[constraints-as-core]] (the feasibility report that proved `spread` reduces
to constraints). Technical terms are introduced as needed and explained; none
is load-bearing jargon.

## Vocabulary

- **Scale factor (σ)** — pixels per data unit. A bar encoding 50 at scale
  factor 2 is 100px.
- **Claim** (size request) — what a node reports upward before layout: its
  extent _as a function of σ_. A data bar claims `50·σ`; a fixed box claims
  the constant `40`.
- **Proposal** — the pixel size a parent hands a child at layout time.
- **Combine (fold)** — an array reduce: a parent's claim is its children's
  claims reduced with an operation (`+` for stacking, `max` for overlaying).
- **Hold fixed (pin)** — a quantity already determined by something else
  before a solve runs (an explicit option, an inherited scale, an
  already-placed child).
- **Measure** — a unit-of-measure tag carried by values and claims
  (`"Fare (USD)"`, the flex measure, px), so layout never silently adds
  incompatible units.
- **Scope** — a region of the tree that shares one scale per axis per
  measure. Defined precisely below; it is the load-bearing concept.

## Part 1: Sizes — one expression per scope

### A bar chart, traced

Three bars encoding 30, 80, 50, side by side with 8px gaps, in a 300px
container. Each bar claims its value times the (unknown) scale factor; the
spread combines them with `+` and adds the spacing constant; a layer overlays
the result with a fixed 90px legend and combines with `max`:

```
                 layer  ──  max(160σ + 16, 90)
                /     \
   spread(gap 8)       legend ── 90        (a constant claim)
   /     |     \
 30σ    80σ    50σ      ── 30σ + 80σ + 50σ + 16  =  160σ + 16
```

Notice what the tree did: each level just **nested the expression one
deeper** — and an expression built from sums, maxes, and constants, plugged
into another such expression, is simply a bigger expression of the same kind.
The levels vanish. At the boundary there is one flat formula in one unknown,
and one inversion solves it:

```
160σ + 16 = 300   ⟹   σ = 284/160 = 1.775
```

Then the **down** pass: with σ known, every node's size is its own claim
_evaluated_ at σ — bars of 53.25, 142, 88.75 pixels. The parent "proposes"
those numbers, but the children could have computed them from σ alone.
**Within this region, the proposal carries no information; it is the
evaluation of an already-solved expression, distributed over the tree.** This
is the precise sense in which the algebra is _flatter than the hierarchy_:
the up-pass compiles the hierarchy away.

### Why the expressions behave: a two-sentence algebra lesson

A **semiring** is an algebra with two operations wired like `+` and `×`
(associativity, distributivity, identities) but with no requirement of
subtraction or division. The **tropical** semirings use (max, +) or (min, +):
"multiplying" means _adding numbers_, "adding" means _taking the larger (or
smaller)_.

Size composition uses exactly the (max, +) operations and nothing else:

| layout act       | algebra                 |
| ---------------- | ----------------------- |
| stack / sequence | `+` (sizes add)         |
| overlay / align  | `max` (larger one wins) |
| spacing, padding | `+ constant`            |
| a data value     | scalar multiple of σ    |

Monotone functions are closed under all four operations, so _any_ network of
these constraints composes to a monotone claim — which is why the inversion
(auto-fit) is always a one-unknown solve and never a general constraint
system. Two bonus facts. First, (max, +) expressions over _linear_ claims are
exactly the **convex piecewise-linear** functions (sums and maxes of lines
build upper envelopes) — so the common case has a normal form with exact,
search-free inversion. Second, this is also the algebra of **critical paths**
in scheduling, which is not a coincidence: a layout axis is a schedule where
extents are durations.

### Scopes: where the flatness ends

If the algebra flattened everything, there would be one σ for the whole
visualization and proposals would never matter. Neither is true, because of
**scopes**. The rule (from the sharedScale redesign):

> **A scale solves at the lowest node where its measure stops being shared.**

Claims in the same measure bubble up and combine until no sibling outside the
region shares that measure; there the claim is absorbed, and that node solves
its own σ for that measure — _against the pixel size it was proposed_. Scope
boundaries arise four ways: a measure private to a region (the
self-scaling case), an explicit pixel size pinning a region, opaque measured
content (text, images), and a coordinate transform (inside a polar warp,
pixel arithmetic restarts).

**The marginal histogram, traced.** A scatterplot of penguin bills with a
histogram of the x-values on top, in a 400×300 container, stacked vertically
with a 10px gap. The x measure (bill length, mm) is shared by both panels;
the histogram's y measure (count) is private to it.

```
AST (≈12 nodes):                     Scope tree (2 nodes):
 root                                 ┌─ scope A ───────────────────────┐
  └ vstack                            │ x: bill-length(mm), shared      │
     ├ marginal histogram             │ y: pixels via fill policy       │
     │   └ bars (count heights)       │   ┌─ scope B ────────────────┐  │
     └ joint panel                    │   │ y: count — private to    │  │
         └ points (bill x, depth y)   │   │ the marginal             │  │
                                      │   └──────────────────────────┘  │
                                      └─────────────────────────────────┘
```

Resolution order, as it actually happens:

1. **Scope A folds and solves.** The shared x claims from _both_ panels
   combine (max — they overlay on x) and invert against 400px once: one
   σ*x for the whole figure. That is what "shared axis" \_means*.
2. On y, neither panel claims in a shared measure; both are fill children of
   the vstack. The fill policy splits 300 − 10 into 145px each — these
   proposals are **policy verdicts**, not evaluations.
3. **The boundary.** The marginal receives 145px. Its count claims (say the
   tallest bin has 29 observations: `29·σ_count`) were _absorbed_ at its root
   rather than bubbling, because no sibling shares the count measure. Now
   that absorbed claim inverts against the proposal:
   `29·σ_count = 145 ⟹ σ_count = 5 px/count`. A fresh, flat, local problem.
4. Inside the marginal, proposals are again mere evaluations (`count·5`).

So the hierarchy that governs resolution is not the AST — it is this much
coarser **tree of scopes**, and the whole engine is an alternation:

```
fold ↑ … invert ⟳ … evaluate ↓ … ║ boundary: evaluated px becomes the
                                  ║ inner scope's budget
                                  ╚═ fold ↑ … invert ⟳ … evaluate ↓ … ║ …
```

(Today GoFish can only create that inner boundary with an explicit pixel
size, which is why the marginal currently needs a hard-coded height; the
measure-scoping rule makes the boundary fall out of the data — the acceptance
test for the multi-scale round, #547.)

### The three real jobs of a proposal

Within a scope a proposal is redundant. It is load-bearing in exactly three
situations, all of which are ways a child sits _outside the expression_:

| job                      | situation                  | example                               |
| ------------------------ | -------------------------- | ------------------------------------- |
| **budget**               | crossing a scope boundary  | the marginal's 145px slice (step 3)   |
| **policy verdict**       | claim-less (fill) children | the vstack's equal split (step 2)     |
| **measurement argument** | opaque content             | `measureText(proposedWidth)`, treemap |

And the first two are scheduled to converge: once flex shares are claims in a
flex measure ([[size-claims]]), fill children re-enter the algebra and their
proposals become evaluations like everyone else's — the "policy" row exists
exactly to the extent that children live outside the algebra.

CSS already knows all of this, it just never says so. `grid-template-columns:
100px 1fr 2fr` in 400px: the constant claims 100; the `fr` tracks claim
`1·σ_f` and `2·σ_f` _in a unit_ — `fr` is nothing but a measure — and
`3·σ_f = 400 − 100` solves σ_f = 100 px/fr, tracks of 100 and 200. The
"subtract the absolute tracks first" rule is not a rule; it is the fact that
constants don't consume σ. **UI layout always had scales; it just never named
them.** That is the unexpected payoff of bringing charts' machinery to UI:
flex factors, `fr` units, and weight parameters across every UI toolkit are
scale claims in an anonymous measure.

## Part 2: Positions — the other tropical semiring

Sizes said nothing about _where_ things go. Placement constraints all have
the shape "B's left = A's right + 8", which unpacks to

```
x_B − x_A = w_A + 8
```

— a **difference constraint**: a fixed gap between two unknowns. Systems of
difference constraints are the textbook application of **shortest paths**:
draw a node per position, an edge per constraint weighted by its gap, pick an
anchor; the consistent positions are the path distances from the anchor, and
the system is consistent exactly when there is no negative cycle. Shortest
paths are (min, +) matrix algebra — along a path you _add_ gaps, across
alternative paths you take the _extreme_. The distribute walk is the trivial
case of this:

```
anchor                                          positions = running path sums
x_A = 0 ──(53.25+8)──▶ x_B = 61.25 ──(142+8)──▶ x_C = 211.25
```

(the bar chart again: 0, 61.25, 211.25, and 211.25 + 88.75 = 300 — the sizes
the (max,+) half produced are the edge weights the (min,+) half consumes).
Our walks get away with being walks because the constraint graph is a forest
— one anchor, no alternative paths, so "shortest" is just "the" path. If
cyclic placement specs are ever allowed, the consistency check is the
standard no-negative-cycle test, still linear-time on these graphs.

So the two halves of layout are **two tropical semirings over two spaces**:
extents compose in (max, +) over scale-space, positions in (min, +) over
position-space. And there is a reason it _had_ to be tropical: geometry with
alignment only ever uses **ordering and addition of lengths**. There is no
meaningful multiplication of two lengths — except area, and notice that the
area-driven operator (treemap) is exactly the one that escapes the per-axis
algebra and must be treated as an algorithm node — and no subtraction-as-
inverse, since sizes cannot go negative. Tropical algebra is what linear
algebra degenerates to when ordering and addition are all you have. UIs,
diagrams, and charts all live on that substrate; that is the pervasiveness
your intuition kept noticing.

## Part 3: Who fires when — order is discovered, not chosen

The remaining mystery is ordering: nest can resolve outside-in (CSS
padding: interior = box − 2·padding) or inside-out (gotree boxes: box =
content + 2·padding), just as a distribute can solve for the scale, the
container, or the spacing ("two of three"). Who decides?

Nobody. Treat every constraint as a **relation** that _fires_ the moment all
but one of its variables are known. Then run the dumbest loop: fire anything
fireable, repeat to fixpoint. Direction is an _outcome_, not a choice.

> **Implementation status.** Known-size placement now uses the batch equivalent
> of this loop: per-axis facet equalities are collected into connected
> components, solved without declaration order, checked for contradictions, and
> committed atomically. Size-setting relations still resolve first through the
> existing span/nest/grid proposal machinery.

**Traced.** A 300px-wide layer with a 60px box `A`, and a nest pair
(outer `O`, inner `I`, padding 10), with `A` and `O` distributed at gap 8:

```
start:    A = 60 (own claim).  O, I unknown — nest has TWO unknowns, stuck.
fire distribute:  O is the only fill child → O = 300 − 60 − 8 = 232.
fire nest:        one unknown left → outside-in: I = 232 − 2·10 = 212.
```

Swap one fact — make `I` a 100px image and `O` claim-less — and the _same
loop_ runs the other direction: nest fires first (inside-out, `O` = 120),
then the distribute walks `A` and `O` into place. The spec didn't encode a
direction; the information flow did. (This corrects the first nest
implementation, which hard-coded inside-out and rejected sized outers.)

Three guarantees make this principled rather than hopeful:

1. **Order doesn't matter.** Because every variable is written at most once
   (the ownership discipline), propagation is _confluent_: any firing order
   reaches the same values — the determinism property of single-assignment
   dataflow. A topological order exists, but only as the _trace_ of the run.
2. **The scale factor is the exception, and it's already handled.** No single
   relation determines σ — it is pinned jointly by everyone's claims against
   one budget. That is exactly why the size half goes _symbolic_: compose the
   claims into one expression (Part 1) and invert once. The engine is a
   deliberate hybrid: **shared per-axis unknowns → symbolic expression + one
   inversion; per-node pixel unknowns → single-assignment propagation.** With
   the linear/convex-PL normal forms, the symbolic side costs the same as
   propagation; nothing is lost.
3. **Failure is a diagnosis.** If fixpoint leaves unknowns: either genuine
   under-determination — a **policy** answers (fill slices, baseline-at-0;
   these are "weak constraints," defaults that yield to anything stronger) —
   or a _stuck cluster_ where every relation has ≥2 unknowns: a genuinely
   simultaneous system (Bluefish's equilateral triangle), which is out of
   the language **by design** and should be reported as such, listing the
   cluster. Two writers on one variable: an ownership error naming both.

## Part 4: The three traditions, clarified by each other

**UI toolkits run the same two passes with all-opaque functions.** SwiftUI's
protocol is propose-down / respond-up — structurally identical to budget-down
/ claim-up — but every view's response is an arbitrary closure. Nothing can
be folded symbolically, so nothing can be inverted: no auto-fit, no
reasoning, every proposal load-bearing. An `HStack` _is_ `distribute +
align`; it's just compiled into imperative code where the constraints are
invisible. Making the relations explicit (diagrams' contribution) and the
responses symbolic (charts' contribution) is what turns the same protocol
into something a solver — and a human — can reason about.

**Min/ideal/max sizing locates itself in the algebra rather than breaking
it.** A measurement policy is `respond(p) = clamp(p, min, max)` — and
`clamp(x, lo, hi) = max(min(x, hi), lo)` is built from min, max, and
constants. Supporting it extends the extent algebra from (max, +) to
(min, max, +), whose expressions are exactly the **monotone piecewise-linear
functions**: still closed under composition, still monotone, so the two-pass
architecture is untouched. The one new phenomenon is **flat segments** (a
clamped child stops responding to its proposal), where inversion becomes
set-valued — there is slack, and the algebra cannot say who absorbs it. That
is not a defect; it is the theory _predicting_ why SwiftUI has
content-hugging and compression-resistance priorities: **priorities are the
slack policy for flat spots in the inverse.** The invariant to demand of any
future content protocol is only this: _responses must be monotone in the
proposal_ — the single property everything above rests on.

**Diagrams get the missing half.** Bluefish's relations are pure
(min, +)-side: positions only, sizes fixed before layout, with the per-axis
2-equation bounding-box ledger keeping anchors consistent and owned. What it
lacked — its own §6.2 — is the (max, +) side: claims, scales, and the
inversion that sizes children. Charts had that all along. Conversely, charts
get diagrams' discipline: alignment and spacing as explicit owned relations
rather than operator internals, and the ledger as the bookkeeping for
"two anchors imply a size."

| tradition | contributes                                              | was missing                                                   |
| --------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| UI        | the proposal protocol; min/ideal/max; fill/flex practice | symbolic claims (⇒ no inversion, no auto-fit); named scales   |
| diagrams  | explicit relations; ownership ledgers; anchor algebra    | the size half entirely (claims, scales, solving)              |
| charts    | scales, measures, data-driven claims                     | the proposal protocol; relations as first-class, owned things |

## The engine, in one box

```
per scope, per axis, per measure:
  1. FOLD      claims combine upward      — (max,+) expression in σ
  2. INVERT    once against the budget    — closed-form on the PL normal form
  3. EVALUATE  claims at σ, downward      — proposals as evaluation
     ║ at a scope boundary: the evaluated pixel size is the inner scope's
     ║ budget; recurse. (fill → policy verdict; opaque → measurement arg)
  4. PROPAGATE pixel relations fire at one-unknown — confluent, owned, sorted
     by information flow (nest, intervals, PiCCL-style equalities)
  5. PLACE     difference constraints     — (min,+) path sums from anchors
```

Everything is one visit per node per pass — O(N) — and every failure mode is
a named diagnosis (under-determined → policy; simultaneous → out of language;
over-determined → ownership report; cycle → error).

**The completeness conjecture**, stated so it can be proved or refuted:
networks of {align, distribute, position, nest} realize _exactly_ the
(max, +) closure of child extents on the size side (align ↦ max, distribute ↦
sum + constant, nest ↦ unary + constant, position ↦ pins), and forests of
difference constraints on the position side. Custom layouts (treemap, force
layouts, wrapping) sit outside the _generators_ but inside the _language_:
arbitrary computation that emits claims, proposals, and placements under the
same ownership rules. That two-sorted statement — which Bluefish could never
formulate for its relation set — is the candidate theorem at the heart of the
thesis chapter, with the (min, max, +) extension and priorities-as-slack as
its UI corollary.
