import { rectCollidesWithObstacles } from "../obstacles";
import type { BBox, LabelStrategy } from "./types";

/**
 * Vega-label-style compass-8 placement: try 8 anchor positions around the
 * target's bbox in priority order, return the first that doesn't collide
 * with the obstacle set.
 *
 * Anchors are encoded as (dx, dy) ∈ {-1, 0, 1}². Diagonal anchors get a
 * `Math.SQRT1_2` factor on the offset to keep the visual distance constant.
 */
type Compass = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";

const ANCHOR_VECTORS: Record<Compass, { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = {
  N: { dx: 0, dy: 1 },
  S: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
  NE: { dx: 1, dy: 1 },
  NW: { dx: -1, dy: 1 },
  SE: { dx: 1, dy: -1 },
  SW: { dx: -1, dy: -1 },
};

const DEFAULT_PRIORITY: Compass[] = [
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
];

function dxToAnchor(dx: -1 | 0 | 1): "start" | "middle" | "end" {
  if (dx < 0) return "end";
  if (dx > 0) return "start";
  return "middle";
}

export const pointStrategy: LabelStrategy = {
  place(node, obstacles, label, ctx) {
    const ix = node.intrinsicDims![0];
    const iy = node.intrinsicDims![1];
    const w = ix.size ?? 0;
    const h = iy.size ?? 0;

    // World-space target bbox.
    const tx = ctx.parentTranslate[0] + (node.transform?.translate?.[0] ?? 0);
    const ty = ctx.parentTranslate[1] + (node.transform?.translate?.[1] ?? 0);
    const targetBBox: BBox = {
      minX: tx + (ix.min ?? 0),
      minY: ty + (iy.min ?? 0),
      maxX: tx + (ix.max ?? 0),
      maxY: ty + (iy.max ?? 0),
    };
    const targetCx = (targetBBox.minX + targetBBox.maxX) / 2;
    const targetCy = (targetBBox.minY + targetBBox.maxY) / 2;
    const halfW = (targetBBox.maxX - targetBBox.minX) / 2;
    const halfH = (targetBBox.maxY - targetBBox.minY) / 2;

    const baseOffset = label.offset ?? 6;
    const priority = (label as any).anchorPriority as Compass[] | undefined;
    const anchors = priority ?? DEFAULT_PRIORITY;

    const labelHalfW = ctx.labelWidth / 2;
    const labelHalfH = ctx.labelHeight / 2;

    for (const compass of anchors) {
      const { dx, dy } = ANCHOR_VECTORS[compass];
      const isDiag = dx !== 0 && dy !== 0;
      const offset = baseOffset * (isDiag ? Math.SQRT1_2 : 1);

      const anchorX = targetCx + dx * (halfW + offset + labelHalfW);
      const anchorY = targetCy + dy * (halfH + offset + labelHalfH);

      const candidate: BBox = {
        minX: anchorX - labelHalfW,
        minY: anchorY - labelHalfH,
        maxX: anchorX + labelHalfW,
        maxY: anchorY + labelHalfH,
      };
      if (!rectCollidesWithObstacles(candidate, obstacles)) {
        return {
          kind: "transform",
          x: anchorX,
          y: anchorY,
          anchor: dxToAnchor(dx),
          baseline: "central",
        };
      }
    }
    return { kind: "hidden" };
  },
};
