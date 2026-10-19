// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { GoFishNode } from "./_node";
import type { Size } from "./dims";
import { Extent, hullExtent } from "./extent";
import * as Monotonic from "../util/monotonic";
import { room } from "../util";
import { childNameKey } from "./constraints/shared";
import { isLiteralSeat } from "./constraints/claimPlacement";
import { originIs } from "./underlyingSpace";

/**
 * A chart's chrome gutters (#1032): how far its chrome (its axes, titles and
 * legend: the shapes of its rings) reaches past its plot on each side, in
 * pixels, `[start, end]` in its axis order. They come from the claim walk
 * (#493: fixed-size nodes report their size). Every chrome shape claims its
 * size, each ring's claim is the hull of what it wraps and of its shapes
 * where its constraints place them (`placeByClaims`), and the chart's claim
 * is its outermost ring's. So a scope solved against a slot already leaves
 * the chrome its room, and the layout reads the gutters off the claims at
 * the size it lays the chart out at, with no second layout.
 *
 * The plot is the chart's content without its dressing
 * (`GoFishNode.resolvePlotExtent`): a label placed beside a mark adds
 * around the plot, as chrome does. On an axis where the plot has a claim,
 * the gutters are the chart's claim past the plot's, both widened to the keyed domain the chart maps, at the
 * σ the chart is laid out at. Where the plot fills the room it is given (a
 * category axis), the rings' claims are built around a plot of size X
 * (`ringsAround`), and the plot's size is the X at which they fill the
 * slot.
 */

/** The claim of `chart`'s rings on `axis` around a plot of size X, as a
 *  function of X: the plot is `[0, X]`, and each ring's claim is what it
 *  wraps with its shapes placed around it. Undefined when a ring cannot
 *  place its shapes in the claim walk (it is not a layer). */
function ringsAround(chart: GoFishNode, axis: 0 | 1): Extent | undefined {
  let inner: Extent = Extent(Monotonic.linear(1, 0));
  for (const ring of chart.chrome!.rings) {
    const place = ring._placeChildren;
    if (place === undefined) return undefined;
    const extents = ring.children.map((c, i): Size<Extent | undefined> => {
      if (i > 0) return c.resolveExtent();
      return axis === 0 ? [inner, undefined] : [undefined, inner];
    });
    const p = place(axis, extents);
    if (p.hull !== undefined) inner = hullExtent(inner, p.hull);
  }
  return inner;
}

/** The chart's claim and its plot's on `axis`, both widened to the keyed
 *  domain the chart maps, or undefined where the plot fills its room. */
function claims(
  chart: GoFishNode,
  axis: 0 | 1
): { chart: Extent; plot: Extent } | undefined {
  const chartClaim = chart.resolveExtent()[axis];
  // The plot is the content without its dressing (a value label beside
  // its bar): like chrome, dressing adds around the plot (#1032).
  const plotClaim = chart.chrome!.content.resolvePlotExtent()[axis];
  if (chartClaim === undefined || plotClaim === undefined) return undefined;
  const keyed = chart.tryGetRenderSession()?.keyedDomains;
  const space = chart._underlyingSpace?.[axis];
  const wide = (claim: Extent): Extent =>
    keyed?.scope(chart, axis, space, claim)[1] ?? claim;
  return { chart: wide(chartClaim), plot: wide(plotClaim) };
}

/** The gutters of the claims `c` at σ. */
const guttersAt = (
  c: { chart: Extent; plot: Extent },
  sigma: number
): [number, number] => [
  room(c.chart.descent.run(sigma) - c.plot.descent.run(sigma)),
  room(c.chart.ascent.run(sigma) - c.plot.ascent.run(sigma)),
];

/** The gutters of the rings `r` around a plot of size `x`. */
const ringGutters = (r: Extent, x: number): [number, number] => [
  room(r.descent.run(x)),
  room(r.ascent.run(x) - x),
];

/** The X at which `m` reaches `target` (`m` never decreases), solved as
 *  the root's σ is: where no X reaches it exactly (fixed parts larger than
 *  the target), the X at which the parts that grow with X reach it. */
const solveFor = (m: Monotonic.Monotonic, target: number): number => {
  const x =
    m.inverse(target, { upperBoundGuess: target }) ??
    Monotonic.rising(m)?.inverse(target);
  return x !== undefined && Number.isFinite(x) ? Math.max(0, x) : 0;
};

/**
 * `chart`'s gutters on `axis` when it is laid out at σ `sigma` in a slot of
 * `slot` pixels (NaN when the axis is unsized, where a plot that fills its
 * room has the size of its own claim, or none).
 */
export function guttersInSlot(
  chart: GoFishNode,
  axis: 0 | 1,
  sigma: number | undefined,
  slot: number
): [number, number] {
  const c = claims(chart, axis);
  if (c !== undefined) return guttersAt(c, sigma ?? 0);
  const r = ringsAround(chart, axis);
  if (r === undefined) return [0, 0];
  if (!Number.isFinite(slot)) return ringGutters(r, 0);
  return ringGutters(r, solveFor(r.width, slot));
}

/**
 * Seat a chart's content past its chrome's start gutters (#1032): the
 * outermost ring pins the ring inside it at a literal pixel (`wrapRing`),
 * and that pixel becomes the start gutter, in the ring's axis order. The
 * layer hands a child it pins at a literal pixel the frame from there
 * (`childPosScalesFor`), so the content's frame starts where its plot does,
 * and whatever it places with no data (an empty cell) sits in the plot, not
 * in the gutter. A seat at a datum, or none (free content its frame seats),
 * already sits where the frame maps it, and so does free content's literal
 * seat at 0, its baseline: the start gutter is part of its claim's descent,
 * below that baseline.
 */
export function seatPastGutters(chart: GoFishNode): void {
  const inner = chart.children[0] as GoFishNode;
  const name = childNameKey(inner);
  const seat = (axis: 0 | 1) =>
    originIs(inner._underlyingSpace?.[axis], "free")
      ? 0
      : chart.chromeGutters(axis)[0];
  for (const c of chart.constraints) {
    if (c.type !== "position" || !isLiteralSeat(c)) continue;
    if (!c.children.some((r) => r.name === name)) continue;
    if (typeof c.x === "number") c.x = seat(0);
    if (typeof c.y === "number") c.y = seat(1);
  }
}

/**
 * `chart`'s gutters on `axis` around a plot `plot` pixels long: a chart with
 * a size of its own, whose own `w`/`h` is its plot (#1032). Its σ is the one
 * at which its plot fills that size.
 */
export function guttersAroundPlot(
  chart: GoFishNode,
  axis: 0 | 1,
  plot: number
): [number, number] {
  const c = claims(chart, axis);
  if (c !== undefined) return guttersAt(c, solveFor(c.plot.width, plot));
  const r = ringsAround(chart, axis);
  return r === undefined ? [0, 0] : ringGutters(r, plot);
}
