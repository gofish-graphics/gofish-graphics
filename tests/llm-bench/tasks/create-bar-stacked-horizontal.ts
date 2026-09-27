import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bar-stacked-horizontal",
  kind: "create",
  data: "survey",
  size: { w: 640, h: 400 },
  instruction:
    "Make a horizontal stacked bar chart with one bar per `question`, the questions top to " +
    "bottom in the order they first appear in the data. Split each bar into one segment per " +
    "`answer` (Agree, Neutral, Disagree), placed end to end starting from zero, with each " +
    "segment's length equal to its `count`. Give each answer its own color, the same in every " +
    "bar, and include a legend that names each answer. Show the questions on the vertical axis " +
    "and a numeric horizontal axis.",
  checks: [
    {
      check: "stackedBars",
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
};
export default task;
