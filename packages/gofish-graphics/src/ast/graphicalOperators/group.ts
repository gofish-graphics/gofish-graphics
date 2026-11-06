// The fluent `group` operator. Lives in its own file (not in layer.tsx with
// the node `layer`) because chartBuilder.ts imports `layer` and we don't
// want that import to transitively pull in createOperator → ChartBuilder.
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { SplitBy, splitEntries } from "../datumProjection";
import type { SpreadOptions } from "./spread";

/** `by`, and the box of the one `layer` the groups are drawn in, as spread's
 *  and stack's. A coordinate space is a chart's (`chart({ coord })`), not a
 *  group's. */
export type GroupOptions = {
  by?: SplitBy;
  x?: number;
  y?: number;
  w?: SpreadOptions["w"];
  h?: SpreadOptions["h"];
};

export const group = createOperator<any, GroupOptions>(layer as any, {
  split: ({ by }, d) => {
    if (!by) throw new Error("group requires opts.by = fieldName");
    return splitEntries(by, d);
  },
  // Its box may be sized from data, as spread's is.
  channels: { w: "size", h: "size" },
  // Positions nothing, but its `by` is still eligible to split a relational
  // mark (see `classifyOperator`).
  arrangement: { kind: "none" },
  serialize: "group",
});
