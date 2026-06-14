// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * A per-axis linear-system bounding box (#39), modeled on Bluefish's
 * `createLinSysBBox`/`solveSystem` (`bbox.ts`). Each axis is a **2-unknown
 * system in `(min, size)`** — `min` is the absolute low edge, `size` the
 * extent. Every facet a caller pins is one linear equation in those unknowns:
 *
 * | facet  | reads as          | coefficients `[min, size]` |
 * | ------ | ----------------- | -------------------------- |
 * | min    | `min`             | `[1, 0]`                   |
 * | max    | `min + size`      | `[1, 1]`                   |
 * | center | `min + size/2`    | `[1, 0.5]`                 |
 * | size   | `size`            | `[0, 1]`                   |
 *
 * - **< 2 independent equations** → only what was written is readable; the rest
 *   are `undefined` (the system is under-determined).
 * - **exactly 2 independent** → solve `(min, size)`; every facet becomes
 *   readable and is marked *inferred*. (Two edges therefore *determine a size* —
 *   exactly what scatter's interval channels need, and what `place()`'s
 *   position-only protocol could not express.)
 * - **a 3rd, dependent equation** → checked for consistency against the solve
 *   within tolerance; a violation is a structured over-determination report
 *   (returned to the caller to warn), NOT a silent last-writer-wins.
 *
 * Each equation records its `owner` so a double-write on the same facet is a
 * named conflict (one owner per facet). This is the ownership ledger
 * size-setting constraints write into (size-claims.md "Dimension B"); GoFish's
 * `(intrinsic-local box, translate)` split is bridged at the call site by
 * stamping `min` into the translate and `[0, size]` into the local box.
 */
export type BBoxFacet = "min" | "max" | "center" | "size";

const COEFFS: Record<BBoxFacet, [number, number]> = {
  min: [1, 0],
  max: [1, 1],
  center: [1, 0.5],
  size: [0, 1],
};

export interface BBoxConflict {
  facet: BBoxFacet;
  /** Value the new equation asserts. */
  asserted: number;
  /** Value the already-solved system implies. */
  implied: number;
  owner: string | undefined;
  priorOwner: string | undefined;
}

interface Equation {
  facet: BBoxFacet;
  value: number;
  owner: string | undefined;
}

/** Solved unknowns `[min, size]`, or undefined when rank < 2. */
type Solution = [number, number] | undefined;

export class BBox {
  /** Independent equations retained (at most 2 drive the solve). */
  private eqs: Equation[] = [];
  private solution: Solution = undefined;

  /**
   * Add one facet equation. Returns a conflict descriptor when the write is
   * inconsistent with the already-determined system (rank-2 over-determination
   * or a second write to the same facet with a different value), else
   * undefined. A consistent or new equation is absorbed.
   */
  add(
    facet: BBoxFacet,
    value: number,
    owner?: string,
    tolerance = 1e-6
  ): BBoxConflict | undefined {
    // If the system already determines this facet, the write is a redundant
    // check rather than new information (rank-2 over-determination, or a repeat
    // of an existing facet). Verify consistency; report on violation.
    if (this.solution !== undefined) {
      const implied = this.read(facet)!;
      if (Math.abs(implied - value) > tolerance) {
        return {
          facet,
          asserted: value,
          implied,
          owner,
          priorOwner: this.eqs[0]?.owner,
        };
      }
      return undefined;
    }
    const existing = this.eqs.find((e) => e.facet === facet);
    if (existing) {
      // Same facet again: a consistent repeat is ignored; a contradiction is a
      // single-owner conflict.
      if (Math.abs(existing.value - value) > tolerance) {
        return {
          facet,
          asserted: value,
          implied: existing.value,
          owner,
          priorOwner: existing.owner,
        };
      }
      return undefined;
    }
    // Reject a second equation that is linearly dependent on the first (e.g.
    // `min` then `min`): handled above by the same-facet check. Distinct facets
    // are always independent here (the four facets are pairwise independent in
    // 2 unknowns), so two distinct facets solve the system.
    this.eqs.push({ facet, value, owner });
    if (this.eqs.length === 2) this.solve();
    return undefined;
  }

  private solve(): void {
    const [a, b] = this.eqs;
    const [a0, a1] = COEFFS[a.facet];
    const [b0, b1] = COEFFS[b.facet];
    const det = a0 * b1 - a1 * b0;
    if (Math.abs(det) < 1e-12) return; // dependent (shouldn't happen for distinct facets)
    const min = (a.value * b1 - b.value * a1) / det;
    const size = (a0 * b.value - b0 * a.value) / det;
    this.solution = [min, size];
  }

  /** Whether the system is fully determined (rank 2). */
  get solved(): boolean {
    return this.solution !== undefined;
  }

  /** Read a facet: from the solve when determined, else from a direct pin, else
   *  undefined (under-determined). */
  read(facet: BBoxFacet): number | undefined {
    if (this.solution !== undefined) {
      const [min, size] = this.solution;
      const [c0, c1] = COEFFS[facet];
      return c0 * min + c1 * size;
    }
    return this.eqs.find((e) => e.facet === facet)?.value;
  }
}
