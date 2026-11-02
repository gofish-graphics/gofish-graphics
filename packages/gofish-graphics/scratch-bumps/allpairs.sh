#!/bin/bash
# SCRATCH: every round-3 pair
P=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify/packages/gofish-graphics/scratch-bumps/pairs.sh
for s in munkres-figure ref-hull penguin-hulls penguin-blobs penguin-spines penguins-four-shapes chart-accent holes-filled holes-kept hyperedges arcs-radius-sweep members-circles members-thick-curves members-polygons members-ribbon-band pack-enclosed bubble-treemap; do
  bash "$P" "$s" "$s"
done
bash "$P" bubble-treemap bubble-treemap-exact current exact
for v in 000 025 050 075 100; do
  bash "$P" "conv-u-$v" "convexity-U-$v"
  bash "$P" "conv-ca-$v" "convexity-ChartAccent-$v"
done
