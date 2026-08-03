---
title: How the Layout Engine Works
section: Layout & Rendering
order: 50.5
group: Layout
status: draft
pageClass: layout-engine-article
glossary:
  title: Layout terms
  entries:
    - term: Surface AST
      definition: "The author-facing parent/child tree before Layers, names, refs, and policies are normalized."
      href: "#term-surface-ast"
    - term: ADT
      definition: "An algebraic data type: a closed set of variant and record forms describing legal structure."
      href: "#term-adt"
    - term: Frame owner
      definition: "The unique Frame whose placement region has write authority over a node."
      href: "#term-frame-owner"
    - term: Frame shell
      definition: "A child Frame viewed as one writable box in its parent, distinct from the nodes inside its body."
      href: "#term-frame-shell"
    - term: Allocation
      definition: "A finite pixel budget offered on one axis; an input, not necessarily the occupied result."
      href: "#term-allocation"
    - term: "Scale / σ"
      definition: "A data-to-pixel rule; σ is its pixels-per-data-unit slope."
      href: "#term-scale"
    - term: Claim
      definition: "A symbolic C(σ) giving the pixel extent requested at scale σ."
      href: "#term-claim"
    - term: Affine piece
      definition: "One line aσ+b with nonnegative slope inside a claim."
      href: "#term-affine-piece"
    - term: Upper envelope
      definition: "The pointwise maximum of a finite set of affine pieces and zero."
      href: "#term-upper-envelope"
    - term: Scope
      definition: "Participants sharing one kind of state or solve; always qualify it."
      href: "#term-scope"
    - term: Scale scope
      definition: "Participants on one axis sharing a solved σ or anchored position map."
      href: "#term-scale-scope"
    - term: Frame equation
      definition: "The fit equation content(σ) = allocation at the owner of one scale scope."
      href: "#term-frame-equation"
    - term: Underlying space
      definition: "The pre-pixel IR for quantity kind, domain, measure, and symbolic size."
      href: "#term-underlying-space"
    - term: Measure
      definition: "A semantic unit/group identity for compatibility, not numeric measurement."
      href: "#term-measure"
    - term: Intrinsic geometry
      definition: "A node's local geometry after scale and mark measurement, before parent placement."
      href: "#term-intrinsic-geometry"
    - term: Proposal
      definition: "A provisional pixel allocation offered to a child, not its final size."
      href: "#term-proposal"
    - term: Placement
      definition: "The solve assigning box positions and any spans determined by anchor equations."
      href: "#term-placement"
    - term: Placement fact
      definition: "A normalized anchor pin, size pin, participant, or anchor relation."
      href: "#term-placement-fact"
    - term: Anchor
      definition: "A named one-axis point on a box, such as start, middle, end, or baseline."
      href: "#term-anchor"
    - term: Rank-two closure
      definition: "Solving a box's two unknowns (min, size) from independent equations."
      href: "#term-rank-two-closure"
    - term: Difference graph
      definition: "A graph whose weighted edges encode equations x_v − x_u = d."
      href: "#term-difference-graph"
    - term: Connected component
      definition: "Placement variables joined by difference edges and sharing one translation freedom."
      href: "#term-connected-component"
    - term: Potential
      definition: "A node coordinate relative to a chosen component root, obtained from path sums."
      href: "#term-potential"
    - term: Pin
      definition: "An absolute anchor equation that fixes a component's free translation."
      href: "#term-pin"
    - term: Gauge
      definition: "A canonical origin chosen for an otherwise unpinned component."
      href: "#term-gauge"
    - term: Bounds
      definition: "An axis-aligned conservative enclosure, always relative to a named coordinate space."
      href: "#term-bounds"
    - term: Frame
      definition: "Target boundary for local writes and coordinate/scale policy; production is not normalized yet."
      href: "#term-frame"
    - term: Layer
      definition: "Target transparent grouping that adds nodes and facts without opening a new Frame."
      href: "#term-layer"
    - term: Placement region
      definition: "The writable targets and facts solved jointly inside one Frame."
      href: "#term-placement-region"
    - term: Scale policy
      definition: "A Frame's per-axis choice among inherit, fit, share(id), and pixel."
      href: "#term-scale-policy"
    - term: Frame fit
      definition: "The policy turning a claim plus pixel budget into a scale or structured fit outcome."
      href: "#term-frame-fit"
    - term: Coordinate scope
      definition: "A subtree sharing one coordinate-map context for transforms and ref transport."
      href: "#term-coordinate-scope"
    - term: Local target
      definition: "A writable handle the current Frame may move or size while solving."
      href: "#term-local-target"
    - term: Placed ref
      definition: "A read-only observation of source geometry already solved in its home Frame."
      href: "#term-placed-ref"
    - term: Geometry port
      definition: "A typed exported projection of completed geometry, such as an anchor, bounds, or path."
      href: "#term-geometry-port"
    - term: Transport
      definition: "Mapping a completed port from source coordinates through a common space to the consumer."
      href: "#term-transport"
    - term: LCA
      definition: "The deepest shared coordinate ancestor; a transform rendezvous, not a scale owner."
      href: "#term-lca"
    - term: Task DAG
      definition: "The dependency graph of computations whose outputs become available at different times."
      href: "#term-task-dag"
    - term: Scheduler
      definition: "Chooses a topological task order; it does not order simultaneous placement facts."
      href: "#term-scheduler"
    - term: Paint order
      definition: "A separate ordering of finished display primitives that does not determine geometry."
      href: "#term-paint-order"
    - term: Lowering
      definition: "Translating a rich representation into a simpler IR, such as constraints into facts."
      href: "#term-lowering"
covers:
  - packages/gofish-graphics/src/ast/_ast.ts
  - packages/gofish-graphics/src/ast/_node.ts
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
4. Where do those boxes go, and which remaining spans do relations determine?
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

An <dfn id="term-allocation">allocation</dfn>, also called a budget, is the
finite pixel interval a parent offers on one axis. It is an input to layout, not
necessarily the interval the child ultimately occupies.

Before a scale is chosen, their widths are symbolic:

$$
w_A = 2\sigma, \qquad w_B = 3\sigma.
$$

A <dfn id="term-scale">scale</dfn> converts data magnitudes or positions into
pixels. Here its slope, <dfn id="term-sigma">$\sigma$</dfn>, means pixels per
data unit.

The engine records this pre-pixel information as an
<dfn id="term-underlying-space">underlying space</dfn>: a per-axis description
of the quantity kind, data domain, semantic measure, and symbolic size.

A <dfn id="term-claim">size claim</dfn> is the function $C(\sigma)$ that returns
the pixel extent requested at a particular $\sigma$. It describes required
space without choosing the scale itself.

Distribution combines those claims in series:

$$
C_x(\sigma) = 2\sigma + 3\sigma + 10.
$$

A <dfn id="term-scope">scope</dfn> is a set of participants over which one
particular kind of state is shared or solved. Because GoFish also has coordinate,
name, and flip scopes, this article avoids using the word unqualified after this
definition.

A <dfn id="term-scale-scope">scale scope</dfn> is the set of participants on one
axis that share a solved $\sigma$ or anchored position map. This simple local
scope is contiguous, and its owner solves the <dfn id="term-frame-equation">frame
equation</dfn>:

$$
5\sigma + 10 = 210,
$$

which gives:

$$
\sigma = 40.
$$

The phrase _frame equation_ means $\operatorname{content}(\sigma) =
\operatorname{allocation}$. It does not by itself imply that a normalized
`Frame` node owns this production solve.

<dfn id="term-intrinsic-geometry">Intrinsic geometry</dfn> is geometry computed
in a node's own local coordinates after applying scale and mark-specific
measurement, but before parent placement or coordinate transport. Intrinsic
layout can now produce concrete widths:

$$
w_A = 80, \qquad w_B = 120.
$$

<dfn id="term-placement">Placement</dfn> assigns box positions, and sometimes a
still-unknown span, from geometric equations after enough intrinsic information
is available.

<dfn id="term-lowering">Lowering</dfn> translates a richer representation into a
simpler one. Here placement lowers the author-facing distribution constraint to
a numeric <dfn id="term-placement-fact">placement fact</dfn>:

$$
\min(B) - \min(A) = 80 + 10 = 90.
$$

The two boxes finally occupy $80 + 10 + 120 = 210$ pixels.

Their <dfn id="term-bounds">bounds</dfn> are the conservative axis-aligned
enclosure of that completed geometry. Bounds are meaningful only together with
the coordinate space in which they were computed.

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

## The scenegraph is one tree, not one scope hierarchy

Before following the engine's call graph, separate the program's syntax from
the semantic relations computed from it.

An <dfn id="term-surface-ast">abstract syntax tree (AST)</dfn> records recursive
parent/child containment: what the author constructed inside what. An
<dfn id="term-adt">algebraic data type (ADT)</dfn> names the finite set of
variants and records that may inhabit that tree.

<Badge type="info" text="AS BUILT" /> Production's entire carrier type is only:

```text
GoFishAST = GoFishNode | GoFishRef

GoFishNode ≈ {
  uid, type, parent?, children: GoFishAST[]
  shared: [boolean, boolean]
  constraints: ConstraintSpec[]
  resolveUnderlyingSpace(...)
  layout(allocation, axisScales, ...)
  lower(...)
  _underlyingSpace?, intrinsicDims?, transform?
}

GoFishRef ≈ {
  selection | directNode, selectedNode?, parent?
  intrinsicDims?, transform?
}
```

`GoFishNode.type`, optional fields, and recursive methods distinguish marks,
Layers, coordinates, and operators. `GoFishRef` is a proxy leaf that selects a
different node. This representation is flexible, but it does not expose the
engine's semantic boundaries in its type.

There is no production node with `type: "frame"`. The `Frame` factory immediately
returns a `coord` node when given a coordinate map and a `layer` otherwise.
Likewise, `_isScope` is a token-name registration boundary, `shared[axis]` marks
a scale-solving root, `type: "coord"` marks a coordinate warp, and `constraints`
are interpreted by Layer placement. These are distinct relations despite the
overloaded word _scope_.

The useful explanatory surface ADT is more specific:

```text
Scene =
    Mark {
      id, intrinsicSpec
    }
  | Layer {
      children: Scene[], declarations: ConstraintDecl[]
    }
  | Frame {
      id, body: Scene, extent: ExtentPolicy²,
      scale: ScalePolicy², coord?: CoordinateMap
    }
  | Derived {
      id, inputs: RefQuery<GeometryPort>[], build
    }

ScalePolicy = inherit | fit | share(ScaleId) | pixel
RefQuery<G> = ref(selector, requestedPort: G)
```

<Badge type="tip" text="TARGET" /> This is a semantic classification, not a
claim that those four variants are already a public serialized TypeScript union.
A connector, enclosure, or label is `Derived` when its geometry must wait for
completed input ports. A ref is one of its operands, not a fifth kind of writable
node.

A <dfn id="term-frame">Frame</dfn> is the core boundary that declares an
allocation, one coordinate context, and one scale policy per axis. A
<dfn id="term-layer">Layer</dfn> is transparent authoring syntax that contributes
children and declarations to the nearest Frame.

Use one toy tree throughout the article:

```text
Frame R · Cartesian
└─ Layer L
   ├─ Frame P · polar
   │  └─ Layer(p, q; distribute(p, q))
   ├─ connector(ref(p.point), ref(q.point))
   └─ label(ref(q.point))
```

The parent pointers above define exactly one syntax tree. They do **not** say
that every descendant shares a solver, scale, or coordinate map with every
ancestor.

### Normalization makes the other relations explicit

Transparent Layers disappear into Frame-local fragments. The normalized core is
closer to the following records:

```text
ProgramIR {
  frames: Map<FrameId, FrameIR>
  dependencies: Set<TaskEdge>
  paint: Set<PaintEdge>
}

FrameIR<F> {
  parent?: FrameId
  coordToParent: CoordinateMap
  scale: [ScalePolicy, ScalePolicy]
  localNodes: Map<NodeId, MarkDef | FrameShell | DerivedDef>
  facts: Set<LocalFact<F>>
  derivedTasks: Set<DerivedTask<F>>
}

ConstraintTarget<F> { node, anchor }       // local, unresolved, writable
PlacedRef<G>        { sourceFrame, sourceNode, port: GeometryPort<G> }
                                              // resolved before use, read-only
```

A child Frame has two deliberately different faces. Its
<dfn id="term-frame-shell">shell</dfn> is one box in the parent Frame's local
problem; its body opens the child's local problem. The parent may place or size
`shell(P)`. It may not thereby move `p` or `q` inside `P`.

The <dfn id="term-frame-owner">Frame owner</dfn> of a node is the unique Frame
whose placement region has authority to write it. In the toy tree:

$$
\begin{aligned}
\operatorname{owner}(\operatorname{shell}(P))
  &= \operatorname{owner}(\text{connector})
   = \operatorname{owner}(\text{label}) = R,\\
\operatorname{owner}(p)
  &= \operatorname{owner}(q) = P.
\end{aligned}
$$

A <dfn id="term-local-target">local target</dfn>
$\operatorname{Target}_F(n,a)$ is well formed exactly when:

$$
\operatorname{owner}(n)=F.
$$

Therefore $\operatorname{Target}_R(\operatorname{shell}(P))$ is valid, while
$\operatorname{Target}_R(q)$ is `NonlocalWrite`.

It denotes a variable the solver for $F$ may write. A
<dfn id="term-placed-ref">placed reference</dfn> denotes completed source
geometry that a consumer may only read. Thus `distribute(p, q)` contributes
variables to $P$'s simultaneous placement problem, while the label in $R$ may
use a transported point from $q$ only as a constant:

$$
x_{\text{label.start}}
=
\operatorname{transport}_{P\rightarrow R}(q.\text{point}) + 8.
$$

Only the label moves. The ref does not grant $R$ write authority over $q$.
Authority, not tree distance, is the fundamental distinction: a `PlacedRef`
remains read-only even when its source happens to share the consumer's Frame.

### Scopes are projections of the tree

The normalized program derives several indices and graphs from the same AST.
They are not additional parent/child trees hidden inside `Layer`:

| Question                                    | Semantic object                                | Toy answer                                                      |
| ------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| What contains this syntax?                  | AST parent relation                            | `Layer L` contains `Frame P`, connector, and label              |
| Which solver may write it?                  | `owner : NodeId → FrameId`                     | `p,q ↦ P`; `shell(P),connector,label ↦ R`                       |
| In which coordinates is it expressed?       | Frame coordinate-context tree $\kappa$         | $\kappa_P$ maps to parent context $\kappa_R$                    |
| Which data scale does it share on axis $a$? | `scaleId : FrameId × Axis → ScaleId ∪ {pixel}` | chosen separately by each Frame's policy                        |
| What must finish before a consumer runs?    | task-dependency DAG                            | place $q$, export its point, transport it, then build the label |
| What paints on top?                         | paint edges                                    | independent of every relation above                             |

Every Frame establishes a distinct coordinate context, even when its map to its
parent is the identity:

$$
\operatorname{parent}(\kappa_F)=\kappa_{\operatorname{parentFrame}(F)},
\qquad
\Phi_F = F.\operatorname{coord}\ \text{or}\ \operatorname{id}.
$$

Scale identity is interpreted independently, once per axis:

$$
\operatorname{scaleId}(F,a)=
\begin{cases}
\operatorname{Local}(F,a) & \text{if policy is }\operatorname{fit},\\
\operatorname{scaleId}(\operatorname{parentFrame}(F),a)
  & \text{if policy is }\operatorname{inherit},\\
k & \text{if policy is }\operatorname{share}(k),\\
\operatorname{pixel} & \text{if policy is }\operatorname{pixel}.
\end{cases}
$$

Consequently, coordinate scopes follow the Frame tree, while a scale scope is an
equivalence class of `(Frame, axis)` pairs with the same non-pixel `ScaleId`.
`share(k)` can make that class structurally non-contiguous. A ref changes neither
mapping: it adds a read-after-place dependency and a coordinate transport.

For a source $s$ observed in consumer Frame $F$:

$$
\operatorname{value}_F(\operatorname{PlacedRef}(s,g))
=
T_{\kappa_{\operatorname{owner}(s)}\rightarrow\kappa_F}
\left(g(\operatorname{Place}(s))\right).
$$

This equation reads a port from already-placed geometry, then changes the
coordinate context in which that value is expressed. It neither evaluates the
source under $F$'s scale nor inserts the source claim into $F$.

The figure compiles the surface variants into these normalized relations. Yellow
is coordinate/Frame structure, purple is scale identity, blue is local writable
geometry, green is derived geometry, and dashed edges are read-only observations.

::: gofish example:internal-layout-scenegraph-adt hidden
:::

The durable invariants are:

- every semantic node has exactly one Frame owner;
- a child Frame's shell belongs to its parent region, while its body belongs to
  the child region;
- every variable in one local fact has the same Frame owner;
- Layers introduce no Frame, coordinate, scale, or scheduling identity;
- a `PlacedRef` becomes a transported constant, never the source variable; and
- task dependencies and paint edges are explicit relations, not child order.

This classifies what the input _is_. The next diagram classifies when each
artifact can be computed.

## Architecture at a glance

The engine is easiest to navigate when recursive method calls are translated into
the values that must exist before other values can be computed.

The arrows in this map are computation dependencies, not syntax-tree containment
and not <dfn id="term-paint-order">paint order</dfn>. Paint order is a separate
relation saying which completed display primitive draws before another; it does
not determine layout geometry.

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
solve scale scopes according to explicit Frame policy
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

A <dfn id="term-coordinate-scope">coordinate scope</dfn> is a subtree sharing
one coordinate-map context for transformation and reference transport.

A <dfn id="term-geometry-port">geometry port</dfn> is a typed projection exported
from completed geometry for later observation, such as a point anchor, segment,
oriented bounds, or path.

Production does not yet represent this whole dependency graph explicitly.

Some arrows are encoded by method-call nesting, some by source-array order, some by
specialized proposal plans, and some by the separate paint graph.

The target architecture makes those dependencies data so that incidental traversal
order stops carrying semantics.

## A scenegraph subtree is not a placement region

Return to the opening toy tree with Cartesian outer Frame $R$ and polar inner
Frame $P$.

In the target semantics, a Frame is the boundary that
declares per-axis allocation, coordinate, and scale policy. Its contents form
one local writable <dfn id="term-placement-region">placement region</dfn>: the
targets and facts that may be solved jointly.

A Layer is intended to be transparent authoring syntax
that contributes nodes and facts to its enclosing Frame without opening another
allocation, coordinate, scale, or scheduling boundary.

The outer Frame contains a Cartesian label and connector that observe points
placed inside the polar Frame.

Its writable regions are:

$$
\mathcal R_R=\{\operatorname{shell}(P),\text{connector},\text{label}\},
\qquad
\mathcal R_P=\{p,q\}.
$$

A plain Layer inside either shaded Frame only contributes nodes and facts to that
Frame's local writable placement problem.

The same scenegraph therefore carries two different scope structures. Coordinate
scopes are tree-shaped: a nested Frame's coordinate map has one parent coordinate
context. Scale identity is chosen separately, once per axis, by scale policy. A
local `fit` often looks nested too, but `inherit` and `share(id)` need not coincide
with the coordinate tree.

The figure shows one scale axis. Yellow regions are coordinate scopes; purple is
that axis's scale scope, identified by its shared scale identity. The darker
outline is the same-hue stroke treatment used by the thesis planets diagram.

::: gofish example:internal-layout-scope-map hidden
:::

The dashed reference edges are not another kind of scope. They transport already-placed
geometry from `p` and `q` into the Cartesian consumer as constants. They neither
carry the source scale nor make the consumer part of the purple scale identity.
The least common ancestor is where transform paths meet, not where a new scale is
implicitly solved.

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

A <dfn id="term-proposal">proposal</dfn> is a provisional pixel allocation a
parent planner offers a child during recursive production layout. It is neither
the child's final size nor a placement fact.

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

The <dfn id="term-measure">measure</dfn> field is a semantic unit or grouping
identity used to decide whether spaces and scales are compatible. It is not a
numeric measurement, text measurement, or the legacy `GoFishRef.measure()`
method.

The `dataDomain` distinguishes an unanchored magnitude, an anchored data-position
space, and a space where only differences are meaningful.

This intermediate representation says what kind of quantity is present and how
much room it claims as a function of scale.

It does not yet contain final pixel geometry.

See [Underlying Space](/internals/core/underlying-space) for the complete current
representation.

### A scale scope chooses pixels per unit

A scale scope can produce either a magnitude scale or an anchored position map.

The magnitude scale is the slope $\sigma$ in pixels per data unit.

The position map also has an intercept, so an anchored domain maps into a concrete
pixel interval.

An `AxisScale` may carry both because the slope and the anchored map can originate
at different structural scopes.

<Badge type="info" text="AS BUILT" /> `ScopeRegistry` is the intended choke point
through which production derives these values. Some proposal planning still
constructs position maps directly with `posScaleFromSpace`, so the migration is
not complete.

Its `solveSize()` method delegates to `Monotonic.inverse()`.

Its call sites still choose their own fallbacks when the inverse is undefined.

The registry therefore centralizes arithmetic and diagnostics, but it does not yet
define a complete fit policy.

It is not a global constraint solver, and it is not a scheduler.

## Size claims and the Frame-fit question

### Concrete: which overlaid child is widest?

Consider two children occupying the same region:

$$
C_1(\sigma)=40\sigma,
\qquad
C_2(\sigma)=10\sigma+50.
$$

The first is all data-scaled width. The second has a smaller data-scaled part and
50 fixed pixels. Their crossover is:

$$
40\sigma=10\sigma+50
\quad\Longrightarrow\quad
\sigma=\frac{5}{3}.
$$

An overlay must reserve whichever width is larger at the chosen scale:

$$
C(\sigma)=\max(40\sigma,10\sigma+50).
$$

The faint lines in the explorer are the constituent affine pieces. The solid line
is their upper envelope: the actual claim seen by the parent.

::: gofish example:internal-layout-claim-lab hidden
:::

### Abstracting the pattern: one variable, one upper envelope

Fix one axis and one scale identity $S$. Every participating leaf contributes a
claim tagged with compatible axis semantics and a compatible measure. A node that
has no claim contributes $\bot$, not the zero function; that distinction matters
for fill and proposal policies.

Within one valid scale scope, every real claim depends on the same unknown
$\sigma_S$. The closed target language is:

$$
\mathcal K
=
\left\{
C:[0,\infty)\to[0,\infty)
\;\middle|\;
C(\sigma)=\max(0,a_1\sigma+b_1,\ldots,a_n\sigma+b_n),\ a_i\ge0
\right\}.
$$

An <dfn id="term-affine-piece">affine piece</dfn> is one line
$a_i\sigma+b_i$ with nonnegative slope and finite intercept. The implicit zero
piece floors physical extents at zero; the other intercepts need not be positive.

The <dfn id="term-upper-envelope">upper envelope</dfn> is their pointwise
maximum. It is finite, nonnegative, continuous, nondecreasing, convex, and
piecewise linear.

The author-facing size problem can be written as an expression:

$$
E ::= C_n
\mid E\vee E
\mid E+E
\mid kE
\mid [E+c]_+,
\qquad k\ge0.
$$

Overlay uses $\vee=\max$, series layout uses $+$, scalar sizing uses $kE$, and
fixed padding or gaps shift the intercept. Evaluating the expression bottom-up
eliminates every intermediate size variable:

$$
C_S=\operatorname{eval}(E_S),
\qquad
\operatorname{Fit}(C_S,B_S)\rightsquigarrow\sigma_S,
\qquad
s_n=C_n(\sigma_S).
$$

Equivalently, the larger system

$$
\begin{aligned}
s_{\mathrm{overlay}}&=\max_i s_i,\\
s_{\mathrm{series}}&=\sum_i s_i+\sum_i g_i,\\
s_{\mathrm{outer}}&=s_{\mathrm{inner}}+2p,\\
s_n&=C_n(\sigma_S),\\
s_{\mathrm{root}}&=B_S
\end{aligned}
$$

compiles to the single per-scope equation $C_S(\sigma_S)=B_S$. This is the
whole size-claim reduction: first build one symbolic function, then solve its one
scale unknown, then evaluate the leaves.

The one-variable qualification is essential. If two children actually use
different scale identities, their parent has a multivariate expression such as
$C(\sigma_\mu,\sigma_\nu)$. The engine must split the scopes, inherit or pin one
scale, or declare an explicit shared solve. Calling a one-dimensional inverse on
that expression would be a semantic error.

### Canonical claim representation

Let $P_C=\{(a_i,b_i)\}$ be a finite piece set and write:

$$
\operatorname{Env}(P_C)(\sigma)
=
\max\!\left(0,\max_{(a,b)\in P_C}(a\sigma+b)\right).
$$

Different piece sets can denote the same function. For example:

$$
\max(10,\sigma+5,2\sigma)=\max(10,2\sigma)
$$

on $\sigma\ge0$: the middle line only ties at $\sigma=5$ and never owns an
interval of the upper envelope.

The canonical hull $H(P)$ keeps only pieces that bind on a nonempty interval,
sorted by increasing slope. For adjacent retained pieces
$p_{j-1}=(a_{j-1},b_{j-1})$ and $p_j=(a_j,b_j)$, the transition is:

$$
\tau_j
=
\frac{b_{j-1}-b_j}{a_j-a_{j-1}},
\qquad
0<\tau_1<\tau_2<\cdots.
$$

An implementation can compute $H$ by sorting by slope, keeping only the greatest
intercept for each slope, and scanning the lines while popping every piece whose
transition is no later than the previous transition. Pieces inactive on
$\sigma\ge0$ are then discarded.

<Badge type="info" text="THEOREM" /> Over exact real arithmetic, this normal form
is semantic:

$$
H(P)=H(Q)
\quad\Longleftrightarrow\quad
\forall\sigma\ge0,\;
\operatorname{Env}(P)(\sigma)=\operatorname{Env}(Q)(\sigma).
$$

The TypeScript kernel still needs a documented floating-point policy for nearly
coincident lines; the theorem is about the mathematical representation.

### Why overlay and series stay in the language

If $C=\operatorname{Env}(P)$ and $D=\operatorname{Env}(Q)$, overlay is piece
union followed by canonicalization:

$$
C\vee D
=
\operatorname{Env}(P\cup Q).
$$

Series composition is the pairwise sum of pieces followed by canonicalization:

$$
C+D+g
=
\operatorname{Env}
\left(
\left\{
(a+c)\sigma+(b+d+g)
\;\middle|\;
(a,b)\in P,\ (c,d)\in Q
\right\}
\right).
$$

For example, putting $A(\sigma)=\max(10,2\sigma)$ in series with
$D(\sigma)=3\sigma$ and a 2-pixel gap gives:

$$
C(\sigma)=\max(3\sigma+12,5\sigma+2).
$$

At budget $B=27$ the two candidate upper bounds are $5$ and $5$, so
$\sigma=5$ and $10+15+2=27$ pixels.

Compatible claims are claims whose measures, quantity meanings, axis, and scale
identity allow them to participate in one solve. For compatible claims, overlay
is associative, commutative, and idempotent:

$$
a\vee b=b\vee a,
\qquad
(a\vee b)\vee c=a\vee(b\vee c),
\qquad
a\vee a=a.
$$

Series addition is an associative commutative monoid, and distributes over the
join:

$$
a+(b\vee c)=(a+b)\vee(a+c).
$$

Evaluation preserves both operations:

$$
\operatorname{ev}_\sigma(a\vee b)
=
\max(\operatorname{ev}_\sigma a,\operatorname{ev}_\sigma b),
$$

$$
\operatorname{ev}_\sigma(a+b)
=
\operatorname{ev}_\sigma a+\operatorname{ev}_\sigma b.
$$

<Badge type="info" text="THEOREM" /> Folding a fixed multiset of compatible claim
operands is independent of traversal order and parenthesization, and evaluating
after the fold equals composing already-evaluated extents.

This does not make an explicitly ordered distribute path geometrically
reorderable. It only says its total series claim is insensitive to how the same
operands are folded.

Production's general [Monotonic module](/internals/core/monotonic) represents a
broader language, including opaque functions and numeric inversion. The
reference `layoutClaims.ts` deliberately uses this smaller closed fragment so
canonicalization, exact fitting, and algebraic laws remain inspectable.

### Fit is a policy over the envelope

A <dfn id="term-frame-fit">Frame-fit policy</dfn> turns a claim $C$ and finite
allocation $B$ into a scale or a structured outcome. Define:

$$
m=C(0),
\qquad
F_B=\{\sigma\ge0\mid C(\sigma)\le B\},
\qquad
E_B=\{\sigma\ge0\mid C(\sigma)=B\}.
$$

Because $C$ is an upper envelope, $C(\sigma)\le B$ exactly when every piece is
at most $B$. If $B\ge m$ and at least one piece grows, then:

$$
F_B=[0,u_B],
\qquad
u_B
=
\min_{i:a_i>0}\frac{B-b_i}{a_i}.
$$

That gives the complete classification:

- If $B<m$, no scale fits: `overflow`, with deficit $m-B$.
- If $C$ grows and $B>m$, $E_B=\{u_B\}$: one exact scale.
- If $B=m$ and growth begins immediately, the exact scale is $0$.
- If $B=m$ and $C$ begins with a plateau, $E_B$ is an interval:
  `underdetermined`.
- If $C$ is constant and $B=m$, every $\sigma$ is a solution:
  `underdetermined`.
- If $C$ is constant and $B>m$, equality has no solution and every scale is
  feasible: `slack`, with $B-m$ unused pixels.

The executable `fitClaim()` experiment reports a plateau as underdetermined and
records its canonical least solution, $\sigma=0$. A greatest-feasible policy
would instead choose $u_B$ when it is finite. That choice belongs to Frame policy,
not to the claim algebra.

For several participants sharing one scale, the general constraint is:

$$
F_{\mathrm{shared}}
=
\bigcap_k F_{B_k}(C_k).
$$

When every participant uses the same allocation, this is equivalent to fitting
$\bigvee_k C_k$ once. With distinct budgets, the intersection form makes the
shared unknown and every participant's obligation explicit.

Finally, $\bot$ is not the zero claim. A true zero claim participates but cannot
determine a local scale. A fill child with no claim introduces another allocation
unknown. For claimed children $N$ and fill children $F$, the series equation is:

$$
B
=
C_N(\sigma)+\text{gaps}+\sum_{j\in F}f_j.
$$

Choosing equal fill, minimum fill, or a scale before fill is an explicit proposal
policy. It cannot be recovered by pretending every $\bot$ was $C(\sigma)=0$.

### Frame declares scale policy

<Badge type="info" text="AS BUILT" /> The current `Frame` operator is not yet a
semantic allocation boundary.

With a coordinate system it delegates to that coordinate operator.

Without one it delegates to `Layer`.

<Badge type="tip" text="TARGET" /> A normalized Frame should be the only construct
that opens an allocation, coordinate, or positional-scale boundary.

It should carry an explicit per-axis
<dfn id="term-scale-policy">scale policy</dfn>:

```text
inherit | fit | share(id) | pixel
```

- `inherit` reuses an accessible parent scale.
- `fit` solves a local scale from a finite allocation and a child claim.
- `share(id)` contributes to one explicitly owned shared scale.
- `pixel` says the axis is already expressed in local geometric units.

<Badge type="warning" text="OPEN DECISION" /> The algebra now distinguishes the
fit outcomes, but a normalized Frame still needs explicit behavior for them:

- An empty feasible set means unavoidable overflow, but the Frame must decide
  whether that is an error or an explicitly requested clip.
- A finite plateau can remain underdetermined or use an explicitly named endpoint
  policy; it must not look like a unique inverse.
- An unbounded feasible set means a constant-only claim did not determine a scale;
  it must not invent an arbitrary $\sigma$.
- Unused pixels are slack, and centering or edge-seating that slack is a placement
  policy rather than part of scale inversion.
- A shared scale needs one explicit owner, compatible participants, and an
  order-independent interpretation of distinct participant budgets.

## Placement is a different mathematical problem

Scale solving answers how large data-dependent boxes become.

Placement begins after their sizes are sufficiently known.

An <dfn id="term-anchor">anchor</dfn> is a named one-axis point derived from a
box. For a box with minimum $m$ and size $s$, its common anchors are:

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
equations over the two box unknowns $(m,s)$.

<dfn id="term-rank-two-closure">Rank-two box closure</dfn> means that two
independent equations determine that pair. For example:

$$
\operatorname{start}=10,
\qquad
\operatorname{end}=70
$$

implies:

$$
m=10,
\qquad
s=60.
$$

Dependent equations leave one degree of freedom; incompatible equations produce a
conflict. The solver does not let the last constraint silently overwrite an
earlier one.

A _fallback intrinsic extent_ is the seed produced by the child's own layout when
strong equations do not determine its span. Production classifies that seed as
weak; it is not another exact solver equation. Once retained, its numeric size is
substituted into the difference stage.

### Concrete: one relation becomes one weighted edge

Return to the opening boxes after scale evaluation:

$$
w_A=80,
\qquad
w_B=120.
$$

The 10-pixel edge gap says:

$$
B.\operatorname{start}=A.\operatorname{end}+10,
$$

so:

$$
x_B-x_A=80+10=90,
$$

where $x_v=\min(v)$ on this axis. The relation fixes a difference, not an
absolute position:

$$
(x_A,x_B)=(t,t+90).
$$

Adding $x_C-x_B=70$ gives the family

$$
(x_A,x_B,x_C)=(t,t+90,t+160).
$$

The explorer separates that solution family from the policy that fixes $t$. Its
conflict state adds a direct edge that asserts $x_C-x_A=150$ even though the path
through $B$ implies $160$.

::: gofish example:internal-placement-difference-graph-lab hidden
:::

### Abstracting the pattern: an equality difference graph

Fix one axis. Once size closure has produced $s_v\ge0$, every anchor is a known
offset from the remaining position variable:

$$
[v:a]=x_v+o_v(a),
$$

with:

$$
o_v(\operatorname{start})=0,
\qquad
o_v(\operatorname{middle})=\frac{s_v}{2},
\qquad
o_v(\operatorname{end})=s_v,
\qquad
o_v(\operatorname{baseline})=\beta_v.
$$

An author-facing relation

$$
[v:b]=[u:a]+g
$$

therefore lowers by substitution to:

$$
x_v-x_u
=
o_u(a)+g-o_v(b)
=
d_{uv}.
$$

A <dfn id="term-difference-graph">difference graph</dfn> has one vertex for
each writable $x_v$ and one directed edge $u\to v$ weighted by $d_{uv}$. The
reverse traversal has weight $-d_{uv}$.

This is an equality-potential problem. It is not the similarly named shortest-path
problem over inequalities $x_v-x_u\le d$.

Orient the edges and let $D$ be their incidence matrix:

$$
D_{e,u}=-1,
\qquad
D_{e,v}=1
\qquad
\text{for }e=(u,v).
$$

Let $d$ be the edge-weight vector. Absolute anchor facts lower to a selector
matrix $P$ and numeric vector $p$. The complete fixed-size placement problem is:

$$
Dx=d,
\qquad
Px=p.
$$

That pair of equations is the whole abstract difference-graph solver.

### Components, potentials, pins, and gauges

Suppose the undirected relation graph has $k$ <dfn
id="term-connected-component">connected components</dfn> $C_1,\ldots,C_k$.
Then:

$$
\operatorname{rank}(D)=|V|-k,
$$

and:

$$
\ker(D)
=
\operatorname{span}
\{\mathbf 1_{C_1},\ldots,\mathbf 1_{C_k}\}.
$$

Each component therefore has exactly one unconstrained degree of freedom:
translation.

Choose a root in one component and assign it $r_{\mathrm{root}}=0$. A <dfn
id="term-potential">potential</dfn> $r_v$ is the signed sum of edge weights along
a root-to-$v$ path. The relation edges are consistent exactly when every signed
cycle has zero total weight:

$$
\sum_{e\in\gamma}\operatorname{sign}_{\gamma}(e)d_e=0
\qquad
\text{for every cycle }\gamma.
$$

Equivalently:

$$
z^{\mathsf T}d=0
\qquad
\text{for every }z\in\ker(D^{\mathsf T}).
$$

The zero-cycle condition makes $r_v$ independent of which path was chosen. Every
solution on a consistent component is then:

$$
x_v=r_v+t_C.
$$

A <dfn id="term-pin">pin</dfn> is an absolute anchor equation. After anchor
offset substitution, $x_i=p_i$ requires:

$$
t_C=p_i-r_i.
$$

All pins in one component are compatible exactly when they imply the same $t_C$.
For any two pinned vertices $i,j$ this means:

$$
p_j-p_i
=
\sum_{e\in i\leadsto j}d_e.
$$

An unpinned component still needs a deterministic origin. A <dfn
id="term-gauge">gauge</dfn> chooses one representative from the translation family
without adding geometric meaning. The reference kernel uses:

$$
t_C=-\min_{v\in C}r_v,
\qquad
\min_{v\in C}x_v=0.
$$

The two algebraic conflicts are now explicit:

1. a closing edge disagrees with an already implied potential, producing a
   nonzero cycle; or
2. two pins imply different component translations.

A useful structured diagnostic would retain the complete cycle or pin-to-pin path
as a witness. Production currently reports the conflicting owners plus asserted
and implied values, but not the whole path.

### Placed references lower to constants

A transported nonlocal reference contributes a numeric constant $c_r$, not
another writable graph variable. A relation from that constant to a local anchor
becomes a pin:

$$
[v:b]=c_r+g
\quad\Longrightarrow\quad
x_v=c_r+g-o_v(b).
$$

A relation between two placed constants is only a check:

$$
c_q\stackrel{?}{=}c_r+g.
$$

This is the algebraic form of the authority boundary: local targets become
variables; placed references become constants; an observation cannot move its
source.

### Align and distribute are graph elaborations

Aligning operands $(v_i,a_i)$ introduces a shared anchor coordinate $\lambda$:

$$
x_i+o_i(a_i)=\lambda
\qquad\text{for every }i.
$$

Eliminating $\lambda$ with any representative $r$ yields a star of difference
edges:

$$
x_i-x_r=o_r(a_r)-o_i(a_i).
$$

The representative has no semantic authority; it is only an economical way to
emit the same equation set. If two already pinned operands disagree, the result
must be a conflict rather than “first source wins.”

For the explicitly ordered distribute path $v_0,\ldots,v_{n-1}$:

$$
x_{i+1}+o_{i+1}(a_{\mathrm{to}})
=
x_i+o_i(a_{\mathrm{from}})+g_i,
$$

so:

$$
x_{i+1}-x_i
=
o_i(a_{\mathrm{from}})+g_i-o_{i+1}(a_{\mathrm{to}}).
$$

Edge spacing chooses `end` then `start`, giving the familiar rule:

$$
x_{i+1}-x_i=s_i+g_i.
$$

Changing fact storage order cannot change these edges. Changing the explicit
operand path does change which edges exist.

<Badge type="info" text="AS BUILT" /> The formulas expose several production
exceptions that should be removed during normalization:

- `align` can choose the first already positioned operand as its source and omit
  other positioned operands instead of checking all of their equations;
- `distribute` can skip an edge when both endpoints were already positioned; and
- the production graph recognizes a distribute-chain origin by inspecting owner
  strings, whereas target lowering should emit an explicit head pin and leave the
  generic solver owner-agnostic.

<Badge type="info" text="THEOREM" /> For fixed intrinsic sizes, a fixed multiset of
consistent lowered facts, and a canonical free-component gauge, solved geometry
is independent of fact traversal order.

**Proof sketch.** The zero-cycle condition makes every potential a path-independent
sum. Pins or the gauge then select each component's only free translation. None of
those values depends on the order in which vertices or facts were visited.

This theorem says nothing about a syntactic reordering that changes the lowered
fact set. In particular, `[A, B, C]` and `[A, C, B]` are different ordered
distribute paths.

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

A local target, represented by
`ConstraintTarget<NodeId>`, is a writable handle authorizing the current Frame
to move or size one node in its placement region.

A placed reference, represented by
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
