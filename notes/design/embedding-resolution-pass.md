# Embedding-resolution pass — concrete design (Track 2)

**Status: DECISIONS MADE + first PR IMPLEMENTED.** The four decisions below were resolved
(all to the recommended option) and Route B shipped as the `resolveEmbedding` pass
(`_node.ts`), hooked in `gofish.tsx` before layout. Verified: full test suite green incl.
`embedding.test.ts` (bubble-in-polar oracle), and `capture-diff` over all 249 stories =
0 moved (the pass is a behavior-preserving superset). The `▶ DECISION` blocks are kept
below as the rationale record.

**Resolved decisions:** 1 = separate top-down pass · 2 = pass is sole author (construction-
time `inferEmbedded` stripped from the shape factories) · 3 = Route A deferred (no corpus
oracle) · 4 = leave all `emX/emY` (capability-only; corpus unmoved).

**Implementation note (refinement found while building):** a polar coord _forgets_ its
axis measure (its underlying space is measureless), so the Route B gate could not read an
"axis measure" off the coord as section 3 first proposed. Instead the discriminator is
**mark-local**: compare a dim's size measure to its own _position_ measure (`min`/`center`/
`max`) — a positioned mark's position measure _is_ the axis measure it sits on, and a
pure-size mark (a bar) has no position to clash with → embeds. The gate is coord-scoped
(only revokes inside a coord), keeping Cartesian byte-identical.

Original framing follows. This doc was decision-oriented: each `▶ DECISION` block was a
fork for the co-design; the resolutions are recorded above.

---

## 0. What "embedding" is, operationally

`embedded` is a per-axis boolean on a node's `intrinsicDims[dir]`. It is consumed in
**two** places, both of which must see the final value:

- **Layout fold** — `embedded` is a fold flag (`_node.ts:725`), changing how a dim's
  extent participates in the parent's space resolution.
- **Render** — `rect.tsx:301-302` switches on `(isXEmbedded, isYEmbedded)`:
  `(0,0)`→point (transform the center, draw at pixel size), `(1 of 2)`→line (embedded
  axis sweeps through the transform → arc), `(2,2)`→area (wedge / annular sector).

So **the count of embedded axes = point/line/area**, exactly the corpus's induced rule 1.

## 1. How `embedded` is set TODAY (and why it's not enough)

Four sites, none coordinated, none measure-correct:

1. **`inferEmbedded`** (`data.ts:310`) — at _construction_, per dim. Sets `embedded:true`
   when `size` is a `Value` **or `undefined`**, and `min` is undefined / aesthetic / a
   value of the **same measure as `size`**. Note it embeds **unsized** dims (this is what
   silently captures the nest-growth case — an unsized θ that nest later grows).
2. **`emX`/`emY`** — explicit override on a `rect` (`dims.ts` → `embedded`). Every GoTree
   wedge sets these by hand.
3. **nest-growth** — an unsized dim on an `emX/emY` rect grown by `nest` to contain its
   subtree. In practice this rides on (1)+(2): the dim is unsized (so `inferEmbedded`
   embeds it) and `emX/emY` is set anyway.
4. **`connect`** — `child.embed(direction)` on link paths (`connect.tsx:121`) → the
   1-embedded "line" case for edges.

**Why it's wrong / incomplete (the gap this pass closes):**

- (1)'s measure check is **min-vs-size consistency**, _not_ "is my size denominated in
  this axis's spatial-scale measure." It can't distinguish a bar's height
  (quantitative-on-y → should embed) from a scatter bubble's area (foreign measure →
  must NOT embed). It never compares against the **axis's** measure because at
  construction the axis/coord doesn't exist yet. → **Route B is not actually
  implemented**; `emX/emY` is the manual stand-in (annotations §"Mechanism").
- There is **no Route A**: a relation that pins _edges_ (edge-metric distribute / stack /
  nest) does not propagate an embed down to dataless constant-size marks. The corpus
  rows 1–5 happen to be correct-by-accident (center-metric + pixel radius), but an
  edge-metric layout of two constant rects under polar should embed and currently can't.
- nest-growth embed status is **not** derived from the containment chain; it leans on
  the unsized-dim branch of (1). Rule 3/4 says embed status genuinely depends on
  children → wants a recursive pass.

## 2. The pass: where it hooks

Mirror the existing top-down passes. Current order in `gofish.tsx`:

```
resolveAliases            (top-down, coord-scoped)   ← I added this in Track 1
resolveUnderlyingSpace    (bottom-up)
resolveAxes / nice        (top-down)
layout                    (bottom-up, reads `embedded`)
place / render
```

Proposed: insert **`resolveEmbedding`** _after_ `resolveUnderlyingSpace`, _before_
`resolveAxes`/layout:

```
resolveAliases
resolveUnderlyingSpace        ← gives each axis its spatial-scale measure (for Route B)
resolveEmbedding   ◀ NEW      ← top-down for Route A scope; reads space for Route B
resolveAxes / nice
layout
```

Rationale: Route B needs the **axis's resolved measure** (only known after underlying
space resolves), and the result must be set before layout (the fold) reads it.

`resolveEmbedding` is a method on `GoFishNode`, structured like `resolveAliases`
(`_node.ts:493`): it threads a downward "embedding context" (the active coord + which
edges a surrounding relation has pinned), rebinding at each `coord`, and **reassigns the
`dims` array element** (so the captured layout/space closures observe it — same
mutate-in-place trick the alias pass uses).

▶ **DECISION 1 — separate pass vs. fold into `resolveUnderlyingSpace`.**
Underlying-space resolution already walks bottom-up and computes per-axis measures; we
_could_ compute `embedded` in the same walk. But Route A is **top-down** (relations pin
edges downward) and underlying-space is bottom-up, so a clean single walk doesn't exist.
My recommendation: **separate top-down pass** (matches `resolveAliases`, keeps each pass
single-direction). Alternative: a two-sweep merged pass. I lean separate.

## 3. Route B — intrinsic, measure-gated (the #534 payoff)

Per mark, per axis: the mark's own size embeds **iff its size's measure equals the
axis's spatial-scale measure.**

- Axis measure = the resolved `_underlyingSpace[dir]` measure at the enclosing coord
  (or the mark's own claimed axis).
- Size measure = `getMeasure(dims[dir].size)` — which, thanks to #534, is now the
  _source_ measure for transform outputs (a bin's `start/end/size`), not a field-name
  fallback. **This is precisely why #534 had to land first.**
- **Match → embed** (bar height in y-units). **Mismatch → ink** (scatter bubble area;
  a circle's pixel radius has no measure → never matches → stays a flat point, matching
  annotations rule 5 / the FlowerTree case).

This **replaces** the measure check inside `inferEmbedded`. `inferEmbedded` at
construction can't see the axis, so I propose: keep a _provisional_ embed at construction
(unsized-dim + value-size, as today) and have `resolveEmbedding` **confirm or revoke** it
against the now-known axis measure. Revoke = a value-sized dim whose measure is foreign
to the axis → set `embedded:false` (drop to ink).

▶ **DECISION 2 — provisional-then-confirm vs. compute-fresh.** Do we keep
`inferEmbedded`'s construction-time guess and let the pass revoke it, or strip embed
inference at construction entirely and let the pass be the _sole_ author of `embedded`
(except `emX/emY`/`connect`)? Sole-author is cleaner (one place owns the flag) but is a
bigger blast radius on the cartesian bar stories that currently rely on construction-time
inference. I lean **sole-author** (radical-unification-style), gated behind a full
capture-diff. Your earlier guidance favors the unified rule over dual paths.

## 4. Route A — relational, measure-free

A surrounding relation that places **edges** in the preimage embeds the participating
marks' edges on that axis, **even with no data/measure**:

- **edge-metric** `distribute` / `stack` / `nest` on axis A → embed A for the children's
  shared edges.
- **center-metric** relation → pins only the center → does **not** embed (point).

Mechanism: the operator that emits the relation tags its children (or the pass reads the
operator's constraint kind) with an "edge-pinned on axis A" mark that `resolveEmbedding`
propagates down to the leaf dims. This is the top-down half of the pass.

▶ **DECISION 3 — where does "edge-metric vs center-metric" come from?** Options:
(a) **read it off the emitted constraint** (`distribute`/`stack` already emit
placement constraints with an anchor; the pass classifies anchor∈{edge,center});
(b) **operators self-declare** an `embedsEdges: Direction` tag (explicit, simple, but
one more thing each operator must set);
(c) **defer Route A entirely** — ship Route B + `emX/emY` first, since the _whole
GoTree corpus is Route-B/explicit_ (rows 1–5 are points that don't need Route A,
and every wedge is emX/emY). Route A only matters for the _dataless edge-to-edge_
case, which no corpus story exercises yet.
My lean: **(c) for the first PR** (unblocks GoTree parity, which is the goal), then (a)
as a follow-up so the model is complete. Route A has no corpus oracle today, so building
it now is unverifiable. This keeps the first cut falsifiable.

## 5. `emX`/`emY` deprecation path

Per the converged model, `emX/emY` is "a stand-in for missing measure provenance." Once
Route B works, most wedge stories' `emX/emY` become redundant (their sizes are
measure-denominated → Route B embeds them). Plan:

1. Land the pass; keep `emX/emY` working (explicit override always wins).
2. Capture-diff: identify which GoTree stories still need `emX/emY` after Route B
   (i.e. sizes that _don't_ carry a matching measure — e.g. leaf-count-derived widths
   that lost provenance). Those reveal the **next** provenance gap (the `width =
leaves().length` field, ties into #618 angular auto-fit).
3. Rename the residual escape hatch (it's mark-level, rare) — candidate: `embed: {x,y}`
   or fold into the alias surface. Not in the first PR.

▶ **DECISION 4 — do we attempt to _remove_ `emX/emY` from any GoTree story in the first
PR, or leave all of them and just make the pass make them redundant (no story edits)?**
I lean **leave them** for the first PR (smaller diff, pure capability add, zero visual
risk), then a second PR strips the now-redundant ones and surfaces the residual gap.

## 6. Oracle tests (falsifiers)

- **`measure.test.ts` is the #534 floor** (done).
- **New `embedding.test.ts`** asserting, per the model:
  - bar height (y-measure) → `embedded.y = true` (area/line);
  - scatter bubble size channel under `polar()` → x/y embed, **size stays NOT embedded**
    (flat circle) — the annotations' "untested oracle case," the cleanest Route-B
    discriminator;
  - circle pixel `r` → never embedded (FlowerTree rule 5).
- **Corpus regression**: `capture-diff` over the 24 polar GoTree stories — the pass must
  hold them identical _if_ we keep `emX/emY` (Decision 4 = leave), proving the pass is a
  superset of today's behavior before we start removing crutches.

## 7. Proposed first-PR scope (smallest falsifiable cut)

1. `resolveEmbedding` pass (separate, top-down), inserted after `resolveUnderlyingSpace`.
2. **Route B only**, measure-gated against the axis measure, consuming #534 provenance;
   `emX/emY`/`connect` still honored; Route A deferred (Decision 3c).
3. `inferEmbedded` becomes provisional; pass is the confirmer (Decision 2 — or
   sole-author if we're bold).
4. `embedding.test.ts` + the bubble-in-polar oracle.
5. Capture-diff: GoTree polar corpus identical (Decision 4 — leave `emX/emY`).
6. Docs: a short "embedding" section in the underlying-space / coords internals essay.

Net: the pass exists, Route B is real, the bubble oracle passes, the corpus is unmoved,
and we've located the _next_ provenance gap (leaf-count widths) for the auto-fit work.

---

### Decisions summary (your call)

1. Separate pass vs. fold into underlying-space resolution. _(lean: separate)_
2. `inferEmbedded` provisional-then-confirm vs. pass sole-author. _(lean: sole-author)_
3. Route A source: read-constraint (a) / self-declare (b) / defer (c). _(lean: c first)_
4. First PR: leave all `emX/emY` (capability-only) vs. strip redundant ones.
   _(lean: leave)_
