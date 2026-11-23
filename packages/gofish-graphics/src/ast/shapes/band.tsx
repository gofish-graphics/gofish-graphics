/**
 * The shape form of `ribbon` and `line` (`marks/chart.ts`): one node that
 * owns its rows and draws a band, or a path, over a parameter.
 *
 * The node holds two edges, each a function of the parameter in data units
 * (`fun.ts`): `lower` and `upper`. A `ribbon({ x, h })` has `lower` 0 and
 * `upper` the curve through its rows' `h`; a `line({ x, y })` has both
 * edges equal to the curve through its rows' `y` ({@link bandOfRows}). A
 * mark whose channels hold function expressions has the functions
 * themselves as its edges, read at one parameter t ({@link
 * bandOfFunctions}). Every pass reads the two edges from one place,
 * {@link BandProps.edges}:
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
 *   cross-section along the value axis; a line drawn through rows also
 *   gives each row's point (`rowPoints`), which lowering records where it
 *   draws it (`drawnRowPoints`), so a tooltip can focus one row of it.
 */
import { color6, resolveColorChannel } from "../../color";
import {
  curve as bezierCurve,
  mapPathPoints,
  reversePath,
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
  breakpoints,
  constant,
  lowerEnvelope,
  maximum,
  minimum,
  record,
  reparameterize,
  restrict,
  scale,
  add,
  shiftPoly,
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
  orderToPixel,
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
import { interval, toJSON as showDomain } from "../../util/interval";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import type { BlendMode } from "../blendMode";
import { evalFieldValues, isMissing } from "../fieldExpr";
import { resolveColumn } from "../channels";
import { groupFun } from "../groupExpr";
import { setDrawnRowPoints } from "../displayList/drawnRowPoints";
import { cellOn } from "../groupCell";

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
  /** Pixels the band's ink is drawn in by from each end of the parameter.
   *  The values are not drawn in, as a bar's data height is never inset
   *  (`rect.inset`). The box is the band's own (ink only). A closed band
   *  only. */
  inset?: number;
  /** The rows the band is drawn through, each at its parameter value, in
   *  order ({@link bandOfRows}); none when its edges are functions
   *  ({@link bandOfFunctions}). */
  rows?: readonly { row: unknown; t: number }[];
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
  const h = p.to - p.from;
  return shiftPoly(p.coeffs, p.from - p.at0).map((d, k) => d * h ** k);
};

/** Whether a piece's end, read from its own polynomial, is the point the
 *  next piece starts at. The two are computed by different sums, so they
 *  agree only up to rounding, and the rounding grows with the size of the
 *  numbers: a few units in the last place of the larger coordinate. A
 *  step's jump is far larger than that. */
const meets = (p: Point, q: Point): boolean => {
  const tolerance =
    1e-9 * Math.max(1, Math.abs(p[0]), Math.abs(p[1]), Math.abs(q[1]));
  return (
    Math.abs(p[0] - q[0]) <= tolerance && Math.abs(p[1] - q[1]) <= tolerance
  );
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
  if (f.pieces === undefined) return sampledEdgePath(f, point);
  const out: Path = [];
  let at: Point | undefined;
  const jumpTo = (p: Point) => {
    if (at !== undefined && !meets(at, p)) out.push(segment(at, p));
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

/** How far a drawn opaque edge may stray from the function, in pixels: half
 *  a pixel, as the resampling under a coordinate transform reads it
 *  (`adaptive-resampling.ts`). */
const EDGE_TOLERANCE = 0.5;
/** The longest step a drawn opaque edge takes along its parameter before it
 *  checks the tolerance, in pixels, so a bump between two samples is not
 *  missed (d3's `minSourceDistance`). */
const EDGE_STEP = 10;
const EDGE_DEPTH = 16;

/**
 * The path an opaque edge draws, through `point(u, v)` with `u` and `v` in
 * pixels: a polyline whose vertices are on the function, split until each
 * segment's midpoint is within {@link EDGE_TOLERANCE} of the function there
 * and no segment is longer than {@link EDGE_STEP} along the parameter. It
 * starts at every knot, where the function may bend sharply.
 */
function sampledEdgePath(
  f: Fun<number>,
  point: (u: number, v: number) => Point
): Path {
  const at = (u: number): Point => point(u, f.at(u));
  const starts = breakpoints(f);
  if (starts.length < 2) return [];
  const out: Path = [];
  const split = (
    u0: number,
    p0: Point,
    u1: number,
    p1: Point,
    depth: number
  ) => {
    const um = (u0 + u1) / 2;
    const pm = at(um);
    const dx = pm[0] - (p0[0] + p1[0]) / 2;
    const dy = pm[1] - (p0[1] + p1[1]) / 2;
    if (
      depth > 0 &&
      (dx * dx + dy * dy > EDGE_TOLERANCE * EDGE_TOLERANCE ||
        u1 - u0 > EDGE_STEP)
    ) {
      split(u0, p0, um, pm, depth - 1);
      split(um, pm, u1, p1, depth - 1);
    } else out.push(segment(p0, p1));
  };
  let prev = at(starts[0]);
  for (let i = 1; i < starts.length; i++) {
    const next = at(starts[i]);
    split(starts[i - 1], prev, starts[i], next, EDGE_DEPTH);
    prev = next;
  }
  return out;
}

/** What layout leaves for lowering and geometry: the edges in the node's
 *  local pixels (along the parameter from 0) and the path they draw, in the
 *  node's axis order, and the point of each row a line is drawn through. */
type LaidOutBand = {
  edges: BandEdges;
  path: Path;
  points: { row: unknown; at: Point }[];
};

export const Band = ({
  axis,
  edges,
  origin,
  closed,
  inset = 0,
  rows,
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
  if (!(Number.isFinite(inset) && inset >= 0))
    throw new Error(
      `[gofish] ribbon({ inset: ${inset} }): inset is a number of pixels, 0 ` +
        `or more.`
    );
  if (inset > 0 && !closed)
    throw new Error(
      "[gofish] line({ inset }): only a ribbon, a closed band, is drawn in."
    );
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
      labelPlacement: "outline",
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
        const ink = inset > 0 ? insetEdges(px, inset) : px;
        // A line's rows, each on its drawn edge. A ribbon is a region (a
        // pointer anywhere inside it is on it), described as a whole, so it
        // gives none.
        const { min: u0, max: u1 } = px.upper.domain;
        const points = closed
          ? []
          : (rows ?? []).map(({ row, t }) => {
              const u = Math.min(u1, Math.max(u0, pxOf(along, t) - start));
              return { row, at: point(u, px.upper.at(u)) };
            });
        const renderData: LaidOutBand = {
          edges: ink ?? px,
          path: ink === undefined ? [] : pathOf(ink),
          points,
        };
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
        const { path, points } = renderData as LaidOutBand;
        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";
        const placed = mapPathPoints(path, local);
        // Under a coordinate transform the exact path is resampled through
        // it, adaptively, to half a pixel; with none it is drawn as it is.
        const warped =
          coordinateTransform && coordinateTransform.type !== "linear"
            ? coordinateTransform
            : undefined;
        const drawn = warped
          ? transformPath(placed, warped, { resample: true })
          : placed;
        const item: DisplayList.DisplayItem = {
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
        };
        // Each row's point, drawn as the path is: placed, through the
        // coordinate transform, to pixels.
        if (points.length > 0)
          setDrawnRowPoints(
            item,
            points.map(({ row, at }) => {
              const placedAt = local(at);
              const [x, y] = toPixel(
                warped ? warped.transform(placedAt) : placedAt
              );
              return { row, x, y };
            })
          );
        return [item];
      },
      geometry: ({ intrinsicDims, renderData }, _children, node) => {
        const { edges: px, path, points } = renderData as LaidOutBand;
        const box = boxOfDims(intrinsicDims, node.type);
        return {
          box,
          rowPoints: () =>
            points.map(({ row, at }) => ({
              row,
              at: orderToPixel([at], node.yFrame.direction)[0],
            })),
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
  if (!closed && rows !== undefined) node.throughRows = true;
  return node;
};

/** Edges in local pixels drawn in by `inset`: `inset` in from each end of
 *  the parameter. The values are not drawn in: the lower edge stays on the
 *  baseline the data puts it on, as a bar's data height is never inset
 *  (`rect.inset`). Undefined when the band is no wider than twice `inset`. */
function insetEdges(px: BandEdges, inset: number): BandEdges | undefined {
  const { min, max } = px.upper.domain;
  if (!(max - min > 2 * inset)) return undefined;
  const over = { min: min + inset, max: max - inset };
  return { lower: restrict(px.lower, over), upper: restrict(px.upper, over) };
}

/** The edges of the curve `f` of values of `kind`: a position's are `f`
 *  twice, an amount's are 0 and `f`. */
const edgesOf = (
  f: Fun<number>,
  kind: "amount" | "position",
  parameterQuantity: Quantity | undefined,
  valueQuantity: Quantity | undefined
): Pick<BandProps, "edges" | "parameterQuantity" | "valueQuantity"> => ({
  edges:
    kind === "position"
      ? { lower: f, upper: f }
      : { lower: constant(0, f.domain), upper: f },
  parameterQuantity,
  valueQuantity,
});

/** One position channel of the shape form: the option's name and its
 *  accessor. */
type Channel = { name: string; accessor: unknown };

/** The map `t ↦ a·t + b` that `f` is, when it is exact and one line over its
 *  whole domain: what a position channel at the mark's parameter must be
 *  for its cross-sections to be functions of the position (the identity of
 *  `domain()` is one, with `a = 1`, `b = 0`). */
function affineOf(f: Fun<number>): { a: number; b: number } | undefined {
  if (f.pieces === undefined) return undefined;
  const spans = f.pieces.filter((p) => p.from !== p.to);
  if (spans.length === 0) return undefined;
  const lineOf = (p: Piece<number>) => {
    const [c0, c1 = 0, ...rest] = p.coeffs;
    return rest.some((c) => c !== 0)
      ? undefined
      : { a: c1, b: c0 - c1 * p.at0 };
  };
  const line = lineOf(spans[0]);
  if (line === undefined) return undefined;
  const on = (t: number, v: number) =>
    Math.abs(line.a * t + line.b - v) <= 1e-12 * Math.max(1, Math.abs(v));
  // Every piece is the same line: each span's ends, and each point piece's
  // value, lie on it.
  for (const p of f.pieces) {
    const l = lineOf(p);
    if (l === undefined) return undefined;
    if (!on(p.from, l.a * p.from + l.b) || !on(p.to, l.a * p.to + l.b))
      return undefined;
  }
  return line;
}

/**
 * The edges of a band or a path whose channels hold function expressions:
 * the mark has one parameter t, and every channel that holds a function is
 * read at the same t (`groupFun` reads each one's function for this group).
 *
 * - Their domains must be equal, or it is an error that names both.
 * - The position channel (`x`, or a vertical band's `y`) must hold a
 *   function: a column beside a function is an error, since rows are not
 *   read at t. The value channel may hold a number instead, a constant
 *   function over the parameter's domain.
 * - The position must be one increasing line in t (`f.domain()` is
 *   `t ↦ t`), so the band's cross-sections stay functions of its position.
 *   The values are then read through it exactly ({@link reparameterize}).
 *   TODO(#1374): a position that bends in t (a P-P plot,
 *   `line({ x: a.cdf(), y: b.cdf() })`) needs the values read through the
 *   inverse of the position; it is an error until then.
 * - `value` is an amount or a position, as for {@link bandOfRows}.
 */
export function bandOfFunctions(
  mark: string,
  rows: readonly unknown[],
  parameter: Channel,
  value: Channel & { kind: "amount" | "position" },
  group: string | number | undefined
): Pick<BandProps, "edges" | "parameterQuantity" | "valueQuantity"> {
  const where = group === undefined ? "" : ` in the group "${group}"`;
  const read = (c: Channel) =>
    groupFun(c.accessor, rows, resolveColumn(rows, c.accessor).quantity);
  const t = read(parameter);
  if (t === undefined)
    throw new Error(
      `[gofish] ${mark}({ ${parameter.name}, ${value.name} }): ` +
        `${value.name} holds a function of t, so ${parameter.name} must too: ` +
        `rows are not read at t. Give ${parameter.name} the function's ` +
        `domain, ${mark}({ ${parameter.name}: f.domain(), ${value.name}: f }).`
    );
  let v = read(value);
  if (v === undefined) {
    if (typeof value.accessor !== "number")
      throw new Error(
        `[gofish] ${mark}({ ${parameter.name}, ${value.name} }): ` +
          `${parameter.name} holds a function of t, so ${value.name} must ` +
          `hold a function too, or a number (a constant over t): rows are ` +
          `not read at t.`
      );
    v = { fun: constant(value.accessor, t.fun.domain) };
  } else if (
    v.fun.domain.min !== t.fun.domain.min ||
    v.fun.domain.max !== t.fun.domain.max
  )
    throw new Error(
      `[gofish] ${mark}({ ${parameter.name}, ${value.name} }): every function ` +
        `channel of a ${mark} is read at one t, so their domains must be ` +
        `equal, but${where} ${parameter.name} is over ` +
        `${showDomain(t.fun.domain)} and ${value.name} over ` +
        `${showDomain(v.fun.domain)}.`
    );
  const line = affineOf(t.fun);
  if (line === undefined || !(line.a > 0))
    throw new Error(
      `[gofish] ${mark}({ ${parameter.name} }): the position must be one ` +
        `increasing line in t, such as f.domain() (t itself), so each ` +
        `${parameter.name} has one value; a position that bends in t is not ` +
        `supported yet.`
    );
  const along =
    line.a === 1 && line.b === 0
      ? v.fun
      : reparameterize(v.fun, line.a, line.b);
  return edgesOf(along, value.kind, t.quantity, v.quantity);
}

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
 * - In a cell of the parameter's column (a partition by
 *   `field(x).bin(p)`, groupCell.ts), it is the band through the whole
 *   group's rows, restricted to the cell, so the cells of one band meet.
 */
export function bandOfRows(
  mark: string,
  rows: readonly unknown[],
  parameter: Channel,
  value: Channel & { kind: "amount" | "position" },
  curve: ParameterCurve,
  group: string | number | undefined
): Pick<BandProps, "edges" | "rows" | "parameterQuantity" | "valueQuantity"> {
  const a = parameter.accessor as { type?: string; name?: string; ops?: [] };
  const column =
    typeof a === "string"
      ? a
      : a?.type === "field" && (a.ops ?? []).length === 0
        ? a.name
        : undefined;
  const cell =
    column === undefined
      ? undefined
      : cellOn(rows, { kind: "column", name: column });
  if (cell !== undefined) {
    const whole = bandOfRows(mark, cell.whole, parameter, value, curve, group);
    const { domain } = whole.edges.upper;
    const over = {
      min: Math.max(domain.min, cell.cell.min),
      max: Math.min(domain.max, cell.cell.max),
    };
    if (!(over.min < over.max))
      throw new Error(
        `[gofish] ${mark}({ ${parameter.name} }): the cell ` +
          `[${cell.cell.min}, ${cell.cell.max}] of "${column}" holds none ` +
          `of the band, which runs over ${showDomain(domain)}.`
      );
    return {
      ...whole,
      edges: {
        lower: restrict(whole.edges.lower, over),
        upper: restrict(whole.edges.upper, over),
      },
      rows: whole.rows?.filter(({ t }) => t >= over.min && t <= over.max),
    };
  }
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
  const points: { row: unknown; t: number; v: number }[] = [];
  rows.forEach((row, i) => {
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
    points.push({ row, t: ti, v: vi });
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
  return {
    ...edgesOf(curveThrough, value.kind, t.quantity, v.quantity),
    rows: points.map(({ row, t }) => ({ row, t })),
  };
}
