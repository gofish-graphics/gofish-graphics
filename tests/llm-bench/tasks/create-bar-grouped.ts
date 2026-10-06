import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bar-grouped",
  kind: "create",
  data: "seafood",
  size: { w: 640, h: 400 },
  instruction:
    "Make a grouped bar chart with one group of bars per `lake`, the lakes left to right in the " +
    "order they first appear in the data. Within each group, draw one bar per `species` side by " +
    "side (not stacked), in the order Bass, Trout, Catfish, Perch, Salmon from left to right. Bar " +
    "height is `count`, measured from zero. Give each species its own color, the same in every " +
    "group, and include a legend that names each species. Show the lake names on the horizontal " +
    "axis and a numeric vertical axis.",
  checks: [
    {
      check: "groupedBars",
      orientation: "vertical",
      category: "lake",
      series: "species",
      value: "count",
    },
    {
      check: "textIncludes",
      strings: [
        "Lake A",
        "Lake F",
        "Bass",
        "Trout",
        "Catfish",
        "Perch",
        "Salmon",
      ],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
