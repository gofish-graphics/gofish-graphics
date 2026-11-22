// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * `.tooltip()` (#1395): a box that describes the mark under the pointer.
 *
 * A tooltip is a layer over its selection, as a label is
 * (`selectionLayer.ts`): written out, a mark's `.tooltip()` is
 *
 *     .layer(
 *       chart(selectAll(<the mark>))
 *         .flow(filter(<the focused one>))
 *         .mark((it) => <a box beside it>)
 *     )
 *
 * where the focused mark is the one the pointer picks (`tooltipFocus.ts`)
 * and the box is ordinary marks: a rounded rect around a column of names
 * and a column of values. The tier goes on the render root, over the whole
 * graphic: its box paints over the marks, their labels and the chrome, and
 * stays inside the graphic. The box is ink (it takes no room, so opening it
 * moves nothing), and nothing it draws is a pointer target. With no focus
 * the selection is empty and nothing is lowered, so the drawing is the
 * drawing without `.tooltip()`.
 *
 * The one entry point is {@link tooltipLayer}, which the render lowers
 * after the labels (`gofish.tsx`).
 */
import { GoFishNode } from "../_node";
import { text } from "../shapes/text";
import { spread } from "../graphicalOperators/spread";
import { enclose } from "../marks/chart";
import { LayerContext, resolveMarkResult } from "../marks/markResult";
import type { SelectionLayer } from "../selectionLayer";
import type { FocusMark, TooltipFocus } from "../../interaction/tooltipFocus";
import { createTooltipPlaceConstraint } from "./place";
import type { TooltipRow } from "./content";
import { takeTooltips, type TooltipRequest } from "./request";

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

/** One focused mark: the node, its request, and its call's focus. */
type TooltipEntry = {
  node: GoFishNode;
  request: TooltipRequest;
  focus: TooltipFocus;
};

/**
 * `.tooltip()` as a layer over its selection (`selectionLayer.ts`). Its
 * stamps are the requests the marks recorded (`takeTooltips`); each call's
 * focus gets the call's marks in the whole render, as candidates, and the
 * selection is the first mark with the focused key (marks with one key are
 * one candidate). Its home is the render root. The tier over it is, per
 * entry, a ref to the mark and its box, seated after the solve beside the
 * mark and inside the graphic (`tooltipPlace`).
 */
export const tooltipLayer: SelectionLayer<TooltipEntry, null> = {
  take(root) {
    const byFocus = new Map<TooltipFocus, FocusMark[]>();
    const entries: TooltipEntry[] = [];
    for (const { node, request } of takeTooltips(root)) {
      const focus = request.focus;
      if (focus === undefined) continue;
      const marks = byFocus.get(focus) ?? [];
      byFocus.set(focus, marks);
      marks.push({
        key: request.key,
        node,
        rows: Array.isArray(node.datum) ? node.datum : [node.datum],
      });
      if (request.key === focus.key && !entries.some((e) => e.focus === focus))
        entries.push({ node, request, focus });
    }
    for (const [focus, marks] of byFocus) focus.use(marks);
    return entries;
  },
  target: (entry) => entry.node,
  home: (_target, root) => root,
  async draw(entries, { select }) {
    const nodes: GoFishNode[] = [];
    const seats: [GoFishNode, GoFishNode][] = [];
    for (const { node, request, focus } of entries) {
      const stand = select(node) as unknown as GoFishNode;
      const shown = await resolveMarkResult(
        box(request.rows) as any,
        new LayerContext()
      );
      // It takes no room, and no pointer lands on it.
      shown.inkOn = [true, true];
      shown.noPointerTarget = true;
      focus.drew(shown);
      nodes.push(stand, shown);
      seats.push([stand, shown]);
    }
    return {
      drawn: null,
      nodes,
      constraints: (at, inner) =>
        seats.map(([stand, shown]) =>
          createTooltipPlaceConstraint([at(stand), inner, at(shown)])
        ),
    };
  },
};
