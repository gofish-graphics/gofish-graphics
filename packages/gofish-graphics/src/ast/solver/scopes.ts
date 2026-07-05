/**
 * The σ-scope registry (#39 endgame, Stage 6b) — the ONE place σ / posScale is
 * derived.
 *
 * Every continuous axis is one affine map per σ-scope, `px(d) = pxMin + σ·(d −
 * domainMin)`, and σ is solved once per scope at the frame equation
 * `content(σ) = allocated` (`Monotonic.inverse`). Before Stage 6b that inversion
 * lived, hand-ordered, at four+ sites (the render root, a self-scaled axis, a
 * composed-constraint budget, a `shared` scope, and a coord boundary), with the
 * #618 propagate-vs-re-root guard hand-written to stop an intermediate from
 * re-rooting. This module makes those a SINGLE mechanism:
 *
 *   - **scope roots solve** — the render root, an axis with an explicit pixel
 *     size (self-scaling region), a composed-constraint budget that roots its
 *     own scope, a `shared` operator, a coord boundary — each calls
 *     {@link ScopeRegistry.solveSize} / {@link ScopeRegistry.solvePosition};
 *   - **everyone else INHERITS** — the #618 guard is now the structural rule
 *     "not a root → inherit": a non-root site simply does not call the solve, so
 *     the inherited σ propagates unchanged.
 *
 * The arithmetic is exactly what the sites ran inline (`Monotonic.inverse` for
 * the slope, `posScaleFromSpace` for the anchored map), so the numbers are
 * bit-identical; the registry adds the single choke-point plus, behind
 * `GOFISH_DUMP_SCOPES`, a printable dump of every scope's frame equation.
 */
import * as Monotonic from "../../util/monotonic";
import { posScaleFromSpace, type AxisMap } from "../domain";
import { envFlag } from "../../util";
import type { RenderSession } from "../_node";

export type ScopeKind =
  | "root"
  | "self-scaled"
  | "constraint-budget"
  | "shared"
  | "coord";

/** Identity of the scope being solved — its root node label and the axis. */
export interface ScopeMeta {
  kind: ScopeKind;
  /** A stable label for the scope root (node key/type) for the dump. */
  rootKey: string;
  axis: 0 | 1;
}

interface ScopeEntry extends ScopeMeta {
  allocated: number;
  /** The frame equation LHS, printed (`Monotonic.print`), or a POSITION map's
   *  `[min,max]→[0,alloc]` shape. */
  frame: string;
  sigma: number | undefined;
  hasMap: boolean;
}

/** Whether the scope dump is on. Off (and near-zero-cost) in prod. */
const dumpEnabled = (): boolean => envFlag("GOFISH_DUMP_SCOPES");

/**
 * Per-render record of every σ-scope solved. Lives on the {@link RenderSession}
 * (one per render, so no cross-render leakage), and is reset at the start of a
 * layout pass so it reflects the last pass if layout re-runs.
 */
export class ScopeRegistry {
  private entries: ScopeEntry[] = [];

  /** Clear recorded scopes — called at the root solve so a second layout pass
   *  does not accumulate stale entries. */
  reset(): void {
    this.entries = [];
  }

  /**
   * Solve σ for a SIZE frame at a scope root: invert `content(σ) = allocated`.
   * `frame` is the σ-affine width `Monotonic` (a space's `width`, or a composed
   * distribute size domain). Returns the slope, or `undefined` when the frame
   * cannot determine σ (slope 0) — the caller keeps applying its own fallback,
   * exactly as before.
   */
  solveSize(
    meta: ScopeMeta,
    frame: Monotonic.Monotonic,
    allocated: number,
    opts?: { tolerance?: number; lowerBound?: number; upperBoundGuess?: number }
  ): number | undefined {
    const sigma = frame.inverse(allocated, opts);
    if (dumpEnabled())
      this.entries.push({
        ...meta,
        allocated,
        frame: Monotonic.print(frame),
        sigma,
        hasMap: false,
      });
    return sigma;
  }

  /**
   * Build the anchored data→pixel map for a POSITION scope root — the space's
   * `[min,max]` domain onto `[0, allocated]`. Records a scope only when a map
   * actually results (a non-anchored axis is not a POSITION scope here).
   */
  solvePosition(
    meta: ScopeMeta,
    space:
      | { kind: string; dataDomain?: { min: number; max: number } | "delta" }
      | undefined,
    allocated: number
  ): AxisMap | undefined {
    const map = posScaleFromSpace(space, allocated);
    if (map !== undefined && dumpEnabled()) {
      const dom =
        space && space.dataDomain && space.dataDomain !== "delta"
          ? `[${space.dataDomain.min},${space.dataDomain.max}]`
          : "[·]";
      this.entries.push({
        ...meta,
        allocated,
        frame: `${dom}→[0,${allocated}]`,
        sigma: map.sigma,
        hasMap: true,
      });
    }
    return map;
  }

  /** Print one line per scope: root kind/key, axis, allocated px, the frame
   *  equation, the solved σ, and whether an anchored map is present. */
  dump(): void {
    if (!dumpEnabled() || this.entries.length === 0) return;
    for (const e of this.entries) {
      console.log(
        `[scope] ${e.kind} key=${e.rootKey} axis=${e.axis === 0 ? "x" : "y"} ` +
          `alloc=${e.allocated}px  ${e.frame} = ${e.allocated}  ` +
          `σ=${e.sigma ?? "—"} map=${e.hasMap ? "yes" : "no"}`
      );
    }
  }
}

/**
 * The render's scope registry: the one on the session (created on first use so
 * the whole render shares it), or a throwaway when there is no session (a
 * standalone `layout()` call). Every σ-scope derivation goes through the
 * returned registry.
 */
export function getScopeRegistry(
  session: RenderSession | undefined
): ScopeRegistry {
  if (!session) return new ScopeRegistry();
  return (session.scopes ??= new ScopeRegistry());
}
