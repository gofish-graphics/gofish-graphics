import type { Path } from "../../../path";
import { pathToSVGPath } from "../../../path";
import type { LabelStrategy } from "./types";

let pathIdCounter = 0;

/**
 * Draws label text along an SVG `<textPath>`. Reads the first rendered path
 * from `node.renderData.paths` (typically populated by the connect operator).
 * Renders an inline `<defs><path id={pathId} d={d}/></defs>` so the textPath
 * is self-contained and doesn't depend on a sibling element id.
 */
export const pathStrategy: LabelStrategy = {
  place(node, _obstacles, label, _ctx) {
    const paths = node.renderData?.paths as Path[] | undefined;
    if (!paths || paths.length === 0) return { kind: "hidden" };

    // For multi-pair connect (e.g. line marks with multiple segments), pick
    // the longest path so the label has the most room.
    let bestPath: Path | undefined;
    let bestLen = -Infinity;
    for (const p of paths) {
      const len = approxPathLength(p);
      if (len > bestLen) {
        bestLen = len;
        bestPath = p;
      }
    }
    if (!bestPath) return { kind: "hidden" };

    return {
      kind: "textPath",
      d: pathToSVGPath(bestPath),
      pathId: `gofish-label-path-${++pathIdCounter}`,
      startOffset: (label as any).startOffset ?? "50%",
      fontSize: label.fontSize,
    };
  },
};

function approxPathLength(path: Path): number {
  let len = 0;
  for (const seg of path) {
    if (seg.type === "line") {
      const [a, b] = seg.points;
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    } else {
      // Cubic bezier: control hull length is a cheap upper bound.
      len +=
        Math.hypot(
          seg.control1[0] - seg.start[0],
          seg.control1[1] - seg.start[1]
        ) +
        Math.hypot(
          seg.control2[0] - seg.control1[0],
          seg.control2[1] - seg.control1[1]
        ) +
        Math.hypot(seg.end[0] - seg.control2[0], seg.end[1] - seg.control2[1]);
    }
  }
  return len;
}
