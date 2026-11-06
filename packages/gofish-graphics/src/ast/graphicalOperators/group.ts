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

/** The options `group`'s layout gets, as `layer` takes them. */
type GroupBox = Omit<GroupOptions, "w" | "h"> & { w?: number; h?: number };

export const group = createOperator<any, GroupOptions>(
  // TODO: `LayoutFn` types a layout's options as the options the user wrote,
  // so `w` and `h` read here as a field name or a length. They reach the
  // layout with their size channels read (a number or a data value, or a
  // length), which `layer` sizes itself from; `LayerOptions` types them as
  // pixels. The rest of the box is checked against `LayerOptions`.
  (opts, children) => layer(opts as GroupBox, children),
  {
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
  }
);
