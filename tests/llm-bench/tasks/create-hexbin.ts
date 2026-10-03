import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/hexbin",
  kind: "create",
  group: "corpus-pilot",
  data: "top-films",
  size: { w: 600, h: 450 },
  instruction:
    "Make a hexagonal binning chart of the films, with `budget` on the horizontal axis and " +
    "`box_office` on the vertical axis (both linear). Bin the films into pointy-top hexagons " +
    "laid out in pixels over the plot area, as d3-hexbin does, with a radius (center to " +
    "corner) of 25 pixels, so neighboring hexagons share edges. Draw each bin that holds at " +
    "least one film as a filled hexagon, and draw nothing for empty bins. Color each hexagon " +
    "by its number of films on a sequential color scale from light (fewest) to dark (most), " +
    "and include a legend or color bar for the counts.",
  checks: [
    { check: "hexbin", x: "budget", y: "box_office", radius: 25 },
    { check: "sizeAbout" },
  ],
};
export default task;
