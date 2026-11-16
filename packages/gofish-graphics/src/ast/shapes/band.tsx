/**
 * The shape form of `ribbon` and `line` (`marks/chart.ts`): one node that
 * owns its rows and draws a band, or a path, over a parameter.
 *
 * The node holds two edges, each a function of the parameter in data units
 * (`fun.ts`): `lower` and `upper`. A `ribbon({ x, h })` has `lower` 0 and
 * `upper` the curve through its rows' `h`; a `line({ x, y })` has both
 * edges equal to the curve through its rows' `y`. Every pass reads the two
 * edges from one place, {@link BandProps.edges}:
 *
 * - Types: along the parameter's axis, a pinned space over the parameter's
 *   extent. Along the value axis, the hull of the two edges, free when the
 *   values are amounts from a baseline (a band's `h`) and pinned when they
 *   are positions (a line's `y`), with the cross-section as its `profile`.
 * - Layout reads the scales it is given and turns each edge into a function
 *   of the local pixel along the parameter, exactly
 *   ({@link reparameterize}, then an affine map of the values).
 * - Lowering draws those pixel edges: lines for linear and step pieces and
 *   cubic Béziers for monotone and smooth ones, then, under a coordinate
 *   transform, one adaptive resampling of the drawn path through it.
 * - Geometry gives the box, the outline of the same path, and the
 *   cross-section along the value axis.
 */
import { color6, resolveColorChannel } from "../../color";
import {
  curve as bezierCurve,
  mapPathPoints,
  reversePath,
  samePoint,
  segment,
  transformPath,
  type Path,
  type Point,
} from "../../path";
import { GoFishNode, outlineOverhang } from "../_node";
import type { GoFishAST } from "../_ast";
import type { Size } from "../dims";
import { isValue, type MaybeValue } from "../data";
import { pxOf, type AxisScale } from "../domain";
import {
  constant,
  lowerEnvelope,
  maximum,
  minimum,
  record,
  reparameterize,
  restrict,
  scale,
  add,
  through,
  type Fun,
  type Interval,
  type ParameterCurve,
  type Piece,
  upperEnvelope,
} from "../fun";
import {
  boxCrossSection,
  boxOfDims,
  outlinePaint,
  pathOutline,
} from "../geometry";
import {
  CONTINUOUS,
  differenceUnits,
  quantityUnits,
  withProfile,
  type UnderlyingSpace,
} from "../underlyingSpace";
import type { Quantity } from "../measure";
import { interval } from "../../util/interval";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import type { BlendMode } from "../blendMode";
import { evalFieldValues, isMissing } from "../fieldExpr";
import { resolveColumn } from "../channels";

/** A band's or a path's two edges: functions of the parameter, in data
 *  units, over one domain (the parameter's extent). */
export type BandEdges = { lower: Fun<number>; upper: Fun<number> };

export type BandProps = {
  /** The axis the parameter runs along: 0 for `x`, 1 for `y`. The values
   *  run along the other. */
  axis: 0 | 1;
  edges: BandEdges;
  /** What the values are: `"free"` for amounts from a baseline (a band's
   *  `h`), which its parent places; `"pinned"` for positions (a line's
   *  `y`). */
  origin: "free" | "pinned";
  /** A band is filled between its edges and closed; a path is the upper
   *  edge alone, open. */
  closed: boolean;
  /** What the parameter's and the values' columns measure, read into
   *  units in the type walk. An amount's units are those of a difference of
   *  its values, as a rect's data size is (`magnitude`). */
  parameterQuantity?: Quantity;
  valueQuantity?: Quantity;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  blendMode?: BlendMode;
};

/** The cross-section of two edges: from the lower envelope to the upper
 *  one, so an edge that crosses the other (a signed `h`) still gives an
 *  interval. Exact when both edges are. */
const crossSectionOfEdges = ({ lower, upper }: BandEdges): Fun<Interval> =>
  record({
    min: lowerEnvelope([lower, upper]),
    max: upperEnvelope([lower, upper]),
  });

/** The smallest and largest value of two edges. */
const hullOfEdges = ({ lower, upper }: BandEdges): [number, number] => [
  Math.min(minimum(lower), minimum(upper)),
  Math.max(maximum(lower), maximum(upper)),
];

/** `f` with its values read through `v ↦ k·v + c`. */
const mapValues = (f: Fun<number>, k: number, c: number): Fun<number> =>
  c === 0 ? scale(f, k) : add(scale(f, k), constant(c, f.domain));

/** A piece's polynomial over `w` in [0, 1] across the piece (`u = from +
 *  w · (to − from)`), lowest power first. */
const overUnit = (p: Piece<number>): number[] => {
  const s0 = p.from - p.at0;
  const h = p.to - p.from;
  const c = p.coeffs;
  // Taylor shift by s0, then scale the kth coefficient by hᵏ.
  const shifted = [...c];
  for (let i = 0; i < shifted.length - 1; i++)
    for (let j = shifted.length - 2; j >= i; j--)
      shifted[j] += shifted[j + 1] * s0;
  return shifted.map((d, k) => d * h ** k);
};

/**
 * The path an exact edge draws, through `point(u, v)`: a line for each
 * piece of degree 0 or 1, a cubic Bézier for each piece of degree 2 or 3,
 * and a straight jump where one piece ends at a different value than the
 * next starts (a step). An affine `point` keeps it exact.
 */
export function edgePath(
  f: Fun<number>,
  point: (u: number, v: number) => Point
): Path {
  if (f.pieces === undefined)
    // TODO(stack profiles S9): a function given as `fun()` has no pieces;
    // it is drawn by resampling it, which arrives with function channels.
    throw new Error(
      "[gofish] band: an edge without exact pieces cannot be drawn yet."
    );
  const out: Path = [];
  let at: Point | undefined;
  const jumpTo = (p: Point) => {
    if (at !== undefined && !samePoint(at, p)) out.push(segment(at, p));
    at = p;
  };
  for (const p of f.pieces) {
    if (p.from === p.to) {
      jumpTo(point(p.from, p.coeffs[0]));
      continue;
    }
    const d = overUnit(p);
    if (d.length > 4)
      throw new Error(
        `[gofish] band: an edge piece of degree ${d.length - 1} cannot be ` +
          `drawn; pieces are at most cubic.`
      );
    const [d0 = 0, d1 = 0, d2 = 0, d3 = 0] = d;
    const h = p.to - p.from;
    const start = point(p.from, d0);
    const end = point(p.to, d0 + d1 + d2 + d3);
    jumpTo(start);
    if (d.length <= 2) out.push(segment(start, end));
    else
      out.push(
        bezierCurve(
          start,
          point(p.from + h / 3, d0 + d1 / 3),
          point(p.from + (2 * h) / 3, d0 + (2 * d1) / 3 + d2 / 3),
          end
        )
      );
    at = end;
  }
  return out;
}

/** What layout leaves for lowering and geometry: the edges in the node's
 *  local pixels (along the parameter from 0) and the path they draw, in the
 *  node's axis order. */
type LaidOutBand = { edges: BandEdges; path: Path };

export const Band = ({
  axis,
  edges,
  origin,
  closed,
  parameterQuantity,
  valueQuantity,
  fill = color6[0],
  stroke,
  strokeWidth = closed ? 0 : 1,
  strokeDasharray,
  opacity = 1,
  blendMode,
}: BandProps): GoFishNode => {
  const across: 0 | 1 = axis === 0 ? 1 : 0;
  const strokeColor = stroke ?? fill;
  const paint = outlinePaint({
    fill: closed ? fill : "none",
    stroke: strokeColor,
    strokeWidth,
  });
  const domain = edges.upper.domain;
  /** A point in the node's axis order: `u` along the parameter, `v` along
   *  the values. */
  const point = (u: number, v: number): Point => {
    const p: Point = [0, 0];
    p[axis] = u;
    p[across] = v;
    return p;
  };
  /** The path two edges draw: the upper edge, and for a band the lower
   *  edge back, closed across each end. */
  const pathOf = (e: BandEdges): Path => {
    const upper = edgePath(e.upper, point);
    if (!closed) return upper;
    const lower = edgePath(e.lower, point);
    // A band of one row has no width: there is nothing to fill.
    if (upper.length === 0 || lower.length === 0) return [];
    const startOf = (path: Path): Point =>
      path[0].type === "line" ? path[0].points[0] : path[0].start;
    const endOf = (path: Path): Point => {
      const seg = path[path.length - 1];
      return seg.type === "line" ? seg.points[1] : seg.end;
    };
    return [
      ...upper,
      segment(endOf(upper), endOf(lower)),
      ...reversePath(lower),
      segment(startOf(lower), startOf(upper)),
    ];
  };

  const node: GoFishNode = new GoFishNode(
    {
      type: closed ? "ribbon" : "line",
      // Labeled by its outline: a line at its end, a band inside itself.
      labelPosition: "outline",
      color: isValue(fill) ? fill : strokeColor,
      strokeOverhang: outlineOverhang(strokeColor, strokeWidth),
      // A band of amounts can be moved by an offset that changes along its
      // parameter (a stack of bands), and draws it.
      shearAxis: origin === "free" ? across : undefined,
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: readonly GoFishAST[]
      ) => {
        const [lo, hi] = hullOfEdges(edges);
        const parameter = CONTINUOUS(
          interval(domain.min, domain.max),
          "pinned",
          quantityUnits(parameterQuantity)
        );
        const units = quantityUnits(valueQuantity);
        const valueUnits =
          origin === "free" ? units && differenceUnits(units) : units;
        const values = withProfile(
          CONTINUOUS(interval(lo, hi), origin, valueUnits),
          crossSectionOfEdges(edges)
        );
        return axis === 0 ? [parameter, values] : [values, parameter];
      },
      layout: (_size, scales: Size<AxisScale | undefined>) => {
        const along = scales[axis]?.map;
        if (along === undefined)
          throw new Error(
            `[gofish] ${node.type}: its parameter's axis has no position ` +
              `scale, so its rows cannot be placed.`
          );
        // The parameter in local pixels, from 0 at its first value.
        const start = pxOf(along, domain.min);
        const values = scales[across];
        // A position is read through its map, from 0 at its lowest value;
        // an amount from its baseline (local 0) through σ alone, as a
        // rect's data size is.
        const [lo] = hullOfEdges(edges);
        let k: number;
        let c: number;
        if (origin === "pinned") {
          const map = values?.map;
          if (map === undefined)
            throw new Error(
              `[gofish] ${node.type}: its value axis has no position scale, ` +
                `so its rows cannot be placed.`
            );
          k = map.sigma;
          c = map.originPx - pxOf(map, lo);
        } else {
          const sigma = values?.map?.sigma ?? values?.sigma;
          if (sigma === undefined)
            throw new Error(
              `[gofish] ${node.type}: its value axis has no scale, so its ` +
                `amounts cannot be sized.`
            );
          k = sigma;
          c = 0;
        }
        // A stack that moves the band by an offset that changes along the
        // parameter (`AxisScale.shear`, in data units) moves both edges by
        // it at every u: each cross-section moves, and none is resized.
        const shear = values?.shear;
        const sheared = (f: Fun<number>): Fun<number> =>
          shear === undefined ? f : add(f, restrict(shear, f.domain));
        const local = (f: Fun<number>): Fun<number> =>
          mapValues(
            reparameterize(sheared(f), along.sigma, along.originPx - start),
            k,
            c
          );
        const px: BandEdges = {
          lower: local(edges.lower),
          upper: local(edges.upper),
        };
        const [vMin, vMax] = hullOfEdges(px);
        const width = px.upper.domain.max - px.upper.domain.min;
        const dims: any = {};
        dims[axis] = { min: 0, size: width };
        dims[across] = { min: vMin, size: vMax - vMin };
        const translate: [number | undefined, number | undefined] = [
          undefined,
          undefined,
        ];
        translate[axis] = start;
        if (origin === "pinned") translate[across] = pxOf(values!.map!, lo);
        const renderData: LaidOutBand = { edges: px, path: pathOf(px) };
        return {
          intrinsicDims: dims,
          transform: { translate },
          renderData,
        };
      },
      lower: (
        { renderData, coordinateTransform, toPixel, local },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const { path } = renderData as LaidOutBand;
        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";
        const placed = mapPathPoints(path, local);
        // Under a coordinate transform the exact path is resampled through
        // it, adaptively, to half a pixel; with none it is drawn as it is.
        const drawn =
          coordinateTransform && coordinateTransform.type !== "linear"
            ? transformPath(placed, coordinateTransform, { resample: true })
            : placed;
        return [
          {
            kind: "path",
            d: pathToPixelSVG(drawn, toPixel),
            datum: node.datum,
            role: roleFor(node.datum),
            style: lowerStyle({
              fill: closed ? resolvedFill : "none",
              stroke: resolvedStroke,
              strokeWidth,
              strokeDasharray,
              opacity,
              mixBlendMode: blendMode,
            }),
          },
        ];
      },
      geometry: ({ intrinsicDims, renderData }, _children, node) => {
        const { edges: px, path } = renderData as LaidOutBand;
        const box = boxOfDims(intrinsicDims, node.type);
        return {
          box,
          outline: (tolerance) => [
            pathOutline(path, tolerance, node.yFrame.direction, closed, paint),
          ],
          crossSection: (on) =>
            on === across ? crossSectionOfEdges(px) : boxCrossSection(box, on),
        };
      },
    },
    []
  );
  return node;
};

/** One position channel of the shape form: the option's name and its
 *  accessor. */
type Channel = { name: string; accessor: unknown };

/**
 * The edges of a band or a path built from `rows`: the rows sorted by the
 * parameter, one knot per row, the values between them read as `curve`
 * says. Rows missing either value are left out.
 *
 * - The parameter's column must hold numbers (a time column, in
 *   `Unit.time()`, holds epoch milliseconds); text or levels are an error.
 * - Two rows of one group at the same parameter value are an error.
 * - `value` is an amount from a baseline (`"amount"`, a band's `h`) or a
 *   position (`"position"`, a line's `y`): an amount's edges are 0 and the
 *   curve, in the difference unit of its column, as a rect's size is; a
 *   position's are the curve twice, in its column's unit.
 */
export function bandOfRows(
  mark: string,
  rows: readonly unknown[],
  parameter: Channel,
  value: Channel & { kind: "amount" | "position" },
  curve: ParameterCurve,
  group: string | number | undefined
): Pick<BandProps, "edges" | "parameterQuantity" | "valueQuantity"> {
  const read = (c: Channel) => {
    const column = resolveColumn(rows, c.accessor);
    const { values, folded, quantity } = evalFieldValues(
      c.accessor as any,
      rows as unknown[],
      column.quantity
    );
    if (folded)
      throw new Error(
        `[gofish] ${mark}({ ${c.name} }): the shape form reads one value per ` +
          `row, but this accessor folds the rows into one. Fold them first ` +
          `with derive, or pass a column.`
      );
    return {
      values,
      column,
      quantity: quantity ?? column.quantity,
    };
  };
  const t = read(parameter);
  const v = read(value);
  const where = group === undefined ? "" : ` in the group "${group}"`;
  if (t.column.type?.HasLevels !== undefined)
    throw new Error(
      `[gofish] ${mark}({ ${parameter.name} }): the column` +
        ` "${parameter.accessor}" has levels, so it has no positions in ` +
        `between to draw a curve over. Use a numeric or time column, or the ` +
        `connector form (${mark}() after a spread or scatter over the levels).`
    );
  const points: { t: number; v: number }[] = [];
  rows.forEach((_, i) => {
    const ti = t.values[i];
    const vi = v.values[i];
    if (isMissing(ti) || isMissing(vi)) return;
    if (typeof ti !== "number")
      throw new Error(
        `[gofish] ${mark}({ ${parameter.name} }): the parameter must be a ` +
          `number or a time, but a row${where} has ${JSON.stringify(ti)}. ` +
          `Use a numeric column, a time column (declare it with ` +
          `Unit.time() in the chart's schema), or the connector form ` +
          `(${mark}() after a spread or scatter over the levels).`
      );
    if (typeof vi !== "number")
      throw new Error(
        `[gofish] ${mark}({ ${value.name} }): the values must be numbers, ` +
          `but a row${where} has ${JSON.stringify(vi)}.`
      );
    if (Number.isNaN(ti) || Number.isNaN(vi)) return;
    points.push({ t: ti, v: vi });
  });
  if (points.length === 0)
    throw new Error(
      `[gofish] ${mark}: no row${where} has both a ` +
        `${parameter.name} and a ${value.name}, so there is nothing to draw.`
    );
  points.sort((a, b) => a.t - b.t);
  const zone = t.column.type?.HasUnit?.zone;
  for (let i = 1; i < points.length; i++)
    if (points[i].t === points[i - 1].t) {
      const at =
        zone === undefined
          ? String(points[i].t)
          : new Date(points[i].t).toISOString();
      throw new Error(
        `[gofish] ${mark}({ ${parameter.name} }): two rows${where} are at ` +
          `${parameter.name} = ${at}, and a ${mark} has one value at each ` +
          `${parameter.name}. Split the rows into one series each with ` +
          `group({ by }), or combine the rows at one ${parameter.name} ` +
          `first with derive.`
      );
    }
  const curveThrough = through(
    points.map((p) => p.t),
    points.map((p) => p.v),
    curve
  );
  if (value.kind === "position")
    return {
      edges: { lower: curveThrough, upper: curveThrough },
      parameterQuantity: t.quantity,
      valueQuantity: v.quantity,
    };
  return {
    edges: { lower: constant(0, curveThrough.domain), upper: curveThrough },
    parameterQuantity: t.quantity,
    valueQuantity: v.quantity,
  };
}
