---
title: "Collapsing the Two Passes: One Propagation, Printable Equations"
section: Speculative Notes
order: 34
status: speculative
---

# Collapsing the Two Passes: One Propagation, Printable Equations

**Claim.** GoFish's layout core is two passes — a max-plus **fold** that solves
the scale factor σ from size claims, then a separate **placement** walk that
positions things once σ is known. Most of the engine's apparent complexity is
the seam between them: a zoo of placement modes (distribute's edge/center walk,
align's anchor walk, position's write-once pin, span's two-edge stamp, nest's
and contain's 2-of-3 arithmetic), each a bespoke way to write a child's
geometry. Replace the whole thing with **one model** — a per-node, per-axis
ledger of facet equations whose values are σ-affine `Monotonic`s, solved by
single-assignment propagation — and that zoo collapses into "emit equations,
then propagate." The payoff is not fewer lines; it is **uniformity** (one
mechanism to reason about) and **printable equations** (every facet is a
`max(aσ+b, …)` you can read off), and it makes a placed thing's extent feed back
into the scale solve so labels stop overhanging.

This note records the target, what genuinely collapses, the three couplings that
deliberately _don't_, the one open fork, and a staged path. It is the
end-state [[size-claims]] designs the ownership for and [[layout-synthesis]]
frames the algebra for; the linsys bbox ([[underlying-space]], #39) is its seed.

## The model

A node owns, per axis, a **ledger of facet equations**. The facets are
`min`/`max`/`center`/`size`; the unknowns per axis are `(min, size)` (the other
two are affine in those — `max = min + size`, `center = min + size/2`). Equations
come from three places:

1. **Owned affine relations** — the `max = min + size` family. Already the
   bbox's `COEFFS`.
2. **Constraints, as equation emitters** rather than placement walks (table
   below).
3. **The scope's σ** — the one unknown closed when a scope's content claim meets
   its allotted pixels. A facet's value may be a `Monotonic` in σ (a bar's
   `size = count·σ`), not just a number.

Layout is then **single-assignment propagation**: seed the known facets, derive
whatever a rank-2 fact determines, and when a scope closes, fold its children's
**edges** (`position + size`, σ-affine) into the scope's σ-claim, invert once,
back-substitute. Over- and under-determination are named reports, not silent
last-writer-wins (the [[size-claims]] ownership rule, generalized from positions
to all facets).

## What collapses

The placement-time mode zoo becomes "add facet equations; let the solver place."
These stop being separate code paths:

| today (a bespoke placement)                               | unified (a facet equation)                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `distribute` edge-walk vs center-walk                     | difference constraint on the `min`-chain vs the `center`-chain     |
| `align` anchor walk                                       | equality on the chosen facet between siblings                      |
| `position` pin (write-once `place()`)                     | one owned facet equation                                           |
| `span` two edges + `setExtent` rank-1/rank-2 dispatch     | add facets; rank 2 ⇒ `size` falls out (the bbox already does this) |
| `nest` 2-of-3, `contain` 2-of-3                           | the same rank-2 solve, not bespoke arithmetic                      |
| pass-1 SIZE fold **and** pass-2 placement                 | one propagation                                                    |
| `align`'s SIZE→POSITION conversion (makes the count axis) | read the axis domain off the resolved facets                       |

Most `apply*` functions, the `setExtent` rank dispatch, and the two-pass
structure fuse into one solver. Edge-vs-center survives only as _which facet the
difference constraint relates_ — a parameter, not a branch.

And because every facet is a `Monotonic`, the equations are **printable**:
`bar.size = 30σ`, `label.min = 30σ + 10`, `plot.size = max(30σ + 10 + th, …)`.
That is the readability win [[layout-synthesis]] calls for, and the reason to
keep `Monotonic` structure-preserving (#568) rather than collapsing maxima into
opaque closures.

## What deliberately does _not_ collapse

Three couplings are irreducibly non-local. They are **accepted as explicit
overlays** on the per-axis propagation — keeping them separate is the point, not
a wart:

1. **σ is per-_scope_, cross-child.** It is not a per-node facet; it is solved
   when a scope (a `sharedScale` boundary) closes, by inverting the max-plus
   fold of that scope's content edges. The scope concept stays; σ is a special
   unknown the propagation pauses to solve. This is where fold and ledger meet.
2. **Aspect ratio is cross-axis.** `size_y = r · size_x` couples the two
   per-axis systems — the one place per-axis decomposition breaks. It rides on
   top as a single cross-axis equation (circles/images/waffle), not as part of
   either axis's propagation.
3. **Measure / scale kind stays.** A SIZE-in-σ and a data-POSITION are placed by
   the same propagation, but they remain different _kinds_ for axis rendering
   and unit-checking ([[underlying-space]]). `UnderlyingSpace` doesn't vanish; it
   stops driving the placement walk.

These three are exactly the structure that makes GoFish charts, not just
diagrams: a diagram solver (Bluefish) needs none of them. Carrying them as named
overlays — rather than dissolving them — is what keeps scales, shared scopes,
and aspect locks first-class.

## The one open fork

**Override / authority.** A pie glyph (placed by a polar coordinate transform)
and a scatter glyph (self-placed in a linear frame) both emit a `position` facet
owned by `"layout"`. A parent pin must override the scatter one and must _not_
override the polar one — and owner identity alone can't tell them apart, which is
why the current `override` flag is a per-call opt-in (and is **genuine**, not
removable by naive owner-priority). The unification does not automatically
dissolve this. The **hypothesis to test**: a coordinate-transform-derived
position is a _hard_ equation, so a parent pin over it is a named
over-determination (correctly — you can't reposition a polar-placed glyph),
whereas a linear self-place is a _default_ the pin supersedes. If that holds,
authority becomes equation strength (hard vs default) rather than a flag. If it
doesn't, a per-call authority signal stays. This is the one design decision to
resolve with a spike before committing the solver.

## What it takes (staged, each gated `capture-diff` REAL = 0)

1. **Ledger holds `Monotonic` facets** — σ-affine values, not only numbers
   (finishes #39 step 1). Type + tests only; no behavior change.
2. **`dims` reads the ledger; `place`/`setExtent`/intrinsic writes record into
   it** — the risky core (~38 `place()` callers). Behavior-preserving; switch
   readers over one at a time. Watch the `baseline` anchor, `embedded`, and the
   `translate === undefined` "unplaced" signal (it must survive as "facet not yet
   determined", never become 0).
3. **Migrate each constraint to a facet-equation emitter** behind today's
   `apply*` signatures, one at a time, gated.
4. **Replace the placement walk with the propagation solver** — σ solved per
   scope inside it; cycles / over-determination → the named-conflict report.
   _This_ is where the two passes fuse, and where a placed edge first feeds back
   into the σ-claim (the label-fits-the-box behavior below).
5. **Aspect ratio + σ-scope as explicit cross-cutting equations** on top.

Blast radius is the whole layout core (`_node.ts`, `layer.tsx`, every `apply*`,
`compose.ts`); the pixel gate is the net. Step 4 is the one that can fail to
converge — it is, in effect, adopting a Bluefish-style constraint solver while
carrying the max-plus σ-scope and the measure type-system on top. Realistically
several sessions.

## The motivating consequence: labels that fit

Today the label overhang is structural. Bars A=10, B=30, C=20; a value label
`spacing = 10` above each σ-scaled bar top, label height `th`:

- **Two-pass (today).** Pass 1 solves the bars' claim `max(10σ, 30σ, 20σ) = 30σ`
  against height `H` ⇒ `σ = H/30`. The label's `+10+th` is not in that claim
  (labels are placed in pass 2, post-σ), so the tallest bar's label overhangs the
  top by `10 + th`.
- **Unified.** The label's top edge is `30σ + 10 + th` — still a `Monotonic`. Fold
  it into the scope claim: `max(30σ + 10 + th, …) = H` ⇒ `σ = (H − 10 − th)/30`.
  The bars shrink just enough that the tallest label fits. No new mechanism —
  `Monotonic.smul` then `Monotonic.adds`, max-folded, inverted — just placement
  feeding edges back into the solve it was previously downstream of.

That single change — _a placed position's extent participates in solving σ_ — is
both the headline simplification and the behavior the two-pass split can't
express. Everything else here is the refactor that makes it a one-line
consequence instead of a special case.
