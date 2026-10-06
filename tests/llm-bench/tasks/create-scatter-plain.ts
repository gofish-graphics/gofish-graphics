import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/scatter-plain",
  kind: "create",
  data: "cars-japan",
  size: { w: 640, h: 400 },
  instruction:
    "Make a scatter plot with one circle per row: `horsepower` on the horizontal axis and `mpg` " +
    'on the vertical axis, both linear. Title the horizontal axis "Horsepower" and the vertical ' +
    'axis "Miles per gallon".',
  checks: [
    { check: "points", x: "horsepower", y: "mpg" },
    { check: "textIncludes", strings: ["Horsepower", "Miles per gallon"] },
    { check: "sizeAbout" },
  ],
};
export default task;
