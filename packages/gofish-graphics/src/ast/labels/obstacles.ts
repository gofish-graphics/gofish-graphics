import type { GoFishNode } from "../_node";
import type { Path, PathSegment } from "../../path";
import type { BBox, Obstacle, ObstacleSet } from "./strategies/types";

/** Walk the post-layout tree and collect screen-space obstacles. */
export function gatherObstacles(root: GoFishNode): ObstacleSet {
  const out: ObstacleSet = [];
  walk(root, [0, 0], out);
  return out;
}

function walk(
  node: GoFishNode,
  parentTranslate: [number, number],
  out: ObstacleSet
): void {
  const tx = parentTranslate[0] + (node.transform?.translate?.[0] ?? 0);
  const ty = parentTranslate[1] + (node.transform?.translate?.[1] ?? 0);

  const isLeaf = node.children.length === 0;

  if (isLeaf && node.intrinsicDims && node.type !== "text") {
    const ix = node.intrinsicDims[0];
    const iy = node.intrinsicDims[1];
    if (ix && iy && ix.min !== undefined && iy.min !== undefined) {
      out.push({
        kind: "bbox",
        bbox: {
          minX: tx + (ix.min ?? 0),
          minY: ty + (iy.min ?? 0),
          maxX: tx + (ix.max ?? 0),
          maxY: ty + (iy.max ?? 0),
        },
      });
    }
  }

  // Connect nodes carry path data even when they have children (refs).
  // Emit per-segment AABBs so point labels can avoid the lines.
  if (node.type === "connect" && node.renderData?.paths) {
    for (const path of node.renderData.paths as Path[]) {
      for (const seg of path) {
        const bb = segmentBBox(seg);
        if (!bb) continue;
        out.push({
          kind: "bbox",
          bbox: {
            minX: tx + bb.minX,
            minY: ty + bb.minY,
            maxX: tx + bb.maxX,
            maxY: ty + bb.maxY,
          },
        });
      }
    }
  }

  for (const child of node.children) {
    if ("type" in child && "children" in child) {
      walk(child as GoFishNode, [tx, ty], out);
    }
  }
}

function segmentBBox(seg: PathSegment): BBox | null {
  if (seg.type === "line") {
    const [[x1, y1], [x2, y2]] = seg.points;
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }
  // Approximate bezier bbox via control hull (loose but correct as a superset).
  const xs = [seg.start[0], seg.control1[0], seg.control2[0], seg.end[0]];
  const ys = [seg.start[1], seg.control1[1], seg.control2[1], seg.end[1]];
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function bboxesOverlap(a: BBox, b: BBox): boolean {
  return !(
    a.maxX < b.minX ||
    b.maxX < a.minX ||
    a.maxY < b.minY ||
    b.maxY < a.minY
  );
}

export function rectCollidesWithObstacles(
  rect: BBox,
  obstacles: ObstacleSet
): boolean {
  for (const o of obstacles) {
    if (o.kind === "bbox" && bboxesOverlap(rect, o.bbox)) return true;
  }
  return false;
}
