import {
  inferLabelPosition,
  calculateLabelOffset,
  getLabelTextAnchor,
  type ShapeInfo,
} from "../labelPlacement";
import type { LabelStrategy } from "./types";

/**
 * Default declarative behavior — preserves the existing `LabelOptions.position`
 * enum. No collision avoidance.
 */
export const boxStrategy: LabelStrategy = {
  place(node, _obstacles, label, ctx) {
    const w = node.intrinsicDims![0].size ?? 0;
    const h = node.intrinsicDims![1].size ?? 0;

    const shapeType = (
      ["rect", "ellipse", "petal", "line", "area"].includes(node.type)
        ? node.type
        : "rect"
    ) as ShapeInfo["type"];

    const position = inferLabelPosition(
      { type: shapeType, dimensions: [w, h] },
      {
        chartBounds: { width: w, height: h },
        availableSpace: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      { position: label.position, offset: label.offset }
    );

    const offset = calculateLabelOffset(position, [w, h], {
      offset: label.offset,
    });
    const anchor = getLabelTextAnchor(position);

    // World coords: parentTranslate + nodeTranslate + intrinsic center + offset.
    const localCenterX = (node.transform?.translate?.[0] ?? 0) + w / 2;
    const localCenterY = (node.transform?.translate?.[1] ?? 0) + h / 2;
    const worldX = ctx.parentTranslate[0] + localCenterX + offset.x;
    const worldY = ctx.parentTranslate[1] + localCenterY + offset.y;

    return {
      kind: "transform",
      x: worldX,
      y: worldY,
      anchor,
      baseline: "central",
    };
  },
};
