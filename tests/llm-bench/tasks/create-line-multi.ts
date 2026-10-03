import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/line-multi",
  kind: "create",
  data: "life-expectancy",
  size: { w: 640, h: 400 },
  instruction:
    "Make a line chart with one line per `country`, showing `life_expect` on the vertical axis " +
    "(linear) against `year` on the horizontal axis (numeric). Give each country its own line " +
    "color and include a legend that names each country.",
  checks: [
    {
      check: "lineSeries",
      x: "year",
      y: "life_expect",
      groupBy: "country",
    },
    { check: "textIncludes", strings: ["China", "Brazil", "Nigeria"] },
    { check: "sizeAbout" },
  ],
};
export default task;
