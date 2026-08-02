---
title: How the Layout Engine Works
section: Layout & Rendering
order: 50.5
group: Layout
status: draft
covers:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/frame.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/solver/scopes.ts
  - packages/gofish-graphics/src/ast/constraints/placementSolver.ts
  - packages/gofish-graphics/src/ast/constraints/differenceGraph.ts
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/layoutClaims.ts
  - packages/gofish-graphics/src/ast/layoutKernel.ts
---

# How the Layout Engine Works

GoFish does not have one layout solver.

It has several small interpreters that successively answer different questions:

1. What spatial quantity does each node represent?
2. How many pixels should one data unit receive?
3. How large is each node at that scale?
4. Where do those fixed-size boxes go?
5. Which later geometry may observe those boxes?
6. How is everything transformed and painted?

Much of the engine's current complexity comes from these stages being interleaved
inside recursive `Layer.layout()` calls.

It also comes from three semantic stories coexisting in the repository.

<Badge type="info" text="AS BUILT" /> describes the production AST today, including
known incomplete cases.

<Badge type="tip" text="TARGET" /> describes the smaller semantics toward which the
engine is being normalized.

<Badge type="info" text="THEOREM" /> states a law we can expect once its listed
preconditions hold.

<Badge type="warning" text="OPEN DECISION" /> marks behavior that still needs a
deliberate policy rather than an accidental fallback.

The target is not a proof of every existing behavior.

Formalizing the engine is expected to reject, repair, or replace some current
behavior.

For the pass-by-pass inventory, see [Layout and Render Passes](/internals/layout/passes).
For the normative target contract, see [Core Layout Semantics v0](/internals/core/layout-kernel).

## Follow two boxes through layout

Begin with two rectangles whose data-driven widths are 2 and 3.

They are distributed with a 10-pixel gap inside a 210-pixel allocation.

Before a scale is chosen, their widths are symbolic:

$$
w_A = 2\sigma, \qquad w_B = 3\sigma.
$$

Distribution combines those claims in series:

$$
C_x(\sigma) = 2\sigma + 3\sigma + 10.
$$

The local scale scope solves the frame equation:

$$
5\sigma + 10 = 210,
$$

which gives:

$$
\sigma = 40.
$$

Intrinsic layout can now produce concrete widths:

$$
w_A = 80, \qquad w_B = 120.
$$

Placement lowers the edge-to-edge distribution relation to:

$$
\min(B) - \min(A) = 80 + 10 = 90.
$$

The two boxes finally occupy $80 + 10 + 120 = 210$ pixels.

The figure exposes the artifacts produced along this route.

::: gofish example:internal-layout-engine-pipeline hidden
:::

<Badge type="info" text="AS BUILT" /> This six-stage presentation is conceptual.

Production performs nested scale solves and child layout recursively.

Axis, label, title, and legend elaboration can also rewrite the tree between
resolution and layout, after which the affected resolution passes run again.

There is no active standalone measurement pass.

The word _measurement_ currently refers to at least three operations:

- symbolic size inference during underlying-space resolution;
- concrete intrinsic work inside a mark's layout, such as measuring text; and
- bounding-box folding after children have been laid out.

`GoFishRef.measure()` is currently an unused identity-like placeholder, not a
general measurement phase.

## Architecture at a glance

The engine is easiest to navigate when recursive method calls are translated into
the values that must exist before other values can be computed.

The arrows in this map are computation dependencies, not syntax-tree containment
and not paint order.

::: gofish example:internal-layout-architecture-map hidden
:::

Read the production diagram as this call structure:

```text
runLayout(root)
  resolve color, names, aliases, and underlying spaces
  elaborate axes, labels, titles, and legend; re-resolve affected passes
  solve root scale scopes
  root.layout(...)
    dispatch recursively by node kind
      Layer.layout(...)
        build local scale, proposal, and dependency plans
        for child in planned order: child.layout(...)     ← recursion
        apply the Layer's placement facts simultaneously
        fold the placed child bounds
      coord.layout(...)                                   ← coordinate-backed Frame path
        derive the coordinate-space allocation
        solve coordinate-local scale scopes
        for child: child.layout(...)                      ← recursion
        anchor children locally, transform, and fold screen bounds
      mark.layout(...)
        compute known or weak intrinsic extents
  pin the root and compute final extents
  bake coordinate scopes; order paint; lower to SVG
```

This explains why production does not have one global “intrinsic pass” followed
by one global “placement pass.”

Those operations are nested inside recursive `layout()` calls.

The normalized dependency flow we want to recover from that recursion is:

```text
resolve names and quantity types
        ↓
collect symbolic claims
        ↓
solve scopes according to explicit Frame policy
        ↓
compute intrinsic geometry
        ↓
lower and solve local placement facts
        ↓
compute bounds and export geometry ports
        ↓
transport refs and construct derived geometry
        ↓
lower an independently ordered paint program
```

Production does not yet represent this whole dependency graph explicitly.

Some arrows are encoded by method-call nesting, some by source-array order, some by
specialized proposal plans, and some by the separate paint graph.

The target architecture makes those dependencies data so that incidental traversal
order stops carrying semantics.

## A scenegraph is not a solve scope

Consider a chart with a Cartesian outer Frame and a polar inner Frame.

The toy program has this shape:

```text
Frame R · Cartesian
└─ Layer · transparent grouping
   ├─ Frame P · polar
   │  ├─ point p
   │  └─ point q
   ├─ connector(ref p, ref q)
   └─ label(ref q)
```

The outer Frame contains a Cartesian label and connector that observe points
placed inside the polar Frame.

A plain Layer inside either shaded Frame only contributes nodes and facts to that
Frame's local writable placement problem.

In the target vocabulary, a Frame boundary is where coordinate and scale policy is
declared; the policy then decides whether each scale is fitted locally, inherited,
or shared explicitly with another Frame. A Layer boundary alone does not declare
either policy.

Step through claim, placement, reference transport, and paint in the figure.

::: gofish example:internal-frame-scenegraph-tour hidden
:::

The important distinctions are:

- **Scenegraph parenthood** determines structural containment and transform paths.
- **Frame membership** determines the local writable placement region and where
  scale policy is declared.
- **Scale policy** determines actual scale sharing; `inherit` and `share(id)` may
  connect scales across Frame boundaries.
- **Task dependencies** determine when nonlocal observations are available.
- **Paint edges** determine which already-constructed primitives appear on top.

These relationships often coincide in simple charts.

They must not be treated as the same relation in the core semantics.

<Badge type="info" text="AS BUILT" /> Production has not completed this
normalization. Coordinate operators are scale-scope roots, some Layers construct
their own scale scopes, and a coordinate-less `Frame` currently delegates directly
to `Layer`.

## The solvers are plural

The production engine is easier to understand as a collection of specialized
mechanisms.

| Mechanism              | Input                                               | Output                                              |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Underlying-space fold  | Mark encodings, operators, constraint typing        | Measures, domains, and symbolic size claims         |
| Scope registry         | A claim or data interval plus a pixel allocation    | A scalar $\sigma$ or affine position map            |
| Proposal planners      | Grid tracks, distributes, nests, and allocations    | Child size proposals and some dependency order      |
| Rank-two box closure   | Strong equations over `(min, size)`                 | Determined sizes and positions                      |
| Difference graph       | Fixed-size anchors, relations, and pins             | Relative positions, component gauges, and conflicts |
| Bake, lower, and paint | Placed geometry, coordinate scopes, and paint edges | Display-list primitives and SVG                     |

A surface constraint can participate in more than one mechanism.

For example, `distribute` can combine child claims as a sum during
underlying-space resolution, divide an allocation into child proposals, and
produce difference equations during placement.

This reuse is powerful, but it makes the current `Layer` responsible for several
semantically different jobs.

### Underlying space describes a quantity, not its pixels

Per axis, production records an underlying space that is approximately one of:

```text
undefined

ordinal(keys)

continuous {
  width: C(σ)
  dataDomain: undefined | [min, max] | "delta"
  measure
}
```

The `dataDomain` distinguishes an unanchored magnitude, an anchored data-position
space, and a space where only differences are meaningful.

This intermediate representation says what kind of quantity is present and how
much room it claims as a function of scale.

It does not yet contain final pixel geometry.

See [Underlying Space](/internals/core/underlying-space) for the complete current
representation.

### A scale scope chooses pixels per unit

A scope can produce either a magnitude scale or an anchored position map.

The magnitude scale is the slope $\sigma$ in pixels per data unit.

The position map also has an intercept, so an anchored domain maps into a concrete
pixel interval.

An `AxisScale` may carry both because the slope and the anchored map can originate
at different structural scopes.

<Badge type="info" text="AS BUILT" /> `ScopeRegistry` is the choke point through
which production derives these values.

Its `solveSize()` method delegates to `Monotonic.inverse()`.

Its call sites still choose their own fallbacks when the inverse is undefined.

The registry therefore centralizes arithmetic and diagnostics, but it does not yet
define a complete fit policy.

It is not a global constraint solver, and it is not a scheduler.

## Size claims and the Frame-fit question

The simplest useful claim fragment consists of nonnegative affine pieces:

$$
a\sigma + b, \qquad a \ge 0.
$$

Overlay combines claims with `max`:

$$
C_{\text{overlay}} = C_1 \vee C_2 = \max(C_1, C_2).
$$

Series layout combines them with addition:

$$
C_{\text{series}} = C_1 + C_2 + \text{gap}.
$$

Finite maxima of nonnegative affine pieces remain continuous, monotone, convex,
and piecewise linear.

The explorer includes the plateau and overflow cases that a single inverse value
can hide.

::: gofish example:internal-layout-claim-lab hidden
:::

The plateau control demonstrates the **greatest-feasible** candidate policy below.

The executable experiment in `layoutClaims.ts` currently takes the more
conservative position: when the budget equals a flat minimum, `fitClaim()`
reports `underdetermined` and records the canonical least solution
$\sigma=0$ instead of choosing the plateau's far edge.

Choosing between those contracts is part of the Frame-fit decision, not a theorem
of the claim algebra.

<Badge type="info" text="THEOREM" /> For compatible claims, `max` is associative,
commutative, and idempotent.

$$
a \vee b = b \vee a,
$$

$$
(a \vee b) \vee c = a \vee (b \vee c),
$$

$$
a \vee a = a.
$$

Addition is associative and commutative, and it distributes over `max`:

$$
a + (b \vee c) = (a + b) \vee (a + c).
$$

These laws are the algebraic reason overlay and series claims can be accumulated
without choosing an execution order.

Production's general [Monotonic module](/internals/core/monotonic) represents a
broader symbolic language.

The reference `layoutClaims.ts` deliberately experiments with a smaller closed
fragment whose laws are easier to inspect and test.

### Frame is intended to own this policy

<Badge type="info" text="AS BUILT" /> The current `Frame` operator is not yet a
semantic allocation boundary.

With a coordinate system it delegates to that coordinate operator.

Without one it delegates to `Layer`.

<Badge type="tip" text="TARGET" /> A normalized Frame should be the only construct
that opens an allocation, coordinate, or positional-scale boundary.

It should carry an explicit per-axis policy:

```text
inherit | fit | share(id) | pixel
```

- `inherit` reuses an accessible parent scale.
- `fit` solves a local scale from a finite allocation and a child claim.
- `share(id)` contributes to one explicitly owned shared scale.
- `pixel` says the axis is already expressed in local geometric units.

<Badge type="warning" text="OPEN DECISION" /> `fit` needs semantics for more than
the happy-path equation $C(\sigma)=B$.

A useful starting point is the feasible set:

$$
F_B = \{\sigma \ge 0 \mid C(\sigma) \le B\}.
$$

When it has a greatest finite element, `fit` can choose:

$$
\sigma^* = \max F_B.
$$

This treats a finite plateau deliberately rather than pretending equality has one
solution.

Several policies remain to be fixed:

- An empty feasible set means unavoidable overflow, but the Frame must decide
  whether that is an error or an explicitly requested clip.
- An unbounded feasible set means a constant-only claim did not determine a data
  scale; it must not invent an arbitrary $\sigma$.
- Unused pixels are slack, and centering or edge-seating that slack is a placement
  policy rather than part of scale inversion.
- A shared scale needs one explicit owner and an order-independent way to combine
  every participant's claim.

## Placement is a different mathematical problem

Scale solving answers how large data-dependent boxes become.

Placement begins after their sizes are sufficiently known.

For a box with minimum $m$ and size $s$, its common anchors are:

$$
\operatorname{start} = m,
$$

$$
\operatorname{middle} = m + \frac{s}{2},
$$

$$
\operatorname{end} = m + s.
$$

### Rank-two box closure

<Badge type="info" text="AS BUILT" /> Strong placement facts initially form linear
equations over the pair $(m,s)$.

Two independent equations determine that pair.

For example:

$$
\operatorname{start}=10, \qquad \operatorname{end}=70
$$

implies:

$$
m=10, \qquad s=60.
$$

The rank-two closure detects incompatible equations instead of letting the last
constraint silently overwrite an earlier one.

A size that remains intrinsic participates as a known extent in the next stage.

### Difference-graph placement

Once a node's size is fixed, every anchor relation reduces to a difference
equation:

$$
x_v - x_u = d.
$$

For example:

$$
B.\operatorname{start}=A.\operatorname{end}+8
$$

becomes:

$$
\min(B)-\min(A)=w_A+8.
$$

The difference solver traverses connected components, assigns relative potentials,
reconciles hard pins, and then chooses an origin for an otherwise free component.

A connected component is consistent exactly when every signed cycle sums to zero.

When it is consistent, all of its solutions differ by one translation.

A hard pin fixes that translation.

Otherwise the engine needs a canonical gauge, such as moving the occupied extent's
minimum to zero.

<Badge type="info" text="THEOREM" /> For fixed intrinsic sizes, a fixed multiset of
consistent lowered facts, and a canonical free-component gauge, the solved geometry
is independent of fact traversal order.

**Proof sketch.** Summing edge equations along any path gives a node's potential
relative to the component root.

The zero-cycle condition makes this value independent of which path is chosen.

Pins or the canonical gauge then choose the one remaining component translation
without consulting traversal order.

This theorem says nothing about a syntactic reordering that changes the lowered
fact set.

In particular, `[A, B, C]` and `[A, C, B]` are different ordered distribute paths.

## The Layer laws we want

<Badge type="tip" text="TARGET" /> A Layer should be transparent syntax for
collecting nodes and facts inside one Frame.

Under that interpretation:

$$
\operatorname{Layer}() \simeq \operatorname{identity},
$$

and:

$$
\operatorname{Layer}(A,\operatorname{Layer}(B,C;F_2);F_1)
\simeq
\operatorname{Layer}(A,B,C;F_1 \cup F_2).
$$

The figure separates four operations that are often conflated as “reordering.”

::: gofish example:internal-layer-law-lab hidden
:::

<Badge type="info" text="THEOREM" /> Layer flattening preserves geometry when all
of the following side conditions hold:

- both Layers are in the same Frame;
- stable node identities and resolved names remain fixed;
- ordered operands inside facts remain fixed;
- no allocation, coordinate, scale, flip, clip, or export boundary is erased; and
- geometry is compared separately from paint order.

**Proof sketch.** Normalize each transparent Layer to an immutable Fragment
containing a node set and fact set.

Flattening becomes set union.

Set union is associative, commutative, and idempotent.

The placement theorem then gives the same solution for the same normalized fact
multiset.

The corresponding child and declaration permutation law is:

$$
\operatorname{geometry}(\operatorname{Layer}(X;F))
=
\operatorname{geometry}(\operatorname{Layer}(\pi(X);\rho(F))),
$$

provided that resolved IDs and explicit sequence-valued operands are unchanged.

This law applies after surface operators have made their order explicit.

A stack, distribute, grid track list, or other sequence-bearing operand may still
use order as geometric input.

Paint composition is associative under sequence splicing, but it is not
commutative.

Changing source paint order or equal-z tie-breaking may change pixels without
changing geometry.

### Why production Layer is not transparent yet

<Badge type="info" text="AS BUILT" /> Production Layer currently participates in:

- underlying-space combination;
- constraint-budget recognition;
- grid and distribute proposals;
- self-scaled regions;
- nest dependency planning;
- child scale planning and layout;
- local placement solving;
- bounding-box construction; and
- some orientation and paint hierarchy.

Layer nesting can therefore change a scale scope, child proposal, constraint target
set, ref schedule, bounding box, coordinate behavior, or paint order.

The unrestricted associativity law is a target theorem, not a fact about today's
surface AST.

The first production fixes should be cases where the current representation loses
information needed for an associative fold.

For example, measure combination needs distinct states for `none`, `one(measure)`,
and `mixed`.

Using one optional value for both “no measure” and “conflicting measures” cannot be
associative.

## The two unrelated things currently called `ref`

The current vocabulary hides a crucial authority boundary.

### The local constraint callback value

The callback passed to `.constrain()` receives values whose runtime meaning is
approximately:

```text
ConstraintRef { name }
```

This object is not a scenegraph reference.

It is an inert identifier that is later resolved to a writable participant in the
containing Layer's placement problem.

<Badge type="tip" text="TARGET" /> Its semantic name should be
`ConstraintTarget<NodeId>`.

It means:

> This frame-local solver has authority to determine this node's placement.

<Badge type="info" text="AS BUILT" /> Name collection and placement lookup currently
disagree for some nested Layers.

The callback name collector can descend through a nested plain Layer, while the
runtime placement table is largely built from direct children.

A nested name can consequently appear to be available and then fail to contribute
a placement fact.

The target semantics rejects unknown or ambiguous names before solving and lowers
every successful name to a stable `NodeId` once.

### The public scenegraph `ref()`

Public `ref()` creates a real `GoFishRef` node.

During one production layout run it approximately:

1. resolves a selected source node;
2. finds the least common ancestor of source and proxy;
3. accumulates translations from each side to that ancestor;
4. stores the translation difference on the proxy;
5. copies the source's intrinsic dimensions; and
6. draws nothing.

Moving the proxy does not move the source.

The ref therefore already resembles a read-only observation plus a writable local
stand-in.

It is not a complete nonlocal geometry reference, however.

It expects the source to have been laid out already.

It transports translations rather than general coordinate transforms.

It copies an axis-aligned intrinsic box even when a nonlinear transform would not
preserve that box.

It ignores the consumer scale passed to its own `layout()`, but its
`resolveUnderlyingSpace()` still proxies the source space upward.

That last mismatch can let an observation contaminate or duplicate the consumer's
scale claim.

The established production workaround is to put sources in an earlier inner tier
and connectors, labels, hulls, or other observers in a later outer tier.

That is why several examples look like hand-written dependency schedules.

The explorer compares the two authorities and then crosses a Frame boundary.

::: gofish example:internal-reference-boundary-lab hidden
:::

### Local targets and placed references

<Badge type="tip" text="TARGET" /> The normalized core should distinguish:

```text
ConstraintTarget<NodeId>   local, unresolved, writable
PlacedRef<GeometryPort>    possibly nonlocal, resolved, read-only
```

When a relation mixes the two, the placed reference lowers to a constant and the
local target remains a variable.

For example, aligning a local label to an already-placed bar means:

```text
PlacedRef(bar.center)  → numeric constant
ConstraintTarget(label.center) → writable variable
```

Only the label moves.

The bar is neither moved nor re-scaled.

A relation containing only placed references should either check an asserted
relation or construct new derived geometry.

It should not silently choose one source to move.

<Badge type="info" text="THEOREM" /> Observing a source through a `PlacedRef` does
not alter the source's scale, placement, or outward claim.

This noninterference property is what makes dependency layering safe.

## Frames, coordinates, and nonlocal references

A least common ancestor answers where two transform paths meet.

It should not automatically own either node's scale.

<Badge type="tip" text="TARGET" /> A cross-Frame reference should follow this order:

1. solve the source in its home Frame;
2. place it in its home coordinate system;
3. compute the requested geometry port;
4. transport that geometry into a common space;
5. express it in the consumer's coordinates; and
6. never re-solve or resize the source.

For a source $s$, consumer $c$, and common ancestor $L$:

$$
g_c(\operatorname{ref}(s))
=
\Phi(c \rightarrow L)^{-1}
\left(
  \Phi(s \rightarrow L)(g_s)
\right).
$$

The LCA is a transport rendezvous.

It is not a scale owner.

### A radar-chart dependency

A radar-like graphic motivates this distinction.

Its points can be solved in a polar Frame while its connecting segments and labels
are constructed in Cartesian space.

```text
polar Frame scale
        ↓
point intrinsic layout
        ↓
point placement in polar space
        ↓
point bounds and anchors
        ↓
transport selected anchors
        ↓
Cartesian connector and labels
```

The points retain the scale chosen by their polar Frame.

The Cartesian consumer receives resolved geometry rather than the original polar
data claim.

This also separates geometry dependency from paint order.

The connector may need point bounds before its path can be constructed while still
painting behind the points.

<Badge type="warning" text="OPEN DECISION" /> Reference ports need explicit geometry
types.

A point anchor usually transports cleanly through a nonlinear map.

An axis-aligned box generally does not remain axis-aligned after such a map.

A future `PlacedRef` may need ports such as:

```text
PointAnchor
Segment
OrientedBounds
AxisAlignedBounds
Path
```

Transport can be exact for one port, require conservative bounds or sampling for
another, and be unsupported when a required inverse does not exist.

The current ref implementation does not yet make those cases explicit.

## What the scheduler should schedule

The scheduler is not for deciding whether `align` runs before `distribute`.

Same-Frame constraints contribute to one simultaneous fact set.

The scheduler is for dependencies between computations whose outputs do not exist
at the same time:

```text
Claim(source Frame)
    → Scale(source Frame)
    → Intrinsic(source)
    → Place(source)
    → Bounds(source)
    → Transport(ref port)
    → DerivedGeometry(consumer)
```

<Badge type="info" text="AS BUILT" /> Production has only partial schedules.

Normal children are largely laid out in source-array order.

Nest planning has a specialized topological order.

Paint has a separate dependency graph.

Public refs therefore still rely on authors arranging some source tiers before
consumer tiers.

<Badge type="tip" text="TARGET" /> The complete task graph should represent every
cross-Frame or derived-geometry dependency explicitly.

The Frame-local placement solver remains an order-independent equation solve inside
one task.

Paint order remains a separate program, so a geometry-dependent connector may
still paint behind its sources.

<Badge type="info" text="THEOREM" /> If tasks are pure, outputs are single-assignment,
and every dependency is represented by an edge, every topological schedule produces
the same result.

**Proof sketch.** Induct over the task graph.

Every source task has the same input in every schedule.

When a later task runs, all of its predecessors already have their uniquely
determined outputs, so the task receives the same input regardless of which
independent tasks ran first.

A dependency cycle is not an ordering hint.

It is a structured layout failure unless a future fixed-point semantics explicitly
defines that cycle.

## A small engine someone else could reimplement

The normalized engine needs only a few semantic records.

```text
Frame {
  id
  allocation: [AxisPolicy, AxisPolicy]
  coord?
  nodes
  placementFacts
  derivedTasks
  paintEdges
}

ConstraintTarget {
  frame
  node
}

PlacedRef<G> {
  sourceFrame
  sourceNode
  port: GeometryPort<G>
}
```

Transparent Layers disappear into immutable Fragments before evaluation.

An independent implementation can then use the following sequence:

1. Resolve names once to stable IDs.
2. Reject missing and ambiguous targets.
3. Normalize transparent Layers into Frame-local node and fact sets.
4. Build the cross-Frame and derived-geometry task DAG.
5. Fold each Frame's symbolic claims.
6. Solve its explicit scale policy.
7. Compute intrinsic boxes.
8. Close strong `(min, size)` facts.
9. Solve fixed-size anchor differences.
10. Compute bounds and exported geometry ports.
11. Transport ports and build derived geometry.
12. Solve paint order and lower to a display list.

Every invalid case should become a structured result rather than an implicit
fallback.

Useful failure categories include:

- incompatible measures;
- empty, unbounded, or set-valued scale fits;
- conflicting box equations;
- a nonzero difference cycle;
- an unknown or ambiguous target;
- a cross-Frame dependency cycle;
- unsupported geometry transport; and
- overflow without an explicit clipping policy.

The executable `layoutKernel.ts` is currently only the same-Frame, known-size
placement slice of this design.

Its placed ports are assumed to have already been resolved and transported.

It is a semantic oracle for that slice, not a replacement for the production
pipeline and not evidence that every surface program already conforms.

## Proof obligations worth keeping

These laws separate established mathematics from end-to-end conformance goals.

| Property                                                       | Kind                         |
| -------------------------------------------------------------- | ---------------------------- |
| Claim `max` is associative, commutative, and idempotent        | Claim algebra                |
| Claim addition is associative and commutative                  | Claim algebra                |
| A strictly increasing claim has at most one equality solution  | Claim algebra                |
| Two independent box equations uniquely determine `(min, size)` | Placement algebra            |
| A consistent difference component is unique modulo translation | Placement algebra            |
| A fixed placement fact multiset is permutation-invariant       | Kernel conformance target    |
| Transparent Layer identity and associativity                   | Core conformance target      |
| Node and fact storage permutations preserve geometry           | Core conformance target      |
| A `PlacedRef` cannot alter source scale or geometry            | Reference conformance target |
| A complete task DAG is independent of topological schedule     | Scheduler conformance target |
| Paint order is permutation-invariant                           | Deliberately false           |

The conformance properties need differential tests from surface `Layer`, `Frame`,
and `ref` programs into normalized kernel records.

Until those tests exist, passing the kernel law suite is constructive evidence for
the small core, not a proof of the production AST.

## Checklist for layout work

Every layout change or agent brief should answer:

- Is this describing production behavior, target semantics, or the executable
  reference kernel?
- Which Frame owns the allocation and scale?
- Is each operand a writable local `ConstraintTarget` or a read-only `PlacedRef`?
- Which phase owns the behavior: claim, scale, intrinsic layout, placement, bounds,
  transport, derived geometry, or paint?
- Which collections are unordered fact sets, and which are explicit sequences?
- Which theorem should the change preserve?
- What is the smallest counterexample that would falsify that theorem?
- Which structured failure replaces an incomplete or ambiguous case?

The shortest durable mental model is this:

> A Frame owns scale and coordinates, a Layer contributes unordered local facts,
> the placement solver solves those facts jointly, a PlacedRef observes completed
> geometry without moving its source, the task DAG orders dependencies between
> Frames, and paint order is separate from geometry.
