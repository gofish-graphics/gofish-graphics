---
title: "Collapsing the Two Passes: One Propagation, Printable Equations"
section: Speculative Notes
order: 34
status: speculative
---

# Collapsing the Two Passes: One Propagation, Printable Equations

> **Outcome (June 2026) — the fusion this note explores was NOT adopted.** What
> landed from it (all gated REAL = 0): the per-node `Monotonic` **bbox ledger** is
> the geometry authority and `(intrinsicDims, transform)` is now a _projection_ of
> it (the redundant `transform.translate` writes are retired across pins and
> operator self-placement; `intrinsicDims` stays the frame-invariant local box);
> the constraints (`distribute`/`align`/`position`/`span`) are **facet-equation
> emitters** (`emit*` produces the equations as data, `apply*` commits). What was
> **rejected** is the headline — _fusing_ sizing and placement into one
> simultaneous solver. On inspection its justification (a placed edge feeding back
> into σ) didn't hold: genuine size↔place **cycles are rare-to-nonexistent** in
> dataviz (layout is one-way, size→place); the "labels fit" motivation is a
> **sizing-time** claim (text extent is known without placement — see that section,
> now reframed); aspect-ratio is a trivial cross-axis `min` (#582); floors/caps are
> piecewise sizing claims (#580). So the direction is **two constraint-based passes
> kept separate** — sizing (already σ-affine) then a placement pass that _derives_
> from the sizing solution where determined, leaving the free DOF (a scope's
> origin) to bubble up. Read the rest as the explored target; the roadmap section
> below records what's actually true.

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
`max(aσ+b, …)` you can read off). _(The original claim went further — that fusing
the passes lets a placed extent feed back into σ so labels stop overhanging. The
emitter half landed; the fusion did not — see the Outcome banner above. The
ledger + emitters give the uniformity and printability without it.)_

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

Most `apply*` functions and the `setExtent` rank dispatch reduce to emitting
facet equations (this part landed — `emit*`/`apply*`). The two-pass _structure_,
though, was kept (the Outcome banner): sizing and placement stay separate solves,
not one fused propagation. Edge-vs-center survives only as _which facet the
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
   so a negative bar stays correct. (As of the item below, `rect` stores that
   box canonically — true `min` + unsigned `size` — so `|size|` is now belt-and-
   suspenders rather than load-bearing.)

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
   - ✅ **Killed the `GoFishNode`↔`GoFishRef` `dims`-getter duplication.** Both
     getters were verbatim copies; the body is now the shared
     `combineDims(intrinsicDims, transform)` in `dims.ts` — the
     `undefined`-preserving sibling of `displayDims`. `place()` stays per-class
     (Node has a write-once guard + `ensureTranslate`; Ref does not), so a shared
     `placeAnchor` / `Placeable` base is still the deeper version available later.
   - ✅ **Removed the dead operator `center`/`max` writes** (`treemap`/`offset`/
     `arrow`/`connect` `intrinsicDims` literals). Dead since the getter derives,
     and `size = max − min ≥ 0` at every site, so the derivation reproduced them.
   - ✅ **Extracted a private `_pinAnchor`** shared by `place()`'s determined
     branch and `setExtent`'s rank-1 pin — both were `ensureTranslate()[dir] =
value − localAnchorPoint(...)`.
   - ✅ **Normalized `rect`'s signed `size` at the source.** `rect.tsx` now
     stores `min: Math.min(0, w)` + `size: Math.abs(w)` — true min, unsigned
     extent — instead of `min: w>=0?0:w` + `size: w`. The consumer audit found
     that `min` was already canonical and `max`/`center` were already derived via
     `|size|`, so the only signed reads were `rect`'s own `_render`: branch-1's
     manual `min + size/2` (a latent wrong-center for negative point-rendered
     rects, now `displayDims.center`) and the SVG `width`/`height`. The
     `Math.abs(rawWidth)` / `rawWidth < 0` sign-correction in the line/area
     branches was already dead (`max − min` is the unsigned extent) and is now
     removed. `petal`'s `-size/2` reads `petal`'s own dims, unaffected. Gated:
     capture-diff REAL = 0 (189 stories, incl. the negative-bar story), 64 tests
     pass, negative bar verified by screenshot.

   The big remaining structural work is the migration off the dual
   `(intrinsicDims-local box, translate)` representation onto **one persistent
   per-node ledger** that `place`/`setExtent`/`dims` all share, then stages 3–4
   below. It proceeds in gated increments:
   - ✅ **Stage 0 — persistent ledger, observe-only.** `setExtent`'s rank-2 solve
     now accumulates into a persistent per-axis `BBox` on the node
     (`GoFishNode._bbox`) instead of a fresh-per-call one, so a second constraint
     pinning the same axis is checked against the first (a named
     over-determination, not a silent re-solve — the debt the old interim note
     flagged). `dims`/render still derive from `(intrinsicDims, transform)`, so
     output is byte-identical (REAL = 0, 64 tests).
   - ✅ **Stage 1 — every mutator records into the ledger, faithfully.** The
     `layout()` wrapper seeds each axis's `size` (and the absolute `min` for a
     self-placing shape); `_pinAnchor` records the absolute anchor facet (and
     rebuilds the axis on an override pin); a rank-2 `setExtent` resets the axis
     and records its determining facets — so the ledger always mirrors the
     written `(intrinsicDims, transform)`. A dev-only assertion
     (`GOFISH_LEDGER_CHECK`, zero-cost off) compares ledger-derived `(min,size)`
     against `combineDims` on every `dims` read; **zero divergences across all
     189 stories**, the confidence stage 2 needs before flipping the read.
     (At this stage `baseline` and `embedded` stayed out of the ledger — origin
     pin / layout-fold flag, not min/max/center facets. `baseline` was folded in
     later, in stage 3, once the σ-affine model recognized the origin as the
     intercept; `embedded` is still out.) Gated REAL = 0 + 64 tests.
   - ✅ **Stage 2 — `dims` reads from the ledger (the risky flip).** The `dims`
     getter now derives its absolute `(min, size)` from the persistent ledger on
     every axis the ledger fully solves (re-deriving center/max via
     `localAnchorPoint`), falling back to `combineDims` on the
     `(intrinsicDims, transform)` split where the ledger is under-determined or
     absent. Render still reads the split directly, so only `dims`-getter
     consumers (constraints, align/distribute, the layer bbox fold) change — no
     pixels move through render. `embedded` is still read off the local box (a
     layout-fold flag, not a ledger facet). The stage-1 assertion stays wired in,
     now fed `combineDims` independently of the getter's result, and reports
     **zero divergences across all 189 stories**. Gated REAL = 0 + 64 tests.
   - **Stage 3** — `(intrinsicDims, transform)` becomes a projection of the
     ledger; the ~29 direct write sites stop double-writing, migrated one
     increment each, each gated REAL = 0 + 64 tests:
     - **3-A (done)** — dropped the last operator center/max literal writes
       (`layer`; `treemap`/`offset`/`arrow`/`connect` went in stage-2 cleanup), so
       stored boxes are `{min, size}` only and `dims`/the ledger re-derive
       center/max.
     - **3-B (done)** — `transform.translate` becomes a derived view of the
       ledger: `ledger.min − intrinsicDims.min` on a fully solved axis, else the
       written translate. Added as a private projector plus a dev assertion
       (`GOFISH_LEDGER_CHECK`) that projected == written translate on every solved
       axis — **zero divergences across all stories**. The field is still written
       (render/flatten untouched), so this is provably inert; it establishes the
       invariant 3-C relies on.
     - **3-D (the coord-render decoupling, done as the unblock)** — `flattenLayout`
       no longer mutates `node.transform`. _D0_ extracted it into its own `bake.ts`
       module (pure move). _D1_ made the bake **emit a `DisplayObject[]` rendering
       IR** (`_displayObject.ts`, formerly an empty stub) rather than mutating: each
       entry pairs a mark with its baked absolute transform, which coord feeds into
       `INTERNAL_render(coordTransform, transform)` as an override threaded to the
       node's `_render`/`_renderLabel`. The scenegraph's parent-relative transforms
       stay intact, removing the one place the split and the ledger diverged — which
       was the whole reason 3-D blocked 3-C. (The originally-planned terminal
       whole-tree bake pass was **dropped**: a global post-layout bake would make a
       coord-transformed node's screen bbox unreadable by downstream layout — e.g. a
       radar chart's cartesian layer connecting refs to polar points — so the coord
       boundary must bake _during_ layout. Tracked as a separate future track.)
       Groundwork from earlier: render-side `transform.translate` reads go through a
       single `displayTranslate`/`translateString` chokepoint in `dims.ts`.
       (This records stage 3-D as it landed. The draw path has since moved on:
       `_render`/`INTERNAL_render` are gone, replaced by per-shape `lower()` /
       `INTERNAL_lower` emitting a display-list IR — see
       [Rendering](/internals/core/rendering). The bake still feeds each entry its
       baked absolute transform; only the method it calls changed.)
     - **3-C (in progress)** — make `transform.translate` a ledger projection and
       retire the writes. _Value reads migrated (both inert, REAL = 0):_ render reads
       a ledger-derived `_displayTransform` getter, and `_ref` accumulation reads
       `projectedTranslate` — so no value-reader depends on the raw written field
       where the ledger is solved. _Then write retirement hit a real gap, now
       closed:_ deleting the writes needs the placement-state checks (`place()`'s
       already-placed short-circuit, `_pinAnchor`'s override) to read the ledger
       instead, which needs **ledger-min-defined ⟺ translate-defined**. That held
       everywhere except `baseline`: a `baseline` pin wrote the translate but
       recorded **no** ledger facet, and `baseline` is pervasive (the root
       placement, coord placing its children). The σ-affine model resolved it: a
       `baseline` pin sets the box's local-0 **origin** (the affine's intercept),
       and screen-min = origin + localMin, so `_pinAnchor` now records
       `min = value + localMin` for a baseline pin — the ledger represents
       baseline like any other anchor and `_projectTranslate`/`dims` derive it.
       Gated REAL = 0 + the `GOFISH_LEDGER_CHECK` mirror clean across all stories.
       _Next:_ migrate the placement-state checks off `transform.translate` (now
       that ⟺ holds), then retire the translate writes one site at a time.

3. ✅ **Constraints are facet-equation emitters.** `distribute`/`align`/
   `position`/`span` each split into a pure `emit*` (produces the placement
   equations as data) + a thin `apply*` commit, behind unchanged signatures —
   the seam a constraint-based placement pass consumes. Gated REAL = 0.
4. **Two constraint-based passes — kept separate (NOT fused).** _Decision
   (June 2026): do not fuse sizing and placement into one solver._ Sizing is
   already a σ-affine constraint solve (the `Monotonic` SIZE domains composed
   bottom-up and inverted per scope — see below). Placement becomes its own
   constraint-based pass that **resolves the emitted equations**, and — the key
   point — for the determined common case it is a _derivation_ of the sizing
   solution, not a separate solve: a stack's positions are the running cumsum of
   the solved sizes. Only genuinely **under-determined** placement needs solving,
   and then the lone free DOF is the scope **origin** (it bubbles up as
   `translate`-undefined / baseline for the parent to pin); **over-determined** →
   a named conflict (`BBox` already returns these). The two passes run one-way
   (size → place); placement reads the sizing solution but they stay distinct.
5. **Cross-cutting features layer on the sizing pass, additively** — not via
   fusion: equal-aspect / shared scale across axes (`σ_x = σ_y` reconciliation,
   #582) and min/max size floors & caps (piecewise σ-affine claims, #580). Both
   sit on the already-σ-affine sizing solve; neither needs the placement pass.

### Making the ledger authoritative is a representation migration, not a `place()` refactor

Flipping the `dims` getter to read the ledger (stage 2) was the small step — it
landed as a clean getter change because stages 0–1 had already made the ledger a
faithful mirror, so the read-flip was provably REAL = 0. The _big_ remaining work
is retiring the redundant split writes (stage 3), and that was initially
under-estimated as "~38 `place()` callers". The reality, measured:
**`intrinsicDims` is referenced 108 times across 20 files, and
`transform.translate` across 23** — and crucially it is **not encapsulated**.
Shapes _set_ their own `intrinsicDims` (`rect`/`ellipse`/`text`/
`petal`/`polygon`/`image`), and operators _read and write_ it and `translate`
directly (`treemap`, `offset`, `porterDuff`, `scatter`, `arrow`, `connect`,
`enclose`, `position`, `coord`). Making the per-node ledger the **sole**
source of geometry therefore means migrating every one of those sites off direct
`intrinsicDims`/`translate` manipulation and onto facet writes — not flipping a
single getter. A purely additive shadow ledger (one that records but doesn't
drive geometry) would be redundant state, not authority. And the local-frame /
absolute-position split that `(intrinsicDims, translate)` encodes — used during
a node's _own_ layout, before its parent places it — has to be reconstructed in
the ledger (a node knows its size before its position: rank-1, the `min`/`center`
facets `undefined`). The asymmetric-center / baseline cases are where a naive
absolute-only ledger silently diverges.

Stage 3 was a **deliberate, interactive, multi-session migration**, gated story
by story — _not_ landed in one blind pass — and it is now substantially **done**:
the ledger is the geometry authority and `(intrinsicDims, transform)` is a
projection of it on every solved axis (`transform.translate` retired across pins
and operator self-placement; `intrinsicDims` stays as the frame-invariant local
box). Its blast radius was the whole layout core (`_node.ts`, `layer.tsx`, every
`apply*`, `compose.ts`, all shapes + geometry operators); the pixel gate was the
net, REAL = 0 throughout.

**A fused solver was considered and rejected (June 2026).** The plan once had a
step 4 that _fused_ sizing and placement into one Bluefish-style constraint
solver — justified by "a placed edge feeds back into the σ-claim." On inspection
that justification didn't hold: the motivating cases reduce to the sizing pass
(which is already σ-affine) or to trivial cross-axis reconciliation, and genuine
size↔place **cycles are rare-to-nonexistent** in dataviz (layout is one-way: size
then place). So the two passes stay **separate and constraint-based** (item 4
above) — placement _derives_ from the sizing solution where determined, which is
REAL = 0 and carries no convergence risk, rather than adopting a simultaneous
solver the corpus doesn't need.

## A motivating consequence: labels that fit (a sizing-pass claim, not a fusion)

Today the label overhang is structural. Bars A=10, B=30, C=20; a value label
`spacing = 10` above each σ-scaled bar top, label height `th`:

- **Today.** The bars' claim `max(10σ, 30σ, 20σ) = 30σ` solves against height `H`
  ⇒ `σ = H/30`. The label's `+10+th` is not in that claim, so the tallest bar's
  label overhangs the top by `10 + th`.
- **The fix.** The "bar + its label" effective top edge is `30σ + 10 + th` — and
  crucially **`th` is known at sizing time** (text metrics need only the string +
  font, not placement), and `+10` is a constant. So this is a _richer sizing
  claim_, not placement feedback: fold the label's extent into the bar's own SIZE
  claim — `max(30σ + 10 + th, …) = H` ⇒ `σ = (H − 10 − th)/30` — and the bars
  shrink just enough that the tallest label fits. `Monotonic.smul`/`adds`,
  max-folded, inverted — entirely within the **sizing** pass.

This is the case that once seemed to require fusing placement back into σ. It
doesn't: because the label's size is a sizing-time fact (size↔size, not
size↔place), "the mark's claim includes its label" lives in the sizing solve. It
is the same family as the floors/caps work (#580) — enriching what a size claim
can express — and needs neither the placement pass nor a fused solver.

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

There are **two genuinely different situations**, and they must NOT be treated
the same:

- **Data charts that DO have a σ-scope DOF** (flower: x-axis runs to 140, data
  reaches ~50): here the scale _can_ stretch, so it _should_ — fit σ to the
  content's actual extent so the axes span the canvas. This is a **sizing-pass**
  fix (resolve σ against the real content bbox, not a stale request); no fusion.
- **Fixed-size content with NO scaling DOF** (nested-boxes-tree requests 720×560;
  the tree is ~150×400): there is **nothing to fill with** — no σ to stretch, no
  rule for how a diagram would grow to 720×560. So it must **not** be stretched.
  The only question is _where the intrinsic-size content sits_ in the larger
  canvas. It currently lands **bottom-left** purely because of the coordinate
  system (`scale(1,-1)` + origin anchoring) — that's not "filling," it's just the
  default origin. The open call is **top-left vs centered** (charts naturally want
  a bottom-left origin; free-space / diagrammy graphics want top-left), and it's
  deferred. Tracked at **#574** (centered-origin roots) and addressed in part by
  PR 575 (render intrinsic-size content at its intrinsic size).

So "fill the canvas" applies **only** to the σ-DOF case; the no-DOF case is a
placement/coordinate-origin question, not a scaling one. The `baseline = origin`
anchoring ([[feedback_baseline_origin_semantics]]; `place()` still carries a
`// TODO: revisit baseline case`) is what fixes the corner. Both are reachable
within the two separate passes — neither needs the fusion.
