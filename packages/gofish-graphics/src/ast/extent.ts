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

import * as Pwl from "./solver/pwl";
import { interval, union, width, type Interval } from "../util/interval";
import type { Size } from "./dims";
import { isValue, type MaybeValue } from "./data";
import {
  isCONTINUOUS,
  niceContinuous,
  axisOver,
  isOneValue,
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
 * undefined axis has one when its content's room depends on σ (a spread of
 * magnitudes: separate spaces, one shared scale), measured as a box (descent
 * 0), or when its content has a pixel size of its own (a text, a box of
 * literal size: a claim with no σ in it, {@link boxExtent}); content that
 * takes whatever room its parent gives it (a rect with no size) has none
 * (`undefined`).
 */
export type Extent = {
  /** The σ-affine reach above data 0. */
  ascent: Pwl.Value;
  /** The σ-affine reach below data 0. */
  descent: Pwl.Value;
  /** The total `ascent + descent`, the size a scope solves σ against.
   *  Computed once by {@link Extent} from the pair; never set on its own. */
  width: Pwl.Value;
};

/** Build an {@link Extent} from its two sides. */
export const Extent = (
  ascent: Pwl.Value,
  descent: Pwl.Value = Pwl.ZERO
): Extent => ({
  ascent,
  descent,
  width: Pwl.isZero(descent) ? ascent : Pwl.add(ascent, descent),
});

/** The hull of claims: each side is the envelope of theirs. */
export const hullExtent = (...extents: Extent[]): Extent =>
  Extent(
    Pwl.envelope(extents.map((e) => e.ascent)),
    Pwl.envelope(extents.map((e) => e.descent))
  );

/** The claim a type makes by itself, with no pixel overhead: each side is
 *  its data reach from 0 times σ, `max·σ` above and `−min·σ` below. This is
 *  every leaf's claim. A result composed from claims (a spread's spacing, a
 *  nest's padding, a fixed pitch, a `transform.scale`) can claim more. */
export const impliedExtent = (space: UnderlyingSpace): Extent | undefined => {
  if (!isCONTINUOUS(space)) return undefined;
  const { min, max } = space.dataInterval;
  return Extent(Pwl.affine(max, 0), Pwl.affine(-min, 0));
};

/**
 * The claim of a box with a pixel size of its own (#493: fixed-size nodes
 * report their size), on an axis of type `space`: it reaches `lo` pixels
 * before its origin and `hi` past it, at any σ. A text, or a rect or ellipse
 * of literal size, claims this, so whatever composes it leaves it room. On
 * an undefined axis the box is all there is. On a pinned point (a glyph
 * placed at a datum) the box sits around the datum's pixel, `lo` below it
 * and `hi` above. Any other type claims what the type implies.
 */
export const boxExtent = (
  space: UnderlyingSpace,
  lo: number,
  hi: number
): Extent | undefined => {
  if (space.kind === "undefined")
    return Extent(Pwl.affine(0, hi), Pwl.affine(0, lo));
  if (isOneValue(space) && space.origin === "pinned") {
    const at = space.dataInterval.min;
    return Extent(Pwl.affine(at, hi), Pwl.affine(-at, lo));
  }
  return impliedExtent(space);
};

/** The claim of a shape's axis `d` (a rect's, an ellipse's), of type
 *  `space`, when the shape has a literal pixel size there ({@link
 *  boxExtent}): a literal `size`, or two literal ends. The box is where the
 *  shape's layout puts it: from a literal start or about a literal center
 *  (the shape places itself there, in its parent's pixels), about a datum
 *  center, or else from its origin. With no literal size (a box that fills
 *  its parent's room, or one sized by data) the type's claim stands. */
export const literalBoxExtent = (
  space: UnderlyingSpace,
  d: {
    min?: MaybeValue<number>;
    center?: MaybeValue<number>;
    max?: MaybeValue<number>;
    size?: MaybeValue<number>;
  }
): Extent | undefined => {
  const size =
    typeof d.size === "number"
      ? d.size
      : typeof d.min === "number" && typeof d.max === "number"
        ? d.max - d.min
        : undefined;
  if (size === undefined || !Number.isFinite(size)) return impliedExtent(space);
  const center = d.min === undefined ? d.center : undefined;
  const start =
    typeof center === "number"
      ? center - Math.abs(size) / 2
      : center !== undefined && isValue(center)
        ? -Math.abs(size) / 2
        : typeof d.min === "number"
          ? d.min
          : 0;
  return boxExtent(
    space,
    -(start + Math.min(0, size)),
    start + Math.max(0, size)
  );
};

/** {@link literalBoxExtent} on both axes of a shape with dims `d`. An
 *  aspect ratio (`w / h`) fits the box inside both literal sizes, as the
 *  shape's layout does; with a size that is not literal it derives one size
 *  from the other at layout, so the shape claims what its types imply. */
export const literalBoxExtents = (
  spaces: Size<UnderlyingSpace>,
  d: Parameters<typeof literalBoxExtent>[1][],
  aspectRatio: number | undefined
): Size<Extent | undefined> => {
  if (aspectRatio === undefined || !(aspectRatio > 0))
    return [
      literalBoxExtent(spaces[0], d[0]),
      literalBoxExtent(spaces[1], d[1]),
    ];
  const [w, h] = [d[0].size, d[1].size];
  if (typeof w !== "number" || typeof h !== "number")
    return impliedExtents(spaces);
  const fitW = Math.min(w, h * aspectRatio);
  return [
    literalBoxExtent(spaces[0], { ...d[0], size: fitW }),
    literalBoxExtent(spaces[1], { ...d[1], size: fitW / aspectRatio }),
  ];
};

/** Whether a claim has σ in it: data-scaled room a scope can solve σ
 *  against. A claim that is only pixels (a box with a literal size) is not:
 *  it needs no canvas, and a scope has nothing to solve from it. */
export const scalesWithSigma = (extent: Extent | undefined): extent is Extent =>
  extent !== undefined && !Pwl.isConstant(extent.width);

/** Whether a scope with type `space` and claim `extent` has a domain to map
 *  into its box: its claim has σ in it, or its type is one data value
 *  (`isOneValue`, #1107), which maps to the middle of the box. A claim that is
 *  only pixels over any other type (content that is all boxes of a literal
 *  size, each of which already mapped its domain) maps nothing. */
export const mapsDomain = (
  space: UnderlyingSpace | undefined,
  extent: Extent | undefined
): extent is Extent =>
  scalesWithSigma(extent) || (extent !== undefined && isOneValue(space));

/** {@link impliedExtent} on both axes. */
export const impliedExtents = (
  spaces: Size<UnderlyingSpace>
): Size<Extent | undefined> => [
  impliedExtent(spaces[0]),
  impliedExtent(spaces[1]),
];

/** A claim scaled by a pixel-space `transform.scale` about data 0 (like
 *  translate, a scale acts on pixels, so it scales the claim but never the
 *  data interval): a negative factor reflects it. */
export const scaleExtent = (scale: number, extent: Extent): Extent =>
  scale === 1
    ? extent
    : scale > 0
      ? Extent(
          Pwl.scale(scale, extent.ascent),
          Pwl.scale(scale, extent.descent)
        )
      : Extent(
          Pwl.scale(-scale, extent.descent),
          Pwl.scale(-scale, extent.ascent)
        );

/** A claim moved `by` pixels up its axis. */
export const shiftExtent = (extent: Extent, by: Pwl.Value): Extent =>
  Pwl.isZero(by)
    ? extent
    : Extent(
        Pwl.add(extent.ascent, by),
        Pwl.add(extent.descent, Pwl.negate(by))
      );

/** A claim grown by `padding` pixels on each side (a nest's inset). */
export const padExtent = (extent: Extent, padding: number): Extent =>
  Extent(
    Pwl.addConstant(extent.ascent, padding),
    Pwl.addConstant(extent.descent, padding)
  );

/** Nice a σ-scope root's type and its claim together (issue #659). Nicing is
 *  a type operation ({@link niceContinuous}), and the niced claim holds the
 *  niced domain ({@link widenTo}): on an absolute axis each side reaches the
 *  farther of the claim and the domain's end, so pixels the content draws
 *  past its data take room only where the domain does not already reach
 *  past them. A delta axis's width is niced from 0. Only a space that renders an
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
 *  uses ({@link widenTo}): the claim widens to hold the domain. A domain the
 *  type already covers leaves both unchanged,
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

/** `space` with its data interval replaced by `to`, and its claim widened to
 *  hold it. A claim is measured from data 0, and on an absolute axis it is
 *  the hull of what the content draws, so each side reaches the farther of
 *  the claim and its end of `to`: pixels the content draws past its data (a
 *  mark's size at a datum, a tick label past the plot) need no more room
 *  when the domain already reaches past them. A delta axis comes from
 *  centering (`middle` alignment), so the content sits centered in the wider
 *  width: half the widening on each side. */
const widenTo = <S extends UnderlyingSpace | undefined>(
  space: S,
  extent: Extent | undefined,
  to: Interval
): [S, Extent | undefined] => {
  const s = space as CONTINUOUS_TYPE;
  const widenedSpace = { ...s, dataInterval: to } as S;
  if (extent === undefined) return [widenedSpace, undefined];
  const iv = s.dataInterval;
  if (axisOver(placeBaseline(s)) !== "delta")
    return [
      widenedSpace,
      Extent(
        Pwl.envelope([extent.ascent, Pwl.affine(to.max, 0)]),
        Pwl.envelope([extent.descent, Pwl.affine(-to.min, 0)])
      ),
    ];
  const half = (width(to) - width(iv)) / 2;
  return [
    widenedSpace,
    Extent(
      Pwl.add(extent.ascent, Pwl.affine(half, 0)),
      Pwl.add(extent.descent, Pwl.affine(half, 0))
    ),
  ];
};
