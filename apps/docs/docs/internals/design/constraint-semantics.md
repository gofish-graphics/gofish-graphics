---
title: "A Denotational Semantics for Constraints"
section: Speculative Notes
order: 34
status: speculative
---

# A Denotational Semantics for Constraints

This note gives a **denotational semantics** for GoFish's layout constraints, in
the style of Spytial's Table 1 (Prasad et al., _Patterns for Spatial
Reasoning_): each construct is given a meaning $[\![ \cdot ]\!]$ as a
mathematical object, independent of how the engine computes it. It is the formal
companion to [[layout-synthesis]] (the two-semiring engine) and
[[constraints-as-core]] (the feasibility argument). Where those essays argue
_that_ operators reduce to constraints, this one says precisely _what a
constraint means_.

The payoff of writing it down: the meaning of a layer is the **composition** of
its constraints' denotations, and because each denotation lives in a semiring
closed under composition, the composite is always well-defined and invertible.
That is the completeness conjecture of [[layout-synthesis]], stated semantically.

## Semantic domains

A layout assigns every node $n$, on each axis $d \in \{x, y\}$, two quantities:

- an **extent** $e_d(n) \ge 0$ — its size;
- a **position** $p_d(n)$ — where its origin sits.

Neither is a free number. Extents are **claims**: monotone functions of a scale
factor $\sigma$ (pixels per data unit), drawn from the carrier

$$\mathsf{Claim} \;=\; \{\, f : \mathbb{R}_{\ge 0} \to \mathbb{R}_{\ge 0} \mid f \text{ monotone} \,\}.$$

A fixed box denotes the constant claim $\lambda\sigma.\,c$; a data value $v$
denotes $\lambda\sigma.\,v\sigma$; spacing and padding denote constant offsets.
Positions, once $\sigma$ is known, are plain reals related by **difference
constraints** $p_d(b) - p_d(a) = w$.

So the meaning of a node splits in two, matching the two passes:

$$[\![ n ]\!] \;=\; \big(\; [\![ n ]\!]^{\mathsf{size}}_d : \mathsf{Claim}, \quad [\![ n ]\!]^{\mathsf{pos}}_d : \text{a set of difference constraints} \;\big).$$

### The two semirings

Composition happens in two tropical semirings, one per quantity (see
[[layout-synthesis]] Part 2):

- **Sizes** compose in $(\max, +)$ over $\mathsf{Claim}$: series (stacking) is
  $+$, overlay (alignment) is $\max$, constants are $+\,c$, data is $\cdot\,\sigma$.
  Closed under composition, so any network folds to a single $\mathsf{Claim}$ —
  hence invertible.
- **Positions** compose in $(\min, +)$: a system of difference constraints is a
  shortest-path problem; on a forest (one anchor, no alternative paths) the
  positions are just path sums from the anchor.

$[\![ \cdot ]\!]^{\mathsf{size}}$ denotes into the first; $[\![ \cdot ]\!]^{\mathsf{pos}}$ into the second.

### The layer is the solver

A constraint is meaningless in isolation — it denotes a _contribution_ to its
enclosing **layer** $L$. The layer composes its children's claims under its
constraints' size-folds into one claim per axis, $[\![ L ]\!]^{\mathsf{size}}_d$,
then — given an allotted budget $B_d$ — solves the single unknown

$$\sigma_d \;=\; \big([\![ L ]\!]^{\mathsf{size}}_d\big)^{-1}(B_d)$$

and **evaluates**: every node's extent is $e_d(n) = [\![ n ]\!]^{\mathsf{size}}_d(\sigma_d)$.
With $\sigma$ fixed, the difference constraints $[\![ \cdot ]\!]^{\mathsf{pos}}$
become concrete and positions are read off by propagation. (This inversion is
exactly `Monotonic.inverse`; the [[monotonic]] module is the implementation of
$\mathsf{Claim}$.)

## The denotations

Below, a constraint relates a layer's ordered children $c_1 \dots c_k$. Write
$e_d(c)$ for $[\![ c ]\!]^{\mathsf{size}}_d$ (the child's own claim) and
$\mathrm{anchor}_a(c, \beta)$ for the predicate "$c$'s chosen anchor on axis $a$
sits at $\beta$" — `start`: $p_a(c)=\beta$; `end`: $p_a(c)+e_a(c)=\beta$;
`middle`: $p_a(c)+e_a(c)/2=\beta$; `baseline`: $c$'s origin $=\beta$. $s$ is
spacing, $p$ padding, $\bar d$ the cross axis.

### distribute (series on axis $d$)

$$[\![ \mathsf{distribute}_d ]\!]^{\mathsf{size}}_d \;=\; \sum_{i=1}^{k} e_d(c_i) \;+\; s\,(k-1), \qquad [\![ \cdot ]\!]^{\mathsf{size}}_{\bar d} = \text{(no contribution)}$$

$$[\![ \mathsf{distribute}_d ]\!]^{\mathsf{pos}} \;=\; \big\{\, p_d(c_{i+1}) - p_d(c_i) = e_d(c_i) + s \,\big\}_{i=1}^{k-1}$$

A series: claims add (plus the spacing constant), and positions are a chain of
difference constraints — the running-sum walk.

### align (overlay on axis $a$)

$$[\![ \mathsf{align}_a ]\!]^{\mathsf{size}}_a \;=\; \max_{i} e_a(c_i), \qquad [\![ \mathsf{align}_a ]\!]^{\mathsf{pos}} \;=\; \big\{\, \mathrm{anchor}_a(c_i, \beta) \,\big\}_{i=1}^{k}$$

for a single shared baseline $\beta$ (taken from the first pre-placed child, else
the axis fallback). Overlay: the extent is the $\max$; positions collapse all
children onto one anchor line.

### position (a pin)

$$[\![ \mathsf{position}(v) ]\!]^{\mathsf{size}}_d = \text{datum domain } \{v\}\ (\text{not an extent}), \qquad [\![ \mathsf{position}(v) ]\!]^{\mathsf{pos}} = \{\, p_d(c) = \mathrm{scale}_d(v) \,\}$$

A literal pins to a pixel; a datum $v$ pins through the axis scale. It is the
boundary case that seeds a difference-constraint forest with an absolute anchor.

### nest (unary, padding $p$)

$$[\![ \mathsf{nest}(o, i) ]\!]^{\mathsf{size}}_d \;=\; e_d(o) = e_d(i) + 2p \ (\text{inside-out}) \quad\text{or}\quad e_d(i) = e_d(o) - 2p \ (\text{outside-in})$$

$$[\![ \mathsf{nest}(o, i) ]\!]^{\mathsf{pos}} \;=\; \{\, \mathrm{center}_d(i) = \mathrm{center}_d(o) \,\}$$

A unary $+\text{constant}$ on the size side; concentric centering on the position
side. Which variable is derived is _discovered_ by which one is already
determined (the firing rule of [[layout-synthesis]] Part 3), not fixed by the
operator.

### grid (the symmetric 2-D layout)

For cells $c_{r,\gamma}$ in $R$ rows $\times$ $C$ columns (`constraints/grid.ts`):

$$[\![ \mathsf{grid} ]\!]^{\mathsf{size}}_x = \sum_{\gamma=1}^{C} \Big( \max_{r} e_x(c_{r,\gamma}) \Big) + s_x (C-1), \qquad [\![ \mathsf{grid} ]\!]^{\mathsf{size}}_y = \sum_{r=1}^{R} \Big( \max_{\gamma} e_y(c_{r,\gamma}) \Big) + s_y (R-1)$$

$$[\![ \mathsf{grid} ]\!]^{\mathsf{pos}} = \big\{\, \mathrm{center}_x(c_{r,\gamma}) = \gamma\,(w{+}s_x) + \tfrac{w}{2}, \;\; \mathrm{center}_y(c_{r,\gamma}) = r\,(h{+}s_y) + \tfrac{h}{2} \,\big\}$$

This is the **$\Sigma$-of-max** form: a track is the $\max$ (overlay) of its
cells, and the axis is the $\sum$ (series) of its tracks — $(\max, +)$ on both
axes, symmetrically. It is exactly two cross-cutting overlay-then-series folds;
that the two share the cells (a cell is in one column _and_ one row) is the
irreducible 2-D structure the `grid` constraint owns. The axes additionally
denote $\mathrm{ORDINAL}(\text{colKeys})$ / $\mathrm{ORDINAL}(\text{rowKeys})$ for
guide rendering.

> **v1 note.** The implementation specializes the equal-track case: every cell
> fills its track, so $\max_r e_x = w$ and the equation collapses to
> $W = C\,w + s_x(C-1)$, solved by box-division (`sliceExtent`). The general
> $\Sigma$-of-max (content-sized tracks) and the symbolic flex claim — so this
> prints as $C\sigma + s_x(C-1)$ — arrive with flex-as-datum (the spread fill
> story).

### overlay (a bare layer) and z-order

A layer with no size-folding constraint denotes pure overlay:

$$[\![ \mathsf{layer} ]\!]^{\mathsf{size}}_d \;=\; \max_i e_d(c_i).$$

`zAbove` / `zBelow` denote **only** a paint order — a relation $\pi(a) > \pi(b)$
on the render sequence, with no size or position contribution. They are the one
constraint outside the geometric semirings.

## Table 1: the constraints at a glance

| constraint        | size denotation $[\![ \cdot ]\!]^{\mathsf{size}}$ — $(\max, +)$      | placement denotation $[\![ \cdot ]\!]^{\mathsf{pos}}$ — $(\min, +)$ | role              |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------- |
| `distribute`      | $\sum_i e_i + s(k{-}1)$ on $d$                                       | $p_d(c_{i+1}) - p_d(c_i) = e_d(c_i) + s$                            | series            |
| `align`           | $\max_i e_i$ on $a$                                                  | $\mathrm{anchor}_a(c_i) = \beta$ (shared)                           | overlay           |
| `position(v)`     | datum domain $\{v\}$                                                 | $p_d(c) = \mathrm{scale}_d(v)$                                      | anchor / pin      |
| `nest(o,i)`       | $e(o) = e(i) + 2p$                                                   | $\mathrm{center}(i) = \mathrm{center}(o)$                           | unary $\pm$ const |
| `grid`            | $\sum_{\text{tracks}} (\max_{\text{cells}} e) + s(n{-}1)$, both axes | cell centered in its $(\text{col},\text{row})$ track                | symmetric 2-D     |
| `layer` (bare)    | $\max_i e_i$                                                         | children at own positions                                           | overlay           |
| `zAbove`/`zBelow` | —                                                                    | — (paint order $\pi(a) > \pi(b)$)                                   | z-order           |

## Why the composition is total

Read the table column-wise. Every size denotation is built from $+$, $\max$,
$\cdot\,\sigma$, and $+\,c$ — the generators of $(\max, +)$ over $\mathsf{Claim}$.
$\mathsf{Claim}$ is closed under all four and monotone throughout, so the fold of
_any_ set of these over a layer is again a single monotone $\mathsf{Claim}$; it
has a (one-unknown) inverse; the budget solve always succeeds. Every placement
denotation is a set of difference constraints; over a forest of anchors they have
a unique solution by path-sum.

That is the completeness statement of [[constraints-as-core]] made precise:

> The denotation of a layer of $\{\mathsf{distribute}, \mathsf{align},
> \mathsf{position}, \mathsf{nest}, \mathsf{grid}\}$ over children with monotone
> claims is a $(\max, +)$ claim on the size side and a difference-constraint
> forest on the position side — hence always solvable, and closed under nesting.

Operators are then just notations for particular denotations: $\mathsf{spread} =
\mathsf{align} + \mathsf{distribute}$, $\mathsf{stack} = \mathsf{distribute}$
(glue), $\mathsf{table} = \mathsf{grid}$. Two constructs sit outside the
generators but inside the language (per [[layout-synthesis]]): `z-order` (a
render-order relation, no geometry) and custom algorithmic layouts like
`treemap` (arbitrary computation that _emits_ claims, pins, and placements under
the same denotations).
