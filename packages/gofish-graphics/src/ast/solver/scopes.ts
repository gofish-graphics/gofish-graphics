/**
 * The σ-scope registry — the ONE place σ / posScale is derived.
 *
 * Every continuous axis is one affine map per σ-scope, `px(d) = σ·d +
 * originPx` (an {@link AxisMap}), and σ is solved once per scope from its size
 * claim at the frame equation `claim.width(σ) = allocated`
 * (`Pwl.solve`). The scope's type fixes whether it has an `originPx`.
 * One mechanism covers every site:
 *
 *   - **sized nodes solve** (#1114) — the render root, a coord boundary, and
 *     a node whose size is given to it (a literal or data-valued `w`/`h`, a
 *     facet panel's slot), each mapping its measure-keyed domain into that
 *     size — each calls {@link ScopeRegistry.fit}. A literal
 *     size solves once, in the claim walk ({@link ScopeRegistry.solveFixed}),
 *     and its layout reuses the solution;
 *   - **everyone else INHERITS** — "not a root → inherit": a non-root site
 *     simply does not call the solve, so the inherited σ propagates unchanged.
 *     This is the structural rule that stops an intermediate from re-rooting.
 *
 * Behind `GOFISH_DUMP_SCOPES` the registry also prints every scope's frame
 * equation.
 */
import * as Pwl from "./pwl";
import {
  hasOrigin,
  isCONTINUOUS,
  isOneValue,
  originIs,
  type UnderlyingSpace,
} from "../underlyingSpace";
import { Extent, mapsDomain } from "../extent";
import type { AxisMap } from "../domain";
import { envFlag } from "../../util";
import type { GoFishNode, RenderSession } from "../_node";
import { fixedOverflow, overflows, warnLayout } from "../layoutWarnings";
import { resolveUnit, sameUnitVar } from "../measure";
import { reachAt, type ChromeForms } from "../chromeGutters";
import { fromFrameStart, type AxisDirection } from "../axisDirection";

export type ScopeKind = "root" | "sized" | "coord" | "recenter";

/** A solved σ-scope on one axis: its slope `sigma` (px per data unit) and,
 *  when the scope's type has an origin, `originPx`, the pixel of data 0 (the
 *  baseline) in the scope's box. The map of the scope is
 *  `px(d) = sigma·d + originPx`. A scope with no data 0 (an origin-less
 *  `none` scope has only differences; an ordinal one has no data
 *  coordinates) has a slope and no `originPx`: it places its content's box
 *  instead, which starts `startPx` from the scope's start edge. That is 0
 *  where the content fills the box; equal measure can leave it short of the
 *  box ({@link ScopeRegistry.equalizeMeasure}). */
export type ScopeSolution =
  | { sigma: number; originPx: number }
  | { sigma: number; originPx: undefined; startPx: number };

/** What {@link ScopeRegistry.fit} lays a claim out in: the scope it
 *  solved, if any, and the box it laid it in, in pixels. */
export type Fitted = { scope: ScopeSolution | undefined; box: number };

/** The slot a scope root's claim is fit to on one axis ({@link
 *  ScopeRegistry.fit}): its pixels, and whether they are a limit (a render
 *  size, a node's own size) or room that grows to hold the claim (the
 *  default canvas, a coord's budget). */
export type Slot = { px: number; limit: boolean };

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

/** Where a child sits in its parent on one axis: its `anchor`, its
 *  baseline or its box's start edge (`min`), at the pixel `px`. */
export type Seat = { px: number; anchor: "baseline" | "min" };

/** The one seating rule: where a child with type `child` sits in its
 *  parent's `scope` on one axis (`seat`), and the map it is handed
 *  (`childMap`, its own frame, {@link frameOf}). The scope is one the parent
 *  solved, or the frame it inherited (an {@link AxisMap} is a scope with a
 *  data 0), or undefined when it has neither.
 *
 *  Where the scope has a data 0 (its `originPx`), its map is the frame its
 *  children sit in. A pinned child shares the frame: its baseline sits at 0
 *  and it places its data through the frame's map. A free child's position
 *  is set by its parent: its baseline sits at the frame's `originPx`, the
 *  pixel of data 0, and its own frame has that baseline at 0. A child with
 *  no data 0 sits at 0 and has no frame. A parent with no scope seats a
 *  child's baseline at 0, its own origin, which its parent places.
 *
 *  A solved scope with no data 0 (a spread of magnitudes) has no frame to
 *  seat its content in: the content's box sits at the scope's `startPx`, its
 *  start edge where the content fills the box, as the render root places its
 *  box (`placeRoot` in gofish.tsx). So a sized node starts at its start edge
 *  on every axis.
 *
 *  TODO(#1051): data 0 is the additive identity of the measure's algebraic
 *  structure (an ordered additive group's 0). Sums are checked now: a unit
 *  without `CanAdd` (dates, temperatures) cannot be summed or stacked
 *  (#1197, `checkSummable` in measure.ts). What is left is the zero itself
 *  (`HasZero`): every measure is still seated as if it had one, so a bar of
 *  a single date or temperature (`.mean()`, which sums nothing) still hangs
 *  from 0 instead of being rejected. */
export const seatInScope = (
  scope: ScopeSolution | undefined,
  child: UnderlyingSpace | undefined
): { seat: Seat; childMap: AxisMap | undefined } => {
  if (scope !== undefined && scope.originPx === undefined)
    return { seat: { px: scope.startPx, anchor: "min" }, childMap: undefined };
  const frame = scope as AxisMap | undefined;
  return {
    seat: {
      px: originIs(child, "free") ? (frame?.originPx ?? 0) : 0,
      anchor: "baseline",
    },
    childMap: frameOf(child, { map: frame }),
  };
};

/** A seat in pixels from the start edge of the band that holds the child,
 *  for a seat read in `direction` relative to that band: `1` where the seat
 *  is in the band's own axis order, `-1` where it is in the other (a root
 *  whose y grows upward on the canvas, or a child whose y grows upward that
 *  no scope seats inside a layer that reads top-down, whose axis starts at
 *  its band's bottom). One rule for the render root (`placeRoot` in
 *  gofish.tsx) and a layer's children (`seatOf` in layer.tsx). */
export const seatInBand = (
  seat: Seat,
  band: number,
  direction: AxisDirection
): Seat => ({
  px: fromFrameStart(seat.px, band, direction),
  anchor: seat.anchor,
});

/** The pixel of data 0 in a box whose claim starts `offset` px above its low
 *  edge: a claim is measured from data 0, so data 0 sits `claim.descent(σ)`
 *  above that. */
const originPxAt = (claim: Extent, sigma: number, offset = 0): number =>
  offset + Pwl.at(claim.descent, sigma);

/** One axis of a scope root that {@link ScopeRegistry.equalizeMeasure}
 *  equalizes (#582): the scope's type and size claim, its box, the σ it
 *  solved there (the quantity the two axes must agree on when they share a
 *  measure), and the direction of its axis order (`1` when it starts at the
 *  screen's left or top, `-1` when it starts at the bottom). */
export type EqualMeasureAxis = {
  space: UnderlyingSpace | undefined;
  claim: Extent;
  box: number;
  sigma: number;
  direction: 1 | -1;
};

/** An axis {@link ScopeRegistry.equalizeMeasure} equalized: its solution
 *  at the shared σ, and its claim with the box's leftover pixels in it. */
export type EqualizedAxis = { solution: ScopeSolution; claim: Extent };

/** Identity of the scope being solved — its root node label and the axis. */
export interface ScopeMeta {
  kind: ScopeKind;
  /** A stable label for the scope root (node key/type) for the dump. */
  rootKey: string;
  axis: 0 | 1;
  /**
   * Where the scope seats data 0: "claim" (the default) at the pixel its
   * claim puts it, `claim.descent(σ)` above the box's low edge, as the root
   * does; "start" at the box's low edge, whatever the claim, so data 0 is
   * the start of the budget (the angular axis of the polar family, whose
   * data 0 is its baseline angle; see `AxisClasses.HasCycle`).
   */
  dataZero?: "claim" | "start";
}

interface ScopeEntry extends ScopeMeta {
  allocated: number;
  /** The frame equation LHS, printed (`Pwl.print`), or a POSITION map's
   *  `[min,max]→[0,alloc]` shape. */
  frame: string;
  sigma: number | undefined;
  hasMap: boolean;
}

/** A scope a node with a literal size solved in the claim walk: the keyed
 *  domain it maps, the solution, the type and widened, niced claim it
 *  solved, and its box (the size it solved against). */
export type FixedSolve = {
  key: string | undefined;
  solution: ScopeSolution;
  claim: Extent;
  space: UnderlyingSpace | undefined;
  box: number;
};

/**
 * Whether x and y carry the same DECLARED unit of measure (#582), so one
 * data unit must be the same pixel length on both. Two unknown units that
 * unify through overlays are one domain, not a claim that a data unit is
 * the same length on x and y, so they do not count.
 */
export function sharesDeclaredMeasure(
  x: UnderlyingSpace | undefined,
  y: UnderlyingSpace | undefined
): boolean {
  const unitX = x && isCONTINUOUS(x) ? x.measure?.unit : undefined;
  const unitY = y && isCONTINUOUS(y) ? y.measure?.unit : undefined;
  return (
    unitX !== undefined &&
    unitY !== undefined &&
    resolveUnit(unitX).kind === "declared" &&
    sameUnitVar(unitX, unitY)
  );
}

/** Whether the scope dump is on. Off (and near-zero-cost) in prod. */
const DUMP_SCOPES = envFlag("GOFISH_DUMP_SCOPES");

/**
 * Per-render record of every σ-scope solved. Lives on the {@link RenderSession}
 * (one per render, so no cross-render leakage); a render lays its tree out
 * once.
 */
export class ScopeRegistry {
  private entries: ScopeEntry[] = [];
  /** The scope each node with a literal size solves on each axis, from the
   *  claim walk ({@link solveFixed}), with the keyed domain it maps. */
  private fixed = new Map<object, [FixedSolve?, FixedSolve?]>();

  /**
   * Solve the scope of a node with a literal size on one axis (#1114): its
   * content's type and chrome forms (`chromeForms`: what it draws and its
   * plot, widened to the keyed domain it maps and niced), with its size as
   * its plot (#1032). σ fits the plot to the size ({@link fit}), and the
   * scope's box is the whole at that σ: the size and what the content's
   * chrome and dressing reach past it (`reachAt`), with data 0 that far
   * further from the box's start. A literal size does not depend on σ, so
   * the claim walk solves it once, here, to compute the pixels the node
   * claims upward, and its layout reuses the solution ({@link fixedSolve}).
   * `key` names the keyed domain the node maps (`KeyedDomains.axisKey`), so
   * a render root with no size of its own can map that domain at the same σ
   * ({@link keyedSigma}).
   */
  solveFixed(
    node: GoFishNode,
    key: string | undefined,
    meta: ScopeMeta,
    space: UnderlyingSpace | undefined,
    forms: ChromeForms | undefined,
    plot: number
  ): ScopeSolution | undefined {
    const fitted =
      forms &&
      this.fit(meta, node, space, forms.plot, { px: plot, limit: true });
    const scope = fitted?.scope;
    const reach = scope && reachAt(forms!, scope.sigma);
    const solution: ScopeSolution | undefined =
      scope === undefined
        ? undefined
        : scope.originPx === undefined
          ? scope
          : { sigma: scope.sigma, originPx: scope.originPx + reach![0] };
    let solves = this.fixed.get(node);
    if (solves === undefined) this.fixed.set(node, (solves = []));
    solves[meta.axis] =
      solution === undefined
        ? undefined
        : {
            key,
            solution,
            claim: forms!.whole,
            space,
            box: fitted!.box + reach![0] + reach![1],
          };
    return solution;
  }

  /**
   * Shared-measure scale equality (#582) at a node with a literal size on
   * both axes, by {@link equalizeMeasure}: the two scopes it solved in the
   * claim walk are equalized, and their claims hold the leftover pixels, so
   * the node still claims its size. `yDirection` is the direction of its
   * axis order on y. Call it after both axes' {@link solveFixed}; a no-op
   * unless both share a declared unit.
   */
  equalizeFixed(node: object, rootKey: string, yDirection: 1 | -1): void {
    const solves = this.fixed.get(node);
    const axisOf = (axis: 0 | 1): EqualMeasureAxis | undefined => {
      const s = solves?.[axis];
      return (
        s && {
          space: s.space,
          claim: s.claim,
          box: s.box,
          sigma: s.solution.sigma,
          direction: axis === 0 ? 1 : yDirection,
        }
      );
    };
    const equalized = this.equalizeMeasure(rootKey, [axisOf(0), axisOf(1)]);
    if (equalized === undefined) return;
    for (const axis of [0, 1] as const)
      solves![axis] = { ...solves![axis]!, ...equalized[axis] };
  }

  /** The scope a node with a literal size solved on `axis` in the claim walk
   *  ({@link solveFixed}), or undefined when it solved none. */
  fixedSolve(node: object, axis: 0 | 1): FixedSolve | undefined {
    return this.fixed.get(node)?.[axis];
  }

  /** The σ the nodes with a literal size solve the keyed domain `key` at on
   *  `axis`: undefined when none solves it, or when they solve it at
   *  different σs (an over-constrained layout). */
  keyedSigma(key: string, axis: 0 | 1): number | undefined {
    let sigma: number | undefined;
    for (const solves of this.fixed.values()) {
      const s = solves[axis];
      if (s === undefined || s.key !== key) continue;
      const next = s.solution.sigma;
      if (sigma === undefined) sigma = next;
      else if (Math.abs(next - sigma) > 1e-9 * Math.abs(sigma))
        return undefined;
    }
    return sigma;
  }

  /**
   * Fit a scope root's claim to its slot on one axis: the one solve of every
   * sized site (the render root, a node with a size of its own, a coord
   * boundary). A claim with no σ in it maps no domain (`mapsDomain`), so it
   * is not solved. Any other claim solves `claim.width(σ) = allocated`
   * ({@link solveScope}). When no σ ≥ 0 does, the claim's fixed parts need
   * more than the slot: the scope takes the σ at which the part of the claim
   * that grows with σ, alone, fills the slot (`Pwl.rising`), as if the fixed
   * parts took no room, and the layout warns once, at `node`
   * (`fixedOverflow`). A claim with no σ in it that is larger than its slot
   * warns the same way, and gets no scope.
   *
   * `node` is the node whose slot `slot` is (for a node with a size of its
   * own, `claim` is its content's). A slot that is a limit is the box the
   * claim is laid out in, and on overflow what the claim draws reaches past
   * it, and the fit warns at `node`. A slot that is not a pixel limit warns
   * nowhere, and the box holds the claim: the default canvas of a render
   * with no size on the axis, which grows to hold its claim (#1179), and a
   * coord's budget. There the box is the claim at its σ where that is
   * longer than the slot, and a claim with no scope (only pixels) is its
   * own box. TODO(#1176): a coord's budget is in its coordinate
   * units (radians on a polar θ axis), so comparing its claim's fixed
   * pixels with it warns falsely (35 lines in 26 stories). Whether a
   * coord's budget is a limit, and in which units, is open; until then a
   * coord does not warn, as before.
   */
  fit(
    meta: ScopeMeta,
    node: GoFishNode,
    space: UnderlyingSpace | undefined,
    claim: Extent | undefined,
    { px, limit }: Slot
  ): Fitted | undefined {
    if (claim === undefined) return undefined;
    const maps = mapsDomain(space, claim);
    let scope = maps ? this.solveScope(meta, space, claim, px) : undefined;
    if (scope === undefined) {
      if (limit) warnLayout(node, fixedOverflow(node, meta.axis, claim, px));
      // No σ fills the slot, so what grows with σ fills it alone
      // (`Pwl.fill`, whose first solve `solveScope` just failed).
      const grows = maps ? Pwl.rising(claim.width) : undefined;
      const sigma = grows && Pwl.solve(grows, px);
      if (sigma !== undefined) scope = this.scopeAt(meta, space, claim, sigma);
    }
    const grown =
      scope === undefined ? undefined : Pwl.at(claim.width, scope.sigma);
    const box = limit
      ? px
      : grown !== undefined
        ? overflows(grown, px)
          ? grown
          : px
        : Pwl.isConstant(claim.width)
          ? Pwl.at(claim.width, 0)
          : px;
    return { scope, box };
  }

  /**
   * Solve a scope root on one axis from its type and size claim. Every
   * continuous scope solves the same frame equation, `claim.width(σ) =
   * allocated`, so any pixel overhead the claim carries (spacing, padding)
   * takes its pixels and the data part gets the rest. A scope whose type has
   * an origin also fixes `originPx`, the pixel of data 0: a claim is
   * measured from data 0, so `originPx = claim.descent(σ)` above the box's
   * low edge, or the low edge itself for a scope that seats data 0 at its
   * start (`meta.dataZero`). For a pinned claim with no overhead that is `−σ·min`, the
   * domain's low edge at 0. A scope whose type has no data coordinates
   * (a spread of magnitudes is ordinal) still solves σ from its claim, with no
   * `originPx`.
   *
   * A one-value domain (`isOneValue`: a one-point chart, a constant `datum`)
   * has no width for σ to scale, so no σ fits its claim to the box. Its value
   * maps to the middle of the box, as d3 and Vega-Lite map a zero-width
   * linear domain to the middle of the range: σ is 0 and the claim (only
   * pixels) is centered in the box. Whether the claim's width depends on σ
   * is decided where it is summed: σ parts that cancel to within rounding are
   * 0 (`Pwl.cancel`), so float noise in a one-value domain's claim does not
   * solve a σ near 1e16. Returns undefined when there is no claim or no σ ≥ 0
   * fits it for any other reason (a claim that is only pixels over a wider
   * type, or pixels that alone are larger than the box).
   */
  solveScope(
    meta: ScopeMeta,
    space: UnderlyingSpace | undefined,
    claim: Extent | undefined,
    allocated: number
  ): ScopeSolution | undefined {
    if (space === undefined || claim === undefined) return undefined;
    const solved = Pwl.solve(claim.width, allocated);
    const oneValue = solved === undefined && isOneValue(space);
    const sigma = oneValue ? 0 : solved;
    if (DUMP_SCOPES)
      this.entries.push({
        ...meta,
        allocated,
        frame: `${isCONTINUOUS(space) ? `${space.origin}[${space.dataInterval.min},${space.dataInterval.max}]` : space.kind} ${Pwl.print(claim.width)}${meta.dataZero === "start" ? " (0 at start)" : ""}`,
        sigma,
        hasMap: hasOrigin(space),
      });
    if (sigma === undefined) return undefined;
    // Centering slack: 0 when σ fits the claim to the box.
    const offset = oneValue ? (allocated - Pwl.at(claim.width, 0)) / 2 : 0;
    if (!hasOrigin(space)) return { sigma, originPx: undefined, startPx: 0 };
    return {
      sigma,
      originPx:
        meta.dataZero === "start" ? 0 : originPxAt(claim, sigma, offset),
    };
  }

  /**
   * A scope root on one axis at a σ solved elsewhere: a render root with no
   * size of its own maps its keyed domain at the σ the nodes with a literal
   * size solve it at ({@link keyedSigma}), and a scope whose claim overflows
   * its slot takes the σ {@link fit} falls back to. Its `originPx` follows
   * from its claim at that σ, as in {@link solveScope}, and its box is that
   * claim.
   */
  scopeAt(
    meta: ScopeMeta,
    space: UnderlyingSpace | undefined,
    claim: Extent | undefined,
    sigma: number
  ): ScopeSolution | undefined {
    if (space === undefined || claim === undefined) return undefined;
    if (DUMP_SCOPES)
      this.entries.push({
        ...meta,
        allocated: Pwl.at(claim.width, sigma),
        frame: `at(σ=${sigma}) ${Pwl.print(claim.width)}`,
        sigma,
        hasMap: hasOrigin(space),
      });
    return hasOrigin(space)
      ? { sigma, originPx: originPxAt(claim, sigma) }
      : { sigma, originPx: undefined, startPx: 0 };
  }

  /**
   * Equal measure (#582), the one post-solve σ adjustment, for every scope
   * root that solves both axes: the render root, and a node with a literal
   * size on both ({@link equalizeFixed}). When x and y carry the SAME
   * declared unit of measure, "1 unit on x" and "1 unit on y" are the same
   * quantity, so their data→pixel scales must be EQUAL — a circle stays
   * circular. Both axes take ONE shared σ, the binding (smaller) one.
   *
   * A scope root's size is its box, and it reports that box whatever σ it
   * maps its content at, so the other axis's content no longer fills its
   * box. Its claim takes the leftover pixels after the content in screen
   * terms, so the content sits at the box's top-left: on its axis order's
   * far end when the order starts at the left or top, and at its start when
   * a y-up order starts at the bottom. The content sits past the leftover
   * before it by its seat (`seatInScope`): its `originPx` follows from that
   * claim, and a scope with no data 0 starts its content's box there
   * (`startPx`). PROVISIONAL: where the leftover goes may be revisited once real
   * use suggests a preference.
   *
   * Only an axis with a data width binds. A one-value axis (a one-point
   * chart, every mark at one `datum`) has no width for σ to scale: it takes
   * the other axis's σ, so data-sized marks on it keep that scale, and its
   * value stays at the middle of its box, as {@link solveScope} maps it.
   * When both axes are one value, nothing binds and neither changes.
   *
   * It lives on the registry, so every slope a render produces is
   * registry-sourced, and `GOFISH_DUMP_SCOPES` records the FINAL σ (a
   * `recenter` entry per axis). Returns the equalized axes; a no-op
   * (undefined) unless both axes are given and share a declared unit.
   */
  equalizeMeasure(
    rootKey: string,
    axes: [EqualMeasureAxis | undefined, EqualMeasureAxis | undefined]
  ): [EqualizedAxis, EqualizedAxis] | undefined {
    const [ax, ay] = axes;
    if (
      ax === undefined ||
      ay === undefined ||
      !sharesDeclaredMeasure(ax.space, ay.space)
    )
      return undefined;
    // Only an axis with a data width binds: a one-value axis (`isOneValue`)
    // has no width for σ to scale, so any σ fits it.
    const binding = [ax, ay].filter((a) => !isOneValue(a.space));
    if (binding.length === 0) return undefined;
    const shared = Math.min(...binding.map((a) => a.sigma)); // binding axis wins
    const equalize = (info: EqualMeasureAxis, axis: 0 | 1): EqualizedAxis => {
      const { claim, box, direction, space } = info;
      const leftover = Math.max(0, box - Pwl.at(claim.width, shared));
      // The leftover pixels before the content along the axis order: none
      // when the order starts at the left or top, all of them when a y-up
      // order starts at the bottom, and half of them on a one-value axis,
      // whose value stays at the middle of its box (`solveScope`).
      const before = isOneValue(space)
        ? leftover / 2
        : direction === 1
          ? 0
          : leftover;
      const filled =
        leftover === 0
          ? claim
          : Extent(
              Pwl.addConstant(claim.ascent, leftover - before),
              Pwl.addConstant(claim.descent, before)
            );
      if (DUMP_SCOPES)
        this.entries.push({
          kind: "recenter",
          rootKey,
          axis,
          allocated: box,
          frame: `equal(σ=${shared}) +${leftover}px`,
          sigma: shared,
          hasMap: space !== undefined && hasOrigin(space),
        });
      return {
        claim: filled,
        // The content sits after `before` by its seat (`seatInScope`): its
        // data 0 at the claim's descent where the scope has one, else its
        // box.
        solution: hasOrigin(space)
          ? { sigma: shared, originPx: originPxAt(filled, shared) }
          : { sigma: shared, originPx: undefined, startPx: before },
      };
    };
    return [equalize(ax, 0), equalize(ay, 1)];
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
