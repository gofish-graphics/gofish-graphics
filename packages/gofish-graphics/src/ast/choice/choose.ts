// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

/**
 * Choice, v0: pick one of several candidate settings for a whole chart by
 * trying them in preference order and scoring what each one produces.
 *
 * This is the WHOLE-CHART form. Layout measures and places in one recursive
 * pass and writes each node's box once, so a subtree cannot be laid out again
 * with a different setting. The only way to compare candidates today is to run
 * the entire pipeline once per candidate, on a freshly built tree each time,
 * and keep the best result. `labelAngle: "auto"` (axes/autoLabelAngle.ts) is
 * the first user.
 *
 * The later, compositional form is a node-local choice: each choice point lays
 * out its own alternatives and prunes the ones another alternative dominates
 * (#486, #630). The evaluation strategy here is what that replaces. The policy
 * half (a candidate list in preference order plus a score) is meant to carry
 * over to it unchanged, which is why the two halves live in separate modules.
 */

/** A lexicographic score: compare the first entry, then the second, and so
 *  on. Lower is better. */
export type Score = readonly number[];

/** Negative when `a` is better than `b`, positive when worse, 0 when equal. */
export function compareScores(a: Score, b: Score): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The default fit test: the first score entry (the main cost) is zero. */
export const firstEntryIsZero = (s: Score): boolean => s[0] === 0;

/**
 * Run `candidates` in order (most preferred first) and return the first whose
 * score fits. If none fits, return the candidate with the lowest score; ties
 * go to the earlier (more preferred) candidate, so the fallback is
 * deterministic. Candidates after the first fit are never run.
 */
export async function chooseFirstFit<C, R>(
  candidates: readonly C[],
  run: (candidate: C) => Promise<R>,
  score: (result: R) => Score,
  fits: (score: Score) => boolean = firstEntryIsZero
): Promise<{ candidate: C; result: R; score: Score }> {
  if (candidates.length === 0) {
    throw new Error("chooseFirstFit: no candidates to choose from");
  }
  let best: { candidate: C; result: R; score: Score } | undefined;
  for (const candidate of candidates) {
    const result = await run(candidate);
    const s = score(result);
    if (fits(s)) return { candidate, result, score: s };
    if (best === undefined || compareScores(s, best.score) < 0) {
      best = { candidate, result, score: s };
    }
  }
  return best!;
}
