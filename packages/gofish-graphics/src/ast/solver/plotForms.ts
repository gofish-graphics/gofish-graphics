// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { Extent } from "../extent";
import * as Pwl from "./pwl";
import { values } from "./arith";
import { room } from "../../util";

/**
 * A node's claim and its plot's on one axis, both widened to the keyed
 * domain it maps (`KeyedDomains.scope`): what it draws, and the part of it
 * a size of its own measures (#1032). A node's own `w`/`h` is its plot, so
 * what its dressing (a value label beside a bar, an outline, the rows of a
 * nested chart's labels) reaches past the plot adds around that size: the
 * difference of the two, a PWL in σ ({@link reachPast}). A plot with no
 * claim is a point at its 0 ({@link plotForms}).
 */
export type PlotForms = { whole: Extent; plot: Extent };

/** The claim of a plot with no claim: a point at its 0. */
const POINT: Extent = Extent(Pwl.ZERO);

/** The forms of a node whose claim is `whole` and whose plot's is `plot`,
 *  each widened by `wide`; undefined where it has no claim. */
export const plotForms = (
  whole: Extent | undefined,
  plot: Extent | undefined,
  wide: (claim: Extent) => Extent
): PlotForms | undefined =>
  whole === undefined
    ? undefined
    : { whole: wide(whole), plot: wide(plot ?? POINT) };

/** How far `f.whole` reaches past `f.plot` at σ, `[start, end]`. */
export const reachPast = (f: PlotForms, sigma: number): [number, number] => [
  room(Pwl.at(f.whole.descent, sigma) - Pwl.at(f.plot.descent, sigma)),
  room(Pwl.at(f.whole.ascent, sigma) - Pwl.at(f.plot.ascent, sigma)),
];

/**
 * The claim of a node that is a σ-scope of its own and fills a share of
 * the scope around it (a facet panel, #1176 step 5), by its chrome forms
 * `f` in its own σ. Its plot is one σ of the scope around it. What its
 * chrome and dressing reach past the plot is read through the length its
 * plot has at its own σ (`Pwl.through`), so at each outer σ the node
 * claims what a node of that plot lays out at (`ScopeRegistry.fixedBox`).
 * Its plot is `share`, one σ by default, `kσ` for `fr(k)` (#1176 step 6).
 */
export function aroundShare(
  f: PlotForms,
  share: Pwl.Affine = Pwl.SIGMA
): PlotForms {
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
