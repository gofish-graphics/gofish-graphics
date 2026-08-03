---
title: Frames, Scale Scopes, and Size Requests
section: Layout & Rendering
order: 50.1
group: Layout
status: draft
pageClass: layout-engine-article
glossary:
  title: Frame & scale terms
  entries:
    - term: Frame
      definition: "The boundary that owns a local writable placement region and declares per-axis coordinate and scale policy."
      href: "#term-frame"
    - term: Layer
      definition: "Transparent grouping that contributes nodes and facts to its enclosing Frame without opening another boundary."
      href: "#term-layer"
    - term: Allocation
      definition: "A finite pixel budget offered on one axis; an input, not necessarily the occupied result."
      href: "#term-allocation"
    - term: "Scale / σ"
      definition: "A data-to-pixel rule; σ is its pixels-per-data-unit slope."
      href: "#term-scale"
    - term: Scale scope
      definition: "Participants on one axis sharing a solved σ or anchored position map."
      href: "#term-scale-scope"
    - term: Size request
      definition: "A scale-dependent function R: ScaleFactor → PixelExtent passed upward during sizing."
      href: "#term-size-request"
    - term: Placement region
      definition: "The writable targets and facts solved jointly inside one Frame."
      href: "#term-placement-region"
    - term: Underlying space
      definition: "The pre-pixel IR for quantity kind, domain, measure, and symbolic size."
      href: "#term-underlying-space"
    - term: Measure
      definition: "A semantic unit or grouping identity used to decide compatibility, not a numeric measurement."
      href: "#term-measure"
    - term: Proposal
      definition: "A provisional pixel allocation offered to a child, not its final size."
      href: "#term-proposal"
    - term: Affine piece
      definition: "One line aσ+b with nonnegative slope inside a size request."
      href: "#term-affine-piece"
    - term: Upper envelope
      definition: "The pointwise maximum of a finite set of affine pieces and zero."
      href: "#term-upper-envelope"
    - term: Frame fit
      definition: "The policy turning a size request plus pixel allocation into a scale or a structured fit outcome."
      href: "#term-frame-fit"
    - term: Scale policy
      definition: "A Frame's per-axis choice among inherit, fit, share(id), and pixel."
      href: "#term-scale-policy"
covers:
  - packages/gofish-graphics/src/ast/graphicalOperators/frame.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/solver/scopes.ts
  - packages/gofish-graphics/src/ast/sizeRequests.ts
---

# Frames, Scale Scopes, and Size Requests

> **Layout engine series · Part 2 of 4**<br>
> [1. How the Layout Engine Works](/internals/layout/how-layout-works) · **2. Frames, Scale Scopes, and Size Requests** · [3. Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws) · [4. References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling)

This article is the scale-and-size deep dive in the layout-engine series. It
starts from the same small scenegraph used by the overview:

```text
Frame R (Cartesian)
└─ Layer
   ├─ Frame P (polar)
   │  └─ Layer(p, q; distribute(p, q))
   ├─ connector(ref(p.point), ref(q.point))
   └─ label(ref(q.point))
```

A <dfn id="term-frame">Frame</dfn> owns a writable placement region and
declares coordinate and scale policy. A <dfn id="term-layer">Layer</dfn> is
transparent grouping inside that region. An
<dfn id="term-allocation">allocation</dfn> is a finite pixel budget offered
on one axis; it is an input, not necessarily the occupied result.

A <dfn id="term-scale">scale</dfn> maps semantic units to pixels. The
participants that share one solved scale on an axis form a
<dfn id="term-scale-scope">scale scope</dfn>. Before pixels are chosen, an
<dfn id="term-underlying-space">underlying space</dfn> records the quantity
kind, domain, measure, and symbolic size. Its symbolic size is a
<span id="term-claim"></span><dfn id="term-size-request">scale-dependent size
request</dfn>: a function from scale factor to requested pixel extent. Earlier
drafts called this object a “claim.”

The page first separates structural containment from writable placement and
scale ownership. It then identifies the production mechanisms that currently
cooperate inside layout, derives a closed algebra for size requests, and states the
remaining policy choices for fitting a Frame.

## A Frame seals a Layer body

The shortest useful model is close to “Frame = Layer + scope boundary,” with one
qualification: a Frame declares several policies, while an actual scale scope is
_derived_ from one of those policies.

```ts
type NodeId = string;
type FrameId = NodeId;
type ScaleId = string;
type PixelExtent = number; // finite, non-negative pixels

interface Fragment {
  nodes: Map<NodeId, LocalNode>;
  facts: Set<LocalFact>;
}

interface NormResult {
  fragment: Fragment; // contribution to the current owner
  frames: Map<FrameId, FrameIR>; // sealed child Frames, including descendants
}

type ExtentPolicy =
  | { kind: "fixed"; px: PixelExtent }
  | { kind: "allocated" }
  | { kind: "auto"; inset?: { before: PixelExtent; after: PixelExtent } };

type ScalePolicy =
  | { kind: "inherit" }
  | { kind: "fit" }
  | { kind: "share"; id: ScaleId }
  | { kind: "pixel" };

interface FrameIR {
  id: FrameId;
  parent?: FrameId;
  shell: FrameShell; // one placeable box in the parent Frame
  body: Fragment; // the local writable region
  coordToParent: CoordinateMap;
  extent: readonly [ExtentPolicy, ExtentPolicy];
  scale: readonly [ScalePolicy, ScalePolicy];
}
```

A normalization step always returns a `NormResult`; a Layer and a Frame do not
silently change its result type. In the equations below, write that record as a
pair $(f,\mathcal H)$. Results combine componentwise:

$$
(f_1,\mathcal H_1)\oplus(f_2,\mathcal H_2)
=
(f_1\sqcup f_2,\mathcal H_1\uplus\mathcal H_2),
\qquad
\operatorname{lift}(f)=(f,\varnothing).
$$

Here $\sqcup$ joins Fragment node and fact sets. The symbol $\uplus$ is disjoint
map union: two entries with the same stable `FrameId` are a normalization error.
A Layer combines complete results inside the current owner $F$:

$$
\operatorname{norm}_F(\operatorname{Layer}(X;D))
=\bigoplus_{x\in X}\operatorname{norm}_F(x)
 \oplus\operatorname{lift}(\operatorname{lower}_F(D)).
$$

A Frame instead binds its body to a fresh owner $G$, while contributing only
$\operatorname{shellFragment}_F(G):\operatorname{Fragment}$ to its parent $F$.
If $\operatorname{frameIR}(G,F,P,b):\operatorname{FrameIR}$ seals body fragment
$b$ with boundary policy bundle $P$, then:

$$
\begin{gathered}
(b,\mathcal H)=\operatorname{norm}_G(B),\\
\operatorname{norm}_F(\operatorname{Frame}_P(B))
=\left(\operatorname{shellFragment}_F(G),
  \mathcal H\uplus
  \{G\mapsto\operatorname{frameIR}(G,F,P,b)\}\right).
\end{gathered}
$$

That boundary creates four things:

1. a fresh writable placement region;
2. a coordinate-context identity, even when the map is Cartesian identity;
3. an allocated shell that the parent may size and place; and
4. one scale-policy declaration per axis.

The policy then determines scale identity. `fit` creates a local scale;
`inherit` reuses an ancestor scale; `share(id)` can connect structurally
nonlocal Frames; and `pixel` has no data scale. Coordinate contexts therefore
follow the Frame tree, while scale scopes need not.

<Badge type="info" text="AS BUILT" /> Production makes the overlap literal:
`Frame(...)` immediately returns either a `coord` node or a `layer` node. A
production Layer is still boxed and may solve local scales, plan proposals,
place children, and fold bounds. The explicit `FrameIR`/transparent `Fragment`
split above is the normalization target, not the current carrier type.

## A scenegraph subtree is not a placement region

The recap above has Cartesian outer Frame $R$ and polar inner Frame $P$.

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

Step through size request, placement, reference transport, and paint in the figure.

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
| Underlying-space fold  | Mark encodings, operators, constraint typing        | Measures, domains, and symbolic size requests       |
| Scope registry         | A size request or data interval plus an allocation  | A scalar $\sigma$ or affine position map            |
| Proposal planners      | Grid tracks, distributes, nests, and allocations    | Child size proposals and some dependency order      |
| Rank-two box closure   | Strong equations over `(min, size)`                 | Determined sizes and positions                      |
| Difference graph       | Fixed-size anchors, relations, and pins             | Relative positions, component gauges, and conflicts |
| Bake, lower, and paint | Placed geometry, coordinate scopes, and paint edges | Display-list primitives and SVG                     |

A <dfn id="term-proposal">proposal</dfn> is a provisional pixel allocation a
parent planner offers a child during recursive production layout. It is neither
the child's final size nor a placement fact.

A surface constraint can participate in more than one mechanism.

For example, `distribute` can combine child size requests as a sum during
underlying-space resolution, divide an allocation into child proposals, and
produce difference equations during placement.

This reuse is powerful, but it makes the current `Layer` responsible for several
semantically different jobs.

### Underlying space describes a quantity, not its pixels

Per axis, production records this TypeScript union:

```ts
type UnderlyingSpace = ContinuousSpace | OrdinalSpace | UndefinedSpace;

interface ContinuousSpace {
  kind: "continuous";
  width: Monotonic; // the scale-dependent size request, as built
  dataDomain: Interval | "delta" | undefined;
  measure?: Measure | MixedMeasure;
  spacing?: number;
  coordinateTransform?: CoordinateTransform;
}

interface OrdinalSpace {
  kind: "ordinal";
  domain?: string[];
  measure?: Measure | MixedMeasure;
}

interface UndefinedSpace {
  kind: "undefined";
}
```

The <dfn id="term-measure">measure</dfn> field is a semantic unit or grouping
identity used to decide whether spaces and scales are compatible. It is not a
numeric measurement, text measurement, or the legacy `GoFishRef.measure()`
method.

The `dataDomain` distinguishes an unanchored magnitude, an anchored data-position
space, and a space where only differences are meaningful.

This intermediate representation says what kind of quantity is present and how
much room it requests as a function of scale.

It does not yet contain final pixel geometry.

See [Underlying Space](/internals/core/underlying-space) for the complete current
representation.

### Where the size request lives

There are currently two representations, and they are not yet wired together.

<Badge type="info" text="AS BUILT" /> Each `GoFishNode` memoizes two
`UnderlyingSpace` values in `_underlyingSpace`, one per axis. For a continuous
axis, the size request is the `width: Monotonic` field above. Marks construct it,
Layers fold child widths, and a scale root passes the folded value plus its
allocation to `ScopeRegistry.solveSize()`.

<Badge type="tip" text="TARGET" /> The executable reference kernel uses a
smaller, inspectable representation:

```ts
type ScaleFactor = number; // pixels per data unit
type PixelExtent = number; // pixels

interface AffineExtent {
  slope: number; // data units
  intercept: number; // fixed pixels
}

interface SizeRequest {
  pieces: readonly AffineExtent[];
}

declare function requestedExtentAt(
  request: SizeRequest,
  scale: ScaleFactor
): PixelExtent;

declare function fitSizeRequest(
  request: SizeRequest,
  allocation: PixelExtent
): FitResult;
```

The representation is stored in `sizeRequests.ts`. It is still a reference
algebra: production's `ContinuousSpace.width` remains the more permissive
`Monotonic` type.

The complete lifecycle on one axis is:

| Stage                          | Concrete location                              | Value                                           |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Leaf contribution              | `mark.resolveUnderlyingSpace()`                | a `Monotonic` such as $2\sigma$                 |
| Per-node memo                  | `node._underlyingSpace[axis]`                  | `ContinuousSpace.width`                         |
| Transparent combination target | Frame-local Fragment fold                      | one `SizeRequest` per compatible scale identity |
| Scale solve                    | `ScopeRegistry.solveSize(request, allocation)` | $\sigma$                                        |
| Downward layout                | `AxisScale` passed to `mark.layout()`          | concrete pixel extent                           |

A literal fixed-pixel mark currently reports `undefined`, not a constant request,
so production does not yet implement every case expressible by `SizeRequest`.
That is an incomplete semantic case, not something the article should hide.

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

## Size requests and the Frame-fit question

Use the following typed notation throughout this section. In particular,
$\sigma$ is not an untyped number:

| Symbol     | Mathematical type                                           | Meaning                                   | Units                   |
| ---------- | ----------------------------------------------------------- | ----------------------------------------- | ----------------------- |
| $S$        | `ScaleId`                                                   | one compatible scale identity on one axis | —                       |
| $\sigma_S$ | $\operatorname{ScaleFactor}_S=\mathbb R_{\ge0}$             | scale chosen for $S$                      | $\mathrm{px}/u_S$       |
| $R_n$      | $\operatorname{ScaleFactor}_S\to\operatorname{PixelExtent}$ | size request contributed by node $n$      | output in $\mathrm{px}$ |
| $B$        | $\operatorname{PixelExtent}=\mathbb R_{\ge0}$               | allocation offered by the Frame           | $\mathrm{px}$           |

Thus $R_n(\sigma_S)$ is the pixel extent requested by $n$ when one data unit
$u_S$ receives $\sigma_S$ pixels.

### Concrete: which overlaid child is widest?

Consider two children occupying the same region:

$$
R_1(\sigma)=40\sigma,
\qquad
R_2(\sigma)=10\sigma+50.
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
R(\sigma)=\max(40\sigma,10\sigma+50).
$$

The faint lines in the explorer are the constituent affine pieces. The solid line
is their upper envelope: the actual size request seen by the parent.

::: gofish example:internal-layout-size-request-lab hidden
:::

### Abstracting the pattern: one variable, one upper envelope

Fix one axis and one scale identity $S$. Every participating leaf contributes a
size request tagged with compatible axis semantics and a compatible measure. A
node that has no request contributes $\bot$, not the zero function; that distinction matters
for fill and proposal policies.

Within one valid scale scope, every real request depends on the same unknown
$\sigma_S$. Written as type declarations, the notation above is:

$$
\begin{aligned}
\sigma_S &\in \operatorname{ScaleFactor}_S
  = \mathbb R_{\ge0}\;[\mathrm{px}/u_S],\\
R_n &: \operatorname{ScaleFactor}_S
  \longrightarrow \operatorname{PixelExtent}
  = \mathbb R_{\ge0}\;[\mathrm{px}].
\end{aligned}
$$

The closed target language of such functions is:

$$
\mathcal K_S
=
\left\{
R:\operatorname{ScaleFactor}_S\to\operatorname{PixelExtent}
\;\middle|\;
R(\sigma)=\max(0,a_1\sigma+b_1,\ldots,a_n\sigma+b_n),\ a_i\ge0
\right\}.
$$

The coefficients carry units: $a_i$ is in data units $u_S$, $b_i$ is in
pixels, and therefore $a_i\sigma+b_i$ is a pixel extent.

An <dfn id="term-affine-piece">affine piece</dfn> is one line
$a_i\sigma+b_i$ with nonnegative slope and finite intercept. The implicit zero
piece floors physical extents at zero; the other intercepts need not be positive.

The <dfn id="term-upper-envelope">upper envelope</dfn> is their pointwise
maximum. It is finite, nonnegative, continuous, nondecreasing, convex, and
piecewise linear.

The author-facing size problem can be written as an expression:

$$
e ::= R_n
\mid e\vee e
\mid e+e
\mid ke
\mid [e+c]_+,
\qquad k\ge0.
$$

Overlay uses $\vee=\max$, series layout uses $+$, scalar sizing uses $ke$, and
fixed padding or gaps shift the intercept. Evaluating the expression bottom-up
eliminates every intermediate size variable:

$$
R_S=\operatorname{eval}(e_S),
\qquad
\operatorname{FitSizeRequest}(R_S,B_S)\rightsquigarrow\sigma_S,
\qquad
s_n=R_n(\sigma_S).
$$

Equivalently, the larger system

$$
\begin{aligned}
s_{\mathrm{overlay}}&=\max_i s_i,\\
s_{\mathrm{series}}&=\sum_i s_i+\sum_i g_i,\\
s_{\mathrm{outer}}&=s_{\mathrm{inner}}+2p,\\
s_n&=R_n(\sigma_S),\\
s_{\mathrm{root}}&=B_S
\end{aligned}
$$

compiles to the single per-scope equation $R_S(\sigma_S)=B_S$. This is the
whole size-request reduction: first build one symbolic function, then solve its one
scale unknown, then evaluate the leaves.

The one-variable qualification is essential. If two children actually use
different scale identities, their parent has a multivariate expression such as
$R(\sigma_\mu,\sigma_\nu)$. The engine must split the scopes, inherit or pin one
scale, or declare an explicit shared solve. Calling a one-dimensional inverse on
that expression would be a semantic error.

### Canonical size-request representation

Let $P_R=\{(a_i,b_i)\}$ be a finite piece set and write:

$$
\operatorname{Env}(P_R)(\sigma)
=
\max\!\left(0,\max_{(a,b)\in P_R}(a\sigma+b)\right).
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

If $R=\operatorname{Env}(P)$ and $S=\operatorname{Env}(Q)$, overlay is piece
union followed by canonicalization:

$$
R\vee S
=
\operatorname{Env}(P\cup Q).
$$

Series composition is the pairwise sum of pieces followed by canonicalization:

$$
R+S+g
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
R(\sigma)=\max(3\sigma+12,5\sigma+2).
$$

At budget $B=27$ the two candidate upper bounds are $5$ and $5$, so
$\sigma=5$ and $10+15+2=27$ pixels.

Compatible size requests are requests whose measures, quantity meanings, axis,
and scale identity allow them to participate in one solve. For compatible
requests, overlay
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

These are laws of the denoted functions over exact real arithmetic. The
TypeScript experiment stores coefficients as JavaScript `number`s, so decimal
reordering can produce distinct bit patterns such as `0.6` and
`0.6000000000000001`. Its tests distinguish the exact mathematical law from the
implementation policy: exactly representable examples use structural equality,
while counterexamples evaluate selected points within an explicit relative
tolerance. Canonical object equality is therefore not a floating-point confluence
theorem, and a production approximate-equivalence procedure remains future work.

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

<Badge type="info" text="THEOREM" /> Folding a fixed multiset of compatible size-request
operands is independent of traversal order and parenthesization, and evaluating
after the fold equals composing already-evaluated extents.

This does not make an explicitly ordered distribute path geometrically
reorderable. It only says its total series request is insensitive to how the same
operands are folded.

Production's general [Monotonic module](/internals/core/monotonic) represents a
broader language, including opaque functions and numeric inversion. The
reference `sizeRequests.ts` deliberately uses this smaller closed fragment so
canonicalization, exact fitting, and algebraic laws remain inspectable.

### Fit is a policy over the envelope

A <dfn id="term-frame-fit">Frame-fit policy</dfn> turns a size request $R$ and finite
allocation $B$ into a scale or a structured outcome. Define:

$$
m=R(0),
\qquad
\mathsf{Feasible}_B(R)=\{\sigma\ge0\mid R(\sigma)\le B\},
\qquad
\mathsf{Exact}_B(R)=\{\sigma\ge0\mid R(\sigma)=B\}.
$$

Because $R$ is an upper envelope, $R(\sigma)\le B$ exactly when every piece is
at most $B$. If $B\ge m$ and at least one piece grows, then:

$$
\mathsf{Feasible}_B(R)=[0,u_B],
\qquad
u_B
=
\min_{i:a_i>0}\frac{B-b_i}{a_i}.
$$

That gives the complete classification:

- If $B<m$, no scale fits: `overflow`, with deficit $m-B$.
- If $R$ grows and $B>m$, $\mathsf{Exact}_B(R)=\{u_B\}$: one exact scale.
- If $B=m$ and growth begins immediately, the exact scale is $0$.
- If $B=m$ and $R$ begins with a plateau, $\mathsf{Exact}_B(R)$ is an interval:
  `underdetermined`.
- If $R$ is constant and $B=m$, every $\sigma$ is a solution:
  `underdetermined`.
- If $R$ is constant and $B>m$, equality has no solution and every scale is
  feasible: `slack`, with $B-m$ unused pixels.

The executable `fitSizeRequest()` experiment reports a plateau as underdetermined and
records its canonical least solution, $\sigma=0$. A greatest-feasible policy
would instead choose $u_B$ when it is finite. That choice belongs to Frame policy,
not to the size-request algebra.

For several participants sharing one scale, the general constraint is:

$$
\mathsf{Feasible}_{\mathrm{shared}}
=
\bigcap_k \mathsf{Feasible}_{B_k}(R_k).
$$

When every participant uses the same allocation, this is equivalent to fitting
$\bigvee_k R_k$ once. With distinct budgets, the intersection form makes the
shared unknown and every participant's obligation explicit.

Finally, $\bot$ is not the zero request. A true zero request participates but
cannot determine a local scale. A fill child with no request introduces another
allocation unknown. For requesting children $N$ and fill children $F$, the
series equation is:

$$
B
=
R_N(\sigma)+\text{gaps}+\sum_{j\in F}f_j.
$$

Choosing equal fill, minimum fill, or a scale before fill is an explicit proposal
policy. It cannot be recovered by pretending every $\bot$ was $R(\sigma)=0$.

### Frame declares scale policy

<Badge type="info" text="AS BUILT" /> The current `Frame` operator is not yet a
semantic allocation boundary.

With a coordinate system it delegates to that coordinate operator.

Without one it delegates to `Layer`.

<Badge type="tip" text="TARGET" /> A normalized Frame should be the only construct
that declares shell extent policy or opens a coordinate or positional-scale
boundary.

It should carry the explicit per-axis
<dfn id="term-scale-policy">`ScalePolicy`</dfn> defined in the opening `FrameIR`:

- `inherit` reuses an accessible parent scale.
- `fit` solves a local scale from a finite allocation and a child size request.
- `share(id)` contributes to one explicitly owned shared scale.
- `pixel` says the axis is already expressed in local geometric units.

<Badge type="warning" text="OPEN DECISION" /> The algebra now distinguishes the
fit outcomes, but a normalized Frame still needs explicit behavior for them:

- An empty feasible set means unavoidable overflow, but the Frame must decide
  whether that is an error or an explicitly requested clip.
- A finite plateau can remain underdetermined or use an explicitly named endpoint
  policy; it must not look like a unique inverse.
- An unbounded feasible set means a constant-only request did not determine a scale;
  it must not invent an arbitrary $\sigma$.
- Unused pixels are slack, and centering or edge-seating that slack is a placement
  policy rather than part of scale inversion.
- A shared scale needs one explicit owner, compatible participants, and an
  order-independent interpretation of distinct participant budgets.

---

> **Previous:** [How the Layout Engine Works](/internals/layout/how-layout-works)<br>
> **Next:** [Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)
