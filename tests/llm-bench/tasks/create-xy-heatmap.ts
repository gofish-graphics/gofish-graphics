import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/xy-heatmap",
  kind: "create",
  group: "corpus-pilot",
  data: "savings-response",
  size: { w: 720, h: 420 },
  instruction:
    "Make a heatmap of `response_rate` by `age_range` and `savings`: a grid of equal-sized " +
    "rectangular cells, one per row of the data, with one column per `age_range` (left to " +
    "right in the order they first appear in the data) and one row per `savings` answer (top " +
    "to bottom in the order they first appear). Fill each cell by its `response_rate` on a " +
    "continuous sequential color scale that runs from light for the lowest rate to dark for " +
    "the highest. Label the columns with the age ranges and the rows with the savings " +
    "answers, and include a legend or color bar for the scale.",
  checks: [
    { check: "heatmap", x: "age_range", y: "savings", value: "response_rate" },
    {
      check: "textIncludes",
      strings: ["18-24", "65+", "or more", "I don't have a savings account"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
