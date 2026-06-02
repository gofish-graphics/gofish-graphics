// v3 `group` operator. Lives in its own file (not in frame.tsx with the
// low-level `Frame`) because chartBuilder.ts imports `Frame` and we don't
// want that import to transitively pull in createOperator → ChartBuilder.
import { createOperator } from "../marks/createOperator";
import { Frame } from "./frame";

export type GroupOptions = {
  by?: string;
};

export const group = createOperator<any, GroupOptions>(
  (_opts, children) => Frame({}, children),
  {
    split: ({ by }, d) => {
      if (!by) throw new Error("group requires opts.by = fieldName");
      return Map.groupBy(d, (r: any) => r[by]);
    },
    serialize: { type: "group" },
  }
);
