// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Which tier a source read in an expression lands in, inferred from the
 * channel and the expression by ONE rule, so an expression needs no `live()`
 * wrapper (a JS closure still does: it is opaque, so `live(fn)` says what the
 * rule cannot see).
 *
 * The rule: an expression that reads a source PATCHES PAINT when
 *   1. its channel is a paint channel, one the display list draws without
 *      layout: a `DisplayList.Style` key, or text content; and
 *   2. its value reaches the screen as written: either the channel draws its
 *      value raw (opacity, a stroke width, text), or every value the
 *      expression can produce is a literal color (a `when(...)` whose branches
 *      are colors), so no color scale with an inferred domain stands between
 *      the value and the paint.
 * Otherwise it is a PIPELINE read: a change lays the chart out again.
 *
 * DECISION FOR JOSH: text content counts as a paint channel (here, and only
 * here). A changing string changes the size it would measure at, so strictly
 * it is layout; the paint tier keeps the box measured at resolve, which is
 * today's `live()` caveat, so the readout must fit the room its first value
 * measured.
 */
import { parse } from "../colorModes";
import { type ExprNode, exprNode, isExprValue, sourcesOf } from "./expr";
import type { Expr, Source } from "./expr";

export type Tier = "paint" | "pipeline";

/** The display list's `Style` keys: the channels paint draws as given. */
const STYLE_CHANNELS = new Set([
  "fill",
  "stroke",
  "strokeWidth",
  "opacity",
  "fillOpacity",
  "mixBlendMode",
  "strokeDasharray",
  "filter",
]);

/** The paint channels: the style keys plus text content (the one choice the
 *  header names). */
const PAINT_CHANNELS = new Set([...STYLE_CHANNELS, "text"]);

/** The paint channels a value reaches through a scale unless it is a color
 *  itself. */
const COLOR_CHANNELS = new Set(["fill", "stroke"]);

/** The values `node` can produce, as trees: the branches of a `when`, or the
 *  node itself. */
const results = (node: ExprNode): ExprNode[] =>
  node.type === "when"
    ? [...node.branches.map(([, v]) => v), node.otherwise].flatMap(results)
    : [node];

const isColorLiteral = (node: ExprNode): boolean =>
  node.type === "lit" &&
  (node.value === null ||
    (typeof node.value === "string" && parse(node.value) !== undefined));

/** The tier of `expr` on `channel`. An expression that reads no source has
 *  nothing to re-run, so it is an ordinary accessor (`"pipeline"`). */
export function tierOf(channel: string, expr: Expr | Source): Tier {
  const node = exprNode(expr);
  if (sourcesOf(node).size === 0) return "pipeline";
  if (!PAINT_CHANNELS.has(channel)) return "pipeline";
  if (COLOR_CHANNELS.has(channel) && !results(node).every(isColorLiteral))
    return "pipeline";
  return "paint";
}

/** Whether a channel value is an expression whose tier is paint. */
export const isPaintExpr = (channel: string, value: unknown): boolean =>
  isExprValue(value) && tierOf(channel, value) === "paint";
