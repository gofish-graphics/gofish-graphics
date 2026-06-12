// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Legends — /internals/frontend/legends
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text } from "../shapes/text";
import { Spread } from "../graphicalOperators/spread";
import { layer } from "../graphicalOperators/layer";
import { Constraint } from "../constraints";
import { wrapPreservingIdentity } from "../elaborationUtils";

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
 * The swatch column. `reverse: true` because `Spread({dir:"y"})` lays children
 * bottom→top in y-up coordinates, so the first color-map entry must render last
 * (at the top), matching the bespoke legend.
 */
export function legendColumn(colorMap: Map<any, string>): GoFishNode {
  const rows = [...colorMap.entries()].map(([key, color]) =>
    legendRow(key, color)
  );
  return (Spread as any)(
    { dir: "y", spacing: ROW_GAP, alignment: "start", reverse: true },
    rows
  ).name(LEGEND_NAME) as GoFishNode;
}

/**
 * Wrap `node` in a Layer with a swatch column seated to its right. Mirrors the
 * axes/elaborate.tsx wrapper recipe (identity move → layer wrap → constrain via
 * the name→ref map → identity restore, via `wrapPreservingIdentity`).
 *
 * The caller owns the "is there anything to draw?" guard (a non-empty color
 * map); this always wraps and returns the new root.
 */
export async function elaborateLegend(
  node: GoFishNode,
  colorMap: Map<any, string>
): Promise<GoFishNode> {
  return wrapPreservingIdentity(node, async (content) => {
    content.name(CONTENT_NAME);

    const root = (await (layer as any)([
      content,
      legendColumn(colorMap),
    ])) as GoFishNode;

    // Constraint order matters: the content pin places the anchor the others read.
    root.constrain((g) => [
      // Pin the content at its origin; it never moves.
      Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [
        g[CONTENT_NAME],
      ]),
      // Seat the column just right of the full content bbox (incl. axis labels).
      Constraint.distribute({ dir: "x", spacing: LEGEND_CONTENT_GAP }, [
        g[CONTENT_NAME],
        g[LEGEND_NAME],
      ]),
      // Top-align the column with the content top (y-up: end = top).
      Constraint.align({ y: "end" }, [g[CONTENT_NAME], g[LEGEND_NAME]]),
    ]);

    return root;
  });
}

/**
 * Measured width the seated legend column adds past the content width. The
 * wrapper's max bbox includes the swatch column that the `distribute({dir:"x"})`
 * constraint above seated to the right of the content, so this is exactly the
 * `LEGEND_CONTENT_GAP` plus the column width to reserve on the right. `max!`,
 * not `?.max ?? 0`: the wrapper layer always emits a placed max here — a silent
 * 0 would clip the legend and mask the bug.
 */
export function legendOverhang(wrapper: GoFishNode, contentW: number): number {
  return Math.max(0, wrapper.dims[0].max! - contentW);
}
