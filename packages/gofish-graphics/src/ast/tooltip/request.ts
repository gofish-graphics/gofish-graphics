// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * What a mark's `.tooltip()` records on the nodes it makes (#1395), for the
 * render to draw the boxes from (`tooltip.ts`). INTERNAL. A leaf module, so
 * the modifier table (`createOperator.ts`) can call it without importing
 * the chart builder.
 */
import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import type { Registrar } from "../../interaction/resolveContext";
import { focusOf, type TooltipFocus } from "../../interaction/tooltipFocus";
import {
  rowsOfDatum,
  tooltipRows,
  tooltipText,
  type TooltipMark,
  type TooltipRow,
} from "./content";

/** One `.tooltip()` call, shared by every node its mark makes: the wire of
 *  the mark it is chained on, whose channel options name the fields the mark
 *  draws (`tooltipRows`). The modifier's `tag` sets it, before any node is
 *  made. */
export type TooltipCall = { wire?: TooltipMark["wire"] };

/** What one node's `.tooltip()` call recorded in a live chart: the rows
 *  the node was drawn from, the call's fields and wire, the rows its box
 *  shows when the call names its fields (otherwise they are made only for
 *  the focused node, {@link tooltipContent}), the node's key, and the focus
 *  of the call in the chart that resolved it. */
export type TooltipRequest = {
  rows: unknown[];
  fields: readonly string[] | undefined;
  wire: TooltipCall["wire"];
  content: TooltipRow[] | undefined;
  key: string;
  focus: TooltipFocus;
};

/** The rows the box of `request` shows: of its focused `row`, when its
 *  mark is drawn through rows and the focus is on one of them, else of the
 *  whole mark. */
export const tooltipContent = (
  request: TooltipRequest,
  point?: { row: unknown }
): TooltipRow[] =>
  point !== undefined
    ? tooltipRows({ rows: [point.row], wire: request.wire }, request.fields)
    : (request.content ??
      tooltipRows({ rows: request.rows, wire: request.wire }, request.fields));

const requests = new WeakMap<GoFishNode, TooltipRequest>();

/** Every node under `root` (itself included) with a request, in tree
 *  order, each with its request, which is taken off it: a later lowering
 *  of the same tree draws no second box. */
export function takeTooltips(
  root: GoFishNode
): { node: GoFishNode; request: TooltipRequest }[] {
  const out: { node: GoFishNode; request: TooltipRequest }[] = [];
  const walk = (n: GoFishNode) => {
    const request = requests.get(n);
    if (request !== undefined) {
      out.push({ node: n, request });
      requests.delete(n);
    }
    for (const c of n.children) if (c instanceof GoFishNode) walk(c);
  };
  walk(root);
  return out;
}

/**
 * The key of a mark, from its rows: equal rows, equal keys, across the
 * re-runs that make every node anew (#673). A ref or node in the rows (a
 * mark over marks) stands for its rows; a date for its instant.
 *
 * TODO(#1395): a shortcut. Marks with equal rows are one candidate: their
 * outlines are merged, and the box is seated beside the first of them, so
 * hovering the second opens a box beside the first. The right fix is a node
 * identity that is stable across re-runs (#673), to key a mark by.
 */
export function rowsKey(rows: readonly unknown[]): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(rows, function (this: unknown, k, v) {
    if (v instanceof GoFishRef || v instanceof GoFishNode)
      return { rows: (v as { datum?: unknown }).datum };
    // A date is serialized before the replacer sees it; read it raw.
    const raw = (this as Record<string, unknown>)[k];
    if (raw instanceof Date) return { date: raw.getTime() };
    if (typeof v === "bigint") return String(v);
    if (v !== null && typeof v === "object") {
      if (seen.has(v)) return "[cycle]";
      seen.add(v);
    }
    return v;
  });
}

/**
 * Record a node the mark of a `.tooltip(fields)` call made from `datum`.
 * In a static drawing, the rows its box would show are its `title`. In a
 * live chart (`registrar`), which paints no titles, the node's request is
 * recorded for the tooltip layer, and the mark reads its call's focus
 * there, as a spec reads an input, so a change of focus re-runs the chart.
 * A field list is checked here either way, so a field that is not there
 * fails the render, not a hover; without one the rows are made only for
 * the focused node.
 */
export function recordTooltip(
  node: GoFishNode,
  datum: unknown,
  fields: readonly string[] | undefined,
  call: TooltipCall,
  registrar: Registrar | undefined
): void {
  const rows = rowsOfDatum(datum);
  if (registrar === undefined) {
    node.title = tooltipText(tooltipRows({ rows, wire: call.wire }, fields));
    return;
  }
  const content = fields && tooltipRows({ rows, wire: call.wire }, fields);
  const focus = focusOf(registrar, call);
  focus.read(registrar);
  requests.set(node, {
    rows,
    fields,
    wire: call.wire,
    content,
    key: rowsKey(rows),
    focus,
  });
}
