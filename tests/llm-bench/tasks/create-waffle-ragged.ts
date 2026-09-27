import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/waffle-ragged",
  kind: "create",
  group: "beyond-defaults",
  data: "lake-totals",
  size: { w: 560, h: 400 },
  instruction:
    "Make a waffle chart of `count` by `lake`, drawn as one block of squares per lake. Every " +
    "square stands for one fish, so each lake's block has exactly `count` squares, all the " +
    "same size. Each block is 5 squares wide, with a small gap between neighboring squares. " +
    "Fill each block from the bottom up: its first row is the bottom row, filled from left to " +
    "right, and each next row sits directly above the one before. Every row holds 5 squares " +
    "except the last (top) row, which holds the remaining squares starting from the left, so " +
    "the blocks have ragged tops. Do not add squares to fill out the top rows. Place the " +
    "blocks side by side from left to right in the order the lakes appear in the data, with " +
    "their bottom rows on one shared baseline and a gap of at least one square's width " +
    "between neighboring blocks. Give each lake's squares one color of its own. Write each " +
    "lake's name centered under its block. Do not draw axes or a legend.",
  checks: [
    {
      check: "unitBlocks",
      category: "lake",
      value: "count",
      width: 5,
      start: "bottom-left",
      labels: true,
    },
    { check: "sizeAbout" },
  ],
};
export default task;
