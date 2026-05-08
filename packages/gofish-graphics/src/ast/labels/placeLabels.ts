import type { GoFishNode } from "../_node";
import { gatherObstacles, bboxesOverlap } from "./obstacles";
import { resolveLabelText } from "./labelPlacement";
import { strategies } from "./strategies/registry";
import { measureLabelDimensions } from "./strategies/measureText";
import type { LabelKind, ObstacleSet, Placement } from "./strategies/types";

/**
 * Pipeline pass between layout and render. Walks the post-layout tree,
 * resolves a `Placement` for every labeled node based on its `_labelKind`,
 * and writes the result into `_label.placement` for the renderer to consume.
 */
export function placeLabels(root: GoFishNode): void {
  const obstacles = gatherObstacles(root);
  walk(root, [0, 0], obstacles);
}

function walk(
  node: GoFishNode,
  parentTranslate: [number, number],
  obstacles: ObstacleSet
): void {
  const tx = parentTranslate[0] + (node.transform?.translate?.[0] ?? 0);
  const ty = parentTranslate[1] + (node.transform?.translate?.[1] ?? 0);

  for (const child of node.children) {
    if ("type" in child && "children" in child) {
      walk(child as GoFishNode, [tx, ty], obstacles);
    }
  }

  if (!node._label || node.datum === undefined || !node.intrinsicDims) return;
  // Per-call override (`label("...", { kind: "path" })`) wins over the node's
  // default `_labelKind` (set per shape/mark constructor).
  const kind = (node._label.kind ?? node._labelKind ?? "box") as LabelKind;
  const labelText = resolveLabelText(node._label.accessor, node.datum);
  if (!labelText) {
    node._label.placement = { kind: "hidden" };
    return;
  }

  const fontSize = node._label.fontSize ?? 11;
  const { width: labelWidth, height: labelHeight } = measureLabelDimensions(
    labelText,
    fontSize
  );

  const strategy = strategies[kind];
  const worldPlacement: Placement = strategy.place(
    node,
    obstacles,
    node._label,
    {
      labelText,
      labelWidth,
      labelHeight,
      parentTranslate,
    }
  );

  // Strategies return world coords; convert to node-parent-local for the
  // renderer (which uses `node.transform.translate`-relative coords).
  let placement = worldPlacement;
  if (worldPlacement.kind === "transform") {
    placement = {
      ...worldPlacement,
      x: worldPlacement.x - parentTranslate[0],
      y: worldPlacement.y - parentTranslate[1],
    };
  }
  node._label.placement = placement;

  // Greedy first-fit: append the resolved label rect (in WORLD coords) to the
  // obstacle set so sibling labels (placed later) avoid this one.
  if (worldPlacement.kind === "transform") {
    const halfW = labelWidth / 2;
    const halfH = labelHeight / 2;
    obstacles.push({
      kind: "bbox",
      bbox: {
        minX: worldPlacement.x - halfW,
        minY: worldPlacement.y - halfH,
        maxX: worldPlacement.x + halfW,
        maxY: worldPlacement.y + halfH,
      },
    });
  }
}
