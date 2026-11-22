// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * `.tooltip()` (#1395): a box that describes the mark under the pointer.
 *
 * A tooltip is one more layer of the same chart. Written out, a mark's
 * `.tooltip()` is
 *
 *     .layer(
 *       chart(selectAll(<the mark>))
 *         .flow(filter(<the focused one>), group(<by mark>))
 *         .mark((it) => <a box beside it>)
 *     )
 *
 * where the focused mark is the one the pointer picks (`tooltipFocus.ts`)
 * and the box is ordinary marks: a rounded rect around a column of names
 * and a column of values. The layer is ink (it takes no room, so opening
 * the box moves nothing), it paints over the marks, and nothing it draws is
 * a pointer target. With no focus its filter keeps nothing, and an empty
 * layer draws nothing and takes no room, so the chart is the chart without
 * `.tooltip()`.
 *
 * The one entry point is {@link tooltipLayers}: given a chart's resolved
 * marks, the layers their tooltips add. `ChartBuilder` calls it once per
 * resolve, beside the transitions it draws over its marks.
 */
import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import { ref } from "../shapes/ref";
import { text } from "../shapes/text";
import { spread } from "../graphicalOperators/spread";
import { layer as Layer } from "../graphicalOperators/layer";
import { chart } from "../marks/chartBuilder";
import { enclose, filter } from "../marks/chart";
import { group } from "../graphicalOperators/group";
import { LayerContext, resolveMarkResult } from "../marks/markResult";
import { SlotOperand } from "../constraints/shared";
import { focusOf, type FocusMark } from "../../interaction/tooltipFocus";
import { createTooltipPlaceConstraint } from "./place";
import type { TooltipRow } from "./content";
import { tooltipRequest } from "./request";

/** The box: a column of muted, right-aligned names beside a column of
 *  left-aligned values, in a white rounded rect. */
const FONT = 12;
const NAME_FILL = "#6b7280";
const VALUE_FILL = "#111827";
const STROKE = "#c9ced6";

function box(rows: readonly TooltipRow[]) {
  const rowGap = Math.round(FONT * 0.35);
  return enclose(
    { padding: 8, fill: "white", stroke: STROKE, strokeWidth: 1, rx: 4 } as any,
    [
      spread({ dir: "x", spacing: 10, alignment: "start" }, [
        spread(
          { dir: "y", spacing: rowGap, alignment: "end" },
          rows.map(([name]) =>
            text({ text: name, fontSize: FONT, fill: NAME_FILL })
          )
        ),
        spread(
          { dir: "y", spacing: rowGap, alignment: "start" },
          rows.map(([, value]) =>
            text({
              text: value,
              fontSize: FONT,
              fill: VALUE_FILL,
              fontWeight: 600,
            })
          )
        ),
      ]) as any,
    ]
  );
}

/** The box of `rows` beside `mark`, kept inside `frame` (the chart's
 *  marks) by the placement that runs after the solve (`place.ts`). */
async function beside(
  mark: GoFishNode,
  frame: GoFishNode,
  rows: readonly TooltipRow[],
  layerContext: LayerContext
): Promise<GoFishNode> {
  const node = (await (Layer as any)({}, [
    ref({ __ref: mark } as any),
    ref({ __ref: frame } as any),
    await resolveMarkResult(box(rows) as any, layerContext),
  ])) as GoFishNode;
  await node.INTERNAL_relate([
    createTooltipPlaceConstraint([
      new SlotOperand(node, 0),
      new SlotOperand(node, 1),
      new SlotOperand(node, 2),
    ]),
  ]);
  return node;
}

/**
 * The layers the tooltips of a chart's marks add, given its resolved marks
 * (`content`, which also bounds where a box may go): one per `.tooltip()`
 * call among them, over that call's marks. Empty when no mark has one.
 *
 * In a live chart (`layerContext.registrar`) each layer reads its call's
 * focus, so a change of focus re-runs the chart. A static drawing has no
 * focus, and draws every layer empty: its tooltips are the marks' titles.
 */
export async function tooltipLayers(
  content: GoFishNode,
  layerContext: LayerContext
): Promise<GoFishNode[]> {
  const byCall = new Map<object, GoFishNode[]>();
  const walk = (n: GoFishNode) => {
    const r = tooltipRequest(n);
    if (r !== undefined) {
      const marks = byCall.get(r.call) ?? [];
      byCall.set(r.call, marks);
      marks.push(n);
    }
    for (const c of n.children) if (c instanceof GoFishNode) walk(c);
  };
  walk(content);

  const layers: GoFishNode[] = [];
  for (const [call, marks] of byCall) {
    const registrar = layerContext.registrar;
    const focus = registrar ? focusOf(registrar, call) : undefined;
    const requestOf = (r: GoFishRef) =>
      tooltipRequest((r as unknown as { directNode: GoFishNode }).directNode)!;
    const tier = chart({ axes: false })
      .flow(
        filter((r: GoFishRef) => requestOf(r).key === focus?.key),
        group({ by: (r: GoFishRef) => requestOf(r).key })
      )
      .mark(async (refs: GoFishRef[]) => {
        const node = (refs[0] as unknown as { directNode: GoFishNode })
          .directNode;
        return beside(node, content, requestOf(refs[0]).rows, layerContext);
      });
    const node = await tier
      .withData(marks.map((n) => ref({ __ref: n } as any)))
      .withLayerContext(layerContext)
      .resolve();
    // It takes no room, and no pointer lands on it.
    node.inkOn = [true, true];
    node.noPointerTarget = true;
    focus?.use(
      registrar!,
      marks.map(
        (n): FocusMark => ({
          key: tooltipRequest(n)!.key,
          node: n,
          rows: Array.isArray(n.datum) ? n.datum : [n.datum],
        })
      ),
      node
    );
    layers.push(node);
  }
  return layers;
}
