#!/bin/bash
# SCRATCH: crops + a contact sheet for one story render.
# usage: sheet.sh <story-slug> <name>   (slug as in tests/tmp/iterate/scratch/<slug>.png)
set -e
ROOT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify
in="$ROOT/tests/tmp/iterate/scratch/$1.png"
out=/tmp/bumps/$2
mkdir -p /tmp/bumps
bash "$ROOT/packages/gofish-graphics/scratch-bumps/crops.sh" "$in" "$out"
cp "$in" "$out-full.png"
magick "$in" -crop 270x180+320+150 +repage -filter point -resize 200% "$out-wide.png"
magick "$out-z1.png" "$out-z2.png" "$out-z3.png" +append "$out-r1.png"
magick "$out-z4.png" "$out-z5.png" +append "$out-r2.png"
