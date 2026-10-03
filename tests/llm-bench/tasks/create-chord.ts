import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/chord",
  kind: "create",
  group: "corpus-pilot",
  data: "mail-links",
  size: { w: 480, h: 480 },
  instruction:
    "Make a chord diagram of the undirected links between mail channels. Around a circle, " +
    "draw one ring segment per channel (Email, Postal, Air) with a small gap between " +
    "neighbors, whose angle is proportional to the channel's total `count` over all links " +
    "that touch it (as `source` or `target`). For each link, draw one filled ribbon through " +
    "the inside of the circle that connects the two channels' segments: each end of the " +
    "ribbon sits on the inner edge of one channel's segment and spans an angle proportional " +
    "to the link's `count`, on the same angular scale as the segments, so the ribbon ends at " +
    "a channel exactly cover its segment. Give each channel its own color, draw the ribbons " +
    "semi-transparent, and label each channel. No axes are needed.",
  checks: [
    { check: "chord", source: "source", target: "target", value: "count" },
    { check: "textIncludes", strings: ["Email", "Postal", "Air"] },
    { check: "sizeAbout" },
  ],
};
export default task;
