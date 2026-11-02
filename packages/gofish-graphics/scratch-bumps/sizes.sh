#!/bin/bash
# SCRATCH: image sizes and trim boxes of round-3 captures matching a pattern
IT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify/tests/tmp/iterate/scratch
for f in "$IT"/enclose-round3--*${1:-}*.png; do
  b=$(basename "$f" .png)
  echo "${b#enclose-round3--} $(magick identify -format '%wx%h' "$f") trim $(magick "$f" -format '%@' info:)"
done
