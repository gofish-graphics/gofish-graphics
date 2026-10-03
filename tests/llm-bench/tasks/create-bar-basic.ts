import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bar-basic",
  kind: "create",
  data: "lake-totals",
  size: { w: 640, h: 400 },
  instruction:
    "Make a vertical bar chart with one bar per lake, in the order the rows appear (left to right). " +
    "Bar height is `count`, measured from zero. Show each lake's name on the horizontal axis and a " +
    "numeric vertical axis.",
  checks: [
    {
      check: "bars",
      orientation: "vertical",
      category: "lake",
      value: "count",
    },
    {
      check: "textIncludes",
      strings: ["Lake A", "Lake B", "Lake C", "Lake D", "Lake E", "Lake F"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
