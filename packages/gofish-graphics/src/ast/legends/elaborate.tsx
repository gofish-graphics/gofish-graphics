// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Legends — /internals/frontend/legends
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text } from "../shapes/text";
import { Spread } from "../graphicalOperators/spread";
import { layer } from "../graphicalOperators/layer";
import { Constraint } from "../constraints";
import { fmtNum } from "../elaborationUtils";
import type { ChromeRing } from "../axes/elaborate";
import { ticks as d3Ticks } from "d3-array";
import { datum } from "../data";
import type { CategoricalScale, ContinuousColorScale } from "../gofish";
import { wrapperDirection } from "../axisDirection";
import { keysDownTheScreen } from "../constraints/distribute";

/**
 * Legend elaboration: turn the resolved color scale into ordinary GoFish shapes
 * + constraints, the same way axes/elaborate.tsx turns an axis into
 * Rect/Text/Spread/Layer nodes. The legend is the outermost ring of its
 * owner's chrome (`legendRing`, placed by `elaborateChrome`), so it takes
 * part in normal layout and its extent is measured, not reserved as a
 * constant. The color scale is resolved once for the whole render, from the
 * root, so the root owns the legend.
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
 * The legend ring of `owner`'s chrome (see `elaborateChrome` in
 * axes/elaborate.tsx): a swatch column for a categorical scale, or a colorbar
 * for a continuous (gradient) one, seated just right of the box inside the
 * ring (the owner with its axes and titles) and top-aligned with it.
 *
 * `owner` is the node the legend describes, without its chrome: a
 * categorical legend lists its entries in the order `owner` lays them down
 * the screen, when it does (see `seriesDownTheScreen`), and "top" is read in
 * the axis order of the rings around it.
 */
export async function legendRing(
  scale: CategoricalScale | ContinuousColorScale,
  owner: GoFishNode
): Promise<ChromeRing> {
  const legend =
    "scaleFn" in scale
      ? await legendColorbar(scale.scaleFn, scale.domain)
      : await legendColumn(legendEntries(scale.color, owner));
  // The legend tops out with the content: "top" is the end of a y that grows
  // upward and the start of one that reads top-down.
  const top = wrapperDirection(owner, 1) === -1 ? "end" : "start";
  return {
    nodes: [legend],
    constraints: (g, inner) => [
      // Seat the column just right of the full box inside (incl. axis labels
      // and titles).
      Constraint.distribute({ dir: "x", spacing: LEGEND_CONTENT_GAP }, [
        g[inner],
        g[LEGEND_NAME],
      ]),
      // Top-align the column with the box's top.
      Constraint.align({ y: top }, [g[inner], g[LEGEND_NAME]]),
    ],
  };
}
