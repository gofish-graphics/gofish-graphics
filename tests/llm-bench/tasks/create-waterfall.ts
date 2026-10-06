import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/waterfall",
  kind: "create",
  group: "corpus-pilot",
  data: "cash-flow",
  size: { w: 560, h: 360 },
  instruction:
    "Make a vertical waterfall chart of `amount` by `label`. The first row (Begin) is a " +
    "starting balance: draw it as a bar from zero up to its amount. Each later row is a " +
    "change: draw it as a floating bar from the running total before it to the running total " +
    "after it (up for a positive amount, down for a negative one). After the last row, add a " +
    "bar labeled End from zero to the final running total. The bars run left to right in data " +
    "order, then End, with equal widths. Color the increases one color, the decreases " +
    "another, and the Begin and End bars a third. Use a linear vertical axis starting at zero " +
    "and label each bar on the horizontal axis.",
  checks: [
    { check: "waterfall", category: "label", value: "amount" },
    { check: "textIncludes", strings: ["Begin", "Jan", "Jun", "End"] },
    { check: "sizeAbout" },
  ],
};
export default task;
