import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/waffle",
  kind: "create",
  group: "beyond-defaults",
  data: "energy-mix",
  size: { w: 560, h: 400 },
  instruction:
    "Make a waffle chart of `percent` by `source`: a grid of 10 rows by 10 columns of " +
    "equal-sized squares, 100 squares in all, with a small gap between neighboring squares. " +
    "Each source gets as many squares as its `percent`. Fill the squares row by row: start at " +
    "the top-left square, go left to right along the top row, then continue from the left end " +
    "of the next row down, taking the sources in the order they appear in the data. Give each " +
    "source its own color and include a legend that names each source. Do not draw axes.",
  checks: [
    {
      check: "waffle",
      rows: 10,
      cols: 10,
      category: "source",
      value: "percent",
      order: "rows",
    },
    {
      check: "textIncludes",
      strings: ["Gas", "Wind", "Hydro", "Coal", "Solar"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
