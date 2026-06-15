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
   (finishes #39 step 1). Type + tests only; no behavior change. ✅ **Landed**
   (`BBox` now holds a `Monotonic` per facet; `read(facet, σ)` evaluates,
   `readMono` returns the claim; all-numeric callers unchanged).
2. **`dims` reads the ledger; `place`/`setExtent`/intrinsic writes record into
   it** — the risky core. Behavior-preserving; switch readers over one at a time.
   Watch the `baseline` anchor, `embedded`, and the `translate === undefined`
   "unplaced" signal (it must survive as "facet not yet determined", never
   become 0). 🟡 **Down-payment attempted and reverted** (recorded so the next
   attempt doesn't repeat it): rerouting `place()`'s positional write through
   `setExtent` (so all of align/distribute/nest/position/span funnel through one
   bbox primitive) was gated REAL = 0, but `/code-review` found a **latent
   divergence** — `setExtent` reconstructs a `center`/`max` anchor geometrically
   (`min + size/2`, `min + size`), which disagrees with `place()`'s use of the
   _stored_ `intrinsic.center`/`max` when a box is asymmetric (e.g. nodes
   `position.tsx` builds with a nonzero local min, reached via nest/distribute/
   grid/treemap center-placement). No current story triggers it, but a latent
   divergence in the hottest layout method — plus a per-placement `BBox`
   allocation — is not worth a standalone reroute. The correct form is the
   _authoritative_ stage 2: a **persistent** per-node ledger that `place`,
   `setExtent`, and `dims` all share, with the local-frame/absolute split
   reconstructed faithfully (a node knows its size before its position: rank-1,
   `min`/`center` `undefined`), plus migrating the 108 direct `intrinsicDims`
   sites. That is the interactive, story-by-story migration below — _not_ a blind
   reroute.

   ✅ **Down-payment re-landed correctly** (the root cause, not the reroute):
   `place()` and `setExtent`'s rank-1 pin now both place an anchor through a
   single pure `localAnchorPoint(anchor, min, size)` (`dims.ts`) that **derives**
   `center`/`max` from `(min, size)` instead of reading a stored facet — so the
   two paths cannot diverge on an asymmetric box, and the rank-1 pin allocates no
   `BBox` (the genuine 2-unknown solve stays only for rank-2 size-setting). Both
   of the reasons the reroute was reverted are gone, gated REAL = 0 across 189
   stories + a `localAnchorPoint` contract test.

   ✅ **All `dims` readers now derive `center`/`max`** (next gated step): the
   `dims` getter (`GoFishNode` + the `GoFishRef` mirror) and `place()`'s anchor
   guard compute `center`/`max` from the placed `(min, size)` instead of reading
   the stored facet — they read back only once a box is placed AND sized. This
   **closes the stored-vs-derived inconsistency**: a stored asymmetric `center`
   (what `position.tsx` wrote as `center: xPos`) can no longer be observed
   through `dims` by `align`/`distribute`/etc. `position()` now stores only its
   local `(min, size)`. REAL = 0.

   ✅ **Shape renders derive; stored-box `center`/`max` writes removed.** The
   shape `_render` functions (`rect`/`ellipse`/`petal`) shared an identical block
   that read their own `intrinsicDims[i].center`/`max` to draw; they now call one
   `displayDims()` helper that derives. With no reader left, `setExtent` and all
   six shape `layout()`s stopped writing `center`/`max` — every stored box is now
   `{min, size}` only. All four derivation sites (`localAnchorPoint`, both `dims`
   getters, `displayDims`) anchor `center`/`max` off the **magnitude `|size|`**,
   so a negative bar (signed `size`, `min` carrying direction) stays correct.

   **`center`/`max` do NOT leave `Interval` — and shouldn't.** The investigation
   corrected the premise: `Interval` is a _general_ dim type with three uses that
   legitimately carry `center`/`max` — input elaboration (`cx`/`x2`, read by
   `image`/`text` for center-positioning and `rect` for min/max spans via
   `elaborateDims`), the computed `dims` output (read by `align`/`distribute`/
   `coord`/overhang), and coordinate-transform **domains** (`{min, max, size}`,
   where `max` is a real domain endpoint). Only the _stored node box_ should omit
   them, and it now does. A dedicated `LocalBox` type for `intrinsicDims` would
   add compiler enforcement but buys little (structural typing already accepts the
   narrower shape), and the remaining operator writes (`treemap`/`offset`/`arrow`/
   `connect`) are now **dead** — the getter derives, ignoring them — so they're
   cosmetic cleanup, not correctness. The 108-writer migration off direct
   `intrinsicDims` manipulation (the path to a single authoritative ledger)
   remains the larger structural work.

   **Deferred follow-ups (PR #576, stage-2 cleanup), roughly in order:**
   - **Kill the `GoFishNode`↔`GoFishRef` duplication.** Their `dims` getter and
     `place()` are near-verbatim copies (`/simplify` flagged this hardest). Extract
     a shared `combineDims(intrinsicDims, transform)` for the getter body (it is
     `displayDims` but returning `undefined` for an unplaced/unsized facet instead
     of `?? 0` — parameterize the fallback or have the getter post-process) and a
     shared `placeAnchor(state, axis, value, anchor)` for `place()`. A `Placeable`
     base/mixin is the deeper version. Gate `capture-diff REAL = 0`.
   - **Remove the dead operator `center`/`max` writes** (`treemap`/`offset`/
     `arrow`/`connect` `intrinsicDims` literals). Dead since the getter derives;
     varied multi-line, so edit per-file and gate. Cosmetic, low risk.
   - **(maybe) Extract a private `_placeAnchor`** shared by `place()` and
     `setExtent`'s rank-1 pin — both are `ensureTranslate()[dir] = value −
localAnchorPoint(...)`. Minor.
   - **Normalize `rect`'s signed `size` at the source** (RISKY — audit first).
     `rect.tsx` stores `size: w` with `w` possibly negative; that signed size is
     why all derivation sites need `Math.abs`. Storing `|w|` with direction in
     `min` would let `localAnchorPoint`/`displayDims`/the getters drop the abs.
     BLOCKED on auditing every reader of the signed `displayDims[i].size` — it is
     used directly as SVG `width`/`height` in `rect`'s non-embedded branch and as
     `-displayDims[0].size / 2` in `petal`. Don't do this without a full
     consumer audit + pixel gate.

   The big remaining structural work is the **108-writer migration** off direct
   `intrinsicDims`/`translate` manipulation onto facet/ledger writes (stage 2
   proper → the authoritative per-node ledger), then stages 3–4 below.

3. **Migrate each constraint to a facet-equation emitter** behind today's
   `apply*` signatures, one at a time, gated.
4. **Replace the placement walk with the propagation solver** — σ solved per
   scope inside it; cycles / over-determination → the named-conflict report.
   _This_ is where the two passes fuse, and where a placed edge first feeds back
   into the σ-claim (the label-fits-the-box behavior below).
5. **Aspect ratio + σ-scope as explicit cross-cutting equations** on top.

### Stage 2 is not a `place()` refactor — it's a representation migration

The size of stage 2 was initially under-estimated as "~38 `place()` callers".
The reality, measured: **`intrinsicDims` is referenced 108 times across 20
files, and `transform.translate` across 23** — and crucially it is **not
encapsulated**. Shapes _set_ their own `intrinsicDims` (`rect`/`ellipse`/`text`/
`petal`/`polygon`/`image`), and operators _read and write_ it and `translate`
directly (`treemap`, `offset`, `porterDuff`, `scatter`, `arrow`, `connect`,
`enclose`, `position`, `coord`). Making a per-node ledger the **authoritative**
source for `dims` therefore means migrating every one of those sites off direct
`intrinsicDims`/`translate` manipulation and onto facet writes — not flipping a
single getter. A purely additive shadow ledger (one that records but doesn't
drive geometry) would be redundant state, not authority. And the local-frame /
absolute-position split that `(intrinsicDims, translate)` encodes — used during
a node's _own_ layout, before its parent places it — has to be reconstructed in
the ledger (a node knows its size before its position: rank-1, the `min`/`center`
facets `undefined`). The asymmetric-center / baseline cases are where a naive
absolute-only ledger silently diverges.

So stage 2 is a **deliberate, interactive, multi-session migration**, gated story
by story — _not_ something to land in one blind pass. (See the judgment-call note
on the PR.) Stages 3–5 sit on top of it; stage 4 additionally _changes pixels_
(labels fit the box), so it needs human "is this better?" judgment per story
([[feedback_pixel_not_dom_gate]]), and stage 5's aspect-ratio home is an open
design fork — neither is gate-decidable alone.

Blast radius is the whole layout core (`_node.ts`, `layer.tsx`, every `apply*`,
`compose.ts`, all shapes + geometry operators); the pixel gate is the net. Step 4
is the one that can fail to converge — it is, in effect, adopting a Bluefish-style
constraint solver while carrying the max-plus σ-scope and the measure type-system
on top. Realistically several sessions.

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

## The visible symptom today: content sits at the origin, not fitted to the canvas

The label-overhang above is the small version. The large, _already-visible_ bug
(pre-dating this work) is that many graphics render **translated too low / into
the bottom-left**, with empty space above and to the right. Confirmed examples:
the bump, croissant, flower, nested-boxes-tree, and python-tutor-memory diagrams.

Measured mechanism (`gofish.tsx`, `PADDING = 40`): the root frame is
`scale(1, -1) translate(leftReserve, -(height + topReserve))`, i.e. content is
pinned at the **origin** with a 40px margin, and the canvas is the _requested_
size. When the content is smaller than the request, it does not fill or center —
it piles up at the origin, which y-up renders at the **bottom-left**. Two
variants of one gap:

- **Diagrams** (nested-boxes-tree requests 720×560; the tree is ~150×400):
  there is no data scale to stretch, so the content is simply origin-anchored in
  an over-large canvas. It should fit-to-canvas (scale and/or center) or the
  canvas should shrink-wrap it.
- **Data charts** (flower: x-axis runs to 140, data reaches ~50): the σ / data
  scale is not fit to the content's actual extent, so the marks occupy a corner.

Both are the four observations converging: the content's **bbox** must drive the
**σ-solve** (so the chart fills its canvas), the **baseline = origin** anchoring
is exactly what drops content to the bottom-left (and is
[[feedback_baseline_origin_semantics]]'s underdeveloped corner — `place()` still
carries a `// TODO: revisit baseline case`, aliasing `baseline` to `min`), and
the fix is "**pick scales to fit the whole chart**". This is _not_ a band-aid
(don't special-case "center when canvas > content"): charts must _fill_ (their
axes span the canvas) while a fixed-size diagram may want to _center_, and that
choice should fall out of whether the axis carries a data scale — which is
exactly what the unified solve, with the bbox edges folded into the per-scope σ,
decides. So this symptom is the acceptance test for stage 4, and the reason
stage 4's pixel changes are _wanted_, not regressions: a chart that now fills its
canvas where it used to sit in a corner is **correct**.

(Diagram-vs-chart fit — scale-to-fill vs center vs shrink-wrap when content < an
explicit canvas — is a design sub-decision to settle alongside stage 4, governed
by whether the scope's axis is a data POSITION or pixel-pure.)
