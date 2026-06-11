// v3 `group` operator. Lives in its own file (not in frame.tsx with the
// low-level `Frame`) because chartBuilder.ts imports `Frame` and we don't
// want that import to transitively pull in createOperator → ChartBuilder.
import { createOperator } from "../marks/createOperator";
import { Frame } from "./frame";
import { projectPath } from "../datumProjection";

export type GroupOptions = {
  by?: string | ((r: any) => unknown);
};

export const group = createOperator<any, GroupOptions>(
  (_opts, children) => Frame({}, children),
  {
    split: ({ by }, d) => {
      if (!by) throw new Error("group requires opts.by = fieldName");
      // Projected/derived keys are runtime strings/numbers (or undefined for
      // ill-posed groups); the assertion bridges projectPath's honest `unknown`.
      return Map.groupBy(
        d,
        (r: any) =>
          (typeof by === "function" ? by(r) : projectPath(r, by)) as
            | string
            | number
      );
    },
    serialize: { type: "group" },
  }
);
