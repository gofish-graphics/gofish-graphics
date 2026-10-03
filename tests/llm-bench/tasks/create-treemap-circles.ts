import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/treemap-circles",
  kind: "create",
  group: "beyond-defaults",
  data: "movie-gross",
  size: { w: 600, h: 400 },
  instruction:
    "Make a two-level treemap of the films' worldwide gross that fills the chart area, with " +
    "a circle drawn in every cell. Use a rectangular treemap with any tiling (squarified, " +
    "slice-and-dice, binary and so on all pass), and leave no gaps between cells. First " +
    "split the chart into one rectangle per `genre`, with area proportional to the genre's " +
    "total `gross`. Then split each genre's rectangle into one cell per film (`title`), with " +
    "area proportional to the film's `gross`, so that a genre's cells exactly fill its " +
    "rectangle. Draw each film cell's outline as a thin (1px), light gray stroke. Inside each " +
    "film cell draw one filled circle, centered in the cell, whose diameter is the cell's " +
    "shorter side minus 2px, so that it almost touches the cell's two longer sides. Color " +
    "each circle by its genre, one color per genre. Name the genres, with a legend or with a label " +
    "on each genre rectangle. Film titles do not need labels, and no axes are needed.",
  checks: [
    {
      check: "treemapCircles",
      parent: "genre",
      leaf: "title",
      value: "gross",
      padding: 2,
    },
    {
      check: "textIncludes",
      strings: ["Action", "Adventure", "Comedy", "Drama", "Horror", "Musical"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
