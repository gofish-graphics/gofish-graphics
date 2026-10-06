import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/dendrogram",
  kind: "create",
  group: "corpus-pilot",
  data: "city-clusters",
  size: { w: 640, h: 400 },
  instruction:
    "Make a dendrogram of the tree in the data. Each row is a node with its `name`, its " +
    "`parent` (empty for the root) and its `height`, the distance at which its children " +
    "merge. Draw it top-down with the root at the top and a linear vertical axis for " +
    "`height`. The leaves (the cities, which are no node's parent) sit side by side along the " +
    "bottom at height 0, evenly spaced, in any order that keeps each node's leaves next to " +
    "each other. Place each other node horizontally at the middle between its two children, " +
    "at its own height. Draw each link as a right angle: a horizontal line at the node's " +
    "height from its left child to its right child, and a vertical line from each child up to " +
    "that horizontal line. Label each leaf with its name just below it; the other nodes need " +
    "no labels.",
  checks: [
    { check: "dendrogram", name: "name", parent: "parent", height: "height" },
    { check: "sizeAbout" },
  ],
};
export default task;
