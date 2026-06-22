// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// Shared layout machinery for the distribute constraint and (phase 3) spread.
//
// A constraint's *space fold* (bottom-up, pre-layout) composes child claims
// into the parent's claim — that lives in each constraint file
// (`distributeSpaceFold` in distribute.ts, `alignSpaceFold` in align.ts). This
// file holds the *budget adjoint* (top-down, layout-time): once the parent has
// solved its scale factor σ against an allotted size, it must hand each
// claim-less ("fill") child a concrete size. `allocateSlices` is that fill
// policy — the one piece of information beyond align + distribute, i.e. the
// flex-layout fragment (see
// apps/docs/docs/internals/design/constraints-as-core.md, "folds, max-plus
// closure, and the budget adjoint").

/**
 * One slot's extent: a `budget` (pixels) split into `n` equal slots after
 * reserving `spacing` between adjacent ones. The single source of the
 * equal-flex-track / fill-slice formula — used by `allocateSlices` (distribute
 * budget) and the `grid` constraint (constraints/grid.ts) so they cannot drift.
 */
export function sliceExtent(
  budget: number,
  spacing: number,
  n: number
): number {
  return (budget - spacing * (n - 1)) / n;
}

/**
 * Divide a one-dimensional `budget` (pixels) among `n` slots after reserving
 * `spacing` between adjacent slots — an equal share each. Extracted verbatim
 * from spread's slice arithmetic (spread.tsx, "Calculate available space for
 * children …") so the two paths cannot drift.
 */
export function allocateSlices(
  budget: number,
  spacing: number,
  n: number
): number[] {
  const slice = sliceExtent(budget, spacing, n);
  return Array.from({ length: n }, () => slice);
}
