---
title: References, Coordinate Transport, and Scheduling
section: Layout & Rendering
order: 50.3
group: Layout
status: draft
pageClass: layout-engine-article
glossary:
  title: Reference terms
  entries:
    - term: Frame
      definition: "The target boundary declaring allocation, coordinate context, and per-axis scale policy."
      href: "#term-frame"
    - term: Frame shell
      definition: "A child Frame viewed as one writable box in its parent, distinct from nodes inside its body."
      href: "#term-frame-shell"
    - term: Placement region
      definition: "The writable targets and simultaneous facts owned by one Frame."
      href: "#term-placement-region"
    - term: Local target
      definition: "A writable handle authorizing the current Frame to move or size one node."
      href: "#term-local-target"
    - term: Placed ref
      definition: "A read-only observation of source geometry already solved in its home Frame."
      href: "#term-placed-ref"
    - term: Geometry port
      definition: "A typed projection exported from completed geometry, such as an anchor, bounds, or path."
      href: "#term-geometry-port"
    - term: LCA
      definition: "The deepest shared coordinate ancestor; a transform rendezvous, not a scale owner."
      href: "#term-lca"
    - term: Transport
      definition: "Mapping a completed geometry port through a common space into consumer coordinates."
      href: "#term-transport"
    - term: Derived geometry
      definition: "New geometry constructed after its source ports have been resolved and transported."
      href: "#term-derived-geometry"
    - term: Task DAG
      definition: "The dependency graph of computations whose outputs become available at different times."
      href: "#term-task-dag"
    - term: Scheduler
      definition: "Chooses a topological task order; it does not order simultaneous placement facts."
      href: "#term-scheduler"
    - term: Paint order
      definition: "A separate ordering of finished primitives that does not determine layout geometry."
      href: "#term-paint-order"
covers:
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/layoutKernel.ts
---

# References, Coordinate Transport, and Scheduling

> **Layout engine series · Part 4 of 4**<br>
> [1. How the Layout Engine Works](/internals/layout/how-layout-works) ·
> [2. Frames, Scale Scopes, and Size Claims](/internals/layout/frames-scale-scopes-and-claims)
> · [3. Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)
> · **4. References, Coordinate Transport, and Scheduling**

A same-Frame placement problem can solve all of its writable facts at once.

A nonlocal reference poses a different problem: its source geometry does not
exist until another layout computation has finished. The consumer may observe
that finished geometry, but it may not retroactively move or re-scale the source.

That distinction separates two questions that otherwise look like one:

1. **Authority:** which variables may this placement solve write?
2. **Availability:** which computations must finish before this consumer can run?

Start with a small scenegraph:

```text
Frame R · Cartesian
├─ Frame P · polar
│  └─ point q
└─ label(ref(q.point))
```

A <dfn id="term-frame">Frame</dfn> is the target boundary that declares an
allocation, one coordinate context, and one scale policy per axis. Its contents
form one local writable <dfn id="term-placement-region">placement region</dfn>.

The label belongs to `R`; the point belongs to `P`. `P` is also represented in
`R` by a <dfn id="term-frame-shell">Frame shell</dfn>: an outer box that `R` may
place without gaining write authority over `q` inside `P`.

The label needs a point exported from `q` as a
<dfn id="term-geometry-port">geometry port</dfn>. It therefore runs after `q` is
scaled, intrinsically laid out, and placed in `P`, and after the point has been
transported into `R`'s Cartesian coordinates. The label's dependency does not
make `R` the owner of `q`'s scale or placement.

The normalized architecture makes those relations explicit:

```text
ProgramIR {
  frames: Map<FrameId, FrameIR>
  dependencies: Set<TaskEdge>
  paint: Set<PaintEdge>
}

FrameIR {
  parent?: FrameId
  coordToParent: CoordinateMap
  scale: [ScalePolicy, ScalePolicy]
  localNodes: Map<NodeId, MarkDef | FrameShell | DerivedDef>
  facts: Set<LocalFact>
  derivedTasks: Set<DerivedTask>
}
```

`ProgramIR` separates the Frame-local fact sets from the dependency graph and
from <dfn id="term-paint-order">paint order</dfn>. A task that waits for source
ports and constructs a connector, enclosure, or label produces
<dfn id="term-derived-geometry">derived geometry</dfn>.

This is a target architecture, not a claim that production already implements
all of it. **AS BUILT** paragraphs describe current behavior. **TARGET**
paragraphs state the normalized semantics. **THEOREM** paragraphs state laws
for that abstract system and identify the assumptions they need.

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
5. aliases the source's intrinsic-dimensions object onto the proxy; and
6. draws nothing.

The ordinary resolved placement path moves the proxy transform rather than the
source transform.

The ref therefore already resembles a read-only observation plus a writable local
stand-in.

It is not a complete nonlocal geometry reference, however.

It expects the source to have been laid out already.

It transports translations rather than general coordinate transforms.

It proxies an axis-aligned intrinsic box even when a nonlinear transform would
not preserve that box.

Its shared `intrinsicDims` reference and source-delegating `embed()` path also mean
that full source noninterference is not a production guarantee yet.

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

A <dfn id="term-local-target">local target</dfn>, represented by
`ConstraintTarget<NodeId>`, is a writable handle authorizing the current Frame
to move or size one node in its placement region.

A <dfn id="term-placed-ref">placed reference</dfn>, represented by
`PlacedRef<G>`, is a read-only observation of source geometry already solved in
its home Frame. _Local_ means inside the same writable placement region;
_nonlocal_ means outside it.

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

A <dfn id="term-lca">least common ancestor (LCA)</dfn> is the deepest coordinate
ancestor shared by source and consumer. It answers where their transform paths
meet.

It should not automatically own either node's scale.

<dfn id="term-transport">Coordinate transport</dfn> maps a completed geometry
port from the source Frame through that common coordinate space and into the
consumer Frame. It converts geometry; it does not re-run the source's scale or
placement solve.

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

A <dfn id="term-task-dag">task DAG</dfn> is the directed acyclic graph of
computations whose outputs become available at different times. Its edges mean
“this output must exist before that computation can run.”

The <dfn id="term-scheduler">scheduler</dfn> chooses any topological execution
order for that graph. It is not for deciding whether `align` runs before
`distribute`.

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

The `ProgramIR`, `FrameIR`, `ConstraintTarget`, and `PlacedRef` records introduced
near the beginning are enough for the normalized engine. Transparent Layers
disappear into immutable Fragments before evaluation; Frames and their shell/body
distinction remain.

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

| Property                                                        | Kind                         |
| --------------------------------------------------------------- | ---------------------------- |
| Claim `max` is associative, commutative, and idempotent         | Claim algebra                |
| Claim addition is associative and commutative                   | Claim algebra                |
| Canonical claim hull equality is pointwise semantic equality    | Claim algebra                |
| Claim evaluation preserves `max` and addition                   | Claim algebra                |
| A strictly increasing claim has at most one equality solution   | Claim algebra                |
| Two independent box equations uniquely determine `(min, size)`  | Placement algebra            |
| Relation edges are feasible iff every signed cycle sums to zero | Placement algebra            |
| Component pins are feasible iff they imply one translation      | Placement algebra            |
| A consistent difference component is unique modulo translation  | Placement algebra            |
| A fixed placement fact multiset is permutation-invariant        | Kernel conformance target    |
| Transparent Layer identity and associativity                    | Core conformance target      |
| Node and fact storage permutations preserve geometry            | Core conformance target      |
| A `PlacedRef` cannot alter source scale or geometry             | Reference conformance target |
| A complete task DAG is independent of topological schedule      | Scheduler conformance target |
| Paint order is permutation-invariant                            | Deliberately false           |

The conformance properties need differential tests from surface `Layer`, `Frame`,
and `ref` programs into normalized kernel records.

Until those tests exist, passing the kernel law suite is constructive evidence for
the small core, not a proof of the production AST.

## Checklist for layout work

Every layout change or agent brief should answer:

- Is this describing production behavior, target semantics, or the executable
  reference kernel?
- Which Frame receives the allocation, what scale policy does it declare, and
  which scale scope performs the solve?
- Is each operand a writable local `ConstraintTarget` or a read-only `PlacedRef`?
- Which phase owns the behavior: claim, scale, intrinsic layout, placement, bounds,
  transport, derived geometry, or paint?
- Which collections are unordered fact sets, and which are explicit sequences?
- Which theorem should the change preserve?
- What is the smallest counterexample that would falsify that theorem?
- Which structured failure replaces an incomplete or ambiguous case?

The shortest durable mental model is this:

> A Frame declares allocation, scale, and coordinate policy; a Layer contributes
> unordered facts to its local placement region; the placement solver solves
> those facts jointly; a PlacedRef observes completed geometry without moving its
> source; the task DAG orders dependencies between Frames; and paint order is
> separate from geometry.

---

> **Layout engine series · Part 4 of 4**<br>
> [1. How the Layout Engine Works](/internals/layout/how-layout-works) ·
> [2. Frames, Scale Scopes, and Size Claims](/internals/layout/frames-scale-scopes-and-claims)
> · [3. Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)
> · **4. References, Coordinate Transport, and Scheduling**
