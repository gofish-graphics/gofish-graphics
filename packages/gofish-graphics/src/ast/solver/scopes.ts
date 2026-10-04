/**
 * The σ-scope registry — the ONE place σ / posScale is derived.
 *
 * Every continuous axis is one affine map per σ-scope, `px(d) = pxMin + σ·(d −
 * domainMin)`, and σ is solved once per scope at the frame equation
 * `content(σ) = allocated` (`Monotonic.inverse`). One mechanism covers every
 * site:
 *
 *   - **scope roots solve** — the render root, an axis with an explicit pixel
 *     size (self-scaling region), a composed-constraint budget that roots its
 *     own scope, a `shared` operator, a coord boundary — each calls
 *     {@link ScopeRegistry.solveSize} / {@link ScopeRegistry.solvePosition};
 *   - **everyone else INHERITS** — "not a root → inherit": a non-root site
 *     simply does not call the solve, so the inherited σ propagates unchanged.
 *     This is the structural rule that stops an intermediate from re-rooting.
 *
 * Behind `GOFISH_DUMP_SCOPES` the registry also prints every scope's frame
 * equation.
 */
import * as Monotonic from "../../util/monotonic";
import type { AxisMap } from "../domain";
import { continuousInterval, type UnderlyingSpace } from "../underlyingSpace";
import type { Extent } from "../extent";
import { envFlag } from "../../util";
import type { RenderSession } from "../_node";

export type ScopeKind =
  | "root"
  | "self-scaled"
  | "constraint-budget"
  | "shared"
  | "coord"
  | "grid"
  | "datum-position"
  | "recenter";

/** One axis's contribution to the #582 equal-measure recentering: either an
 *  anchored POSITION axis (its data min, its size claim, and its canvas) or a
 *  bare SIZE axis (just its σ). `unitPx` is the axis's pixels-per-data-unit
 *  before recentering — the quantity the two axes must agree on when they
 *  share a measure. */
export type EqualMeasureAxis =
  | {
      kind: "position";
      unitPx: number;
      min: number;
      /** The pixels the content claims at σ (data width·σ plus any pixel
       *  overhead), used to center it in the canvas. */
      claim: Monotonic.Monotonic;
      canvas: number;
    }
  | { kind: "size"; unitPx: number };

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
const DUMP_SCOPES = envFlag("GOFISH_DUMP_SCOPES");

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
   * cannot determine σ (slope 0) — the caller applies its own fallback.
   */
  solveSize(
    meta: ScopeMeta,
    frame: Monotonic.Monotonic,
    allocated: number,
    opts?: { tolerance?: number; lowerBound?: number; upperBoundGuess?: number }
  ): number | undefined {
    const sigma = frame.inverse(allocated, opts);
    if (DUMP_SCOPES)
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
   * Build the anchored data→pixel map for a pinned scope root. A pinned scope
   * is a SIZE frame too: σ solves the scope's size claim against its box,
   * `claim.width(σ) = allocated`, exactly as {@link solveSize} does, so any
   * pixel overhead the claim carries (a pinned row of bars with spacing, a
   * padded nest) takes its pixels and the data part gets the rest. The map
   * then lays the data interval out with that σ from the box's low edge:
   * `px(d) = σ·(d − min)`. With no overhead the claim is `dataWidth·σ`, so σ
   * is `allocated / dataWidth`, the domain filling the box.
   *
   * A claim with no σ in it (a zero-width domain) cannot be fit; σ is then
   * `allocated / dataWidth`, the same degenerate map an empty domain has
   * always had. Returns undefined, and records no scope, for a type that is
   * not pinned.
   */
  solvePosition(
    meta: ScopeMeta,
    space: UnderlyingSpace | undefined,
    extent: Extent | undefined,
    allocated: number
  ): AxisMap | undefined {
    const iv = space === undefined ? undefined : continuousInterval(space);
    if (iv === undefined || extent === undefined) return undefined;
    const sigma =
      extent.width.inverse(allocated, { upperBoundGuess: allocated }) ??
      allocated / (iv.max - iv.min);
    const map: AxisMap = { sigma, domainMin: iv.min, pxMin: 0 };
    if (DUMP_SCOPES)
      this.entries.push({
        ...meta,
        allocated,
        frame: `[${iv.min},${iv.max}] ${Monotonic.print(extent.width)}`,
        sigma,
        hasMap: true,
      });
    return map;
  }

  /**
   * Equal-measure recentering, modeled as a named post-solve scope
   * operation. When x and y carry the SAME unit of measure, "1 unit
   * on x" and "1 unit on y" are the same quantity, so their data→pixel scales
   * must be EQUAL — a circle stays circular. The two axes' independently-solved
   * scopes are therefore collapsed into ONE shared σ (the binding, smaller
   * `unitPx`); the other axis takes slack, centered by convention. A POSITION
   * axis writes back a recentered anchored map; a SIZE axis writes back its σ
   * (content stays origin-anchored — SIZE-slack centering is deferred).
   *
   * This is the ONE place a post-solve σ adjustment happens, so it lives on the
   * registry (not inlined in `gofish.tsx`): every slope a render produces is
   * registry-sourced, and `GOFISH_DUMP_SCOPES` records the FINAL σ (a `recenter`
   * entry per axis). Mutates `posScales`
   * / `rootScaleFactors` in place; a no-op unless both axes have a continuous
   * scale to equate.
   */
  recenterEqualMeasure(
    rootKey: string,
    axisInfo: [EqualMeasureAxis | undefined, EqualMeasureAxis | undefined],
    posScales: (AxisMap | undefined)[],
    rootScaleFactors: (number | undefined)[]
  ): void {
    const [ax, ay] = axisInfo;
    if (ax === undefined || ay === undefined) return;
    const shared = Math.min(ax.unitPx, ay.unitPx); // binding axis wins
    for (const axis of [0, 1] as const) {
      const info = axisInfo[axis]!;
      if (info.kind === "position") {
        const offset = (info.canvas - info.claim.run(shared)) / 2; // center slack
        // Same affine map as `(pos − min)·shared + offset`, intercept explicit.
        posScales[axis] = {
          sigma: shared,
          domainMin: info.min,
          pxMin: offset,
        };
      } else {
        rootScaleFactors[axis] = shared;
      }
      if (DUMP_SCOPES)
        this.entries.push({
          kind: "recenter",
          rootKey,
          axis,
          allocated: info.kind === "position" ? info.canvas : NaN,
          frame:
            info.kind === "position"
              ? `[${info.min},·]→center(σ=${shared})`
              : `σ:=min(x,y)`,
          sigma: shared,
          hasMap: info.kind === "position",
        });
    }
  }

  /** Print one line per scope: root kind/key, axis, allocated px, the frame
   *  equation, the solved σ, and whether an anchored map is present. */
  dump(): void {
    if (!DUMP_SCOPES || this.entries.length === 0) return;
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
