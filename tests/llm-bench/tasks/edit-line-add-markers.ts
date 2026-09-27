import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "edit/line-add-markers",
  kind: "edit",
  base: "create/line-single",
  data: "wheat",
  size: { w: 640, h: 400 },
  instruction:
    "Add a small filled circle at every data point on the line. Keep everything else the same.",
  checks: [
    { check: "lineSeries", x: "year", y: "wheat" },
    { check: "points", x: "year", y: "wheat" },
    { check: "textIncludes", strings: ["Year", "Wheat price (shillings)"] },
    { check: "sizeAbout" },
  ],
  // The circles are new data marks, and the base has no filled data marks,
  // so both the mark counts and the set of data-mark colors change.
  mayChange: ["marks", "colors"],
};
export default task;
