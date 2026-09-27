import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "edit/stacked-to-grouped",
  kind: "edit",
  base: "create/bar-stacked-horizontal",
  data: "survey",
  size: { w: 640, h: 400 },
  instruction:
    "Place the answers side by side instead of stacking them: for each question, draw three " +
    "separate bars that each start from zero, in the order Agree, Neutral, Disagree from top to " +
    "bottom, each as long as its `count`. Keep the questions in the same order, top to bottom, " +
    "and keep everything else the same.",
  checks: [
    {
      check: "groupedBars",
      orientation: "horizontal",
      category: "question",
      series: "answer",
      value: "count",
    },
    {
      check: "textIncludes",
      strings: [
        "Ease of use",
        "Speed",
        "Design",
        "Support",
        "Price",
        "Agree",
        "Neutral",
        "Disagree",
      ],
    },
    { check: "sizeAbout" },
  ],
  mayChange: [],
};
export default task;
