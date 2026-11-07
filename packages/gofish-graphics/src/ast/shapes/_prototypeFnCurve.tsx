/**
 * THROWAWAY PROTOTYPE for the croissant-sampling proposal (#1332, approach B).
 * Not exported from lib.ts and not meant to merge. It tests one claim: a mark
 * whose channel holds a function can draw itself with no rows, sampling the
 * function at render time through the existing `adaptive-resampling.ts`, by
 * treating x ↦ (x, f(x)) (or t ↦ (x(t), y(t))) as one more transform composed
 * in front of the coordinate transform.
 *
 * Domain inference runs before any pixel scale exists, so it samples the
 * function in data space (`dataExtent`) to find the y extent.
 */
import { GoFishNode, outlineOverhang } from "../_node";
import { boxOfDims, outlinePaint, ringOutline } from "../geometry";
import type { GoFishAST } from "../_ast";
import type { Size } from "../dims";
import { CONTINUOUS, type UnderlyingSpace } from "../underlyingSpace";
import { nameableMark, type NameableMark } from "../marks/createOperator";
import { datumOfInput } from "../marks/markResult";
import { posFn } from "../domain";
import { interval } from "../../util/interval";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import { adaptiveResamplePath } from "../../adaptive-resampling";
import { segment, type Path, type PathSegment, type Point } from "../../path";
import type { CoordinateTransform } from "../coordinateTransforms/coord";

export type FnCurveProps = {
  /** A graph: y = f(x) over `range`. */
  f?: (x: number) => number;
  range?: [number, number];
  /** A parametric curve: (x(t), y(t)) for t in `t`. */
  param?: {
    x: (t: number) => number;
    y: (t: number) => number;
    t: [number, number];
  };
  /** "area" fills down to y = 0; "line" strokes the curve only. */
  kind?: "area" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  pinY?: boolean;
};

/** The min and max of g over [a, b], found in data space: 512 even samples,
 *  then golden-section refinement around the best sample of each. */
export const dataExtent = (
  g: (t: number) => number,
  a: number,
  b: number
): [number, number] => {
  const n = 512;
  const xs = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const ys = xs.map(g);
  const refine = (i: number, sign: 1 | -1) => {
    let lo = xs[Math.max(0, i - 1)];
    let hi = xs[Math.min(n, i + 1)];
    for (let k = 0; k < 40; k++) {
      const m1 = hi - (hi - lo) / 1.618;
      const m2 = lo + (hi - lo) / 1.618;
      if (sign * g(m1) > sign * g(m2)) hi = m2;
      else lo = m1;
    }
    return g((lo + hi) / 2);
  };
  let iMax = 0;
  let iMin = 0;
  ys.forEach((y, i) => {
    if (y > ys[iMax]) iMax = i;
    if (y < ys[iMin]) iMin = i;
  });
  return [
    Math.min(ys[iMin], refine(iMin, -1)),
    Math.max(ys[iMax], refine(iMax, 1)),
  ];
};

export const FnCurve = (props: FnCurveProps) => {
  const {
    kind = "area",
    fill = kind === "area" ? "black" : "none",
    stroke = kind === "area" ? fill : "black",
    strokeWidth = kind === "area" ? 0 : 1.5,
    opacity = 1,
  } = props;
  // One parametric form for both: a graph is x(t) = t, y(t) = f(t).
  const P = props.param ?? {
    x: (t: number) => t,
    y: props.f!,
    t: props.range!,
  };
  const [t0, t1] = P.t;
  const [xMin, xMax] = dataExtent(P.x, t0, t1);
  let [yMin, yMax] = dataExtent(P.y, t0, t1);
  if (kind === "area") yMin = Math.min(0, yMin);
  // A nonnegative graph drawn as an area is a magnitude (like ribbon's h).
  // (Prototype shortcut: `pinY` makes y a position, which Coord.polar's
  // radius needs here; the real mark would read the coord's traits.)
  const free = kind === "area" && !props.param && yMin >= 0 && !props.pinY;

  // Set by layout: the curve in LOCAL pixels, as a function of the source
  // coordinate s (local pixels along the curve's own parameter).
  const st: {
    lift: (s: number) => Point;
    base: (s: number) => Point;
    s1: number;
    ring: Point[];
  } = { lift: () => [0, 0], base: () => [0, 0], s1: 0, ring: [] };

  const paint = outlinePaint({ fill, stroke, strokeWidth });

  // Resample source [from, till] through `to`, adaptively, to half a pixel.
  // The source starts as 16 segments, not one: d3's rule (and so
  // adaptive-resampling.ts) never splits a segment whose two ends land on
  // the same pixel, which a closed curve (θ from 0 to 2π) does.
  const resample = (
    to: (s: number) => Point,
    ct: CoordinateTransform | undefined,
    from: number,
    till: number
  ): Path =>
    adaptiveResamplePath(
      Array.from({ length: 16 }, (_, i) =>
        segment(
          [from + ((till - from) * i) / 16, 0],
          [from + ((till - from) * (i + 1)) / 16, 0]
        )
      ),
      {
        type: "prototype-fn",
        domain: ct?.domain as any,
        transform: (p: Point) => (ct ? ct.transform(to(p[0])) : to(p[0])),
      } as CoordinateTransform
    );

  return new GoFishNode(
    {
      type: "fnCurve",
      labelPosition: "outline",
      color: fill,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: (
        _c: Size<UnderlyingSpace>[],
        _n: readonly GoFishAST[]
      ): Size<UnderlyingSpace> => [
        CONTINUOUS(interval(xMin, xMax), "pinned"),
        // An area's height is a magnitude from 0, as ribbon's `h` is: free,
        // so its parent places its baseline. A line's y is a position.
        free
          ? CONTINUOUS(interval(0, yMax), "free")
          : CONTINUOUS(interval(yMin, yMax), "pinned"),
      ],
      layout: (_size, scales) => {
        const mapX = posFn(scales?.[0]?.map) ?? ((d: number) => d);
        const sigmaY = scales?.[1]?.sigma ?? scales?.[1]?.map?.sigma ?? 1;
        const mapY = free
          ? (d: number) => sigmaY * d
          : (posFn(scales?.[1]?.map) ?? ((d: number) => d));
        const xs = [mapX(xMin), mapX(xMax)];
        const ys = [mapY(yMin), mapY(yMax)];
        const tx = Math.min(...xs);
        const ty = Math.min(...ys);
        // The source coordinate is in pixels: t scaled so that the source
        // length is the curve's rough length on screen. Then the resampler's
        // 10-pixel source step means 10 screen pixels.
        let len = 0;
        let prev: Point | undefined;
        for (let i = 0; i <= 64; i++) {
          const t = t0 + ((t1 - t0) * i) / 64;
          const p: Point = [mapX(P.x(t)), mapY(P.y(t))];
          if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
          prev = p;
        }
        st.s1 = Math.max(len, 1);
        const tOf = (s: number) => t0 + ((t1 - t0) * s) / st.s1;
        st.lift = (s) => {
          const t = tOf(s);
          return [mapX(P.x(t)) - tx, mapY(P.y(t)) - ty];
        };
        st.base = (s) => {
          const t = tOf(s);
          return [mapX(P.x(t)) - tx, mapY(0) - ty];
        };
        // The local ring, for geometry (intersect reads it): the resampled
        // points of the curve, closed along the baseline for an area.
        const top = resample(st.lift, undefined, 0, st.s1);
        const pts: Point[] = [
          top[0].type === "line" ? top[0].points[0] : top[0].start,
        ];
        for (const seg of top)
          pts.push(seg.type === "line" ? seg.points[1] : seg.end);
        st.ring = kind === "area" ? [st.base(0), ...pts, st.base(st.s1)] : pts;
        return {
          intrinsicDims: [
            { min: 0, size: Math.abs(xs[1] - xs[0]) },
            { min: 0, size: Math.abs(ys[1] - ys[0]) },
          ],
          transform: { translate: [tx, free ? undefined : ty] },
        };
      },
      lower: ({ coordinateTransform, toPixel, local }, _children, node) => {
        const ct =
          coordinateTransform && coordinateTransform.type !== "linear"
            ? coordinateTransform
            : undefined;
        const L = (f: (s: number) => Point) => (s: number) => local(f(s));
        // The claim: one adaptive resample of s ↦ coord(local(x(s), f(x(s)))).
        let drawn: PathSegment[] = resample(L(st.lift), ct, 0, st.s1);
        if (kind === "area") {
          const T = (p: Point) => (ct ? ct.transform(p) : p);
          const end = T(local(st.lift(st.s1)));
          const endBase = T(local(st.base(st.s1)));
          const startBase = T(local(st.base(0)));
          const start = T(local(st.lift(0)));
          drawn = [
            ...drawn,
            segment(end, endBase),
            ...resample(L(st.base), ct, st.s1, 0),
            segment(startBase, start),
          ];
        }
        const item: DisplayList.PathItem = {
          kind: "path",
          d: pathToPixelSVG(drawn, toPixel),
          datum: node.datum,
          role: roleFor(node.datum),
          style: lowerStyle({ fill, stroke, strokeWidth, opacity }),
        };
        return [item];
      },
      geometry: ({ intrinsicDims }, _children, node) => ({
        box: boxOfDims(intrinsicDims, node.type),
        outline: () => [ringOutline(st.ring, node.yFrame.direction, paint)],
      }),
    },
    []
  );
};

/** The prototype mark: options, or a function of the group's rows that
 *  returns them (a smoothed sample builds its function from its rows). */
export const fnCurve = (
  opts: FnCurveProps | ((rows: any[]) => FnCurveProps)
): NameableMark<any> =>
  nameableMark(async (rows: any[]) => {
    const node = FnCurve(typeof opts === "function" ? opts(rows) : opts);
    node.datum = datumOfInput(rows);
    return node;
  });
