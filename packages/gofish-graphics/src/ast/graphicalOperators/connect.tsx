import { For } from "solid-js";
import { Path, PathSegment, pathToSVGPath, transformPath } from "../../path";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { Dimensions, elaborateDirection, FancyDirection, Size } from "../dims";
import { pairs } from "../../util";
import { linear } from "../coordinateTransforms/linear";
import { getValue, isValue, MaybeValue } from "../data";
import { Domain } from "../domain";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";

// Per-axis bbox anchor. A literal number is the raw fraction in [0, 1]; the
// keywords map to {start: 0, middle: 0.5, end: 1}. GoFish is y-up, so
// `start`/`end` on the y axis are bottom/top respectively.
export type AnchorAlignment = "start" | "middle" | "end";
export type AnchorAxis = number | AnchorAlignment;
// One of:
//   - a single keyword applied to both axes  (`"middle"` ≡ `[0.5, 0.5]`)
//   - a per-axis tuple                       (`["start", "middle"]`)
//   - an axis-keyed object                   (`{ x: "start", y: 0.5 }`)
// In the object form, omitted axes default to `"middle"` (0.5).
export type AnchorSpec =
  | AnchorAlignment
  | [AnchorAxis, AnchorAxis]
  | { x?: AnchorAxis; y?: AnchorAxis };

const resolveAnchorAxis = (a: AnchorAxis): number =>
  typeof a === "number" ? a : a === "start" ? 0 : a === "middle" ? 0.5 : 1;

const resolveAnchor = (a: AnchorSpec): [number, number] => {
  if (typeof a === "string") {
    const v = resolveAnchorAxis(a);
    return [v, v];
  }
  if (Array.isArray(a)) {
    return [resolveAnchorAxis(a[0]), resolveAnchorAxis(a[1])];
  }
  return [
    a.x !== undefined ? resolveAnchorAxis(a.x) : 0.5,
    a.y !== undefined ? resolveAnchorAxis(a.y) : 0.5,
  ];
};

export const connect = createNodeOperator(
  (
    {
      direction,
      fill,
      interpolation,
      stroke,
      strokeWidth,
      opacity,
      mode = "edge",
      mixBlendMode,
      source,
      target,
    }: {
      // Optional in anchor mode (source/target), where it is ignored.
      direction?: FancyDirection;
      fill?: MaybeValue<string>;
      interpolation?: "linear" | "bezier";
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      mode?: "edge" | "center";
      mixBlendMode?: "multiply" | "normal";
      // Per-endpoint anchor on each child's bbox. Accepts a per-axis tuple
      // `[fx, fy]` of numbers (`min + f * size`) or alignment keywords
      // (`start | middle | end` → `0 | 0.5 | 1`), with a single keyword as
      // shorthand for both axes (e.g. `"middle"` ≡ `[0.5, 0.5]`).
      //
      // When either is given, the connector runs straight between the
      // anchored points of each consecutive child pair, ignoring
      // `direction`/`mode`. If both are given, the line runs directly between
      // them. If only one is given, the other endpoint is the specified
      // point clamped onto the opposite bbox per axis (Bluefish `Line`
      // behavior) — yielding an axis-aligned line when the point lies within
      // that box on one axis.
      source?: AnchorSpec;
      target?: AnchorSpec;
    },
    children: GoFishAST[]
  ) => {
    const resolvedSource =
      source !== undefined ? resolveAnchor(source) : undefined;
    const resolvedTarget =
      target !== undefined ? resolveAnchor(target) : undefined;
    const dir = elaborateDirection(direction ?? 0);
    interpolation = interpolation ?? "linear";

    return new GoFishNode(
      {
        type: "connect",
        labelKind: "path",
        shared: [false, false],
        color: fill,
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          return [UNDEFINED, UNDEFINED];
        },
        layout: (shared, size, scaleFactors, children) => {
          const defaultColor = children[0]?.color ?? "black";

          const paths: Path[] = [];

          const hasAnchors =
            resolvedSource !== undefined || resolvedTarget !== undefined;

          if (mode === "edge" && !hasAnchors) {
            for (const child of children) {
              // toggle embedding on the direction axis
              (child as GoFishAST).embed(direction ?? 0);
            }
          }

          const childPlaceables = children.map((child) =>
            child.layout(size, scaleFactors, [undefined, undefined])
          );
          const bboxPairs = pairs(childPlaceables.map((child) => child.dims));

          // Anchor mode: connect normalized points on each endpoint's bbox.
          if (hasAnchors) {
            const onlySource =
              resolvedSource !== undefined && resolvedTarget === undefined;
            const onlyTarget =
              resolvedTarget !== undefined && resolvedSource === undefined;

            // Resolve a normalized [fx, fy] anchor to an absolute point on a bbox.
            const anchorPoint = (
              b: Dimensions,
              f: [number, number]
            ): [number, number] => [
              b[0].min! + f[0] * b[0].size!,
              b[1].min! + f[1] * b[1].size!,
            ];

            // When one anchor is omitted, clamp the specified point's
            // coordinates into the other bbox's range (per-axis). This is
            // Bluefish's Line behavior: it produces an axis-aligned line when
            // the specified point lies within the other box on one axis, and
            // falls back to the nearest corner otherwise.
            const clamp = (v: number, lo: number, hi: number): number =>
              Math.max(lo, Math.min(hi, v));
            const clampOnto = (
              pt: [number, number],
              onto: Dimensions
            ): [number, number] => [
              clamp(pt[0], onto[0].min!, onto[0].max!),
              clamp(pt[1], onto[1].min!, onto[1].max!),
            ];

            let aMinX = Infinity;
            let aMaxX = -Infinity;
            let aMinY = Infinity;
            let aMaxY = -Infinity;
            for (const [b0, b1] of bboxPairs) {
              let p0: [number, number];
              let p1: [number, number];
              if (onlySource) {
                p0 = anchorPoint(b0, resolvedSource!);
                p1 = clampOnto(p0, b1);
              } else if (onlyTarget) {
                p1 = anchorPoint(b1, resolvedTarget!);
                p0 = clampOnto(p1, b0);
              } else {
                p0 = anchorPoint(b0, resolvedSource ?? [0.5, 0.5]);
                p1 = anchorPoint(b1, resolvedTarget ?? [0.5, 0.5]);
              }
              paths.push([{ type: "line", points: [p0, p1] }]);
              aMinX = Math.min(aMinX, p0[0], p1[0]);
              aMaxX = Math.max(aMaxX, p0[0], p1[0]);
              aMinY = Math.min(aMinY, p0[1], p1[1]);
              aMaxY = Math.max(aMaxY, p0[1], p1[1]);
            }
            const hasPaths = bboxPairs.length > 0;
            const w = hasPaths ? aMaxX - aMinX : 0;
            const h = hasPaths ? aMaxY - aMinY : 0;
            return {
              intrinsicDims: [
                {
                  min: hasPaths ? aMinX : 0,
                  size: w,
                  center: hasPaths ? aMinX + w / 2 : 0,
                  max: hasPaths ? aMaxX : 0,
                },
                {
                  min: hasPaths ? aMinY : 0,
                  size: h,
                  center: hasPaths ? aMinY + h / 2 : 0,
                  max: hasPaths ? aMaxY : 0,
                },
              ],
              transform: { translate: [0, 0] },
              renderData: { paths, defaultColor },
            };
          }
          // If in center mode, adjust bounding boxes to have zero width/height
          // with min and max equal to the center point

          // Compute bounding box from connected elements
          let bboxMinX = Infinity;
          let bboxMaxX = -Infinity;
          let bboxMinY = Infinity;
          let bboxMaxY = -Infinity;

          for (const [b0, b1] of bboxPairs) {
            if (mode === "center") {
              const cx0 = (b0[0].min! + b0[0].max!) / 2;
              const cy0 = (b0[1].min! + b0[1].max!) / 2;
              const cx1 = (b1[0].min! + b1[0].max!) / 2;
              const cy1 = (b1[1].min! + b1[1].max!) / 2;
              bboxMinX = Math.min(bboxMinX, cx0, cx1);
              bboxMaxX = Math.max(bboxMaxX, cx0, cx1);
              bboxMinY = Math.min(bboxMinY, cy0, cy1);
              bboxMaxY = Math.max(bboxMaxY, cy0, cy1);
            } else {
              bboxMinX = Math.min(bboxMinX, b0[0].min!, b1[0].min!);
              bboxMaxX = Math.max(bboxMaxX, b0[0].max!, b1[0].max!);
              bboxMinY = Math.min(bboxMinY, b0[1].min!, b1[1].min!);
              bboxMaxY = Math.max(bboxMaxY, b0[1].max!, b1[1].max!);
            }
          }

          if (dir === 0) {
            if (interpolation === "linear") {
              if (mode === "center") {
                for (const [b0, b1] of bboxPairs) {
                  const midX = (b0[0].max! + b1[0].min!) / 2;
                  const midY = (b0[1].max! + b1[1].min!) / 2;
                  paths.push([
                    {
                      type: "line",
                      points: [
                        [
                          (b0[0].min! + b0[0].max!) / 2,
                          (b0[1].min! + b0[1].max!) / 2,
                        ],
                        [
                          (b1[0].min! + b1[0].max!) / 2,
                          (b1[1].min! + b1[1].max!) / 2,
                        ],
                      ],
                    },
                  ]);
                }
              } else {
                for (const [b0, b1] of bboxPairs) {
                  paths.push([
                    {
                      type: "line",
                      points: [
                        [b0[0].max!, b0[1].min!],
                        [b1[0].min!, b1[1].min!],
                      ],
                    },
                    {
                      type: "line",
                      points: [
                        [b1[0].min!, b1[1].min!],
                        [b1[0].min!, b1[1].max!],
                      ],
                    },
                    {
                      type: "line",
                      points: [
                        [b1[0].min!, b1[1].max!],
                        [b0[0].max!, b0[1].max!],
                      ],
                    },
                    {
                      type: "line",
                      points: [
                        [b0[0].max!, b0[1].max!],
                        [b0[0].max!, b0[1].min!],
                      ],
                    },
                  ]);
                }
              }
            } else if (interpolation === "bezier") {
              for (const [b0, b1] of bboxPairs) {
                const midX = (b0[0].max! + b1[0].min!) / 2;
                paths.push([
                  {
                    type: "bezier",
                    start: [b0[0].max!, b0[1].min!],
                    control1: [midX, b0[1].min!],
                    control2: [midX, b1[1].min!],
                    end: [b1[0].min!, b1[1].min!],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].min!, b1[1].min!],
                      [b1[0].min!, b1[1].max!],
                    ],
                  },
                  {
                    type: "bezier",
                    start: [b1[0].min!, b1[1].max!],
                    control1: [midX, b1[1].max!],
                    control2: [midX, b0[1].max!],
                    end: [b0[0].max!, b0[1].max!],
                  },
                  {
                    type: "line",
                    points: [
                      [b0[0].max!, b0[1].max!],
                      [b0[0].max!, b0[1].min!],
                    ],
                  },
                ]);
              }
            }
          } else {
            if (interpolation === "linear") {
              if (mode === "center") {
                for (const [b0, b1] of bboxPairs) {
                  paths.push([
                    {
                      type: "line",
                      points: [
                        [
                          (b0[0].min! + b0[0].max!) / 2,
                          (b0[1].min! + b0[1].max!) / 2,
                        ],
                        [
                          (b1[0].min! + b1[0].max!) / 2,
                          (b1[1].min! + b1[1].max!) / 2,
                        ],
                      ],
                    },
                  ]);
                }
              } else {
                for (const [b0, b1] of bboxPairs) {
                  paths.push([
                    {
                      type: "line",
                      points: [
                        [b0[0].min!, b0[1].max!],
                        [b1[0].min!, b1[1].min!],
                      ],
                    },
                    {
                      type: "line",
                      points: [
                        [b1[0].min!, b1[1].min!],
                        [b1[0].max!, b1[1].min!],
                      ],
                    },
                    {
                      type: "line",
                      points: [
                        [b1[0].max!, b1[1].min!],
                        [b0[0].max!, b0[1].max!],
                      ],
                    },
                    {
                      type: "line",
                      points: [
                        [b0[0].max!, b0[1].max!],
                        [b0[0].min!, b0[1].max!],
                      ],
                    },
                  ]);
                }
              }
            } else if (interpolation === "bezier") {
              if (mode === "center") {
                for (const [b0, b1] of bboxPairs) {
                  paths.push([
                    {
                      type: "line",
                      points: [
                        [
                          (b0[0].min! + b0[0].max!) / 2,
                          (b0[1].min! + b0[1].max!) / 2,
                        ],
                        [
                          (b1[0].min! + b1[0].max!) / 2,
                          (b1[1].min! + b1[1].max!) / 2,
                        ],
                      ],
                    },
                  ]);
                }
              } else {
                for (const [b0, b1] of bboxPairs) {
                  const midY = (b0[1].max! + b1[1].min!) / 2;
                  paths.push([
                    {
                      type: "bezier",
                      start: [b0[0].min!, b0[1].max!],
                      control1: [b0[0].min!, midY],
                      control2: [b1[0].min!, midY],
                      end: [b1[0].min!, b1[1].min!],
                    },
                    {
                      type: "line",
                      points: [
                        [b1[0].min!, b1[1].min!],
                        [b1[0].max!, b1[1].min!],
                      ],
                    },
                    {
                      type: "bezier",
                      start: [b1[0].max!, b1[1].min!],
                      control1: [b1[0].max!, midY],
                      control2: [b0[0].max!, midY],
                      end: [b0[0].max!, b0[1].max!],
                    },
                    {
                      type: "line",
                      points: [
                        [b0[0].max!, b0[1].max!],
                        [b0[0].min!, b0[1].max!],
                      ],
                    },
                  ]);
                }
              }
            }
          }

          // If no paths were created, use zero dimensions
          const bboxW = bboxPairs.length > 0 ? bboxMaxX - bboxMinX : 0;
          const bboxH = bboxPairs.length > 0 ? bboxMaxY - bboxMinY : 0;

          // Derive label-placement geometry. `polygon` is the largest closed
          // ring (sampled from beziers) for area-strategy polylabel; `strips`
          // is a sorted-by-x array of (x, y0, y1) triples for ribbon-strategy
          // d3-area-label. Both are derived from the same `paths` data and
          // are populated only when meaningful (mode === "edge" closes each
          // path; mode === "center" produces open polylines).
          const labelPolygon =
            mode === "edge" ? largestPolygon(paths) : undefined;
          const labelStrips =
            mode === "edge" && dir === 0
              ? extractStripsXEdge(paths)
              : undefined;

          return {
            intrinsicDims: [
              {
                min: bboxPairs.length > 0 ? bboxMinX : 0,
                size: bboxW,
                center: bboxPairs.length > 0 ? bboxMinX + bboxW / 2 : 0,
                max: bboxPairs.length > 0 ? bboxMaxX : 0,
              },
              {
                min: bboxPairs.length > 0 ? bboxMinY : 0,
                size: bboxH,
                center: bboxPairs.length > 0 ? bboxMinY + bboxH / 2 : 0,
                max: bboxPairs.length > 0 ? bboxMaxY : 0,
              },
            ],
            transform: { translate: [0, 0] },
            renderData: {
              paths,
              defaultColor,
              polygon: labelPolygon,
              strips: labelStrips,
            },
          };
        },
        render: (
          { intrinsicDims, transform, renderData, coordinateTransform },
          children,
          node
        ) => {
          const scaleContext = node.getRenderSession().scaleContext;
          fill = fill ?? renderData.defaultColor;
          fill = isValue(fill)
            ? scaleContext?.unit?.color
              ? scaleContext.unit.color.get(getValue(fill))
              : getValue(fill)
            : fill;

          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${transform?.translate?.[1]! ?? 0})`}
            >
              <For each={renderData.paths}>
                {(path) => {
                  const transformedPath = coordinateTransform
                    ? transformPath(path, coordinateTransform, {
                        resample: true,
                      })
                    : path;
                  const d = pathToSVGPath(transformedPath);
                  return (
                    <path
                      // filter="url(#crumpled-paper)"
                      style={{
                        "mix-blend-mode":
                          mixBlendMode ??
                          (mode === "center" ? "normal" : "multiply"),
                      }}
                      d={d}
                      fill={fill ?? "none"}
                      stroke={stroke ?? fill ?? "black"}
                      stroke-width={strokeWidth ?? 0}
                      opacity={opacity ?? 1}
                    />
                  );
                }}
              </For>
            </g>
          );
        },
      },
      children
    );
  }
);

// ─── Label-placement geometry helpers ───────────────────────────────────────
// Sample a cubic Bezier at parameter t ∈ [0, 1].
const BEZIER_SAMPLES = 16;

function bezierAt(
  b: {
    start: [number, number];
    control1: [number, number];
    control2: [number, number];
    end: [number, number];
  },
  t: number
): [number, number] {
  const mt = 1 - t;
  const x =
    mt * mt * mt * b.start[0] +
    3 * mt * mt * t * b.control1[0] +
    3 * mt * t * t * b.control2[0] +
    t * t * t * b.end[0];
  const y =
    mt * mt * mt * b.start[1] +
    3 * mt * mt * t * b.control1[1] +
    3 * mt * t * t * b.control2[1] +
    t * t * t * b.end[1];
  return [x, y];
}

function pathToPolygon(path: Path): [number, number][] {
  const ring: [number, number][] = [];
  for (const seg of path) {
    if (seg.type === "line") {
      if (ring.length === 0) ring.push(seg.points[0]);
      ring.push(seg.points[1]);
    } else {
      if (ring.length === 0) ring.push(seg.start);
      for (let i = 1; i <= BEZIER_SAMPLES; i++) {
        ring.push(bezierAt(seg, i / BEZIER_SAMPLES));
      }
    }
  }
  return ring;
}

// Approximate signed area as a polygon-size proxy.
function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

/** For multi-piece connect output, return the single largest closed ring. */
function largestPolygon(paths: Path[]): [number, number][] | undefined {
  let best: [number, number][] | undefined;
  let bestArea = 0;
  for (const p of paths) {
    const ring = pathToPolygon(p);
    if (ring.length < 3) continue;
    const a = ringArea(ring);
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  return best;
}

/**
 * Extract strips for ribbon labeling. Assumes dir=x edge mode where each
 * path is `[bottomBezier, line, topBezier, line]`. Walks bezier samples in
 * lockstep so each sample yields a matched (x, y0, y1) triple.
 */
function extractStripsXEdge(
  paths: Path[]
): { x: number; y0: number; y1: number }[] | undefined {
  const out: { x: number; y0: number; y1: number }[] = [];
  for (const path of paths) {
    if (path.length !== 4) continue;
    const bottom = path[0];
    const top = path[2];
    if (bottom.type !== "bezier" && bottom.type !== "line") continue;
    if (top.type !== "bezier" && top.type !== "line") continue;
    for (let i = 0; i <= BEZIER_SAMPLES; i++) {
      const t = i / BEZIER_SAMPLES;
      const [bx, by] =
        bottom.type === "bezier"
          ? bezierAt(bottom, t)
          : [
              bottom.points[0][0] * (1 - t) + bottom.points[1][0] * t,
              bottom.points[0][1] * (1 - t) + bottom.points[1][1] * t,
            ];
      // Top edge runs right→left; sample at (1 - t) so x's match approximately.
      const [, ty] =
        top.type === "bezier"
          ? bezierAt(top, 1 - t)
          : [
              top.points[0][0] * t + top.points[1][0] * (1 - t),
              top.points[0][1] * t + top.points[1][1] * (1 - t),
            ];
      out.push({ x: bx, y0: by, y1: ty });
    }
  }
  out.sort((a, b) => a.x - b.x);
  return out.length >= 2 ? out : undefined;
}
