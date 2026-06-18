---
title: "Design Space: Collapsing the Size and Difference Space Kinds"
section: Speculative Notes
order: 35
status: speculative
---

# Design Space: Collapsing the Size and Difference Space Kinds

> **Status — landed.** This note worked out [#586](https://github.com/gofish-graphics/gofish-graphics/issues/586)
> and the design it argues for has shipped: the underlying-space kinds
> `POSITION` / `SIZE` / `DIFFERENCE` are now a single `CONTINUOUS { width:
Monotonic, origin: number | null }`. The canonical description is in
> [Underlying Space → The three space kinds](/internals/core/underlying-space#the-three-space-kinds);
> this page records _why_, and the dead ends along the way. The merge is
> geometry-identical across all stories.

## Question

The [underlying-space type system](/internals/core/underlying-space) carried
five kinds: `position`, `difference`, `size`, `ordinal`, `undefined`. Three of
them describe "a data-driven extent": `size` (an extent that is a monotone
function of σ, pre scale-solve), `difference` (a concrete origin-less width,
post-solve), and `position` (an extent embedded in a shared coordinate). #586
asked whether `size` and `difference` are the same thing observed at two
pipeline stages, and could collapse — handling the pre/post-solve distinction
by _when_ σ is substituted rather than by _which kind_.

The answer turned out richer than the question: it's not `size`+`difference`
that merge, it's **all three**, and the surviving distinction is an `origin`
field. Here is the derivation.

## Step 1 — the σ-machinery is identical

The two consumers that solve σ read each kind like this:

|              | content extent at σ           | scale factor from allocated `size`   |
| ------------ | ----------------------------- | ------------------------------------ |
| `SIZE`       | `domain.run(σ)` (`shadow.ts`) | `domain.inverse(size)` (`layer.tsx`) |
| `POSITION`   | `width(domain) · σ`           | `size / width(domain)`               |
| `DIFFERENCE` | `width · σ`                   | `size / width`                       |

A [`Monotonic`](/internals/core/monotonic) `linear(slope, intercept)` has
`run(σ) = slope·σ + intercept` and `inverse(y) = (y − intercept)/slope`. So a
`POSITION([a,b])` is `linear(b−a, 0)` and a `DIFFERENCE(w)` is `linear(w, 0)` —
substitute and both rows reproduce exactly. **All three are the same Monotonic
machinery**; the σ-solve, the `shadow` frame check, and the combination folds
need no per-kind branch once they read `width` instead of three different
shapes. (Correcting #586's framing: a difference width _scales_ with σ, so it's
a through-origin `linear(w, 0)`, **not** a constant `linear(0, w)`. A genuine
constant — fixed pixels, no inverse — is the separate #508 `CONSTANT`, today
spelled `UNDEFINED`.)

## Step 2 — the surviving distinction is `origin`, and it's load-bearing

If the widths unify, what's left? Two things the code genuinely dispatches on:

- **posScale.** `posScaleFromSpace` builds a coordinate scale only for an
  _anchored_ extent — one with a shared data origin. A bar's height (`SIZE`)
  and a streamgraph's centered count (`DIFFERENCE`) build none.
- **axis style.** An anchored extent renders absolute ticks; an origin-less one
  renders _delta_ ticks (the `elaborateDifferenceAxis` path).

So the irreducible distinction is **whether the extent has a committed origin**.
That became the field: `origin: number` (anchored — old POSITION, and a
sized-but-unplaced mark at origin 0) vs `origin: null` (unanchored — old
DIFFERENCE). `SIZE` folds into the anchored case at origin 0 (its own
baseline).

## Step 3 — middle-alignment is the one demotion (the streamgraph)

Why isn't a bare bar already a difference axis? Because a sized mark _has_ a
baseline (its bottom = origin 0), so it's born anchored. The transition to
origin-less is a specific operation: **`middle`-alignment nulls the origin**.
Trace a streamgraph (`spread(... alignment: "middle")` over `stack(... dir: y)`
of `blank({ h: "count" })`):

1. each band → anchored magnitude `{ width: linear(count, 0), origin: 0 }`;
2. `stack` sums within a lake → still anchored (origin 0);
3. `spread` **middle**-aligns the per-lake stacks across lakes → `origin: null`.

Centering scrambles the baselines — absolute y stops meaning anything, only the
band thickness does — so the count axis is a delta axis. A _stacked bar chart_
is identical except the cross-alignment is `start`/`baseline`, which keeps the
shared zero → anchored → absolute axis. The only difference between the two
charts is the alignment mode, and `origin` is exactly what records it.

This also explains why the distinction can't be _two_ values that promote on
alignment: three baseline-aligned streamgraphs (each already `origin: null`)
must **not** promote back to an absolute axis — their internal baselines are
mutually inconsistent and lining up one edge doesn't unify them. So
`origin: null` is **absorbing**: alignment never re-anchors it. The fold
encodes this directly — `middle`, or any already-null child, yields null.

## What collapsed in the code

- Five kinds → three: `CONTINUOUS { width: Monotonic, origin: number | null }`,
  plus `ORDINAL` and `UNDEFINED`. `SIZE`/`POSITION`/`DIFFERENCE` survive as thin
  builder functions that fill in the right `origin`.
- The σ-solve and the folds (`unionChildSpaces`, `distributeSpaceFold`,
  `resolveAlignmentSpace`, the `shadow` check, the layer/treemap scale-factor
  solves) dropped their three-way `isSIZE/isPOSITION/isDIFFERENCE` switches for
  a single `isCONTINUOUS` + `width`.
- The `rect.tsx` introduction anomaly is gone: a literal-pixel `min` plus a
  data size, and an absent `min` plus a data size, are now the same kind,
  differing only in `origin` (null vs 0) — a principled difference (off-scale
  pixel placement vs shared baseline), not a syntactic accident.
- **Two coupled hacks fell out.** The constraint-`align` path carried a
  `guardDataPositioned` / `fromSize` flag (filled from pre-fold child spaces)
  to stop baseline-aligning data-positioned children, and `layer` separately
  _suppressed_ the posScale for `SIZE` children so that guard wouldn't misfire.
  Once the distinction lives in `origin`, the bespoke spread guard re-expresses
  as "every child anchored at origin 0" and the constraint-path copy plus the
  posScale suppression became dead weight — removed, with every story
  unchanged.

## The dead end worth recording

The first instinct was `origin: number | null` _full stop_, with `SIZE` folded
into `POSITION`. That can't be quite right on paper: `SIZE` and `POSITION` are
both anchored, yet the code distinguishes them — a faceted year panel
(`POSITION [1955, 2010]`) must not baseline-align, a bar (`SIZE`) must. The fear
was that this needed a third origin state (free / local / global). Empirically
it did **not**: the distinction the guard actually needs is "origin 0 vs origin
≠ 0," which `number | null` already expresses, and the duplicate constraint-path
guard was removable outright. The two-value `origin` shipped, and the faceted
charts render identically. The lesson: the SIZE/POSITION operational split read
as load-bearing from the comments, but most of it was a workaround for the
`posScale(0)` baseline assuming origin 0 — which the `origin` field makes
explicit.

## Open

- The genuinely-constant case (#508 `CONSTANT`, `linear(0, w)` — fixed pixels
  that don't scale) is still spelled `UNDEFINED`. It is a real third role,
  distinct from `origin: null` (which still scales with σ).
- The `alignFallbackBaseline` still uses `posScale(0)` rather than
  `posScale(origin)`; with `origin` now explicit, an origin-aware fallback
  could retire the last copy of the data-positioned guard entirely.
