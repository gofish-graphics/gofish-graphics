// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Arith } from "../solver/arith";

/**
 * A per-axis linear-system bounding box (#39), modeled on Bluefish's
 * `createLinSysBBox`/`solveSystem` (`bbox.ts`). Each axis is a **2-unknown
 * system in `(min, size)`** — `min` is the absolute low edge, `size` the
 * extent. Every key a caller pins is one linear equation in those unknowns:
 * an **anchor equation** (min/center/max), or a **size equation**.
 *
 * | key    | reads as          | coefficients `[min, size]` |
 * | ------ | ----------------- | -------------------------- |
 * | min    | `min`             | `[1, 0]`                   |
 * | max    | `min + size`      | `[1, 1]`                   |
 * | center | `min + size/2`    | `[1, 0.5]`                 |
 * | size   | `size`            | `[0, 1]`                   |
 *
 * - **< 2 independent equations** → only what was written is readable; the rest
 *   are `undefined` (the system is under-determined).
 * - **exactly 2 independent** → solve `(min, size)`; every key becomes readable
 *   and is marked *inferred*. (Two anchors therefore *determine a size* —
 *   exactly what scatter's interval channels need, and what `place()`'s
 *   position-only protocol could not express.)
 * - **a 3rd, dependent equation** → checked for consistency against the solve
 *   within tolerance; a violation is a structured over-determination report
 *   (returned to the caller to warn), NOT a silent last-writer-wins.
 *
 * Each equation records its `owner` so a double-write on the same key is a
 * named conflict (one owner per key). This is the ownership ledger
 * size-setting constraints write into
 * (apps/docs/docs/internals/design/size-claims.md "Dimension B"); GoFish's
 * `(intrinsic-local box, translate)` split is bridged at the call site by
 * stamping `min` into the translate and `[0, size]` into the local box.
 *
 * **Key values in any {@link Arith}.** A key's value is a `T`: a number (a
 * node's own box in layout), a piecewise-linear value in σ (`values`, a
 * bar's `size = count·σ`, resolved once σ is solved; see
 * apps/docs/docs/internals/design/unified-propagation.md), or a formula of a
 * layer's plan (`Tape`), so a size two pins determine stays a formula in
 * what layout measures. Consistency is checked by the arithmetic's `near`.
 */
export type BBoxKey = "min" | "max" | "center" | "size";

const COEFFS: Record<BBoxKey, [number, number]> = {
  min: [1, 0],
  max: [1, 1],
  center: [1, 0.5],
  size: [0, 1],
};

export interface BBoxConflict {
  key: BBoxKey;
  /** Value the new equation asserts (as the arithmetic reports it). */
  asserted: number;
  /** Value the already-solved system implies (as the arithmetic reports it). */
  implied: number;
  owner: string | undefined;
  priorOwner: string | undefined;
}

interface Equation<T> {
  key: BBoxKey;
  value: T;
  owner: string | undefined;
}

export class BBox<T> {
  /** Independent equations retained (at most 2 drive the solve). */
  private eqs: Equation<T>[] = [];
  /** Solved unknowns `[min, size]`, or undefined when rank < 2. */
  private solution: [T, T] | undefined = undefined;

  constructor(private readonly A: Arith<T>) {}

  /**
   * Add one box-key equation. Returns a conflict descriptor when the write is
   * inconsistent with the already-determined system (rank-2 over-determination
   * or a second write to the same key with a different value), else
   * undefined. A consistent or new equation is absorbed.
   */
  add(
    key: BBoxKey,
    value: T,
    owner?: string,
    tolerance = 1e-6
  ): BBoxConflict | undefined {
    const A = this.A;
    // If the system already determines this key, the write is a redundant
    // check rather than new information (rank-2 over-determination, or a repeat
    // of an existing key). Verify consistency; report on violation.
    if (this.solution !== undefined) {
      const implied = this.readValue(key)!;
      const owners = {
        owner: owner ?? "cell",
        priorOwner: this.eqs[0]?.owner ?? "cell",
      };
      if (!A.agree(value, implied, tolerance, owners)) {
        return {
          key,
          asserted: A.report(value),
          implied: A.report(implied),
          owner,
          priorOwner: this.eqs[0]?.owner,
        };
      }
      return undefined;
    }
    const existing = this.eqs.find((e) => e.key === key);
    if (existing) {
      // Same key again: a consistent repeat is ignored; a contradiction is a
      // single-owner conflict.
      const owners = {
        owner: owner ?? "cell",
        priorOwner: existing.owner ?? "cell",
      };
      if (!A.agree(value, existing.value, tolerance, owners)) {
        return {
          key,
          asserted: A.report(value),
          implied: A.report(existing.value),
          owner,
          priorOwner: existing.owner,
        };
      }
      return undefined;
    }
    // The four keys are pairwise independent in 2 unknowns, so two distinct
    // keys solve the system.
    this.eqs.push({ key, value, owner });
    if (this.eqs.length === 2) this.solve();
    return undefined;
  }

  private solve(): void {
    const A = this.A;
    const [a, b] = this.eqs;
    const [a0, a1] = COEFFS[a.key];
    const [b0, b1] = COEFFS[b.key];
    const det = a0 * b1 - a1 * b0;
    if (Math.abs(det) < 1e-12) return; // dependent (shouldn't happen for distinct keys)
    // min  = (a·b1 − b·a1) / det,  size = (a0·b − b0·a) / det.
    const min = A.add(A.scale(b1 / det, a.value), A.scale(-a1 / det, b.value));
    const size = A.add(A.scale(a0 / det, b.value), A.scale(-b0 / det, a.value));
    this.solution = [min, size];
  }

  /** Whether the system is fully determined (rank 2). */
  get solved(): boolean {
    return this.solution !== undefined;
  }

  /** Read a box key: from the solve when determined, else from a direct pin,
   *  else undefined (under-determined). */
  readValue(key: BBoxKey): T | undefined {
    if (this.solution !== undefined) {
      const [min, size] = this.solution;
      const [c0, c1] = COEFFS[key];
      return this.A.add(this.A.scale(c0, min), this.A.scale(c1, size));
    }
    return this.eqs.find((e) => e.key === key)?.value;
  }
}
