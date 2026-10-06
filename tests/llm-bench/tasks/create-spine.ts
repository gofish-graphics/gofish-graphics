import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/spine",
  kind: "create",
  group: "corpus-pilot",
  data: "gender-response",
  size: { w: 560, h: 420 },
  instruction:
    "Make a spine chart of `percent` by `nationality` and `gender`: one row per nationality, " +
    "top to bottom in the order they appear in the data, with two horizontal bars that meet " +
    "at one shared vertical center line. The Women bar extends to the left of the line and " +
    "the Men bar to the right, each as long as its `percent` on one linear scale from zero, " +
    "the same on both sides. Color all Women bars one color and all Men bars another, include " +
    "a legend that names both, and label each row with its nationality.",
  checks: [
    {
      check: "spine",
      category: "nationality",
      series: "gender",
      value: "percent",
    },
    { check: "textIncludes", strings: ["UAE", "French", "Women", "Men"] },
    { check: "sizeAbout" },
  ],
};
export default task;
