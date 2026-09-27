import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "edit/grouped-to-stacked",
  kind: "edit",
  base: "create/bar-grouped",
  data: "seafood",
  size: { w: 640, h: 400 },
  instruction:
    "Stack the bars instead of placing them side by side: one bar per lake, made of one segment " +
    "per species placed end to end starting from zero, with each segment's height equal to its " +
    "`count`. Keep everything else the same.",
  checks: [
    {
      check: "stackedBars",
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
  mayChange: [],
};
export default task;
