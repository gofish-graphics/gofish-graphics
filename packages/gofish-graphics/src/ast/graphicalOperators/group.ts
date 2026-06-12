// v3 `group` operator. Lives in its own file (not in frame.tsx with the
// low-level `Frame`) because chartBuilder.ts imports `Frame` and we don't
// want that import to transitively pull in createOperator → ChartBuilder.
import { createOperator } from "../marks/createOperator";
import { Frame } from "./frame";
import { SplitBy, splitKeyFn } from "../datumProjection";

export type GroupOptions = {
  by?: SplitBy;
};

export const group = createOperator<any, GroupOptions>(
  (_opts, children) => Frame({}, children),
  {
    split: ({ by }, d) => {
      if (!by) throw new Error("group requires opts.by = fieldName");
      return Map.groupBy(d, splitKeyFn(by));
    },
    serialize: { type: "group" },
  }
);
