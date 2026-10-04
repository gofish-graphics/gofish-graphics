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
import type { Size } from "./dims";
import {
  dataSides,
  dataWidth,
  isCONTINUOUS,
  niceContinuous,
  type UnderlyingSpace,
  originIs,
} from "./underlyingSpace";

/**
 * One axis's size claim, measured from the extent's baseline like a font's
 * ascent and descent: a bar of value 30 claims ascent 30σ, a bar of value −20
 * claims descent 20σ. A pinned or origin-less extent sits wholly above its low
 * edge, so its descent is 0. Every continuous axis has exactly one claim; an
 * ordinal or undefined axis has none (`undefined`).
 */
export type Extent = {
  /** The σ-affine extent on the positive side of the baseline. */
  ascent: Monotonic.Monotonic;
  /** The σ-affine extent on the negative side of the baseline. */
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

/** The claim a type makes by itself, with no pixel overhead: each side is its
 *  data extent times σ. This is every leaf's claim, and the claim of any
 *  pinned or origin-less result of a fold (those claim exactly their data
 *  width). Only a free result composed from claims (a spread's spacing, a
 *  nest's padding, a fixed pitch, a `transform.scale`) claims more. */
export const impliedExtent = (space: UnderlyingSpace): Extent | undefined => {
  if (!isCONTINUOUS(space)) return undefined;
  const { ascent, descent } = dataSides(space);
  return Extent(Monotonic.linear(ascent, 0), Monotonic.linear(descent, 0));
};

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
 *  kept. The widths are lengths, so this holds for a signed domain too. Only a
 *  pinned space is niced; any other space keeps its type and claim. */
export const niceScope = <S extends UnderlyingSpace | undefined>(
  space: S,
  extent: Extent | undefined
): [S, Extent | undefined] => {
  if (space === undefined || !originIs(space, "pinned")) return [space, extent];
  const niced = niceContinuous(space);
  if (extent === undefined) return [niced, undefined];
  const widened = dataWidth(niced as typeof space) - dataWidth(space);
  return [
    niced,
    Extent(
      Monotonic.add(extent.ascent, Monotonic.linear(widened, 0)),
      extent.descent
    ),
  ];
};

/** The upper envelope `max_i m_i(σ)` of claims, over σ ≥ 0. Unlike
 *  `Monotonic.max` it keeps lines with a negative slope or a zero line, which
 *  a union's lower reach needs (a pinned interval above 0 reaches down by a
 *  negative amount). Linear and piecewise claims keep an exact envelope. */
export const envelope = (ms: Monotonic.Monotonic[]): Monotonic.Monotonic =>
  ms.every((m) => Monotonic.isLinear(m) || Monotonic.isPiecewise(m))
    ? Monotonic.piecewise(
        ms.flatMap((m) =>
          Monotonic.isLinear(m)
            ? [{ slope: m.slope, intercept: m.intercept }]
            : (m as Monotonic.Piecewise).pieces
        )
      )
    : Monotonic.unknown((x) => Math.max(...ms.map((m) => m.run(x))));
