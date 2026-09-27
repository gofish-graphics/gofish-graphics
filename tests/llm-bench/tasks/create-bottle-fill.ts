import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bottle-fill",
  kind: "create",
  group: "beyond-defaults",
  data: "bottle-fill",
  size: { w: 560, h: 360 },
  instruction:
    "Make a bottle fill chart with one bottle per `wine`, side by side from left to right in " +
    "the order the wines appear in the data, all standing on the same baseline. Draw each " +
    "bottle as one closed outline with a dark gray stroke and no fill: a rectangular body 60 px " +
    "wide and 150 px tall, with a neck 20 px wide and 50 px tall centered on top of it, so the " +
    "bottle is 200 px tall in all. Fill each bottle with green liquid from its bottom up to " +
    "`fill_pct` percent of the bottle's full 200 px height. The liquid takes the shape of the " +
    "bottle's inside: it spans the body's full width, and where the level is above the body it " +
    "continues up the neck at the neck's width. Write the percentage (for example 55%) above " +
    "each bottle and the wine's name below it. Do not draw axes.",
  checks: [
    { check: "bottleFill", category: "wine", value: "fill_pct", max: 100 },
    {
      check: "textIncludes",
      strings: [
        "Merlot",
        "Chardonnay",
        "Riesling",
        "Prosecco",
        "30%",
        "55%",
        "80%",
        "92%",
      ],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
