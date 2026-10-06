import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/circle-pack",
  kind: "create",
  group: "beyond-defaults",
  data: "movie-gross",
  size: { w: 520, h: 520 },
  instruction:
    "Make a circle-packing chart (a treemap drawn as nested circles) of the films' worldwide " +
    "gross. Draw one filled circle per film (`title`) whose area is proportional to its " +
    "`gross` (the same scale for every film, so a film with twice the gross has twice the " +
    "area). Pack the circles of each `genre` together inside one larger circle for that " +
    "genre, drawn as an outline or a light fill: every film circle lies entirely inside its " +
    "genre's circle, and no two film circles overlap. Pack the genre circles into the chart " +
    "so that no two genre circles overlap. Color each film circle by its genre, one color per " +
    "genre. Label each genre's circle with the genre name. Film titles do not need labels, " +
    "and no axes are needed.",
  checks: [
    { check: "circlePack", parent: "genre", leaf: "title", value: "gross" },
    {
      check: "textIncludes",
      strings: ["Action", "Adventure", "Comedy", "Drama", "Horror", "Musical"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
