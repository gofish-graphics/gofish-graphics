// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { GoFishNode } from "./_node";
import { Extent } from "./extent";
import * as Pwl from "./solver/pwl";
import { values } from "./solver/arith";
import { room } from "../util";
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
 * the size it lays the chart out at.
 *
 * The plot is the chart's content without its dressing
 * (`GoFishNode.resolvePlotExtent`): a label placed beside a mark adds
 * around the plot, as chrome does. The gutters are forms of the claim walk:
 * the chart's claim past the plot's, both widened to the keyed domain the
 * chart maps (`chromeForms`), a PWL in σ that layout evaluates at the σ the
 * chart is laid out at. A plot that fills a share claims one σ (#493 piece
 * 3), so its forms are PWLs in σ too. A plot with no claim on an axis (one inside a
 * coordinate space, or one that fills a room no σ divides) is a point at its
 * 0 (`setChromeForms`): its chrome reaches past it by the chart's whole
 * claim.
 */

/** The claim of a plot with no claim: a point at its 0. */
const POINT: Extent = Extent(Pwl.ZERO);

/** A node's chrome forms on one axis: its claim and its plot's, both widened
 *  to the keyed domain it maps. How far its chrome and dressing reach past
 *  its plot at each end is the difference, a PWL in σ ({@link reachAt}). */
export type ChromeForms = { whole: Extent; plot: Extent };

/**
 * `node`'s chrome forms on `axis` for what it draws, `whole`, and its plot,
 * both widened as a scope widens its claim (`KeyedDomains.scope`), so a
 * tick label past a niced domain end reaches only where the domain does
 * not. A plot with no claim there is a point at its 0 ({@link POINT}).
 * Undefined where the node has no claim either. They are memoized with its
 * claim (`ClaimMemo.chrome`, cleared with it: the auto label angle lays out
 * twice).
 */
export function setChromeForms(
  node: GoFishNode,
  axis: 0 | 1,
  whole: Extent | undefined,
  plot: Extent | undefined,
  // How the node's scope widens a claim: by its own type, unless it is a
  // node with a size of its own, which widens its content's.
  wide: (claim: Extent) => Extent = (claim) =>
    node
      .tryGetRenderSession()
      ?.keyedDomains?.scope(
        node,
        axis,
        node._underlyingSpace?.[axis],
        claim
      )[1] ?? claim
): ChromeForms | undefined {
  const forms =
    whole !== undefined
      ? { whole: wide(whole), plot: wide(plot ?? POINT) }
      : undefined;
  node._claimMemo.chrome[axis] = forms ?? null;
  return forms;
}

/**
 * `node`'s chrome forms on `axis` (`setChromeForms`). A node with a size of
 * its own sets them from its content as it claims (its claim is its own
 * pixels); any other node's are its claim and its plot's, read when first
 * asked. The plot is the content without its dressing (a value label
 * beside its bar): like chrome, dressing adds around the plot (#1032).
 */
export function chromeForms(
  node: GoFishNode,
  axis: 0 | 1
): ChromeForms | undefined {
  // Its own claim hook may be asking (a node with a size of its own sets
  // its forms before it reads them), so the memo is read first.
  const seeded = node._claimMemo.chrome[axis];
  if (seeded !== undefined) return seeded ?? undefined;
  const whole = node.resolveExtent()[axis];
  const hit = node._claimMemo.chrome[axis];
  if (hit !== undefined) return hit ?? undefined;
  const plot = (node.chrome?.content ?? node).resolvePlotExtent()[axis];
  return setChromeForms(node, axis, whole, plot);
}

/** How far `f.whole` reaches past `f.plot` at σ, `[start, end]`. */
export const reachAt = (f: ChromeForms, sigma: number): [number, number] => [
  room(Pwl.at(f.whole.descent, sigma) - Pwl.at(f.plot.descent, sigma)),
  room(Pwl.at(f.whole.ascent, sigma) - Pwl.at(f.plot.ascent, sigma)),
];

/**
 * The claim of a node that is a σ-scope of its own and fills a share of
 * the scope around it (a facet panel, #1176 step 5), by its chrome forms
 * `f` in its own σ. Its plot is one σ of the scope around it. What its
 * chrome and dressing reach past the plot is read through the length its
 * plot has at its own σ (`Pwl.through`), so at each outer σ the node
 * claims what {@link aroundPlot} lays it out at around a plot that long.
 * Its plot is `share`, one σ by default, `kσ` for `fr(k)` (#1176 step 6).
 */
export function aroundShare(
  f: ChromeForms,
  share: Pwl.Affine = Pwl.SIGMA
): ChromeForms {
  // What reaches past a plot of length `t`, read at the plot's length in
  // the outer σ: `h(share(σ))`, `h` read through the line that takes the
  // share's length back to σ.
  const atShare = (h: Pwl.Value): Pwl.Value =>
    share.slope === 1 && share.intercept === 0
      ? h
      : share.slope === 0
        ? Pwl.constant(Pwl.at(h, share.intercept))
        : Pwl.through(
            h,
            Pwl.affine(1 / share.slope, -share.intercept / share.slope)
          );
  const reach = (whole: Pwl.Value, plot: Pwl.Value) =>
    atShare(
      Pwl.through(
        Pwl.envelope([values.sub(whole, plot), Pwl.ZERO]),
        f.plot.width
      )
    );
  return {
    whole: Extent(
      Pwl.add(share, reach(f.whole.ascent, f.plot.ascent)),
      reach(f.whole.descent, f.plot.descent)
    ),
    plot: Extent(share),
  };
}

/**
 * `chart`'s gutters on `axis` when it is laid out at σ `sigma`: its chrome
 * forms' reach at σ (none where it has no claim).
 */
export function guttersAt(
  chart: GoFishNode,
  axis: 0 | 1,
  sigma: number | undefined
): [number, number] {
  const f = chromeForms(chart, axis);
  return f !== undefined ? reachAt(f, sigma ?? 0) : [0, 0];
}

/**
 * Where a chart seats its content on `axis` (#1032), for the literal pixel
 * `literal` its outermost ring pins the ring inside it at (`wrapRing`): at
 * its start gutter, in the ring's axis order. The layer hands a child it
 * pins at a literal pixel the frame from there (`childPosScalesFor`), so the
 * content's frame starts where its plot does, and whatever it places with
 * no data (an empty cell) sits in the plot, not in the gutter. A seat at a
 * datum, or none (free content its frame seats), already sits where the
 * frame maps it, and so does free content's literal seat at 0, its
 * baseline: the start gutter is part of its claim's descent, below that
 * baseline.
 *
 * The claim walk keeps the literal pin (the content's data 0 at the ring's),
 * and the two agree on every box: layout hands the content its frame from
 * the seat, so a box's edges telescope to the same pixel. They differ only
 * for what the content places at a constant of its own frame (a noise
 * offset, a label slot): the claim walk reads that constant from the
 * content's data 0, and layout from its plot's start edge, which is
 * `wide(plot).descent(σ)` apart (0 for a domain that starts at 0).
 * TODO(#1239): which origin a pinned node's own constants are about (its
 * data 0, or its plot's start) is a design question, so both stay. Seating
 * the claim walk at the start gutter instead would move the content's data
 * 0 off its ticks.
 */
export function contentSeat(
  chart: GoFishNode,
  axis: 0 | 1,
  literal: number | undefined
): number | undefined {
  if (literal === undefined) return undefined;
  const inner = chart.children[0] as GoFishNode;
  return originIs(inner._underlyingSpace?.[axis], "free")
    ? 0
    : chart.chromeGutters(axis)[0];
}

/**
 * The whole of `node` on `axis` around a plot `plot` pixels long: the plot
 * and what its chrome and dressing reach past it, at the σ at which its plot
 * fills `plot` (#1032). A node's own `w`/`h` is its plot, so a node with a
 * size of its own is this around its size, and so is a part a chain hands
 * a share as its plot (a facet panel).
 */
export function aroundPlot(
  node: GoFishNode,
  axis: 0 | 1,
  plot: number
): number {
  const f = chromeForms(node, axis);
  // The σ at which the plot fills `plot`, by the one fit's solve
  // (`Pwl.fill`); 0 where none does.
  const sigma = f && Pwl.fill(f.plot.width, plot);
  const [start, end] =
    f !== undefined
      ? reachAt(
          f,
          sigma !== undefined && Number.isFinite(sigma) ? Math.max(0, sigma) : 0
        )
      : [0, 0];
  return plot + start + end;
}
