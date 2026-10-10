// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// The SIZE CLAIM half of an axis. The type half (what the axis means: its
// origin, data interval, measure) is `UnderlyingSpace` in `./underlyingSpace`.
// An `Extent` says how much room the content needs, as functions of σ (the
// scope's pixels-per-data-unit), so a scope can solve σ against its box.
//
// Claims are computed by their own walk (`GoFishNode.resolveExtent`), AFTER
// the types: a claim may read the resolved types, but `./underlyingSpace` never
// imports this module, so a type can never read a claim.

import * as Monotonic from "../util/monotonic";
import { interval, union, width, type Interval } from "../util/interval";
import type { Size } from "./dims";
import {
  isCONTINUOUS,
  niceContinuous,
  axisOver,
  placeBaseline,
  type AxisTicks,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
} from "./underlyingSpace";

/**
 * One axis's size claim, measured from the extent's data 0 like a font's
 * ascent and descent: a bar of value 30 claims ascent 30σ, a bar of value −20
 * claims descent 20σ. Every continuous claim is measured from data 0,
 * whatever the origin state, so a side can be negative: a pinned `[30, 50]`
 * claims ascent 50σ and descent −30σ (its low edge lies 30σ above its 0), and
 * its width is 20σ. An origin-less extent's interval starts at 0, so its
 * descent is 0. Every continuous axis has exactly one claim. An ordinal or
 * undefined axis has one only when its content's room depends on σ (a spread
 * of magnitudes: separate spaces, one shared scale), measured as a box
 * (descent 0); otherwise it has none (`undefined`).
 */
export type Extent = {
  /** The σ-affine reach above data 0. */
  ascent: Monotonic.Monotonic;
  /** The σ-affine reach below data 0. */
  descent: Monotonic.Monotonic;
  /** The total `ascent + descent`, the size a scope solves σ against.
   *  Computed once by {@link Extent} from the pair; never set on its own. */
  width: Monotonic.Monotonic;
};

/** Build an {@link Extent} from its two sides. */
export const Extent = (
  ascent: Monotonic.Monotonic,
  descent: Monotonic.Monotonic = Monotonic.ZERO
): Extent => ({
  ascent,
  descent,
  width: Monotonic.isZero(descent) ? ascent : Monotonic.add(ascent, descent),
});

/** The claim a type makes by itself, with no pixel overhead: each side is
 *  its data reach from 0 times σ, `max·σ` above and `−min·σ` below. This is
 *  every leaf's claim. A result composed from claims (a spread's spacing, a
 *  nest's padding, a fixed pitch, a `transform.scale`) can claim more. */
export const impliedExtent = (space: UnderlyingSpace): Extent | undefined => {
  if (!isCONTINUOUS(space)) return undefined;
  const { min, max } = space.dataInterval;
  return Extent(Monotonic.linear(max, 0), Monotonic.linear(-min, 0));
};

/** Whether a claim has σ in it: data-scaled room a scope can solve σ
 *  against. A claim that is only pixels (a box with a literal size) is not:
 *  it needs no canvas, and a scope has nothing to solve from it. */
export const scalesWithSigma = (extent: Extent | undefined): extent is Extent =>
  extent !== undefined && !Monotonic.isConstant(extent.width);

/** {@link impliedExtent} on both axes. */
export const impliedExtents = (
  spaces: Size<UnderlyingSpace>
): Size<Extent | undefined> => [
  impliedExtent(spaces[0]),
  impliedExtent(spaces[1]),
];

/** A claim scaled by a pixel-space `transform.scale` (like translate, a scale
 *  acts on pixels, so it scales the claim but never the data interval). */
export const scaleExtent = (scale: number, extent: Extent): Extent =>
  scale === 1
    ? extent
    : Extent(
        Monotonic.smul(scale, extent.ascent),
        Monotonic.smul(scale, extent.descent)
      );

/** A claim grown by `padding` pixels on each side (a nest's inset). */
export const padExtent = (extent: Extent, padding: number): Extent =>
  Extent(
    Monotonic.adds(extent.ascent, padding),
    Monotonic.adds(extent.descent, padding)
  );

/** Nice a σ-scope root's type and its claim together (issue #659). Nicing is
 *  a type operation ({@link niceContinuous}) that widens only the data part:
 *  the niced claim is the claim plus `σ·(nicedWidth − dataWidth)`, both widths
 *  in data units from the type, so any pixel overhead the claim carries is
 *  kept. The widths are lengths, so this holds for a signed domain too, and
 *  for a delta axis, whose width is niced from 0. Only a space that renders an
 *  axis over its interval ({@link axisOver}), or will once placed (a free
 *  magnitude, {@link placeBaseline}), is niced, and only when some node in
 *  the scope draws that axis: `ticks` are that axis's ticks, which the
 *  domain is niced to, or undefined for no axis (nicing is a presentation
 *  adjustment, so its demand comes from axis views). */
export const niceScope = <S extends UnderlyingSpace | undefined>(
  space: S,
  extent: Extent | undefined,
  ticks: AxisTicks | undefined
): [S, Extent | undefined] => {
  if (ticks === undefined) return [space, extent];
  const axis = axisOver(placeBaseline(space));
  if (space === undefined || !isCONTINUOUS(space) || axis === undefined)
    return [space, extent];
  return widenTo(space, extent, niceContinuous(space, ticks).dataInterval);
};

/** Widen a sized node's type and claim to its keyed domain `domain` (#1114):
 *  the node maps the whole domain of its unit into its own size, not just
 *  the part of it its own data covers. It is the arithmetic {@link niceScope}
 *  uses: only the data part of the claim widens, so any pixel overhead it
 *  carries is kept. A domain the type already covers leaves both unchanged,
 *  and so does a space with no axis over its interval (an ordinal, a spread
 *  of magnitudes). */
export const widenScope = <S extends UnderlyingSpace | undefined>(
  space: S,
  extent: Extent | undefined,
  domain: Interval | undefined
): [S, Extent | undefined] => {
  if (domain === undefined || space === undefined || !isCONTINUOUS(space))
    return [space, extent];
  const axis = axisOver(placeBaseline(space));
  if (axis === undefined) return [space, extent];
  const iv = space.dataInterval;
  // A delta axis has only a width: it widens to the domain's width, from
  // its own low edge. An absolute axis widens to the union of the two.
  const to =
    axis === "delta"
      ? interval(iv.min, iv.min + Math.max(width(domain), width(iv)))
      : union(iv, domain);
  if (to.min === iv.min && to.max === iv.max) return [space, extent];
  return widenTo(space, extent, to);
};

/** `space` with its data interval replaced by `to`, and its claim widened by
 *  the same data. A claim is measured from data 0, so each side of an
 *  absolute axis widens by its own end. A delta axis comes from centering
 *  (`middle` alignment), so the content sits centered in the wider width:
 *  half the widening on each side. */
const widenTo = <S extends UnderlyingSpace | undefined>(
  space: S,
  extent: Extent | undefined,
  to: Interval
): [S, Extent | undefined] => {
  const s = space as CONTINUOUS_TYPE;
  const widenedSpace = { ...s, dataInterval: to } as S;
  if (extent === undefined) return [widenedSpace, undefined];
  const iv = s.dataInterval;
  const widened = width(to) - width(iv);
  const [up, down] =
    axisOver(placeBaseline(s)) === "delta"
      ? [widened / 2, widened / 2]
      : [to.max - iv.max, iv.min - to.min];
  return [
    widenedSpace,
    Extent(
      Monotonic.add(extent.ascent, Monotonic.linear(up, 0)),
      Monotonic.add(extent.descent, Monotonic.linear(down, 0))
    ),
  ];
};
