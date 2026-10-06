import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/surplus-deficit-line",
  kind: "create",
  group: "corpus-pilot",
  data: "trade-balance",
  size: { w: 640, h: 400 },
  instruction:
    "Make a line chart of `balance` over `date` (a time axis, one point per month) with the " +
    "area between the line and zero filled: fill the part above zero in one color and the " +
    "part below zero in another color, so at every month the fill runs from zero to that " +
    "month's value (where the line crosses zero, the fill changes color there). Draw the line " +
    "itself as a stroked line through every month's value. Use a linear vertical axis that " +
    "includes zero.",
  checks: [
    { check: "signedArea", x: "date", y: "balance" },
    { check: "textIncludes", strings: ["2018"] },
    { check: "sizeAbout" },
  ],
};
export default task;
