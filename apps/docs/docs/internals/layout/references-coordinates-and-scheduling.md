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
      definition: "The target boundary declaring Frame-box extent, coordinate, and per-axis scale policy."
      href: "#term-frame"
    - term: Allocation
      definition: "A finite pixel extent offered by the root or a parent-owned sizing task; it is an input, not measured body size."
      href: "#term-allocation"
    - term: Extent policy
      definition: "The per-axis rule that makes a Frame box fixed, allocated, or content-sized from its resolved body."
      href: "#term-extent-policy"
    - term: Frame box
      definition: "The resolved geometry of a child Frame viewed as a writable parent-region target, not a second semantic object."
      href: "#term-frame-box"
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
> [2. Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims)
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

A <dfn id="term-frame">Frame</dfn> is the target boundary that declares one
Frame-box extent policy, one coordinate context, and one scale policy per axis. Some
extent policies consume an allocation supplied by the root or parent; a
`content`-sized Frame instead derives its box extent after resolving its body. Its
contents form one local writable
<dfn id="term-placement-region">placement region</dfn>.

The label belongs to `R`; the point belongs to `P`. `P` is also represented in
`R` by a <span id="term-frame-shell"></span><dfn id="term-frame-box">Frame
box</dfn>: the resolved geometry of the child Frame target that `R` may place
without gaining write authority over `q` inside `P`. `box(P)` is not a second
node or identity distinct from `P`.

The label needs a point exported from `q` as a
<dfn id="term-geometry-port">geometry port</dfn>. It therefore runs after `q` is
scaled, intrinsically laid out, and placed in `P`, and after the point has been
transported into `R`'s Cartesian coordinates. The label's dependency does not
make `R` the owner of `q`'s scale or placement.

The normalized architecture makes those relations explicit:

```ts
interface ProgramIR {
  frames: Map<FrameId, FrameIR>;
  dependencies: Set<TaskEdge>;
  paint: Set<PaintEdge>;
}

interface ChildFrameDef {
  frame: FrameId; // this Frame is the parent-region target
}

interface FrameIR {
  parent?: FrameId;
  coordToParent: CoordinateMap;
  extent: readonly [ExtentPolicy, ExtentPolicy];
  scale: readonly [ScalePolicy, ScalePolicy];
  localNodes: Map<NodeId, MarkDef | ChildFrameDef | DerivedDef>;
  facts: Set<LocalFact>;
  derivedTasks: Set<DerivedTask>;
}
```

`ProgramIR` separates the Frame-local fact sets from the dependency graph and
from <dfn id="term-paint-order">paint order</dfn>. A task that waits for source
ports and constructs a connector, enclosure, or label produces
<dfn id="term-derived-geometry">derived geometry</dfn>.

This is a target architecture, not an assertion that production already implements
all of it. **AS BUILT** paragraphs describe current behavior. **TARGET**
paragraphs state the normalized semantics. **THEOREM** paragraphs state laws
for that abstract system and identify the assumptions they need.

## The two unrelated things currently called `ref`

The current vocabulary hides a crucial authority boundary.

### The local constraint callback value

The callback passed to `.constrain()` receives values whose runtime meaning is
approximately:

```ts
interface ConstraintRef {
  readonly name: string;
}
```

This object is not a scenegraph reference.

It is an inert identifier that is later resolved to a writable participant in the
containing Layer's placement problem.

<Badge type="tip" text="TARGET" /> Its semantic name should be
`ConstraintTarget`.

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
scale-dependent extent.

The established production workaround is to put sources in an earlier inner tier
and connectors, labels, hulls, or other observers in a later outer tier.

That is why several examples look like hand-written dependency schedules.

The explorer compares the two authorities and then crosses a Frame boundary.

::: gofish example:internal-reference-boundary-lab hidden
:::

### Local targets and placed references

<Badge type="tip" text="TARGET" /> The normalized core should distinguish:

```ts
interface ConstraintTarget {
  readonly owner: FrameId;
  readonly node: NodeId;
  readonly anchor: Anchor;
}

interface PlacedRef<G extends GeometryPort = GeometryPort> {
  readonly sourceFrame: FrameId;
  readonly sourceNode: NodeId;
  readonly port: G;
}

declare const target: ConstraintTarget; // local, unresolved, writable
declare const ref: PlacedRef<GeometryPort>; // possibly nonlocal, resolved, read-only
```

A <dfn id="term-local-target">local target</dfn>, represented by
`ConstraintTarget`, is a writable handle authorizing the current Frame
to move or size one node in its placement region.

A <dfn id="term-placed-ref">placed reference</dfn>, represented by
`PlacedRef<G>`, is a read-only observation of source geometry already solved in
its home Frame. _Local_ means inside the same writable placement region;
_nonlocal_ means outside it.

`ConstraintTarget` is concrete because it always identifies a node and anchor.
Only `PlacedRef<G>` is generic: $G$ is the selected geometry-port type.

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
not alter the source's scale, placement, or outward scale-dependent extent.

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
3. compute the selected geometry port;
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
scale-dependent extent.

This also separates geometry dependency from paint order.

The connector may need point bounds before its path can be constructed while still
painting behind the points.

<Badge type="warning" text="OPEN DECISION" /> Reference ports need explicit geometry
types.

A point anchor usually transports cleanly through a nonlinear map.

An axis-aligned box generally does not remain axis-aligned after such a map.

A future `PlacedRef` may need ports such as:

```ts
type GeometryPort =
  | PointAnchor
  | Segment
  | OrientedBounds
  | AxisAlignedBounds
  | Path;
```

Transport can be exact for one port, require conservative bounds or sampling for
another, and be unsupported when a required inverse does not exist.

The current ref implementation does not yet make those cases explicit.

## Allocation is an input; Frame-box extent is a task result

<Badge type="tip" text="TARGET" /> On axis $a$, keep these two values distinct:

$$
\operatorname{Allocation}(F,a),\ \operatorname{Extent}(F,a)
\in \operatorname{PixelExtent}=\mathbb R_{\ge 0}\,[\mathrm{px}].
$$

An <dfn id="term-allocation">allocation</dfn> is a finite pixel extent offered
to $F$ independently of $F$'s body. The root viewport or a parent-owned sizing
task supplies it. `Allocation(F, a)` is therefore an input task, not an alias for
`Bounds(F.body)`.

`Extent(F, a)` is the resolved size of $F$'s box in its parent's placement
region. The <dfn id="term-extent-policy">extent policy</dfn> says how that task
gets its value:

```ts
type PixelExtent = number; // finite, non-negative pixels

type ExtentPolicy =
  | { kind: "fixed"; px: PixelExtent }
  | { kind: "allocated" }
  | {
      kind: "content";
      inset?: { before: PixelExtent; after: PixelExtent };
    };
```

Let $B_F$ be the resolved body bounds after $F$'s coordinate map, expressed in
the Frame box's parent-facing basis but before the parent places that box. For
insets $i^-$ and $i^+$,

$$
\operatorname{Extent}(F,a)=
\begin{cases}
p & \text{if the policy is }\operatorname{fixed}(p),\\
\operatorname{Allocation}(F,a)
  & \text{if the policy is }\operatorname{allocated},\\
\operatorname{span}_a(B_F)+i^-+i^+
  & \text{if the policy is }\operatorname{content}.
\end{cases}
$$

`fixed` and `allocated` extents exist before body layout. A `content` extent exists
only after the body's scale, intrinsic geometry, Frame-local placement, and local
bounds exist. This distinction supplies the missing scheduler edges.

A content-sized Frame box is schedulable with an inherited scale when its coordinate
map does not itself require that same box extent.

The body's symbolic scale-dependent extent first contributes to the inherited scale
identity's extent join. The ancestor owner solves that joined extent against
its own pre-body extent; it does not wait for the child's content-sized box.
`ExtentJoin(S, a)` below denotes the associative join of extents for scale
identity $S$.

```text
ScaleDependentExtent(F.body, a) → ExtentJoin(S, a)
ExtentJoin(S, a) + Extent(owner(S), a)
    → Scale(S, a)
    → Scale(F, a) [inherit S]
    → Intrinsic(F.body)
    → Place(F)
    → BodyBounds(F)
    → Extent(F, a) [content]
    → Place(parent(F))
```

The child body can be solved before the parent knows where to place the child
Frame box. `pixel` follows the same path without a scale task. If the coordinate map
also consumes `Extent(F, a)`, the DAG exposes another extent cycle rather than
treating `content` as available.

By contrast, `fitToExtent` needs a Frame-box extent before it can solve the body's scale:

```text
ScaleDependentExtent(F.body, a) + Extent(F, a) [fixed or allocated]
    → Scale(F, a) [fitToExtent]
```

Pairing `fitToExtent` with `content` on the same axis creates the cycle
`Extent → Scale → Intrinsic → BodyBounds → Extent`; v0 reports that cycle
instead of guessing a fixed point. A shared-scale participant may be content-sized
after the shared scale is solved, but the one owner that fits the shared scale
must have a fixed or allocated extent independent of its own body.

`fitToExtent` varies only $\sigma$; it never partially fulfills the body's hard
scale-dependent extent. If even $\sigma=0$ exceeds the Frame extent, v0 reports
`InfeasibleExtent`. A constant extent below the Frame extent is fully satisfied
with unused pixels, but does not determine $\sigma$ and therefore reports
`UnderdeterminedScale` unless another policy supplies it. A plateau likewise
requires an explicit endpoint policy or reports `UnderdeterminedScale`.

<Badge type="info" text="AS BUILT" /> Production has no `ExtentPolicy` union and
no explicit `Allocation` or `Extent` task records. `Frame(...)` immediately
delegates to a Layer or coordinate node, and recursive `layout()` calls carry
sizes through a partial, operator-specific schedule. The task semantics above is
the normalization target; in particular, the target's explicit `content`/`fitToExtent` cycle
diagnostic is not yet a production guarantee.

## What the scheduler should schedule

A <dfn id="term-task-dag">task DAG</dfn> is the directed acyclic graph of
computations whose outputs become available at different times. Its edges mean
“this output must exist before that computation can run.”

The <dfn id="term-scheduler">scheduler</dfn> chooses any topological execution
order for that graph. It is not for deciding whether `align` runs before
`distribute`.

Same-Frame constraints contribute to one simultaneous fact set.

The scheduler is for dependencies between computations whose outputs do not exist
at the same time. Its task vocabulary includes the allocation input and resolved
Frame-box extent rather than treating “allocated extent” as an unexplained value:

```text
root/parent offer → Allocation(F, a) → Extent(F, a) [allocated]
fixed pixels ──────────────────↗

ScaleDependentExtent(F.body, a) + Extent(F, a) [pre-body]
    → Scale(F, a) [fitToExtent]
Scale(ancestor, a) → Scale(F, a) [inherit]
ExtentJoin(S, a) + Extent(owner(S), a) [pre-body]
    → Scale(S, a) → Scale(F, a) [share(S)]

Scale(F, a)
    → Intrinsic(F.body)
    → Place(F)
    → BodyBounds(F)
    → Extent(F, a) [content, when needed]

Bounds(source)
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
disappear into immutable Fragments before evaluation; each Frame remains a box in
its parent and a body containing its own local problem.

An independent implementation can then use the following sequence:

1. Resolve names once to stable IDs.
2. Reject missing and ambiguous targets.
3. Normalize transparent Layers into Frame-local node and fact sets.
4. Build the cross-Frame and derived-geometry task DAG.
5. Fold each Frame body's symbolic scale-dependent extents.
6. Seed root/parent `Allocation` inputs and constant `fixed` extents.
7. Execute ready scale tasks; `fitToExtent` waits for a pre-body extent, `inherit` waits
   for its ancestor scale, and `share(id)` waits for its owner extent and joined
   scale-dependent extents.
8. Compute intrinsic boxes, close strong `(min, size)` facts, and solve
   fixed-size anchor differences inside each ready Frame.
9. Apply coordinate maps needed for parent-facing body bounds, resolve `content`
   Frame-box extents, and unblock parent placement tasks.
10. Compute exported geometry ports.
11. Transport ports and build derived geometry.
12. Solve paint order and lower to a display list.

Every invalid case should become a structured result rather than an implicit
fallback.

Useful failure categories include:

- incompatible measures;
- `InfeasibleExtent` or `UnderdeterminedScale` from an empty, unbounded, or
  set-valued scale fit;
- conflicting box equations;
- a nonzero difference cycle;
- an unknown or ambiguous target;
- a cross-Frame dependency cycle;
- unsupported geometry transport; and
- non-finite geometry.

The executable `layoutKernel.ts` is currently only the same-Frame, known-size
placement slice of this design.

Its placed ports are assumed to have already been resolved and transported.

It is a semantic oracle for that slice, not a replacement for the production
pipeline and not evidence that every surface program already conforms.

## Proof obligations worth keeping

These laws separate established mathematics from end-to-end conformance goals.

| Property                                                                 | Kind                         |
| ------------------------------------------------------------------------ | ---------------------------- |
| Scale-dependent-extent `max` is associative, commutative, and idempotent | Exact-real extent algebra    |
| Scale-dependent-extent addition is associative and commutative           | Exact-real extent algebra    |
| Canonical extent-hull equality is pointwise semantic equality            | Extent algebra               |
| Extent evaluation preserves `max` and addition                           | Extent algebra               |
| A strictly increasing extent has at most one equality solution           | Extent algebra               |
| Two independent box equations uniquely determine `(min, size)`           | Placement algebra            |
| Relation edges are feasible iff every signed cycle sums to zero          | Placement algebra            |
| Component pins are feasible iff they imply one translation               | Placement algebra            |
| A consistent difference component is unique modulo translation           | Placement algebra            |
| A fixed placement fact multiset is permutation-invariant                 | Kernel conformance target    |
| Transparent Layer identity and associativity                             | Core conformance target      |
| Node and fact storage permutations preserve geometry                     | Core conformance target      |
| A `PlacedRef` cannot alter source scale or geometry                      | Reference conformance target |
| A complete task DAG is independent of topological schedule               | Scheduler conformance target |
| Paint order is permutation-invariant                                     | Deliberately false           |

The conformance properties need differential tests from surface `Layer`, `Frame`,
and `ref` programs into normalized kernel records.

Until those tests exist, passing the kernel law suite is constructive evidence for
the small core, not a proof of the production AST.

The exact-real rows state mathematical laws of denotations. The TypeScript
experiment uses JavaScript `number`; its counterexamples compare selected
evaluations under a documented tolerance. Arbitrary regrouping is not necessarily
bit-for-bit or structurally identical, and full approximate equivalence is not yet
an implementation guarantee.

## Checklist for layout work

Every layout change or agent brief should answer:

- Is this describing production behavior, target semantics, or the executable
  reference kernel?
- What is the Frame's extent policy? If it is `allocated`, which root or
  parent-owned task supplies `Allocation(F, axis)`? If it is `content`, which
  already-available scale makes its body resolvable?
- What scale policy does the Frame declare, and which scale scope performs the
  solve?
- Is each operand a writable local `ConstraintTarget` or a read-only `PlacedRef`?
- Which phase owns the behavior: scale-dependent extent, scale, intrinsic layout, placement, bounds,
  transport, derived geometry, or paint?
- Which collections are unordered fact sets, and which are explicit sequences?
- Which theorem should the change preserve?
- What is the smallest counterexample that would falsify that theorem?
- Which structured failure replaces an incomplete or ambiguous case?

The shortest durable mental model is this:

> A Frame declares Frame-box extent, scale, and coordinate policy; an allocation is
> an explicit root/parent input when that extent policy needs one; a Layer
> contributes unordered facts to its local placement region; the placement solver
> solves those facts jointly; a PlacedRef observes completed geometry without
> moving its source; the task DAG orders dependencies between Frames; and paint
> order is separate from geometry.

---

> **Layout engine series · Part 4 of 4**<br>
> [1. How the Layout Engine Works](/internals/layout/how-layout-works) ·
> [2. Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims)
> · [3. Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)
> · **4. References, Coordinate Transport, and Scheduling**
