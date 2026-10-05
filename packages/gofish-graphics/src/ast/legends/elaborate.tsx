// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Legends — /internals/frontend/legends
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text } from "../shapes/text";
import { Spread } from "../graphicalOperators/spread";
import { layer } from "../graphicalOperators/layer";
import { Constraint } from "../constraints";
import { wrapPreservingIdentity, fmtNum } from "../elaborationUtils";
import { ticks as d3Ticks } from "d3-array";
import { datum } from "../data";
import type { CategoricalScale, ContinuousColorScale } from "../gofish";
import { wrapperDirection } from "../axisDirection";
import { keysDownTheScreen } from "../constraints/distribute";

/**
 * Legend elaboration: turn the resolved color scale into ordinary GoFish shapes
 * + constraints, the same way axes/elaborate.tsx turns an axis into
 * Rect/Text/Spread/Layer nodes. This replaces the bespoke render-time legend
 * (the `<For>` over `scaleContext.unit.color` in gofish.tsx that hand-placed
 * swatches at `translate(width + pad*3, ...)` behind a fixed `LEGEND_MARGIN`):
 * the legend is no longer a privileged render-time fixture, it's a subtree
 * wrapped in a `Layer` beside the content, participating in normal layout (so
 * its extent is measured, not reserved as a constant).
 *
 * A **categorical** scale yields a swatch column (`legendColumn`); a
 * **continuous** (gradient) scale yields a colorbar (`legendColorbar`) — a
 * sampled gradient bar with tick labels pinned at d3 tick values. Both are pure
 * builders (the customization seam): a future public API can override how a
 * legend renders.
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
 * The swatch column: one row per entry of `colorMap`, in that order, top to
 * bottom (a `Spread({dir:"y"})` reads top-down).
 */
export async function legendColumn(
  colorMap: Map<any, string>
): Promise<GoFishNode> {
  const rows = [...colorMap.entries()].map(([key, color]) =>
    legendRow(key, color)
  );
  // `Spread` returns a PromiseWithRender — await the real node.
  const col = (await (Spread as any)(
    { dir: "y", spacing: ROW_GAP, alignment: "start" },
    rows
  )) as GoFishNode;
  return col.name(LEGEND_NAME);
}

/**
 * The order the plot lays its color series down the screen, when it lays
 * them out along y: the parts of the first chain in `content` (breadth
 * first) whose parts are all legend entries, top to bottom, as that chain
 * reports them ({@link keysDownTheScreen}). Undefined when no chain lays the
 * legend's entries out down the screen; the legend then keeps the color
 * scale's order. A chain of one part orders nothing.
 */
function seriesDownTheScreen(
  content: GoFishNode,
  legendKeys: Set<string>
): string[] | undefined {
  const queue: GoFishNode[] = [content];
  while (queue.length > 0) {
    const n = queue.shift()!;
    const keys = keysDownTheScreen(n);
    if (
      keys !== undefined &&
      keys.length > 1 &&
      keys.every((k) => legendKeys.has(String(k)))
    )
      return keys.map(String);
    for (const c of n.children) if (c instanceof GoFishNode) queue.push(c);
  }
  return undefined;
}

/** The categorical legend's entries in the order the column lists them, top
 *  to bottom: the order the plot lays them down the screen (see
 *  {@link seriesDownTheScreen}), else the color scale's order. */
function legendEntries(
  colorMap: Map<any, string>,
  content: GoFishNode
): Map<any, string> {
  const byKey = new Map([...colorMap.keys()].map((k) => [String(k), k]));
  const order = seriesDownTheScreen(content, new Set(byKey.keys()));
  if (order === undefined) return colorMap;
  const keys = [
    ...order.map((k) => byKey.get(k)),
    ...[...colorMap.keys()].filter((k) => !order.includes(String(k))),
  ];
  return new Map(keys.map((k) => [k, colorMap.get(k)!]));
}

// Colorbar constants.
const BAR_WIDTH = 14;
const BAR_HEIGHT = 120;
const BAND_COUNT = 40; // gradient sampling resolution (≈3px bands → reads smooth)
const BAND_OVERLAP = 1; // px each band overhangs the next, so no sub-pixel seam shows
const COLORBAR_TICK_COUNT = 5;
const TICK_MARK_LEN = 4;
const BAR_LABEL_GAP = 4; // gap between a tick mark and its label

/**
 * The colorbar: a vertical gradient bar sampled from `scaleFn` over `domain`,
 * with tick labels pinned at the domain endpoints plus d3 "nice" ticks between
 * them. The bar is a continuous value axis: a `layer` `BAR_HEIGHT` px tall
 * whose shapes are pinned at DATA values (`datum(v)`), so its y is continuous
 * and grows upward (see `axisDirection.ts`), and the domain max is at the top.
 * It holds `BAND_COUNT` thin band `Rect`s, each pinned by its bottom edge (the
 * `start` of the upward y) at its slice's low value and showing the value at
 * its center, plus a tick mark + label per tick. Each band overhangs the next
 * by `BAND_OVERLAP` px (the next band, drawn on top, hides the seam) so the
 * bar reads as a smooth gradient rather than discrete bands. The layer's bbox
 * is the union of these, so the colorbar is measured by normal layout exactly
 * like the swatch column.
 */
export async function legendColorbar(
  scaleFn: (v: number) => string,
  domain: [number, number]
): Promise<GoFishNode> {
  const [min, max] = domain;
  // A one-value domain still needs a span to lay the bar out over.
  const span = max === min ? 1 : max - min;
  const bandSpan = span / BAND_COUNT;

  const bandName = (i: number) => `__cbBand${i}`;
  const tickName = (i: number) => `__cbTick${i}`;
  const labelName = (i: number) => `__cbLabel${i}`;

  const bandH = BAR_HEIGHT / BAND_COUNT;
  const bands = Array.from({ length: BAND_COUNT }, (_, i) =>
    Rect({
      w: BAR_WIDTH,
      h: bandH + BAND_OVERLAP,
      fill: scaleFn(min + (i + 0.5) * bandSpan),
    }).name(bandName(i))
  );

  // Always show the domain endpoints; fill in d3 "nice" ticks strictly between.
  const tickValues =
    max === min
      ? [min]
      : [
          min,
          ...d3Ticks(min, max, COLORBAR_TICK_COUNT).filter(
            (t) => t > min && t < max
          ),
          max,
        ];
  const tickMarks = tickValues.map((_, i) =>
    Rect({ w: TICK_MARK_LEN, h: 1, fill: LABEL_COLOR }).name(tickName(i))
  );
  const tickLabels = tickValues.map((v, i) =>
    Text({
      text: fmtNum(v),
      fontSize: LABEL_FONT_SIZE,
      fill: LABEL_COLOR,
    }).name(labelName(i))
  );

  const root = (await (layer as any)({ h: BAR_HEIGHT }, [
    ...bands,
    ...tickMarks,
    ...tickLabels,
  ])) as GoFishNode;

  await root.relate((g: Record<string, any>) => {
    const cs: any[] = [];
    // Bands: centered in the bar column (x), pinned by their bottom edge at
    // their slice's low value (y) and stacked bottom→top to fill the bar.
    // Each band overhangs upward by BAND_OVERLAP; the next band (drawn on
    // top) covers that overhang, so no sub-pixel seam shows between bands.
    // (x uses anchor "middle", y uses "start" — separate constraints since
    // one shared anchor can't do both.)
    bands.forEach((_, i) => {
      cs.push(
        Constraint.position({ x: BAR_WIDTH / 2, anchor: "middle" }, [
          g[bandName(i)],
        ])
      );
      cs.push(
        Constraint.position({ y: datum(min + i * bandSpan), anchor: "start" }, [
          g[bandName(i)],
        ])
      );
    });
    // Ticks + labels pinned at their value. x and y are pinned by separate
    // position constraints so the label can sit start-aligned in x while
    // staying middle-aligned in y (one shared anchor can't do both).
    tickValues.forEach((v, i) => {
      cs.push(
        Constraint.position(
          { x: BAR_WIDTH + TICK_MARK_LEN / 2, y: datum(v), anchor: "middle" },
          [g[tickName(i)]]
        )
      );
      cs.push(
        Constraint.position({ y: datum(v), anchor: "middle" }, [
          g[labelName(i)],
        ])
      );
      cs.push(
        Constraint.position(
          { x: BAR_WIDTH + TICK_MARK_LEN + BAR_LABEL_GAP, anchor: "start" },
          [g[labelName(i)]]
        )
      );
    });
    return cs;
  });

  return root.name(LEGEND_NAME);
}

/**
 * Wrap `node` in a Layer with a legend seated to its right — a swatch column
 * for a categorical scale, or a colorbar for a continuous (gradient) one.
 * Mirrors the axes/elaborate.tsx wrapper recipe (identity move → layer wrap →
 * constrain via the name→ref map → identity restore, via
 * `wrapPreservingIdentity`).
 *
 * The caller owns the "is there anything to draw?" guard (a non-empty color map
 * or a continuous scale); this always wraps and returns the new root.
 */
export async function elaborateLegend(
  node: GoFishNode,
  scale: CategoricalScale | ContinuousColorScale,
  /** The plot the legend describes: a categorical legend lists its entries
   *  in the order the plot lays them down the screen, when it does (see
   *  `seriesDownTheScreen`). */
  content: GoFishNode
): Promise<GoFishNode> {
  const legend =
    "scaleFn" in scale
      ? await legendColorbar(scale.scaleFn, scale.domain)
      : await legendColumn(legendEntries(scale.color, content));
  // The legend tops out with the content: "top" is the end of a y that grows
  // upward and the start of one that reads top-down.
  const top = wrapperDirection(node, 1) === -1 ? "end" : "start";
  return wrapPreservingIdentity(node, async (content) => {
    content.name(CONTENT_NAME);

    const root = (await (layer as any)([content, legend])) as GoFishNode;

    // Constraint order matters: the content pin places the anchor the others read.
    await root.relate((g) => [
      // Pin the content at its origin; it never moves.
      Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [
        g[CONTENT_NAME],
      ]),
      // Seat the column just right of the full content bbox (incl. axis labels).
      Constraint.distribute({ dir: "x", spacing: LEGEND_CONTENT_GAP }, [
        g[CONTENT_NAME],
        g[LEGEND_NAME],
      ]),
      // Top-align the column with the content top.
      Constraint.align({ y: top }, [g[CONTENT_NAME], g[LEGEND_NAME]]),
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
