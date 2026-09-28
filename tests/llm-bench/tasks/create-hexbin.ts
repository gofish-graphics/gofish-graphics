import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/hexbin",
  kind: "create",
  group: "corpus-pilot",
  data: "top-films",
  size: { w: 600, h: 450 },
  instruction:
    "Make a hexagonal binning chart of the films, with `budget` on the horizontal axis and " +
    "`box_office` on the vertical axis (both linear). Lay the bins out in data units: the bin " +
    "centers are at budget 0, 100, 200, ... with box office 0, 1000, 2000, ..., and also at " +
    "budget 50, 150, 250, ... with box office 500, 1500, 2500, .... Each film belongs to the " +
    "bin whose center is nearest, measuring distance as (difference in budget / 100)^2 + 3 * " +
    "(difference in box office / 1000)^2. Draw each bin that holds at least one film as a " +
    "filled pointy-top hexagon around its center (x, y) with corners at (x, y + 333.3), (x + " +
    "50, y + 166.7), (x + 50, y - 166.7), (x, y - 333.3), (x - 50, y - 166.7) and (x - 50, y " +
    "+ 166.7) in the axes' data units, so neighboring hexagons share edges. Draw nothing for " +
    "empty bins. Color each hexagon by its number of films on a continuous sequential color " +
    "scale from light (fewest) to dark (most), and include a legend or color bar for the " +
    "counts.",
  checks: [
    { check: "hexbin", x: "budget", y: "box_office", xStep: 100, yStep: 1000 },
    { check: "sizeAbout" },
  ],
};
export default task;
