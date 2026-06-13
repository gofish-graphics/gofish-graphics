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
  const totalSpacing = spacing * (n - 1);
  const available = budget - totalSpacing;
  return Array.from({ length: n }, () => available / n);
}
