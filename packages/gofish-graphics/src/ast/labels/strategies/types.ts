import type { GoFishNode } from "../../_node";
import type { LabelSpec } from "../labelPlacement";

export type LabelKind = "box" | "point" | "area" | "ribbon" | "path";

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * A resolved label placement, written into `_label.placement` by the
 * `placeLabels` pass and consumed by `renderLabelJSX`.
 *
 * - "transform": absolute screen-space (x, y) plus SVG anchor + baseline.
 * - "textPath": text drawn along the SVG path with the given `d` attribute.
 *   The renderer emits an inline `<defs><path id={pathId} d={d}/></defs>`.
 * - "hidden": the strategy declined to place; renderer should emit nothing.
 */
export type Placement =
  | {
      kind: "transform";
      x: number;
      y: number;
      anchor: "start" | "middle" | "end";
      baseline: "auto" | "central" | "hanging" | "mathematical";
      fontSize?: number;
    }
  | {
      kind: "textPath";
      d: string;
      pathId: string;
      startOffset: string;
      fontSize?: number;
    }
  | { kind: "hidden" };

export type Obstacle =
  | { kind: "bbox"; bbox: BBox }
  | { kind: "segment"; from: [number, number]; to: [number, number] };

export type ObstacleSet = Obstacle[];

export type LabelStrategyContext = {
  /** The text to render. Pre-resolved from `_label.accessor` and `node.datum`. */
  labelText: string;
  /** Pre-measured label dimensions (in screen px). */
  labelWidth: number;
  labelHeight: number;
  /**
   * Accumulated translate from the root to this node's parent (world coords).
   * Strategies work in world coords (obstacles are world-coord); the
   * `placeLabels` walker subtracts this from the strategy's returned `x`/`y`
   * before storing, so the renderer (which uses `node.transform.translate`,
   * i.e. node-parent-local) consumes the placement directly.
   */
  parentTranslate: [number, number];
};

export interface LabelStrategy {
  place(
    node: GoFishNode,
    obstacles: ObstacleSet,
    label: LabelSpec,
    ctx: LabelStrategyContext
  ): Placement;
}
