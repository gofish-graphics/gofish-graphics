---
title: Core Layout Semantics v0
section: Core
order: 25
status: draft
covers:
  - packages/gofish-graphics/src/ast/scaleDependentExtents.ts
  - packages/gofish-graphics/src/ast/layoutKernel.ts
---

# Core Layout Semantics v0

This page is the normative contract for a small GoFish layout kernel. It describes
the semantics that an implementation must preserve, not every behavior of the
current AST implementation. Surface operators may elaborate into this kernel, and
an implementation may optimize it, provided the laws below still hold.

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. A layout
either produces a resolved scene or a structured failure. Silent first-wins name
resolution, last-writer-wins placement, skipped constraints, and invalid numeric
fallbacks are not part of the semantics.

The kernel is intentionally smaller than the authoring language. Its concepts are:

- stable node identities;
- transparent `Layer`s and their lowered `Fragment`s;
- coordinate and scale `Frame`s;
- geometric constraints over local targets and placed references;
- an explicit dependency graph; and
- a paint program that runs after geometry.

See [Underlying Space](/internals/core/underlying-space) for the current
scale-dependent-extent carrier, [The Bounding-Box Model](/internals/core/bbox)
for box terminology, and [Name Resolution & Scoping](/internals/core/names-and-scoping)
for the author-facing naming problem. This contract deliberately separates those
concerns from structural parenthood.

## 0. Status and executable slices

This is a target contract, not a claim that the current AST already conforms. The
implementation in this change makes three deliberately bounded pieces executable:

- `scaleDependentExtents.ts` is the closed, inspectable
  `ScaleDependentExtent` algebra proposed for the normalized core; production
  still uses `Monotonic` while migration is evaluated.
- `layoutKernel.ts` is only the **same-frame, known-size placement subkernel**. A
  `PlacedPort` supplied to it is already resolved and transported into the consumer
  frame. Frame construction, allocation/extent resolution, scale ownership,
  coordinate transport, name lowering, and the full task DAG remain upstream
  obligations; this subkernel does not pretend to prove them. Its solved axes now
  include exact occupied bounds summarized from the same component potentials as
  placement.
- the production underlying-space fold now has a lossless `none | one | mixed`
  measure state, eliminating one concrete violation of layer associativity.

The executable law tests establish the algebra of those slices. Conformance of the
whole engine additionally requires differential tests from surface `Layer`, `Frame`,
and `ref` programs into the kernel records described here. Until those exist, this
page should be read as the migration target and the tests as constructive evidence,
not as a proof of current end-to-end behavior.

## 1. Results and observations

For a viewport and a normalized core program, evaluation returns exactly one of:

```ts
interface ResolvedScene {
  boxes: Map<NodeId, Box>;
  transforms: Map<NodeId, WorldTransform>;
  scales: Map<ScaleId, ResolvedScale>;
  references: Map<RefId, NodeId>;
  displayList: DisplayItem[];
}

interface LayoutFailure {
  errors: LayoutError[];
}
```

Two programs are **geometry-equivalent**, written `A ≈ᴳ B`, when their
surviving node IDs have the same resolved references, scale IDs and maps, local
boxes, world geometry, and outward scale-dependent extents. Mathematically these
values are equal; an implementation may compare floating-point results within one
documented global tolerance.

They are **paint-equivalent**, written `A ≈ᴾ B`, when they lower to the same
ordered display primitives with the same world geometry, clipping, compositing,
and style. Paint equivalence implies that ordering is observable. Geometry
equivalence does not.

An optimization MUST preserve both equivalences unless it explicitly operates on
geometry only. If evaluation fails, equivalent programs MUST report the same
canonical set of errors; source traversal order may not choose the error.

## 2. Stable identity and names

Every semantic node has a `NodeId` that is unique within the program and stable
across:

- child-array permutations;
- constraint-declaration permutations;
- insertion or removal of `Fragment`s; and
- serialization and deserialization of the same program.

A `NodeId` MUST NOT be derived from a current child index. A surface elaborator may
derive an ID from a stable data key or allocate one once and persist it.

Human-readable names are symbols that resolve to `NodeId`s before layout. Within a
name scope, an unknown name is `UnknownReference` and more than one visible match is
`AmbiguousName`. There is no first DFS match or direct-child-wins rule. Name scopes
are explicit and independent of `Fragment`, `Layer`, `Frame`, and paint grouping.

After name resolution, every constraint and reference names a `NodeId`; later tree
walks never repeat string lookup. This is a precondition for all permutation laws
below.

## 3. Layer and Fragment

`Layer(children, constraints)` is transparent authoring syntax: it contributes
nodes and geometric facts to the nearest enclosing `Frame` (or to the implicit
root frame). It does not allocate a box, own a scale, open a coordinate system, or
create a scheduling phase. Its `.constrain()` callback is a lexical fact builder,
not a runtime solve boundary.

`Fragment` is the normalized form of that contribution. It is an immutable set of
stable-ID node definitions and facts, with paint ordering represented separately.
It has no `NodeId`, name, box, transform, scale policy, coordinate system, layout
phase, or paint scope, and it cannot itself be referenced.

Within one frame, layer nesting is therefore just associative fragment union. If
`C₁` and `C₂` are constraint fact sets, then:

```text
Layer()                                                    ≈ identity
Layer(A, Layer(B, C; C₂); C₁)                              ≈ Layer(A, B, C; C₁ ∪ C₂)
Layer(Layer(A, B), C)                                      ≈ Layer(A, Layer(B, C))
```

These laws hold for `≈ᴳ`. They also hold for `≈ᴾ` when flattening splices the
inner paint sequence in place. Structural layer boundaries are ignored when
choosing the writable solve region: a constraint declared in an outer layer may
write `A`, `B`, or `C`, and an inner declaration contributes to the same joint
problem.

Geometry treats children and declarations as membership, not as an implicit
execution sequence. For any permutations `π` and `σ`,

```text
geometry(Layer(X; C)) = geometry(Layer(π(X); σ(C)))
```

provided resolved IDs and explicit sequence-valued operands are unchanged. Paint
may change when the author changes an explicit paint or z sequence; that ordering
is not geometric input. Identical facts are idempotent.

The flattening laws require the wrapper to be a genuine layer. Anything that owns
an allocation, transform, coordinate map, scale policy, flip, or clip is a
`Frame` (or an explicit paint group), not a layer. Name resolution must also
produce the same IDs before and after flattening. If surface syntax names or refs
an aggregate layer, normalization creates an explicit derived aggregate node;
that node's bounds are an associative union of its members and the structural
wrapper is still erased.

Associative composition requires explicit state for information that cannot be
represented by a single optional value. For example, measure combination needs
states equivalent to `none`, `one(measure)`, and `mixed`; using `undefined` for
both “no measure” and “conflict” makes the fold non-associative. Likewise, ordinal
domain order MUST be explicit or canonical rather than inherited from child
encounter order.

## 4. Frame, coordinates, and scales

`Frame` is the only core construct that opens a coordinate or positional-scale
boundary. A frame has one inner **frame body** and declares, per axis, how the
parent-facing **frame box** obtains its extent and how the body's scale is
obtained. It may also declare a coordinate map:

```ts
interface Frame {
  id: NodeId;
  body: Node;
  extent: readonly [ExtentPolicy, ExtentPolicy];
  coord?: CoordinateMap;
  scale: readonly [ScalePolicy, ScalePolicy];
}

type PixelExtent = number; // finite, non-negative pixels

type ExtentPolicy =
  | { kind: "fixed"; px: PixelExtent }
  | { kind: "allocated" }
  | {
      kind: "content";
      inset?: { before: PixelExtent; after: PixelExtent };
    };

type ScalePolicy =
  | { kind: "inherit" }
  | { kind: "fitToExtent" }
  | { kind: "share"; id: ScaleId }
  | { kind: "pixel" };
```

The surface language may infer these policies, but the normalized core MUST store
them explicitly.

### Per-axis extent policy

For Frame $F$ and axis $a$, `Allocation(F, a)` is a finite pixel extent supplied
by the root viewport or a parent-owned sizing task. It MUST be independent of
$F$'s body. `Extent(F, a)` is a task whose output is the resolved size of
$F$'s frame box, as seen by the parent's placement region. They are different
values even when the extent policy makes them numerically equal.

- **`fixed(px)`** makes `Extent(F, a) = px` without consuming an allocation.
- **`allocated`** makes `Extent(F, a) = Allocation(F, a)`. A missing root or
  parent offer is `MissingAllocation`.
- **`content(inset)`** waits for resolved body bounds expressed in the frame
  box's parent-facing coordinate basis, before the parent places $F$, and makes
  `Extent(F, a) = span(BodyBounds(F), a) + inset.before + inset.after`. Omitted
  insets are zero. This result is occupied frame-box size, not an allocation fed
  back into the same body.

Every allocation, fixed extent, and derived extent MUST be finite and
non-negative. `fixed` and `allocated` extents are available before body layout;
`content` extents are available only after the body's scale, intrinsic geometry,
Frame-local placement, and local bounds.

Content-sized frame boxes are therefore schedulable with `inherit` when their
coordinate map does not consume that same frame-box extent: the ancestor scale
resolves first, then the child body and coordinate mapping, then its box extent,
and finally the child Frame's placement in the parent. This is also schedulable
with `pixel` under the same condition. If the coordinate map depends on
`Extent(F, a)`, that dependency is an explicit DAG edge and may form a cycle. A
`fitToExtent` scale always requires a `fixed` or `allocated` extent that exists
before body layout. Combining `fitToExtent` and `content` on the same axis is
invalid: fitting needs the box extent to choose the scale, while content sizing
needs the scale to choose the box extent. With no independent extent, this is an
underdetermined cyclic sizing dependency (and positive insets can instead make
its equations inconsistent). It MUST fail as `DependencyCycle` in v0; no
implicit fixed-point or tie-breaking semantics is implied.

Under `inherit`, `ScaleDependentExtent(F.body, a)` contributes symbolically to
the inherited scale identity's extent join before its ancestor owner solves the
scale. That join does not wait for `Extent(F, a) [content]`; the content extent
is the later concrete result of evaluating and placing the body under the solved
scale.

For `share(id)`, all participants may contribute symbolic scale-dependent extents
before their geometry exists. The group's one fitting owner MUST provide a
`fixed` or `allocated` extent. A non-owner participant may be `content`, because
it derives its frame box only after the shared scale has been solved.

### Per-axis scale policy

- **`inherit`** contributes the body's symbolic scale-dependent extent to the
  accessible parent `ScaleId` and reuses its solved mapping. The frame does not
  solve a new scale. A child that requires a data scale when none is available
  fails with `MissingInheritedScale`.
- **`fitToExtent`** consumes the body's scale-dependent extent and solves one local
  scale against the frame's finite pre-body `Extent`. The inner data-dependent
  extent does not escape to the parent; outwardly the axis is a resolved geometric
  extent. A missing extent, incompatible extent function, infeasible extent, or
  underdetermined scale is a structured failure. `NonInvertibleScale` is reserved
  for an opaque extent representation whose inverse operation is unsupported.
- **`share(id)`** contributes its scale-dependent extent to the named scale group.
  All participants' extents are joined first, the group has exactly one owner,
  and the resulting scale is solved once. Incompatible measures or two owners
  fail; traversal order never chooses a winner.
- **`pixel`** declares that the axis is already in frame-local geometric units and
  has no data scale. A data-dependent child that still needs a scale fails with
  `ScaleRequired`.

The scale-dependent extent of node $n$ on axis $a$ has type

$$
E_{n,a} : \operatorname{ScaleFactor}_S \longrightarrow
          \operatorname{PixelExtent}.
$$

$E_{n,a}(\sigma)$ is the concrete extent the node requires at scale $\sigma$;
it is not a negotiable request. Compatible scale-dependent extents form an
order-independent algebra. For `e₁`, `e₂`, and `e₃`, the join `⊔` MUST satisfy:

```text
e₁ ⊔ e₂ = e₂ ⊔ e₁
(e₁ ⊔ e₂) ⊔ e₃ = e₁ ⊔ (e₂ ⊔ e₃)
e₁ ⊔ e₁ = e₁
```

An incompatible join returns `IncompatibleScaleDependentExtents`; it does not
forget unit information. Ordered categories are represented by an explicit
domain sequence or ordering key outside this commutative join.

Fitting uses hard fulfillment semantics. Given available extent $B$, the
reference inversion `fitScale(E, B)` first seeks a scale satisfying
$E(\sigma)=B$. A unique solution is an exact fit. Its intermediate algebraic
result may instead be `slack` when a constant extent remains below $B$: the
content is fully accommodated and $B-E(\sigma)$ pixels remain unused, but that
result contains no scale.

The Frame policy `fitToExtent` must produce a scale, so v0 accepts only the exact
case. It maps both a non-unique equality and a scale-free `slack` result to
`UnderdeterminedScale` unless an independent policy has already supplied
$\sigma$. If $E(0)>B$, no non-negative scale can accommodate the content and v0
MUST return `InfeasibleExtent`. Clipping or accepting overflow would require a
future explicit policy that is not present in this `Frame` type. No term may be
dropped, shrunk, prioritized, or partially fulfilled in any case, and traversal
order never selects among several feasible scales.

### Coordinate map

With no `coord`, the frame-local Cartesian map is the identity. Otherwise `coord`
maps fully resolved frame-local geometry into the parent coordinate space after
per-axis scales have been applied. An affine map may transform boxes directly. A
nonlinear map MUST transform the actual path or an approximation with a documented
error bound; transforming only opposite box corners is not equivalent.

A coordinate frame is never transparent merely because its current map happens to
look like an identity. Its scope identity may be consumed by references, scale
sharing, or later animation.

As an object in its parent's solve region, the frame itself is a local
`ConstraintTarget`; its frame-box size comes from `Extent(F, axis)`.
Targets inside its body belong to the frame's inner region. Constraints may move
the outer frame from the parent but may not thereby acquire write access to its
contents.

## 5. Constraint targets and placed references

The core has two deliberately different handles:

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

declare const target: ConstraintTarget; // local and writable
declare const ref: PlacedRef<GeometryPort>; // potentially nonlocal and read-only
```

`ConstraintTarget` is a concrete node-and-anchor handle. Only `PlacedRef<G>` is
generic: $G$ is the geometry-port type that the consumer is allowed to observe.

A `ConstraintTarget` belongs to exactly one frame-local solve region. All layers
inside that frame elaborate to the same region, so their callbacks may constrain
one another's targets after name resolution. Passing a target across a `Frame`
boundary as writable state is `NonlocalWrite`.

A `PlacedRef` observes geometry after its source has been resolved. It may be used
by connectors, enclosures, labels, and as a fixed source anchor for a local
constraint. It never grants permission to move or resize its source, never
duplicates the source's scale-dependent extent, and never reinterprets the source under the
consumer's scale.

Surface `.constrain()` callbacks receive `ConstraintTarget`s even if their syntax
looks reference-like; those handles are the writable variables in the current
frame-local problem. Surface `ref(name)` produces a `PlacedRef`, including when the
source happens to be nearby. Thus align and distribute lower to ordinary equations
between local targets. If they also contain a `PlacedRef`, its anchors lower to
constants: local targets may move relative to it, while an all-placed relation is
only a consistency check. A placed operand is never selected as the thing to move.

Let `s` be the source, `c` the consumer, and `L` their least common coordinate
scope. If `Φ(x → L)` maps geometry from `x`'s local frame into `L`, then:

```text
geometry_c(ref(s)) = inverse(Φ(c → L))(Φ(s → L)(geometry_s))
```

The source geometry is first resolved using the source frame's scale policy. A ref
across a self-scaled frame therefore preserves the source scale and appears to the
consumer as placed geometry. It does not inject the source's data domain into the
consumer's scale join. Inserting or removing `Fragment`s does not alter the least
common coordinate scope and therefore cannot change this result.

The least common coordinate scope is only the transport space; it is not an
implicit scale owner. A `fitToExtent` scale is solved in its declared source frame,
`inherit` uses the declared ancestor scale, and `share(id)` uses its one explicit
owner. Cross-frame refs never promote those solves to the least common ancestor.
Code that needs a joint scale must request `share(id)` (or a future explicit joint
layout construct) instead of relying on a reference side effect.

Read-only transport requires a forward path from source to the common scope and a
way to express the result in the consumer frame. If that transport is undefined,
evaluation fails with `IncompatibleCoordinateTransport`. Writing across a
nonlinear or independently scaled boundary is never inferred; authors must instead
declare a shared frame/scale or an explicit projection operation.

## 6. Constraint algebra and confluence

A frame's layer declarations elaborate to an unordered set of equations and
relations. They are solved as one problem, not executed as mutations in
declaration order.

Operand order is part of a constraint only where the constraint says so:

| Constraint form                    | Normative operand shape                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| Position many targets at one value | set of targets                                                   |
| Align at one anchor                | set of targets                                                   |
| Align with different anchors       | map `target -> anchor`                                           |
| Copy span or size                  | one explicit source plus a set of targets                        |
| Distribute                         | ordered path of targets                                          |
| Grid                               | map `target -> (row, column)`, or an explicit row-major sequence |
| Nest                               | role record `{ outer, inner }`                                   |
| Above/below                        | directed paint edge; not a geometric constraint                  |

Reordering a set or map has no semantic effect. Reordering a distribute path,
swapping nest roles, or changing grid coordinates intentionally changes the
program. Simultaneously permuting `(target, anchor)` pairs does not.

For node table `N`, geometric fact set `C`, child permutation `π`, and declaration
permutation `σ`, the confluence law is:

```text
Solve(N, C) = Solve(π(N), σ(C))
```

provided names resolve identically and every explicit ordered operand is held
fixed. If the equations are consistent, both sides yield the same boxes and scales.
If they are inconsistent, both yield the same canonical conflict set.

An unpinned placement component has translation freedom. The kernel fixes that
gauge by translating the component so the minimum of its box-min coordinates is
zero. A lone unconstrained target is placed at the local origin. Remaining rank
deficiency in an extent or scale is `UnderdeterminedLayout`; it is not resolved by
choosing the first declaration.

If an ordered operator needs a different gauge—such as keeping the head of a
negative-gap distribute path at zero—its lowering emits that origin as an explicit
pin. The generic solver never recovers semantic order by inspecting fact storage or
owner strings.

### Known-size body bounds

Fix one Frame-local axis after every node has a finite size $s_v\geq 0$. If
canonical placement gives box minimum $x_v$, that node occupies the closed interval

$$
I_v=[x_v,x_v+s_v].
$$

The axis body bounds have type

$$
\operatorname{BodyBounds}_a:
\operatorname{SolvedAxis}_a\longrightarrow\operatorname{Interval}_{\bot},
$$

where $\bot$ means that the axis contains no geometry. For a nonempty node set,

$$
\operatorname{BodyBounds}_a
=
\left[
\min_v x_v,
\max_v(x_v+s_v)
\right].
$$

The node set is total over ordinary known-size members of the Frame body; an
implementation MUST NOT omit an unconstrained child and fold it back in after the
solve. A member with neither pins nor relations is a singleton free component. If
its intrinsic or data semantics require a particular origin—such as baseline zero—
normalization emits that requirement as a pin. Geometry whose construction consumes
already placed source boxes is a later derived-geometry task and is outside this
known-size placement set.

Its scalar occupied extent is the difference between those endpoints. The kernel
MUST NOT identify $\bot$ with the occupied point interval $[0,0]$: an enclosing
Frame policy may map empty content to a zero box extent, but that is a later policy
decision. `layoutKernel.ts` represents $\bot$ as `bounds: null`.

For a component $C$ with relative potentials $r_v$ and chosen translation $t_C$,
an implementation MAY compute the same result without first materializing every
box:

$$
B_C^- = t_C + \min_{v\in C}r_v,
\qquad
B_C^+ = t_C + \max_{v\in C}(r_v+s_v).
$$

Hulling these component summaries MUST equal hulling the intervals returned by
full placement. Placement and bounds may be fused into one traversal, but they are
not allowed to use divergent constraint interpretations or gauge policies. A
conflict returns neither partial placement nor partial bounds, and every derived
coordinate, endpoint, and occupied extent MUST remain finite.

## 7. Proof sketches for the executable laws

These are ordinary mathematical proof obligations, separate from TypeScript tests.
The tests exercise counterexamples and finite instances; they are not a proof
assistant.

**Layer flattening.** Normalize every layer inside one frame to its node definitions
and fact set. Set union is associative, commutative, and idempotent, while paint
sequence splicing is associative. Therefore regrouping layers preserves normalized
geometry facts (and preserves paint when relative sequence is spliced in place).
The theorem requires name resolution and explicit ordered operands to be unchanged.

**Placement confluence.** On one axis, anchor lowering produces equations
`min(v) - min(u) = d`. In a connected component, every consistent path assigns the
same relative potential exactly when every cycle sums to zero. All solutions then
differ by one translation. Consistent pins determine that translation; without a
pin, the minimum-at-zero gauge determines it. Thus a consistent component has one
canonical solution independent of fact order. A nonzero cycle or disagreeing pins is
an order-independent conflict.

**Known-size body-bounds coherence.** Canonical placement has
$x_v=r_v+t_C$. Distributing the global minimum and maximum over connected
components gives

$$
\min_v x_v=\min_C\left(t_C+\min_{v\in C}r_v\right),
$$

and

$$
\max_v(x_v+s_v)
=
\max_C\left(t_C+\max_{v\in C}(r_v+s_v)\right).
$$

Those are exactly the component-summary endpoints above. Therefore summarizing a
valid solve plan and placing its cells and then taking their hull commute. Combined
with placement confluence, bounds are also independent of fact traversal order.

**Placed-reference immutability.** A transported `PlacedRef` lowers to a numeric
constant, never to the source node's writable variable. Local equations can position
local targets relative to that constant, but cannot change the source. Because the
source's scale-dependent extent is absent from the consumer fact set, referencing it
also cannot duplicate its scale contribution.

**Measure join.** Raw measure state is `none`, `one(m)`, or `mixed`. `none` is the
identity, equal singleton values join to themselves, unequal singleton values join to
`mixed`, and `mixed` is absorbing. Case analysis gives associativity, commutativity,
and idempotence. Projecting `mixed` to no public axis title happens only after all
internal joins, so projection cannot make a later fold resurrect a unit.

**Scale-dependent-extent closure.** A scale-dependent extent is a finite maximum of
non-negative-slope affine pieces and zero. Maximum is set union followed by
upper-envelope normalization. Addition
uses `maxᵢ pᵢ + maxⱼ qⱼ = maxᵢⱼ(pᵢ + qⱼ)`. These constructions preserve finiteness,
non-negativity, continuity, monotonicity, and piecewise linearity, and their set and
Cartesian-product laws give the stated associativity and permutation invariance over
exact real arithmetic. JavaScript `number` does not preserve structural equality
under every regrouping. The law suite uses exact object equality only for exactly
representable cases and checks selected evaluations of floating-point
counterexamples within an explicit tolerance; a complete approximate-equivalence
procedure remains future work.

## 8. Dependency graph

Execution order comes from data dependencies, never from child order or nesting
used as an accidental phase barrier. The normalized program contains a directed
acyclic graph of tasks. Useful task kinds are:

- `ScaleDependentExtent(node, axis)` — compute the symbolic extent function;
- `Allocation(frame, axis)` — supply a root- or parent-owned finite pixel offer;
- `Extent(frame, axis)` — resolve the frame-box size according to `ExtentPolicy`;
- `Scale(frame, axis)` — solve or obtain the frame's scale;
- `Intrinsic(node)` — compute scale-dependent intrinsic geometry;
- `Place(frame, axis)` — jointly solve the frame-local constraints;
- `Bounds(node)` — compute placed bounds; and
- `Derived(node)` — build geometry that consumes `PlacedRef`s.

Required edges include:

- child scale-dependent extents before an inherited-parent or shared-scale
  extent join;
- a root/parent offer before an `allocated` extent;
- a frame's scale-dependent extent and pre-body extent before its `fitToExtent` scale;
- an ancestor scale before a descendant's `inherit` scale;
- all shared scale-dependent extents and the fitting owner's pre-body extent
  before a shared scale;
- a scale before intrinsic geometry that consumes it;
- intrinsic target geometry before the owning frame's placement solve;
- Frame-local placement before local body bounds;
- local body bounds before a `content` extent;
- a child Frame's box extent before the parent placement task that consumes its
  size;
- a nest or sizing source before its derived target;
- source bounds before every `PlacedRef` consumer; and
- placement before final bounds and paint lowering.

Independent tasks may run in any order or in parallel. A cycle is
`DependencyCycle` and MUST include a stable-ID path in its diagnostic. A derived
mark may not enlarge an ancestor allocation that its own source depended on; that
would be such a cycle. Supporting that behavior would require a separately
specified fixed-point solver and is outside v0.

In particular, `fitToExtent` plus `content` on one Frame axis yields the stable-ID
task path `Extent(F, a) → Scale(F, a) → Intrinsic(F.body) → Place(F) →
BodyBounds(F) → Extent(F, a)`. With `inherit`, that scale-specific edge is absent:
`Scale(F, a)` comes from the ancestor rather than from `Extent(F, a)`.
The cycle has no independent value from which to start: the box extent is supposed
to determine the scale while the scaled body is supposed to determine that same
extent. It is therefore an underdetermined cyclic sizing specification, not a
scheduler ordering choice.

## 9. Geometry and paint are separate

Geometry produces boxes, transforms, scales, and resolved reference geometry.
Paint consumes those values afterwards. The geometry solver MUST ignore:

- child paint sequence;
- numeric z hints;
- above/below relations;
- backend batching order; and
- whether an otherwise identical node is drawn before or after a sibling.

The paint program consists of ordered sequences, directed above/below edges, and
explicit clip/compositor groups. It is topologically ordered only after geometry
has succeeded. Incomparable paint nodes may use an explicit sequence as their
fallback; if storage-order-invariant paint is required, that sequence must use
stable paint keys. A paint cycle is `PaintCycle` and does not become a geometric
constraint conflict.

Consequently, reordering layer children may alter an explicit or fallback paint
order while geometry and scales remain identical. That is intentional separation,
not a confluence exception.

## 10. Required failures

At minimum, a conforming implementation reports these conditions explicitly:

| Failure                                   | Meaning                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `DuplicateNodeId`                         | Two semantic nodes have the same stable ID.                       |
| `UnknownReference` / `AmbiguousName`      | Name resolution did not produce exactly one target.               |
| `InvalidFragment`                         | A purported layer/fragment carries a frame or paint boundary.     |
| `MissingAllocation`                       | An `allocated` extent has no root or parent-owned pixel offer.    |
| `InvalidExtent`                           | An allocation or resolved extent is negative or non-finite.       |
| `IncompatibleScaleDependentExtents`       | A scale join contains incompatible units or extent kinds.         |
| `MissingInheritedScale` / `ScaleRequired` | A node needs a scale forbidden or absent under its frame policy.  |
| `ScaleOwnershipConflict`                  | A shared scale group has more than one owner.                     |
| `InfeasibleExtent`                        | A hard scale-dependent extent cannot fit the available pixels.    |
| `UnderdeterminedScale`                    | `fitToExtent` does not uniquely determine $\sigma$.               |
| `NonInvertibleScale`                      | An opaque extent representation has no supported inverse.         |
| `NonlocalWrite`                           | A constraint attempts to mutate a nonlocal target or `PlacedRef`. |
| `IncompatibleCoordinateTransport`         | Referenced geometry cannot be represented in the consumer frame.  |
| `ConstraintConflict`                      | Geometric equations imply inconsistent values.                    |
| `UnderdeterminedLayout`                   | Required geometry remains free after canonical gauge fixing.      |
| `DependencyCycle`                         | Layout dependencies are cyclic.                                   |
| `PaintCycle`                              | Above/below relations are cyclic.                                 |
| `NonFiniteGeometry`                       | A successful-looking solve produced `NaN` or infinity.            |

Errors are values produced before a display list. Diagnostics SHOULD include stable
node IDs, axis, owning frame-local solve region, and the competing facts. Reordering
inputs may change source spans shown as secondary context, but not the error kind or
the canonical conflicting fact set.

## 11. A short reimplementation algorithm

A minimal independent implementation can follow these steps:

1. **Normalize structure.** Resolve and flatten `Layer`s and `Fragment`s into one
   node/fact set per frame, validate or assign stable IDs, and retain `Frame`, name,
   and paint boundaries explicitly.
2. **Resolve names.** Build explicit name scopes, reject missing or ambiguous
   names, and rewrite every constraint and ref to `NodeId`s.
3. **Lower semantics.** Convert geometric constraints to unordered facts with
   their set-, map-, path-, or role-shaped operands. Separate paint edges.
4. **Build dependencies.** Create the task DAG, including every allocation,
   extent, scale, sizing, nesting, and `PlacedRef` dependency; reject cycles.
5. **Seed pre-body values.** Join scale-dependent extents bottom-up, supply root or
   parent-owned allocations, and resolve `fixed` and `allocated` extents.
6. **Resolve scales and geometry.** In topological order, solve or inherit scales,
   compute intrinsic boxes, jointly solve each ready frame-local fact set, and fix
   translation gauges canonically.
7. **Resolve content-sized Frames and refs.** Apply coordinate maps needed for
   parent-facing body bounds, compute `content` extents, unblock parent Frame
   placement, and transport placed refs through their least common coordinate
   scopes.
8. **Validate.** Compute outward/world boxes, check box invariants and finite
   numbers, and return the canonical error set if any check failed.
9. **Paint.** Topologically order the independent paint program and lower the
   resolved scene to a flat display list.

No step requires executing siblings or constraint declarations in source order.
The only sequences that survive normalization are sequences the program explicitly
declares: distribute paths, grid order where coordinates are not explicit, and
paint order.

## 12. Migration checklist

The following gaps are intentionally visible rather than papered over:

- lower production `Layer` syntax into transparent frame-local fragments and add
  surface-to-kernel differential tests;
- make `Frame` `Allocation`/`Extent` tasks, scale ownership, and coordinate
  transport explicit in the executable IR;
- replace sibling-order ref scheduling with task-level dependency edges and lower
  cross-frame refs to transported placed ports;
- lower fallback child paint order to an explicit paint sequence before geometric
  child order is discarded;
- replace encounter-ordered ordinal-domain union with explicit order facts (or a
  documented canonical category order) so nested union is genuinely associative;
- bound and benchmark the scale-dependent-extent representation, then migrate
  production callers from opaque `Monotonic.unknown` cases where the closed
  algebra applies; and
- return canonical complete conflict sets rather than whichever single diagnostic
  a legacy path encounters first.

Each item should land with a counterexample that fails before the migration and a
law or differential test that remains after it. The v0 contract is complete only
when this list is empty.
