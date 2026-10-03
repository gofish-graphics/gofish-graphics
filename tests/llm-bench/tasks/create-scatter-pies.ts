import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/scatter-pies",
  kind: "create",
  group: "beyond-defaults",
  data: "lake-catch",
  size: { w: 560, h: 480 },
  instruction:
    "Make a scatter plot of lakes in which every point is a small pie chart. Draw one pie per " +
    "`lake`, centered at that lake's position: `x` on the horizontal axis and `y` on the " +
    "vertical axis (both linear, with y increasing upward). Every pie has a radius of 20 px " +
    "and one slice per `species`, whose angle is proportional to that species' share of the " +
    "lake's total `count`. Give each species its own color, the same in every pie, and include " +
    "a legend that names each species. Show both axes.",
  checks: [
    {
      check: "pieGlyphs",
      by: "lake",
      x: "x",
      y: "y",
      category: "species",
      value: "count",
    },
    {
      check: "textIncludes",
      strings: ["Bass", "Trout", "Catfish", "Perch", "Salmon"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
