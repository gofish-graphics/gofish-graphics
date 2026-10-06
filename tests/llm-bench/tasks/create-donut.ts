import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/donut",
  kind: "create",
  data: "traffic",
  size: { w: 480, h: 400 },
  instruction:
    "Make a donut chart with one slice per `channel`, where each slice's angle is proportional " +
    "to `visits`. The hole in the middle should have about half the outer radius. Give every " +
    "slice its own color, and name each channel, either in a legend or next to its slice. Do not " +
    "draw axes.",
  checks: [
    { check: "wedges", category: "channel", value: "visits", hole: true },
    {
      check: "textIncludes",
      strings: ["Search", "Direct", "Social", "Referral", "Email"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
