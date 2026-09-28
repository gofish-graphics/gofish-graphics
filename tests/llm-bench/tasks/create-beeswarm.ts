import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/beeswarm",
  kind: "create",
  group: "corpus-pilot",
  data: "top-films",
  size: { w: 640, h: 300 },
  instruction:
    "Make a beeswarm plot of the films by release `year`: one filled circle per film, all the " +
    "same size (a radius of about 6 pixels), each centered at its `year` (within 2 pixels) " +
    "along a linear horizontal axis. Circles must not overlap. Place them around one horizontal " +
    "center line: a circle sits on the line when it has room there, and otherwise moves up or " +
    "down just far enough to rest against a circle that is already placed, so the circles " +
    "pile up into a swarm. Color the circles by `genre` and include a legend that names each " +
    "genre. Show the years on the horizontal axis; no vertical axis is needed.",
  checks: [
    { check: "beeswarm", x: "year", colorBy: "genre" },
    {
      check: "textIncludes",
      strings: ["Action", "Animation", "Adventure", "Drama", "Other"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
