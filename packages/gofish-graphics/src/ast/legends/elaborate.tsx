// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Legends — /internals/frontend/legends
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text } from "../shapes/text";
import { Spread } from "../graphicalOperators/spread";
import { layer } from "../graphicalOperators/layer";
import { Constraint } from "../constraints";

/**
 * Legend elaboration: turn the resolved categorical color scale into ordinary
 * GoFish shapes + constraints, the same way axes/elaborate.tsx turns an axis
 * into Rect/Text/Spread/Layer nodes. This replaces the bespoke render-time
 * legend (the `<For>` over `scaleContext.unit.color` in gofish.tsx that
 * hand-placed swatches at `translate(width + pad*3, ...)` behind a fixed
 * `LEGEND_MARGIN`): the legend is no longer a privileged render-time fixture,
 * it's a swatch column wrapped in a `Layer` beside the content, participating
 * in normal layout (so its extent is measured, not reserved as a constant).
 *
 * `legendRow` / `legendColumn` are pure builders (the customization seam): a
 * future public API can override how a legend renders.
 *
 * Note: a gradient color config currently yields one row per color-map entry
 * (parity with the bespoke path). A continuous colorbar is a follow-up.
 */

// Visual constants — chosen to match the previous bespoke legend styling.
const SWATCH_SIZE = 10;
const SWATCH_LABEL_GAP = 5; // gap between a swatch and its label
const ROW_GAP = 8; // vertical gap between legend rows
const LABEL_FONT_SIZE = 10;
const LABEL_COLOR = "gray";
const LEGEND_CONTENT_GAP = 20; // gap between content and the legend column
const CONTENT_NAME = "__legendContent";
const LEGEND_NAME = "__legend";

/** One legend row: a color swatch followed by its label, aligned on a row. */
function legendRow(key: any, color: string): GoFishNode {
  return (Spread as any)(
    { dir: "x", spacing: SWATCH_LABEL_GAP, alignment: "middle" },
    [
      Rect({ w: SWATCH_SIZE, h: SWATCH_SIZE, fill: color }),
      Text({ text: String(key), fontSize: LABEL_FONT_SIZE, fill: LABEL_COLOR }),
    ]
  ) as GoFishNode;
}

/**
 * The swatch column. Rows are REVERSED because `Spread({dir:"y"})` lays children
 * bottom→top (first child gets the smallest y) in y-up coordinates, so the first
 * color-map entry must be last in the spread to render at the top (parity with
 * the bespoke legend, which placed entry 0 at the top).
 */
export function legendColumn(colorMap: Map<any, string>): GoFishNode {
  const rows = [...colorMap.entries()]
    .map(([key, color]) => legendRow(key, color))
    .reverse();
  return (Spread as any)(
    { dir: "y", spacing: ROW_GAP, alignment: "start" },
    rows
  ).name(LEGEND_NAME) as GoFishNode;
}

/**
 * Wrap `node` in a Layer with a swatch column seated to its right. Mirrors the
 * axes/elaborate.tsx wrapper recipe (identity move → layer wrap → constrain via
 * the name→ref map → identity restore).
 */
export async function elaborateLegend(
  node: GoFishNode,
  colorMap: Map<any, string>
): Promise<{ node: GoFishNode; changed: boolean }> {
  if (colorMap.size === 0) return { node, changed: false };

  // Move identity off the content onto the outer layer, so the parent
  // (faceting/refs/select) still resolves to this node.
  const origName = node._name;
  const origKey = node.key;
  node._name = undefined;
  node.key = undefined;
  node.name(CONTENT_NAME);

  const root = (await (layer as any)([
    node,
    legendColumn(colorMap),
  ])) as GoFishNode;

  // Constraint order matters: the content pin places the anchor the others read.
  root.constrain((g) => [
    // Pin the content at its origin; it never moves.
    Constraint.align({ x: "baseline", y: "baseline" } as any, [
      g[CONTENT_NAME],
    ]),
    // Seat the column just right of the full content bbox (incl. axis labels).
    Constraint.distribute({ dir: "x", spacing: LEGEND_CONTENT_GAP }, [
      g[CONTENT_NAME],
      g[LEGEND_NAME],
    ]),
    // Top-align the column with the content top (y-up: end = top).
    Constraint.align({ y: "end" } as any, [g[CONTENT_NAME], g[LEGEND_NAME]]),
  ]);

  if (origName !== undefined) root._name = origName;
  if (origKey !== undefined) root.setKey(origKey);
  return { node: root, changed: true };
}
