import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/scatter-colored",
  kind: "create",
  data: "penguins",
  size: { w: 640, h: 400 },
  instruction:
    "Make a scatter plot with one circle per row: `bill_length_mm` on the horizontal axis and " +
    "`flipper_length_mm` on the vertical axis (both linear). Color the circles by `species`, one " +
    "color per species, and include a legend that names each species.",
  checks: [
    {
      check: "points",
      x: "bill_length_mm",
      y: "flipper_length_mm",
      colorBy: "species",
    },
    { check: "textIncludes", strings: ["Adelie", "Chinstrap", "Gentoo"] },
    { check: "sizeAbout" },
  ],
};
export default task;
