---
title: Placement Solving and the Layer Laws
section: Layout & Rendering
order: 50.2
group: Layout
status: draft
pageClass: layout-engine-article
glossary:
  title: Placement terms
  entries:
    - term: Placement fact
      definition: "A normalized anchor pin, size pin, participant, or anchor relation consumed by placement."
      href: "#term-placement-fact"
    - term: Anchor
      definition: "A named one-axis point on a box, such as start, middle, end, or baseline."
      href: "#term-anchor"
    - term: Rank-two closure
      definition: "Solving a box's two unknowns (min, size) from independent equations."
      href: "#term-rank-two-closure"
    - term: Difference graph
      definition: "A graph whose weighted edges encode equality constraints x_v - x_u = d."
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
    - term: Placed reference
      definition: "A read-only source geometry value that lowers to a constant in a local placement problem."
      href: "#term-placed-reference"
    - term: Layer
      definition: "Target transparent syntax that contributes nodes and facts to one Frame-local problem."
      href: "#term-layer"
    - term: Fragment
      definition: "The immutable node-and-fact set produced by normalizing a transparent Layer."
      href: "#term-fragment"
covers:
  - packages/gofish-graphics/src/ast/constraints/bbox.ts
  - packages/gofish-graphics/src/ast/constraints/placementFacts.ts
  - packages/gofish-graphics/src/ast/constraints/placementLowering.ts
  - packages/gofish-graphics/src/ast/constraints/placementProgramLowerer.ts
  - packages/gofish-graphics/src/ast/constraints/placementSolver.ts
  - packages/gofish-graphics/src/ast/constraints/differenceGraph.ts
  - packages/gofish-graphics/src/ast/constraints/position.ts
  - packages/gofish-graphics/src/ast/constraints/align.ts
  - packages/gofish-graphics/src/ast/constraints/distribute.ts
  - packages/gofish-graphics/src/ast/layoutKernel.ts
---

# Placement Solving and the Layer Laws

> **Layout engine series · Part 3 of 4**<br>
> [1. How the Layout Engine Works](/internals/layout/how-layout-works) ·
> [2. Frames, Scale Scopes, and Size Requests](/internals/layout/frames-scale-scopes-and-claims)
> · **3. Placement Solving and the Layer Laws** ·
> [4. References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling)

This chapter begins after scale solving has made each data-dependent box's size
sufficiently concrete. It develops the remaining one-axis placement problem from a
small box example into its complete equality-graph form, then uses that result to
state precisely when transparent Layers may be flattened or reordered.

The bridge between those topics is a <dfn id="term-placement-fact">placement
fact</dfn>: a normalized equation contributed to the Frame-local solve. If Layer
nesting preserves the same node and fact sets, placement confluence gives the same
geometry. If nesting changes scale ownership, allocation, coordinate policy, or an
explicitly ordered operand, the theorem does not apply.

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

Suppose a preceding scale solve has evaluated two boxes' data-driven widths to:

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

A transported nonlocal <dfn id="term-placed-reference">placed reference</dfn>
contributes a numeric constant $c_r$, not another writable graph variable. A
relation from that constant to a local anchor becomes a pin:

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

<Badge type="tip" text="TARGET" /> A <dfn id="term-layer">Layer</dfn> should be
transparent syntax for collecting nodes and facts inside one Frame.

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

**Proof sketch.** Normalize each transparent Layer to an immutable <dfn
id="term-fragment">Fragment</dfn> containing a node set and fact set.

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

---

> **Previous:** [Frames, Scale Scopes, and Size Requests](/internals/layout/frames-scale-scopes-and-claims)<br>
> **Next:** [References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling)
