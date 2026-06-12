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
 * `spacing` between adjacent slots. Equal split by default; with a valid
 * `weights` array (length `n`, all finite and ≥ 0, positive sum) the available
 * space is split in proportion to the weights. Extracted verbatim from spread's
 * slice arithmetic (spread.tsx, "Calculate available space for children …") so
 * the two paths cannot drift.
 *
 * `weights` are positional: `weights[i]` is the share of slot `i` in placement
 * order (the same order distribute walks), so a reversed distribute must pass
 * weights already aligned to that reversed order.
 */
export function allocateSlices(
  budget: number,
  spacing: number,
  n: number,
  weights?: number[]
): number[] {
  const totalSpacing = spacing * (n - 1);
  const available = budget - totalSpacing;
  const weightsOk =
    weights !== undefined &&
    weights.length === n &&
    weights.every((w) => Number.isFinite(w) && w >= 0);
  const weightSum = weightsOk
    ? weights!.reduce((acc, w) => acc + Math.max(w, 0), 0)
    : 0;
  const useWeights = weightsOk && weightSum > 0;
  return useWeights
    ? weights!.map((w) => (Math.max(w, 0) / weightSum) * available)
    : Array.from({ length: n }, () => available / n);
}
