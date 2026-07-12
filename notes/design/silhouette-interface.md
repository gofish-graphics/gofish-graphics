# The silhouette interface

**Status:** design note (2026-07-12). Companion to
[modular-layout-algorithms](./modular-layout-algorithms.md), which surveys the surrounding
design space. This note formalizes one piece of it: the summary of a child's boundary that
composition operators consume, and the laws that summary must satisfy so that choice-based
layout selection (issue #486) stays sound and its cost stays predictable. Related issues:
#486 (choice operator), #630 (`min` in the claim algebra), #122 (wrap operator), #290
(`.stack()` as a mark method), #739 (grid reshape), #47 (stacked ribbons).

## 1. The problem

`stack` composes children by bounding box. The space fold sums each child's extent along the
stack axis, and the placement chain glues facing box edges. This is a sound composition of
values exactly when a child's boundary along that axis is fully described by its box edge,
which is true for rects and false for almost everything else. Two experiments (2026-07-12)
made the failure concrete:

- Stacking the panels of a ridgeline chart glues boxes, not curves. The meaningful stacked
  version of overlapping area panels is a stacked area chart, which needs the panels to
  compose at every x position. The interface between siblings is the whole top curve.
- Stacking the category runs of a waffle chart needs run B to continue run A's ragged last
  row. The interface between siblings is the position where A's last row ends.

Both failures have the same shape. The interface between composed siblings is richer than a
bounding box, and the current architecture only passes a bounding box.

The pretty-printing literature solved this for text. There the summary passed between
concatenated documents is the pair (last line width, cost), and the optimizer prunes a Pareto
frontier over it. Porncharoenwase, Pombrio, and Torlak (OOPSLA 2023) additionally made the
cost side pluggable: the algorithm requires only a total order, an associative combine, and
monotonicity laws, and any cost type satisfying those laws works. This note applies the same
move to the geometric side. Instead of hard-coding a `lastRowWidth` field into the layout
architecture, we define the interface that any boundary summary must satisfy, and ship the
paragraph summary as one instance among several.

## 2. The observation that dissolves the "hard-code it?" question

The engine already passes children summaries richer than a bounding box, and it already
accretes them one field at a time:

- The base record is an `Interval` per axis (`{min, center, max, size}`, `dims.ts`).
- `baseline` is an extra coordinate that only some joins consult. It is defined as the
  node's local origin, travels through the translate chain, and is read through
  `localAnchor` / `projectedTranslate` (`_node.ts`). A spread with `anchor: "baseline"`
  chains it; every other parent ignores it.
- `pitchAnchorY` (`_node.ts`) is a second one-off scalar a node exposes so a parent can
  chain on it.

So the status quo is a boundary summary with three hard-coded components and no extension
mechanism. Adding `lastRowWidth` as a fourth field would continue that pattern. The
alternative is to name the concept once, state its laws, and make the existing fields the
first instances. We call the concept a **silhouette**, following the contour language of
issue #486. We deliberately avoid the word "measure", which already has three unrelated
senses in this codebase (the unit-of-measure tag `Measure` in `data.ts`, canvas text
measurement, and `GoFishRef.measure()`).

## 3. Definition

Fix a set J of **joins**. A join is a binary composition mode along a flow, e.g. the hard
glued join of `stack`, the hard join with pitch of `spread`, and the soft join of a `wrap`
(continue on the current row, or break). Operators are folds of joins over child lists.

A **silhouette structure** for J consists of:

- a set S of silhouette values, with a distinguished identity ε (the empty layout);
- for each join j ∈ J, a combine operation ⊕ⱼ : S × S → S;
- a projection π : S → Box, where Box is the existing per-axis interval record, with
  π(ε) = the empty box;
- a preorder ⊑ on S, called **domination**. Read a ⊑ b as "a is at least as good as b in
  every context". In practice ⊑ also folds in a cost component: frontier elements are pairs
  (s, c) with c drawn from a cost algebra (C, ≤, +) in the sense of Porncharoenwase et al.,
  and (s, c) ⊑ (s′, c′) iff s ⊑ s′ and c ≤ c′.

A **choice** node (the `alt` of issue #486) denotes a finite set of alternatives. Evaluation
carries finite subsets of S (frontiers), combines them pointwise, and prunes dominated
elements:

    A ⊕̂ⱼ B  =  min⊑ { a ⊕ⱼ b : a ∈ A, b ∈ B }

## 4. The three laws

**Law 1 (fold coherence).** Each join is a monoid on S:

    (a ⊕ⱼ b) ⊕ⱼ c = a ⊕ⱼ (b ⊕ⱼ c)        ε ⊕ⱼ a = a = a ⊕ⱼ ε

An operator folds its child list, so the result must not depend on how the fold is grouped.
Note the law is per join. Re-associating _across_ different joins, e.g. turning
(a ⊕soft b) ⊕hard c into a ⊕soft (b ⊕hard c), is not required to preserve anything and does
not, and choice trees never need it. This mirrors pretty printing, where concatenation is
associative but the alternatives inside an `alt` are not interchangeable with it.

**Law 2 (conservativity over box joins).** Some joins already have a box semantics ⊞ⱼ in the
engine, e.g. stack's "concatenate intervals along dir, union across". For every such join,
the projection must be a monoid homomorphism:

    π(a ⊕ⱼ b) = π(a) ⊞ⱼ π(b)

This law is the interface with the current architecture, and its scoping is the point. It
does _not_ say π commutes with every join. A soft join has no box counterpart, and the box
of a soft combination is genuinely not a function of the two boxes (the combined width
depends on where the left side's last row ends). That missing function is exactly the
information the silhouette adds. The law says instead: wherever only box joins are applied,
the refinement is erasable. A parent that reads only π(s) composes projections and gets the
same geometry as projecting the composition, so silhouettes never leak past the scope that
understands them, and every existing operator remains correct unchanged.

**Law 3 (monotonicity, which is what makes pruning sound).** Every join is monotone in each
argument with respect to domination:

    a ⊑ a′  implies  a ⊕ⱼ c ⊑ a′ ⊕ⱼ c   and   c ⊕ⱼ a ⊑ c ⊕ⱼ a′

and the cost combine is monotone in the same way. The payoff is the standard Pareto
admissibility argument. Let K be any one-hole context built from joins and fixed
silhouettes. By induction over K, Law 3 gives

    a ⊑ a′  implies  K[a] ⊑ K[a′]

so a dominated alternative can be discarded from a frontier without losing any optimal
completion of any enclosing context, and frontier evaluation with pruning computes the same
optima as enumerating every alternative. This is the same role the cost laws play in
Porncharoenwase et al. (their monotonicity conditions on `cost-text` and `cost-nl` are Law 3
restricted to the cost component) and the same argument Bernardy (ICFP 2017) uses for his
measure vectors.

**Tractability falls out of the domination order.** The frontier after pruning is an
antichain of ⊑, so its size is bounded by the width of ⊑ (the size of the largest
antichain). That makes the cost of choice a visible property of the silhouette type you
declare, before anything runs:

| silhouette          | width of ⊑                          | consequence                             |
| ------------------- | ----------------------------------- | --------------------------------------- |
| box, cost only      | 1                                   | greedy, no search (today's engine)      |
| paragraph (h, w, ℓ) | bounded by distinct last-row widths | polynomial Pareto DP (pretty printing)  |
| contour / skyline   | unbounded                           | search; NP-hard strip packing territory |

The dividing line issue #486 draws between "Pareto-optimal choice" and "heuristic tactic
plus certificate" is therefore not a judgment call per algorithm. It is the width of the
declared domination order.

## 5. Instances

**Box.** S = the per-axis `Interval` record, π = identity, joins = the existing folds, ⊑ =
cost only. All three laws are trivial. The current engine is this instance with a frontier
of size one.

**Box with baseline.** S = Box × ℝ, where the second component is the origin offset. π
forgets the offset. A baseline-anchored join reads the component; box joins ignore it, so
Law 2 holds. This is a reconstruction of what `baseline` and `pitchAnchorY` already do, which
is the evidence that the interface is descriptive, not speculative.

**Unit count (the waffle).** With a fixed column count C and unit size (u, v), take S = ℕ
with ⊕soft = +, ε = 0, and

    π(n) = box( min(n, C)·u ,  ⌈n/C⌉·v )        lastRowWidth(n) = (n mod C, or C)·u

Everything is associative and monotone, and with C fixed there is no choice anywhere, so the
frontier has size one. This is why today's `derive` + `chunk` implementation of the waffle
is correct: the silhouette algebra degenerates to counting. The machinery only activates
when something is actually chosen (C, the unit size per issue #663, or flat-vs-grid).

**Paragraph (Bernardy's measure).** S = (h, w, ℓ): row count, maximum width, last-row
width. With aligned concatenation, where the right block starts on the left block's last row
at column ℓₐ:

    h = hₐ + h_b − 1        w = max(wₐ, ℓₐ + w_b)        ℓ = ℓₐ + ℓ_b

and with the hard vertical join:

    h = hₐ + h_b        w = max(wₐ, w_b)        ℓ = ℓ_b

Domination is componentwise ≤ (plus cost), and max and + are monotone, so Law 3 holds. For
_unaligned_ concatenation (the PrettyExpressive primitive, where only the first row of the
right block starts at column ℓₐ), the silhouette becomes column-indexed: S is a function
from start column to (h, w, ℓ), the laws hold pointwise, and evaluation at a column is their
`resolve` at column c. This is the instance issue #486 calls the tractable first cut.

**Table columns.** S = a vector of column widths, ⊕row = pointwise max, π = the sum. This
is the summary a grid needs so cells align across rows, and it shows the interface is not
specialized to reading-order flows.

**Contour.** S = a piecewise function from cross-axis position to extent, ⊕ = the contour
merge of van der Ploeg's tidy-tree algorithm. The laws hold, but ⊑ has unbounded width, so
this instance sits on the far side of the table in §4: it composes deterministically in a
fixed order, and any _choice_ over it is a tactic, not a Pareto search.

## 6. Integration with the engine

**Placement side only, scoped, and the write-once commit survives.** The placement solver
commits exactly one geometry per node axis (`solvePlacementConstraints`,
`placementSolver.ts`). That contract can stand. A frontier lives inside the operator that
declares the silhouette, e.g. inside a wrap's reading-order scope. At the scope boundary the
choice is committed and only π(s) leaves, which is Law 2's erasure applied at exactly the
boundary where the σ-scope model already recurses. Issue #486's restriction that a choice
must not change scale domains is the same boundary condition on the scale pass.

**The claim algebra is untouched.** No silhouette enters the size-claim carrier. When a
choice must escape a scope, e.g. a content-sized wrap negotiating with its parent, it
escapes as `min` over Monotonic claims, which is issue #630 and is already analyzed in the
survey (min ≡ the pretty printer's `group`; monotone piecewise-linear claims are closed
under min).

**The genuine remaining pinch is cross-axis, not the silhouette.** A wrap's height claim is
a function of its width, h(w). The claim carrier is scalar per axis, which the survey's §4
already lists as a known gap. Fixed-column wraps do not hit it. Solved-width wraps do, and
the options (a two-pass measurement at the proposed width, as text does, or a cross-axis
claim carrier) are out of scope for this note. Whoever implements a solved-width wrap should
answer that question first, because it is architectural in a way the silhouette is not.

## 7. What wrap is, in join terms

Checking the PrettyExpressive source (github.com/sorawee/pretty-expressive) pinned down the
join structure a wrap operator needs, and it is not `group`:

- `group d = (alt d (flatten d))` is one all-or-nothing choice over a whole subtree.
- Word wrapping (`fill-sep`, in their benchmarks, not their library) is a fold that
  introduces a _fresh_ `alt` per seam: each next item joins by
  `alt(continue-on-this-row, break-to-a-new-row)`. n items, n − 1 independent choices, and
  the Pareto search picks the break set.
- Vertical concatenation `<$>` is concatenation with a hard newline, which _fails_ under
  flatten, so a hard join is structurally exempt from choice.

So the operator family is one concatenation spine where only the seam differs: `stack` is
the hard glued seam, `spread` is the hard seam with pitch, and `wrap` is the soft seam
`alt(h-join, v-join)` folded per pair. This yields the spec square that motivated the note:

    stacked bar:      spread("lake"), stack("species"), rect(h: "count")
    grouped waffle:   spread("lake"), stack("species"), wrap(), rect(4, 4)
    stacked waffle:   spread("lake"), wrap("species"),  wrap(), rect(4, 4)

The conventional "stacked waffle" has no hard seam anywhere, so nothing in it is stacked;
the folk name is corrected by the algebra. Fill is associative, so the two nested wraps
collapse into one fill over the flattened units, and the outer `wrap("species")` carries the
partition (order, contiguity, color scale), not layout.

## 8. What this note deliberately does not decide

- Surface syntax and operator spelling (issues #122 and #290), which need sign-off on
  rendered examples.
- Sequencing. The survey's §6 recommendation to probe plan synthesizers (its Option B)
  before the choice algebra still stands. This note lowers the cost of the choice path by
  fixing its interface, but does not reorder the queue.
- Engineering of the frontier representation and where the cost factory plugs in.

## References

- Porncharoenwase, Pombrio, Torlak. _A Pretty Expressive Printer._ OOPSLA 2023.
  https://doi.org/10.1145/3622837 (implementation: github.com/sorawee/pretty-expressive;
  the cost-factory laws are Law 3 restricted to the cost component)
- Bernardy. _A Pretty But Not Greedy Printer._ ICFP 2017. (the (h, w, ℓ) measure and the
  Pareto argument)
- van der Ploeg. _Drawing Non-layered Tidy Trees in Linear Time._ SP&E 2014. (the contour
  instance)
- Issues #486, #630, #122, #290, #739, #47, #663, and
  [modular-layout-algorithms](./modular-layout-algorithms.md) §4 to §6.
