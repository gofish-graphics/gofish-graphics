---
title: Frames, Scale Scopes, and Size Claims
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
    - term: Claim
      definition: "A symbolic C(σ) giving the pixel extent requested at scale σ."
      href: "#term-claim"
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
      definition: "One line aσ+b with nonnegative slope inside a claim."
      href: "#term-affine-piece"
    - term: Upper envelope
      definition: "The pointwise maximum of a finite set of affine pieces and zero."
      href: "#term-upper-envelope"
    - term: Frame fit
      definition: "The policy turning a claim plus pixel budget into a scale or a structured fit outcome."
      href: "#term-frame-fit"
    - term: Scale policy
      definition: "A Frame's per-axis choice among inherit, fit, share(id), and pixel."
      href: "#term-scale-policy"
covers:
  - packages/gofish-graphics/src/ast/graphicalOperators/frame.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/solver/scopes.ts
  - packages/gofish-graphics/src/ast/layoutClaims.ts
---

# Frames, Scale Scopes, and Size Claims

> **Layout engine series · Part 2 of 4**<br>
> [1. How the Layout Engine Works](/internals/layout/how-layout-works) · **2. Frames, Scale Scopes, and Size Claims** · [3. Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws) · [4. References, Coordinate Transport, and Scheduling](/internals/layout/references-coordinates-and-scheduling)

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
<dfn id="term-claim">claim</dfn> $C(\sigma)$: the extent requested at scale
$\sigma$.

The page first separates structural containment from writable placement and
scale ownership. It then identifies the production mechanisms that currently
cooperate inside layout, derives a closed algebra for claims, and states the
remaining policy choices for fitting a Frame.

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

---

> **Previous:** [How the Layout Engine Works](/internals/layout/how-layout-works)<br>
> **Next:** [Placement Solving and the Layer Laws](/internals/layout/placement-and-layer-laws)
