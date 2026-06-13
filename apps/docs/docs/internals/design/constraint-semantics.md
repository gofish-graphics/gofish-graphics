---
title: "A Denotational Semantics for Constraints"
section: Speculative Notes
order: 34
status: speculative
---

# A Denotational Semantics for Constraints

This note gives a **denotational semantics** for GoFish's layout constraints, in
the style of Spytial's Table 1 (Prasad et al., _Patterns for Spatial
Reasoning_): each construct is given a meaning `⟦·⟧` as a mathematical object,
independent of how the engine computes it. It is the formal companion to
[[layout-synthesis]] (the two-semiring engine) and [[constraints-as-core]] (the
feasibility argument). Where those essays argue _that_ operators reduce to
constraints, this one says precisely _what a constraint means_.

The payoff of writing it down: the meaning of a layer is the **composition** of
its constraints' denotations, and because each denotation lives in a semiring
closed under composition, the composite is always well-defined and invertible.
That is the completeness conjecture of [[layout-synthesis]], stated semantically.

(Equations are ASCII, matching [[layout-synthesis]]; `σ` is the scale factor.)

## Semantic domains

A layout assigns every node `n`, on each axis `d ∈ {x, y}`, two quantities:

- an **extent** `e_d(n) ≥ 0` — its size;
- a **position** `p_d(n)` — where its origin sits.

Neither is a free number. Extents are **claims**: monotone functions of a scale
factor `σ` (pixels per data unit), drawn from the carrier

```
Claim  =  { f : ℝ≥0 → ℝ≥0  |  f monotone }
```

A fixed box denotes the constant claim `λσ. c`; a data value `v` denotes
`λσ. v·σ`; spacing and padding denote constant offsets. Positions, once `σ` is
known, are plain reals related by **difference constraints** `p_d(b) − p_d(a) = w`.

So the meaning of a node splits in two, matching the two passes:

```
⟦n⟧  =  (  ⟦n⟧ˢⁱᶻᵉ_d : Claim ,   ⟦n⟧ᵖᵒˢ_d : a set of difference constraints  )
```

### The two semirings

Composition happens in two tropical semirings, one per quantity (see
[[layout-synthesis]] Part 2):

- **Sizes** compose in **(max, +)** over `Claim`: series (stacking) is `+`,
  overlay (alignment) is `max`, constants are `+c`, data is `·σ`. Closed under
  composition, so any network folds to a single `Claim` — hence invertible.
- **Positions** compose in **(min, +)**: a system of difference constraints is a
  shortest-path problem; on a forest (one anchor, no alternative paths) the
  positions are just path sums from the anchor.

`⟦·⟧ˢⁱᶻᵉ` denotes into the first; `⟦·⟧ᵖᵒˢ` into the second.

### The layer is the solver

A constraint is meaningless in isolation — it denotes a _contribution_ to its
enclosing **layer** `L`. The layer composes its children's claims under its
constraints' size-folds into one claim per axis, `⟦L⟧ˢⁱᶻᵉ_d`, then — given an
allotted budget `B_d` — solves the single unknown

```
σ_d  =  (⟦L⟧ˢⁱᶻᵉ_d)⁻¹ (B_d)
```

and **evaluates**: every node's extent is `e_d(n) = ⟦n⟧ˢⁱᶻᵉ_d(σ_d)`. With `σ`
fixed, the difference constraints `⟦·⟧ᵖᵒˢ` become concrete and positions are read
off by propagation. (This inversion is exactly `Monotonic.inverse`; the
[[monotonic]] module is the implementation of `Claim`.)

## The denotations

Below, a constraint relates a layer's ordered children `c₁ … c_k`. Write `e_d(c)`
for `⟦c⟧ˢⁱᶻᵉ_d` (the child's own claim) and `anchor_a(c, β)` for the predicate
"`c`'s chosen anchor on axis `a` sits at `β`" — `start`: `p_a(c)=β`; `end`:
`p_a(c)+e_a(c)=β`; `middle`: `p_a(c)+e_a(c)/2=β`; `baseline`: `c`'s origin `=β`.
`s` is spacing, `p` padding, `d̄` the cross axis.

### distribute (series on axis `d`)

```
⟦distributeₔ⟧ˢⁱᶻᵉ_d  =  Σᵢ e_d(cᵢ)  +  s·(k−1)          ⟦·⟧ˢⁱᶻᵉ_d̄ = (no contribution)

⟦distributeₔ⟧ᵖᵒˢ     =  { p_d(cᵢ₊₁) − p_d(cᵢ) = e_d(cᵢ) + s }   for i = 1 … k−1
```

A series: claims add (plus the spacing constant), and positions are a chain of
difference constraints — the running-sum walk.

### align (overlay on axis `a`)

```
⟦alignₐ⟧ˢⁱᶻᵉ_a  =  maxᵢ e_a(cᵢ)          ⟦alignₐ⟧ᵖᵒˢ  =  { anchor_a(cᵢ, β) }   for i = 1 … k
```

for a single shared baseline `β` (taken from the first pre-placed child, else the
axis fallback). Overlay: the extent is the `max`; positions collapse all children
onto one anchor line.

### position (a pin)

```
⟦position(v)⟧ˢⁱᶻᵉ_d  =  contributes the datum domain {v}, not an extent
⟦position(v)⟧ᵖᵒˢ     =  { p_d(c) = scale_d(v) }
```

A literal pins to a pixel; a datum `v` pins through the axis scale. It is the
boundary case that seeds a difference-constraint forest with an absolute anchor.

### nest (unary, padding `p`)

```
⟦nest(o,i)⟧ˢⁱᶻᵉ_d  =  e_d(o) = e_d(i) + 2p   (inside-out)
                  or  e_d(i) = e_d(o) − 2p   (outside-in)
⟦nest(o,i)⟧ᵖᵒˢ     =  { center_d(i) = center_d(o) }
```

A unary `+constant` on the size side; concentric centering on the position side.
Which variable is derived is _discovered_ by which one is already determined (the
firing rule of [[layout-synthesis]] Part 3), not fixed by the operator.

### grid (the symmetric 2-D layout)

For cells `c_{r,γ}` in `R` rows × `C` columns (`constraints/grid.ts`):

```
⟦grid⟧ˢⁱᶻᵉ_x  =  Σ_γ ( max_r e_x(c_{r,γ}) )  +  s_x·(C−1)
⟦grid⟧ˢⁱᶻᵉ_y  =  Σ_r ( max_γ e_y(c_{r,γ}) )  +  s_y·(R−1)

⟦grid⟧ᵖᵒˢ    =  { center_x(c_{r,γ}) = γ·(w+s_x) + w/2 ,
                  center_y(c_{r,γ}) = r·(h+s_y) + h/2 }
```

This is the **Σ-of-max** form: a track is the `max` (overlay) of its cells, and
the axis is the `+` (series) of its tracks — `(max, +)` on both axes,
symmetrically. It is exactly two cross-cutting overlay-then-series folds; that
the two share the cells (a cell is in one column _and_ one row) is the
irreducible 2-D structure the `grid` constraint owns. The axes additionally
denote `ORDINAL(colKeys)` / `ORDINAL(rowKeys)` for guide rendering.

> **v1 note.** The implementation specializes the equal-track case: every cell
> fills its track, so `max_r e_x = w` and the equation collapses to
> `W = C·w + s_x·(C−1)`, solved by box-division (`sliceExtent`). The general
> Σ-of-max (content-sized tracks) and the symbolic flex claim — so this prints as
> `C·σ + s_x·(C−1)` — arrive with flex-as-datum (the spread fill story).

### overlay (a bare layer) and z-order

A layer with no size-folding constraint denotes pure overlay:

```
⟦layer⟧ˢⁱᶻᵉ_d  =  maxᵢ e_d(cᵢ)
```

`zAbove` / `zBelow` denote **only** a paint order — a relation `π(a) > π(b)` on
the render sequence, with no size or position contribution. They are the one
constraint outside the geometric semirings.

## Table 1: the constraints at a glance

| constraint        | size denotation `⟦·⟧ˢⁱᶻᵉ` — (max, +)         | placement denotation `⟦·⟧ᵖᵒˢ` — (min, +) | role          |
| ----------------- | -------------------------------------------- | ---------------------------------------- | ------------- |
| `distributeₔ`     | `Σ eᵢ + s(k−1)` on `d`                       | `p_d(cᵢ₊₁) − p_d(cᵢ) = e_d(cᵢ) + s`      | series        |
| `alignₐ`          | `maxᵢ eᵢ` on `a`                             | `anchor_a(cᵢ) = β` (shared)              | overlay       |
| `position(v)`     | datum domain `{v}`                           | `p_d(c) = scale_d(v)`                    | anchor / pin  |
| `nest(o,i)`       | `e(o) = e(i) + 2p`                           | `center(i) = center(o)`                  | unary ± const |
| `grid`            | `Σ_tracks (max_cells e) + s(n−1)`, both axes | cell centered in its `(col,row)` track   | symmetric 2-D |
| `layer` (bare)    | `maxᵢ eᵢ`                                    | children at own positions                | overlay       |
| `zAbove`/`zBelow` | —                                            | — (paint order `π(a) > π(b)`)            | z-order       |

## Why the composition is total

Read the table column-wise. Every size denotation is built from `+`, `max`, `·σ`,
and `+c` — the generators of `(max, +)` over `Claim`. `Claim` is closed under all
four and monotone throughout, so the fold of _any_ set of these over a layer is
again a single monotone `Claim`; it has a (one-unknown) inverse; the budget solve
always succeeds. Every placement denotation is a set of difference constraints;
over a forest of anchors they have a unique solution by path-sum.

That is the completeness statement of [[constraints-as-core]] made precise:

> The denotation of a layer of `{distribute, align, position, nest, grid}` over
> children with monotone claims is a `(max, +)` claim on the size side and a
> difference-constraint forest on the position side — hence always solvable, and
> closed under nesting.

Operators are then just notations for particular denotations: `spread = align +
distribute`, `stack = distribute(glue)`, `table = grid`. Two constructs sit
outside the generators but inside the language (per [[layout-synthesis]]):
`z-order` (a render-order relation, no geometry) and custom algorithmic layouts
like `treemap` (arbitrary computation that _emits_ claims, pins, and placements
under the same denotations).
