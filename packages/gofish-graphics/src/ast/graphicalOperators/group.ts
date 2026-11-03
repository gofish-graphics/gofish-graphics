// The fluent `group` operator. Lives in its own file (not in layer.tsx with the
// node `layer`) because chartBuilder.ts imports `layer` and we don't
// want that import to transitively pull in createOperator → ChartBuilder.
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { SplitBy, splitEntries } from "../datumProjection";

export type GroupOptions = {
  by?: SplitBy;
};

export const group = createOperator<any, GroupOptions>(
  (_opts, children) => layer({}, children),
  {
    split: ({ by }, d) => {
      if (!by) throw new Error("group requires opts.by = fieldName");
      return splitEntries(by, d);
    },
    // Positions nothing, but its `by` is still eligible to split a relational
    // mark (see `classifyOperator`).
    arrangement: { kind: "none" },
    serialize: "group",
  }
);
