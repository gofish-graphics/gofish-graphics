---
title: How the Layout Engine Works
section: Layout & Rendering
order: 50
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
    - term: Frame box
      definition: "A child Frame viewed as one writable box in its parent, distinct from its inner frame body."
      href: "#term-frame-box"
    - term: Allocation
      definition: "A finite pixel budget offered on one axis; an input, not necessarily the occupied result."
      href: "#term-allocation"
    - term: "Scale / σ"
      definition: "A data-to-pixel rule; σ is its pixels-per-data-unit slope."
      href: "#term-scale"
    - term: Scale-dependent extent
      definition: "A function E: ScaleFactor → PixelExtent giving the extent content requires at each scale."
      href: "#term-scale-dependent-extent"
    - term: Affine piece
      definition: "One line aσ+b with nonnegative slope inside a scale-dependent extent."
      href: "/internals/layout/frames-scale-scopes-and-claims#term-affine-piece"
    - term: Upper envelope
      definition: "The pointwise maximum of a finite set of affine pieces and zero."
      href: "/internals/layout/frames-scale-scopes-and-claims#term-upper-envelope"
    - term: Scope
      definition: "Participants sharing one kind of state or solve; always qualify it."
      href: "#term-scope"
    - term: Scale scope
      definition: "Participants on one axis sharing a solved σ or anchored position map."
      href: "#term-scale-scope"
    - term: Frame equation
      definition: "The equation E(σ) = available extent at the owner of one scale scope."
      href: "#term-frame-equation"
    - term: Underlying space
      definition: "The pre-pixel IR for quantity kind, domain, measure, and symbolic size."
      href: "#term-underlying-space"
    - term: Measure
      definition: "A semantic unit/group identity for compatibility, not numeric measurement."
      href: "/internals/layout/frames-scale-scopes-and-claims#term-measure"
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
      href: "/internals/layout/placement-and-layer-laws#term-anchor"
    - term: Rank-two closure
      definition: "Solving a box's two unknowns (min, size) from independent equations."
      href: "/internals/layout/placement-and-layer-laws#term-rank-two-closure"
    - term: Difference graph
      definition: "A graph whose weighted edges encode equations x_v − x_u = d."
      href: "/internals/layout/placement-and-layer-laws#term-difference-graph"
    - term: Connected component
      definition: "Placement variables joined by difference edges and sharing one translation freedom."
      href: "/internals/layout/placement-and-layer-laws#term-connected-component"
    - term: Potential
      definition: "A node coordinate relative to a chosen component root, obtained from path sums."
      href: "/internals/layout/placement-and-layer-laws#term-potential"
    - term: Pin
      definition: "An absolute anchor equation that fixes a component's free translation."
      href: "/internals/layout/placement-and-layer-laws#term-pin"
    - term: Gauge
      definition: "A canonical origin chosen for an otherwise unpinned component."
      href: "/internals/layout/placement-and-layer-laws#term-gauge"
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
      definition: "A Frame's per-axis choice among inherit, fitToExtent, share(id), and pixel."
      href: "/internals/layout/frames-scale-scopes-and-claims#term-scale-policy"
    - term: Fit to extent
      definition: "The policy solving a scale-dependent extent against a definite parent-facing Frame extent."
      href: "/internals/layout/frames-scale-scopes-and-claims#term-frame-fit"
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
      href: "/internals/layout/references-coordinates-and-scheduling#term-transport"
    - term: LCA
      definition: "The deepest shared coordinate ancestor; a transform rendezvous, not a scale owner."
      href: "/internals/layout/references-coordinates-and-scheduling#term-lca"
    - term: Task DAG
      definition: "The dependency graph of computations whose outputs become available at different times."
      href: "/internals/layout/references-coordinates-and-scheduling#term-task-dag"
    - term: Scheduler
      definition: "Chooses a topological task order; it does not order simultaneous placement facts."
      href: "/internals/layout/references-coordinates-and-scheduling#term-scheduler"
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

For the pass-by-pass inventory, see [Production Pass Inventory](/internals/layout/passes).
For the normative target contract, see [Core Layout Semantics v0](/internals/core/layout-kernel).

> **Layout engine series · Part 1 of 4**<br>
> **1. How the Layout Engine Works** ·
> [2. Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims)
> · [3. Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)
> · [4. References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling)

## Follow two boxes through layout

Begin with two rectangles whose data-driven widths are 2 and 3.

They are distributed with a 10-pixel gap inside a 210-pixel allocation.

An <dfn id="term-allocation">allocation</dfn>, also called a budget, is the
finite pixel interval a parent offers on one axis. It is an input to layout, not
necessarily the interval the child ultimately occupies.

Before a scale is chosen, their extents are symbolic:

$$
w_A = 2\sigma, \qquad w_B = 3\sigma.
$$

A <dfn id="term-scale">scale</dfn> converts data magnitudes or positions into
pixels. On one scale scope $S$, define the types first:

$$
\begin{aligned}
\operatorname{ScaleFactor}_S
  &\coloneqq \mathbb R_{\ge 0}\;[\mathrm{px}/u_S],\\
\operatorname{PixelExtent}
  &\coloneqq \mathbb R_{\ge 0}\;[\mathrm{px}],\\
\sigma_S &\in \operatorname{ScaleFactor}_S.
\end{aligned}
$$

Here $u_S$ is the data unit shared by the scope and
<dfn id="term-sigma">$\sigma_S$</dfn> is its pixels-per-data-unit slope.

The engine records this pre-pixel information as an
<dfn id="term-underlying-space">underlying space</dfn>: a per-axis description
of the quantity kind, data domain, semantic measure, and symbolic size.

A <span id="term-claim"></span><span id="term-size-request"></span><dfn
id="term-scale-dependent-extent">scale-dependent extent</dfn> has the
mathematical type:

$$
E_n : \operatorname{ScaleFactor}_S \longrightarrow
      \operatorname{PixelExtent}.
$$

$E_n(\sigma)$ is the pixel extent node $n$ requires if scope $S$ chooses
$\sigma$. It describes content, not a negotiable bid: layout may choose the
scale, but it does not partially honor, prioritize, or drop terms in $E_n$.
Earlier drafts called this value a “claim” and then a “size request.” The target
name makes the denotation explicit. Production still carries the same idea in a
`Monotonic` value whose APIs use request-like sizing vocabulary.

Distribution combines those extents in series:

$$
E_x(\sigma) = 2\sigma + 3\sigma + 10.
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

which gives an exact fit:

$$
\sigma = 40.
$$

The phrase _frame equation_ means $E(\sigma) =
\operatorname{availableExtent}$. It does not by itself imply that a normalized
`Frame` node owns this production solve.

The fulfillment rule is hard. For available extent $B$, fitting first seeks
$E(\sigma)=B$. If a constant extent remains below $B$, the content is still
fully accommodated and the difference is unused space—not partial fulfillment.
If even $E(0)>B$, no non-negative scale can accommodate the content, so layout
fails with `InfeasibleExtent`. The v0 `Frame` type has no overflow or clipping
policy; accepting overflow would require adding one explicitly. If more than one
scale solves the equality, v0 reports `UnderdeterminedScale`. The solver never
shrinks, drops, or prioritizes individual terms in $E$.

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

### Where those values live in production

The conceptual names above are not all first-class runtime types yet. This is
the concrete implementation map for the same two-box example:

| Concept                         | Current carrier                                                                | Created by                                                       | Read by / lifetime                                          |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Per-axis scale-dependent extent | `node._underlyingSpace[axis]`, specifically `ContinuousSpace.width: Monotonic` | each node's `resolveUnderlyingSpace()`; Layer folds child spaces | scale solving and proposal planning, before concrete layout |
| Chosen scale                    | `AxisScale`                                                                    | `ScopeRegistry.solveSize()` or a position-scale path             | passed downward through recursive `layout(size, scales)`    |
| Intrinsic box                   | `node.intrinsicDims`                                                           | the node-kind-specific `_layout` callback                        | local constraints, bounds folding, and geometry queries     |
| Parent placement                | `node.transform.translate` plus constraint solver state                        | Layer proposal and placement mechanisms                          | child bounds, ref reconciliation, and lowering              |
| Completed observable geometry   | `Placeable` state on the source node                                           | the source's completed `layout()`                                | `GoFishRef.layout()` and derived operators                  |
| Paint program                   | `DisplayList.DisplayItem[]`                                                    | `INTERNAL_lower()` after layout                                  | renderer only                                               |

There is no production `ScaleDependentExtent` object attached to each node. The
smaller `scaleDependentExtents.ts` module introduced in this branch is an
executable reference algebra; production carries the value as `Monotonic`
inside `UnderlyingSpace`. Keeping those representations distinct prevents the
target model from being mistaken for an already-completed migration.

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

```ts
type GoFishAST = GoFishNode | GoFishRef;

interface GoFishNode {
  uid: string;
  type: string;
  parent?: GoFishNode;
  children: GoFishAST[];
  shared: [boolean, boolean];
  constraints: ConstraintSpec[];
  resolveUnderlyingSpace(...args: unknown[]): UnderlyingSpace[];
  layout(...args: unknown[]): Placeable;
  lower(...args: unknown[]): DisplayItem[];
  _underlyingSpace?: UnderlyingSpace[];
  intrinsicDims?: Dimensions;
  transform?: Transform;
}

interface GoFishRef {
  selection?: Selection;
  directNode?: GoFishNode;
  selectedNode?: GoFishNode;
  parent?: GoFishNode;
  intrinsicDims?: Dimensions;
  transform?: Transform;
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

```ts
type Scene = Mark | Layer | Frame | Derived;

interface Mark {
  kind: "mark";
  id: NodeId;
  intrinsicSpec: IntrinsicSpec;
}

interface Layer {
  kind: "layer";
  children: Scene[];
  declarations: ConstraintDecl[];
}

interface Frame {
  kind: "frame";
  id: FrameId;
  body: Scene;
  extent: readonly [ExtentPolicy, ExtentPolicy];
  scale: readonly [ScalePolicy, ScalePolicy];
  coord?: CoordinateMap;
}

interface Derived {
  kind: "derived";
  id: NodeId;
  inputs: RefQuery<GeometryPort>[];
  build: DerivedBuilder;
}

type PixelExtent = number; // finite, non-negative pixels

type ExtentPolicy =
  | { kind: "fixed"; px: PixelExtent }
  | { kind: "allocated" }
  | { kind: "content"; inset?: { before: PixelExtent; after: PixelExtent } };

type ScalePolicy =
  | { kind: "inherit" }
  | { kind: "fitToExtent" }
  | { kind: "share"; id: ScaleId }
  | { kind: "pixel" };

interface RefQuery<G extends GeometryPort> {
  selector: Selector;
  requestedPort: G;
}
```

<Badge type="tip" text="TARGET" /> This is a semantic classification, not a
claim that those four variants are already a public serialized TypeScript union.
A connector, enclosure, or label is `Derived` when its geometry must wait for
completed input ports. A ref is one of its operands, not a fifth kind of writable
node.

A <dfn id="term-frame">Frame</dfn> is the core boundary that declares one
parent-facing frame-box extent policy, one coordinate context, and one scale
policy per axis. It receives an allocation only when that extent policy requires
one. A
<dfn id="term-layer">Layer</dfn> is transparent authoring syntax that contributes
children and declarations to the nearest Frame.

The policy names describe opposite dependency directions. `content` means “lay
out the frame body, then derive the frame-box extent from its bounds.”
`fitToExtent` means “start with a definite `fixed` or `allocated` frame-box
extent, then choose the body's scale to fit it.” The same axis cannot be both
`content` and `fitToExtent`: the box extent would be needed to choose the scale,
while the scale would be needed to choose the box extent. With no independent
extent, that is an underdetermined cyclic sizing dependency, not a scheduling
choice or an implicit fixed-point problem.

The useful intuition is therefore “Frame = Layer body + boundary,” but the two
normalize to different objects. A Layer produces a mergeable fragment; a Frame
seals such a fragment under a fresh owner:

```ts
interface NormResult {
  fragment: Fragment; // contribution to the current owner
  frames: Map<FrameId, FrameIR>; // sealed child Frames, including descendants
}
```

Write a `NormResult` as $(f,\mathcal H)$. Normalization results merge
componentwise, never by changing type:

$$
(f_1,\mathcal H_1)\oplus(f_2,\mathcal H_2)
=
(f_1\sqcup f_2,\mathcal H_1\uplus\mathcal H_2),
\qquad
\operatorname{lift}(f)=(f,\varnothing).
$$

$\sqcup$ joins Fragment node and fact sets. $\uplus$ is disjoint Frame-map
union, so a duplicate stable `FrameId` is an error. With policy record $\Pi$ and
fresh child Frame $G$,
$\operatorname{frameFragment}_F(G):\operatorname{Fragment}$ contributing $G$
itself as a parent-local target, and
$\operatorname{frameIR}(G,F,\Pi,b):\operatorname{FrameIR}$:

$$
\begin{aligned}
\operatorname{norm}_F(\operatorname{Layer}(X;D))
  &= \bigoplus_{x\in X}\operatorname{norm}_F(x)
     \oplus \operatorname{lift}(\operatorname{lower}_F(D)),\\
 (b,\mathcal H)
  &= \operatorname{norm}_G(B),\\
\operatorname{norm}_F(\operatorname{Frame}_\Pi(B))
  &= \left(\operatorname{frameFragment}_F(G),\;
      \mathcal H\uplus
      \{G\mapsto\operatorname{frameIR}(G,F,\Pi,b)\}\right).
\end{aligned}
$$

So Layer is a fragment-combining operation. Frame is a region-forming binder:
it contributes itself as one box-like target to its parent, creates a writable
region for its body, gives that body a coordinate identity, and declares scale
policy. It does **not** necessarily create a new scale identity; `inherit` and
`share(id)` may reuse one.

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

```ts
interface ProgramIR {
  frames: Map<FrameId, FrameIR>;
  dependencies: Set<TaskEdge>;
  paint: Set<PaintEdge>;
}

interface FrameIR {
  parent?: FrameId;
  coordToParent: CoordinateMap;
  extent: [ExtentPolicy, ExtentPolicy];
  scale: [ScalePolicy, ScalePolicy];
  localNodes: Map<NodeId, MarkDef | ChildFrameDef | DerivedDef>;
  facts: Set<LocalFact>;
  derivedTasks: Set<DerivedTask>;
}

interface ConstraintTarget {
  readonly owner: FrameId;
  readonly node: NodeId;
  readonly anchor: Anchor;
} // local, unresolved, writable

interface PlacedRef<G extends GeometryPort = GeometryPort> {
  readonly sourceFrame: FrameId;
  readonly sourceNode: NodeId;
  readonly port: G;
} // resolved before use, read-only
```

A child Frame has two deliberately different roles, but it is not two semantic
nodes. The <dfn id="term-frame-box">frame box</dfn> is the resolved geometry of
the child Frame itself in its parent's local problem; the **frame body** opens
the child's local problem. The parent may place or size `P`. We write `box(P)`
only when we specifically mean its resolved geometry. Placing `P` does not grant
the parent authority to move `p` or `q` inside its body.

The <dfn id="term-frame-owner">Frame owner</dfn> of a node is the unique Frame
whose placement region has authority to write it. In the toy tree:

$$
\begin{aligned}
\operatorname{owner}(P)
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

Therefore $\operatorname{Target}_R(P)$ is valid, while
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
| Which solver may write it?                  | `owner : NodeId → FrameId`                     | `p,q ↦ P`; `P,connector,label ↦ R`                              |
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
\operatorname{Local}(F,a) & \text{if policy is }\operatorname{fitToExtent},\\
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
source under $F$'s scale nor inserts the source's scale-dependent extent into $F$.

The figure compiles the surface variants into these normalized relations. Yellow
is coordinate/Frame structure, purple is scale identity, blue is local writable
geometry, green is derived geometry, and dashed edges are read-only observations.

::: gofish example:internal-layout-scenegraph-adt hidden
:::

The yellow child-Frame region and the purple scale region are content-derived
enclosures, so each background actually contains the structure it denotes. The
blue segment literally joins the aligned `p` and `q` anchors; the orange dotted
routes denote exported, read-only ports consumed outside their home Frame.

The durable invariants are:

- every semantic node has exactly one Frame owner;
- a child Frame itself belongs to its parent placement region, while its body
  belongs to the child region;
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

```ts
async function runLayout(root: GoFishNode): Promise<DisplayList> {
  resolveColorNamesAliasesAndSpaces(root);
  elaborateGuides(root); // axes, labels, titles, legend
  resolveAffectedPassesAgain(root);
  solveRootScaleScopes(root);

  // Production dispatches recursively by node kind.
  const placed = await root.layout(/* allocation and inherited scales */);

  // Layer.layout() builds local plans, lays out children in a planned order,
  // solves its placement facts simultaneously, and folds child bounds.
  // coord.layout() derives a coordinate allocation, solves local scales,
  // recurses, anchors children, transforms them, and folds screen bounds.
  // mark.layout() computes known or weak intrinsic extents.

  pinRootAndFinalizeExtents(placed);
  return lowerToDisplayList(orderPaint(bakeCoordinateScopes(placed)));
}
```

This explains why production does not have one global “intrinsic pass” followed
by one global “placement pass.”

Those operations are nested inside recursive `layout()` calls.

The normalized dependency flow we want to recover from that recursion is:

```text
resolve names and quantity types
        ↓
collect scale-dependent extents
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

## Continue through the engine

This page is the map: it establishes the artifacts, the semantic tree, and the
whole-engine dependency order. The substantial mathematical passes now have
their own chapters so each concrete example can grow into its abstract model
without competing with the rest of the engine.

| Part | Question                                                                                       | Chapter                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | What exists, who owns it, and when can it be computed?                                         | **This overview**                                                                                           |
| 2    | How do Frames, scale scopes, scale-dependent extents, and fit-to-extent policy determine size? | [Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims)       |
| 3    | How do anchor equations determine placement, and when may Layers flatten?                      | [Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)                          |
| 4    | How does completed geometry cross coordinate boundaries without granting write authority?      | [References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling) |

For a chronological inventory of production calls, keep
[Production Pass Inventory](/internals/layout/passes) beside this conceptual
series. For the normative target, use
[Core Layout Semantics v0](/internals/core/layout-kernel).

## The solvers are plural

No chapter introduces a single universal solver. The engine remains a
composition of mechanisms with different inputs and outputs:

| Mechanism              | Input                                                        | Output                                              |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Underlying-space fold  | Mark encodings, operators, constraint typing                 | Measures, domains, and scale-dependent extents      |
| Scope registry         | A scale-dependent extent or data interval plus an allocation | A scalar $\sigma$ or affine position map            |
| Proposal planners      | Grid tracks, distributes, nests, and allocations             | Child size proposals and some dependency order      |
| Rank-two box closure   | Strong equations over `(min, size)`                          | Determined sizes and positions                      |
| Difference graph       | Fixed-size anchors, relations, and pins                      | Relative positions, component gauges, and conflicts |
| Bake, lower, and paint | Placed geometry, coordinate scopes, and paint edges          | Display-list primitives and SVG                     |

A <dfn id="term-proposal">proposal</dfn> is a provisional pixel allocation a
parent planner offers a child. It is neither the child's final size nor a
placement fact.

A surface operator may contribute to several rows. `distribute`, for example,
can combine scale-dependent extents, propose child allocations, and lower to
placement equations. The chapters separate those interpretations explicitly.

## A scenegraph subtree is not a placement region

A syntax subtree says what contains what. A
<dfn id="term-placement-region">placement region</dfn> says which variables
one Frame may write simultaneously. In the running Cartesian/polar scene:

$$
\mathcal R_R=\{P,\text{connector},\text{label}\},
\qquad
\mathcal R_P=\{p,q\}.
$$

Coordinate ancestry and per-axis scale identity are separate projections again.
The full scope diagrams and scale semantics begin in
[Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims#a-scenegraph-subtree-is-not-a-placement-region).

## Scale-dependent extents and fitting

Size solving reduces a finite family of data-scaled and fixed-pixel requirements
to a canonical upper envelope:

$$
E(\sigma)=\max\!\left(0,\max_i(a_i\sigma+b_i)\right).
$$

The algebra determines the feasible scales for an available pixel extent; the
Frame still needs an explicit policy for empty, unique, plateau, and unbounded
outcomes. It never partially fulfills $E$: slack is fully accommodated content
plus unused pixels, while v0 reports overflow as `InfeasibleExtent`. Supporting
clipping later would require an explicit policy.
The derivation and interactive envelope live in
[Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims#scale-dependent-extents-and-the-extent-fit-question).

## Placement is a different mathematical problem

After sizes are sufficiently known, anchor relations lower to equality
differences:

$$
x_v-x_u=d.
$$

Zero-sum cycles make relative potentials path-independent; pins or a canonical
gauge fix each component's remaining translation. See
[Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws#placement-is-a-different-mathematical-problem)
for the matrix form, conflict conditions, and interactive graph.

## The Layer laws we want

Layer flattening is a theorem about normalization, not a promise about every
current `Layer.layout()` branch:

$$
\operatorname{Layer}(A,\operatorname{Layer}(B,C;F_2);F_1)
\simeq
\operatorname{Layer}(A,B,C;F_1\cup F_2).
$$

It holds when both sides normalize to the same Frame-local node and fact sets,
and no effectful boundary or ordered operand is erased. The exact side
conditions stay beside the placement-confluence proof in
[Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws#the-layer-laws-we-want).

## The two unrelated things currently called `ref`

The decisive distinction is authority:

| Value              | Meaning                                                | May the current Frame write the source? |
| ------------------ | ------------------------------------------------------ | --------------------------------------- |
| `ConstraintTarget` | An unresolved node anchor with an explicit Frame owner | Yes                                     |
| `PlacedRef<G>`     | A completed geometry port of type $G$                  | No                                      |

The production callback token and public scenegraph `ref()` only approximate
these two roles today. Their current behavior and target replacements are
spelled out in
[References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling#the-two-unrelated-things-currently-called-ref).

## Frames, coordinates, and nonlocal references

A nonlocal reference is solved at home, exported as a typed port, and transported
into consumer coordinates:

$$
\operatorname{value}_F(\operatorname{PlacedRef}(s,g))
=
T_{\kappa_{\operatorname{owner}(s)}\rightarrow\kappa_F}
\!\left(g(\operatorname{Place}(s))\right).
$$

That read does not re-evaluate the source under the consumer's scale or grant
the consumer placement authority. Port types, coordinate LCA behavior, and the
radar-chart example continue in
[References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling#frames-coordinates-and-nonlocal-references).

## What the scheduler should schedule

The scheduler orders tasks whose outputs become available at different times:
Frame solves, exported ports, transports, and derived geometry. It does not
choose an order for simultaneous facts such as `align` and `distribute`.

A complete acyclic dependency graph yields the same result under every
topological schedule when each task is deterministic. The task model and cycle
policy are in
[References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling#what-the-scheduler-should-schedule).

## A small engine someone else could reimplement

The complete normalized route is deliberately short:

```text
resolve stable IDs
→ normalize Layers into Frame-local nodes and facts
→ build the cross-Frame task DAG
→ fold scale-dependent extents and solve explicit scale policies
→ compute intrinsic geometry
→ close box equations and solve anchor differences
→ export bounds and geometry ports
→ transport ports and construct derived geometry
→ solve paint order and lower
```

Invalid programs produce structured conflicts instead of traversal-sensitive
fallbacks. The full implementation checklist and failure taxonomy conclude
[References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling#a-small-engine-someone-else-could-reimplement).

## Proof obligations worth keeping

| Family                         | Representative law                                                                                        | Detailed chapter                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Scale-dependent-extent algebra | Over exact reals, `max` and addition are associative and commutative; numeric TypeScript uses a tolerance | [Frames and scale-dependent extents](/internals/layout/frames-scale-scopes-and-claims#canonical-scale-dependent-extent-representation) |
| Placement algebra              | Feasibility is equivalent to zero signed cycle sums; consistent components are unique modulo translation  | [Placement and Layers](/internals/layout/placement-and-layer-laws#components-potentials-pins-and-gauges)                               |
| Boundary conformance           | Placed refs cannot alter source geometry; complete task DAGs are schedule-invariant                       | [References and scheduling](/internals/layout/references-coordinates-and-scheduling#proof-obligations-worth-keeping)                   |

These are proofs about explicit semantic inputs. Surface conformance still needs
differential tests showing that author programs normalize to those inputs.

## Checklist for layout work

Every layout change or agent brief should answer:

- Is this production behavior, target semantics, or the executable reference
  kernel?
- Which Frame receives the allocation, and which per-axis scale policy applies?
- Is each operand a writable local `ConstraintTarget` or a read-only `PlacedRef`?
- Which phase owns the behavior: scale-dependent extent, scale, intrinsic layout,
  placement, bounds, transport, derived geometry, or paint?
- Which collections are unordered fact sets, and which are explicit sequences?
- Which theorem should the change preserve?
- What is the smallest counterexample that would falsify that theorem?
- Which structured failure replaces an incomplete or ambiguous case?

The shortest durable mental model is:

> A Frame declares extent, scale, and coordinate policy; a Layer contributes
> unordered facts to its local placement region; the placement solver solves
> those facts jointly; a PlacedRef observes completed geometry without moving its
> source; the task DAG orders dependencies between Frames; and paint order is
> separate from geometry.

---

> **Next:** [Frames, Scale Scopes, and Scale-Dependent Extents](/internals/layout/frames-scale-scopes-and-claims)
