#!/bin/bash
# SCRATCH: re-crop the round-3 "New" captures (after the neck fix) with the
# round-3 crop sizes into artifact-page/img/round4/<name>-new.png, and print
# how many pixels differ from the round-3 image.
ROOT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify
IT=$ROOT/tests/tmp/iterate/scratch
R3=$ROOT/artifact-page/img/round3
OUT=$ROOT/artifact-page/img/round4
VIEW=$ROOT/packages/gofish-graphics/scratch-bumps/out
mkdir -p "$OUT"
for f in "$R3"/*-new.png; do
  name=$(basename "$f" -new.png)
  case "$name" in
    convexity-*) slug=$(echo "$name" | sed -e 's/convexity-ChartAccent-/conv-ca-/' -e 's/convexity-U-/conv-u-/') ;;
    *) slug=$name ;;
  esac
  src="$IT/enclose-round3--$slug-new.png"
  [ -f "$src" ] || { echo "MISSING $src"; continue; }
  S=$(magick identify -format '%wx%h' "$f")
  magick "$src" -crop "$S+0+0" +repage "$OUT/$name-new.png"
  d=$(magick compare -metric AE -fuzz 2% "$f" "$OUT/$name-new.png" null: 2>&1)
  echo "$name $S diff_px=$d"
  if [ "${d%%.*}" != "0" ]; then
    magick "$f" "$OUT/$name-new.png" -bordercolor '#888' -border 1 +append "$VIEW/r4vs3-$name.png"
  else
    rm "$OUT/$name-new.png"
  fi
done
