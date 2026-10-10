/**
 * The σ-scope registry — the ONE place σ / posScale is derived.
 *
 * Every continuous axis is one affine map per σ-scope, `px(d) = σ·d +
 * originPx` (an {@link AxisMap}), and σ is solved once per scope from its size
 * claim at the frame equation `claim.width(σ) = allocated`
 * (`Monotonic.inverse`). The scope's type fixes whether it has an `originPx`.
 * One mechanism covers every site:
 *
 *   - **sized nodes solve** (#1114) — the render root, a coord boundary, and
 *     a node whose size is given to it (a literal or data-valued `w`/`h`, a
 *     facet panel's slot), each mapping its measure-keyed domain into that
 *     size — each calls {@link ScopeRegistry.solveScope} (or
 *     {@link ScopeRegistry.solveSize} for a grid's bare tracks);
 *   - **everyone else INHERITS** — "not a root → inherit": a non-root site
 *     simply does not call the solve, so the inherited σ propagates unchanged.
 *     This is the structural rule that stops an intermediate from re-rooting.
 *
 * Behind `GOFISH_DUMP_SCOPES` the registry also prints every scope's frame
 * equation.
 */
import * as Monotonic from "../../util/monotonic";
import {
  hasOrigin,
  isCONTINUOUS,
  originIs,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
} from "../underlyingSpace";
import type { Extent } from "../extent";
import type { AxisMap } from "../domain";
import { envFlag } from "../../util";
import type { RenderSession } from "../_node";

export type ScopeKind = "root" | "sized" | "coord" | "grid" | "recenter";

/** A solved σ-scope on one axis: its slope `sigma` (px per data unit) and,
 *  when the scope's type has an origin, `originPx`, the pixel of data 0 (the
 *  baseline) in the scope's box. The map of the scope is
 *  `px(d) = sigma·d + originPx`. An origin-less (`none`) scope has only
 *  differences, so it has a slope and no `originPx`. */
export type ScopeSolution = { sigma: number; originPx: number | undefined };

/** The frame a solved scope places its content in, `px(d) = sigma·d +
 *  originPx`, or undefined for an unsolved scope or one with no origin (only
 *  differences). */
export const scopeFrame = (
  scope: ScopeSolution | undefined
): AxisMap | undefined =>
  scope?.originPx === undefined
    ? undefined
    : { sigma: scope.sigma, originPx: scope.originPx };

/** The frame a node with type `space` places its children in, given the
 *  scale it was handed (its parent's frame's map, and its σ). A pinned node
 *  shares its parent's frame. A free node, or a pinned one its parent nests
 *  at a datum (handed σ but no map), has a frame of its own whose 0 is its
 *  origin, `{σ, 0}`: its parent places that origin. A node with no data 0
 *  has no frame. */
export const frameOf = (
  space: UnderlyingSpace | undefined,
  handed: { sigma?: number; map?: AxisMap }
): AxisMap | undefined => {
  if (originIs(space, "pinned") && handed.map !== undefined) return handed.map;
  if (!originIs(space, "free") && !originIs(space, "pinned")) return undefined;
  const sigma = handed.map?.sigma ?? handed.sigma;
  return sigma === undefined ? undefined : { sigma, originPx: 0 };
};

/** The one seating rule: where a child with type `child` sits in its
 *  parent's `frame` on one axis (`seatPx`, the pixel its baseline is placed
 *  at), and the map it is handed (`childMap`, its own frame, {@link
 *  frameOf}). A pinned child shares the frame: it sits at 0 and places its
 *  data through the frame's map. A free child's position is set by its
 *  parent: its baseline sits at the frame's `originPx`, the pixel of data 0,
 *  and its own frame has that baseline at 0. A child with no data 0 sits at
 *  0 and has no frame.
 *
 *  TODO(#773 follow-up): data 0 is the additive identity of the measure's
 *  algebraic structure (an ordered additive group's 0). Measures don't carry
 *  their structure yet, so every measure is treated as a group with identity
 *  0. A torsor-valued measure (dates, temperatures) has no identity and
 *  should reject bars. */
export const seatInScope = (
  frame: AxisMap | undefined,
  child: UnderlyingSpace | undefined
): { seatPx: number; childMap: AxisMap | undefined } => ({
  seatPx: originIs(child, "free") ? (frame?.originPx ?? 0) : 0,
  childMap: frameOf(child, { map: frame }),
});

/** The pixel of data 0 in a box whose claim starts `offset` px above its low
 *  edge: a claim is measured from data 0, so data 0 sits `claim.descent(σ)`
 *  above that. */
const originPxAt = (claim: Extent, sigma: number, offset = 0): number =>
  offset + claim.descent.run(sigma);

/** One axis's contribution to the #582 equal-measure recentering: the
 *  scope's type and size claim, its box, and its solved σ (`unitPx`, the
 *  quantity the two axes must agree on when they share a measure). */
export type EqualMeasureAxis = {
  space: CONTINUOUS_TYPE;
  claim: Extent;
  canvas: number;
  unitPx: number;
};

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
   * Solve a scope root on one axis from its type and size claim. Every
   * continuous scope solves the same frame equation, `claim.width(σ) =
   * allocated`, so any pixel overhead the claim carries (spacing, padding)
   * takes its pixels and the data part gets the rest. A scope whose type has
   * an origin also fixes `originPx`, the pixel of data 0: a claim is
   * measured from data 0, so `originPx = claim.descent(σ)` above the box's
   * low edge. For a pinned claim with no overhead that is `−σ·min`, the
   * domain's low edge at 0. A scope whose type has no data coordinates
   * (a spread of magnitudes is ordinal) still solves σ from its claim, with no
   * `originPx`. Returns undefined when there is no claim or it cannot
   * determine σ (a claim with no σ in it, such as a zero-width domain).
   */
  solveScope(
    meta: ScopeMeta,
    space: UnderlyingSpace | undefined,
    claim: Extent | undefined,
    allocated: number
  ): ScopeSolution | undefined {
    if (space === undefined || claim === undefined) return undefined;
    const sigma = claim.width.inverse(allocated, {
      upperBoundGuess: allocated,
    });
    if (DUMP_SCOPES)
      this.entries.push({
        ...meta,
        allocated,
        frame: `${isCONTINUOUS(space) ? `${space.origin}[${space.dataInterval.min},${space.dataInterval.max}]` : space.kind} ${Monotonic.print(claim.width)}`,
        sigma,
        hasMap: hasOrigin(space),
      });
    if (sigma === undefined) return undefined;
    return {
      sigma,
      originPx: hasOrigin(space) ? originPxAt(claim, sigma) : undefined,
    };
  }

  /**
   * Equal-measure recentering, modeled as a named post-solve scope
   * operation. When x and y carry the SAME unit of measure, "1 unit
   * on x" and "1 unit on y" are the same quantity, so their data→pixel scales
   * must be EQUAL — a circle stays circular. The two axes' independently-solved
   * scopes are therefore collapsed into ONE shared σ (the binding, smaller
   * `unitPx`); the other axis takes slack, centered by convention: its content
   * (the claim at the shared σ) is centered in its canvas, and its `originPx`
   * follows from where that puts the claim's baseline.
   *
   * This is the ONE place a post-solve σ adjustment happens, so it lives on the
   * registry (not inlined in `gofish.tsx`): every slope a render produces is
   * registry-sourced, and `GOFISH_DUMP_SCOPES` records the FINAL σ (a `recenter`
   * entry per axis). Returns the recentered solutions; a no-op (undefined)
   * unless both axes have a solved scope.
   */
  recenterEqualMeasure(
    rootKey: string,
    axisInfo: [EqualMeasureAxis | undefined, EqualMeasureAxis | undefined]
  ): [ScopeSolution, ScopeSolution] | undefined {
    const [ax, ay] = axisInfo;
    if (ax === undefined || ay === undefined) return undefined;
    const shared = Math.min(ax.unitPx, ay.unitPx); // binding axis wins
    const solve = (info: EqualMeasureAxis, axis: 0 | 1): ScopeSolution => {
      const offset = (info.canvas - info.claim.width.run(shared)) / 2; // center slack
      if (DUMP_SCOPES)
        this.entries.push({
          kind: "recenter",
          rootKey,
          axis,
          allocated: info.canvas,
          frame: `center(σ=${shared})`,
          sigma: shared,
          hasMap: hasOrigin(info.space),
        });
      return {
        sigma: shared,
        originPx: hasOrigin(info.space)
          ? originPxAt(info.claim, shared, offset)
          : undefined,
      };
    };
    return [solve(ax, 0), solve(ay, 1)];
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
