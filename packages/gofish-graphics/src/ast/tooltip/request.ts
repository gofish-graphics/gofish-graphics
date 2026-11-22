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
  tooltipRows,
  tooltipText,
  type TooltipMark,
  type TooltipRow,
} from "./content";

/** What one node's `.tooltip()` call recorded: the call it belongs to, the
 *  rows the box shows, the node's key, and the focus of the call in the
 *  live chart that resolved it (none in a static drawing). */
export type TooltipRequest = {
  call: object;
  rows: TooltipRow[];
  key: string;
  focus: TooltipFocus | undefined;
};

const requests = new WeakMap<GoFishNode, TooltipRequest>();
/** Each call's mark wire, which names the fields its channels draw. */
const wires = new WeakMap<object, TooltipMark["wire"]>();

/** The request `node` carries, if its mark has a tooltip. */
export const tooltipRequest = (node: GoFishNode): TooltipRequest | undefined =>
  requests.get(node);

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

/** Remember the wire of the mark one `.tooltip()` call is chained on: its
 *  channel options name the fields the mark draws (`tooltipRows`). */
export const recordTooltipWire = (
  call: object,
  wire: TooltipMark["wire"]
): void => void wires.set(call, wire);

/**
 * Record, on a node the mark of a `.tooltip(fields)` call made from `datum`,
 * the rows its box shows (checked here, so a field that is not there fails
 * the render, not a hover) and its key, and write them as its `title` for a
 * static drawing. In a live chart (`registrar`) the mark reads its call's
 * focus there, as a spec reads an input, so a change of focus re-runs the
 * chart.
 */
export function recordTooltip(
  node: GoFishNode,
  datum: unknown,
  fields: readonly string[] | undefined,
  call: object,
  registrar: Registrar | undefined
): void {
  const rows = Array.isArray(datum)
    ? datum
    : datum === undefined
      ? []
      : [datum];
  const content = tooltipRows({ rows, wire: wires.get(call) }, fields);
  node.title = tooltipText(content);
  const focus = registrar ? focusOf(registrar, call) : undefined;
  focus?.read(registrar!);
  requests.set(node, { call, rows: content, key: rowsKey(rows), focus });
}
