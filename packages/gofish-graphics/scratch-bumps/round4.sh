#!/bin/bash
# SCRATCH: crop round-4 captures from the top-left (axes and legend kept) into
# artifact-page/img/round4/, one crop size per chart, and contact sheets.
set -e
ROOT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify
IT=$ROOT/tests/tmp/iterate/scratch
OUT=$ROOT/artifact-page/img/round4
VIEW=$ROOT/packages/gofish-graphics/scratch-bumps/out
mkdir -p "$OUT" "$VIEW"
size() { # max trim box (+8) over the files given
  local W=0 H=0 t w h x y rest
  for f in "$@"; do
    t=$(magick "$f" -format '%@' info:)
    w=${t%%x*}; rest=${t#*x}; h=${rest%%+*}; rest=${rest#*+}; x=${rest%%+*}; y=${rest#*+}
    [ $((x + w + 8)) -gt $W ] && W=$((x + w + 8))
    [ $((y + h + 8)) -gt $H ] && H=$((y + h + 8))
  done
  echo "${W}x${H}"
}
for pair in "u:u" "pg:penguins" "ca:chartaccent"; do
  k=${pair%%:*}; name=${pair#*:}
  S=$(size "$IT"/enclose-round4--conv-$k-*.png "$IT"/enclose-round4--alt-*-$k-*.png)
  for v in 000 050 100 125 150 175 200; do
    magick "$IT/enclose-round4--conv-$k-$v.png" -crop "$S+0+0" +repage "$OUT/conv-$name-$v.png"
  done
  magick "$IT/enclose-round4--conv-$k-oval.png" -crop "$S+0+0" +repage "$OUT/oval-$name.png"
  for a in circle corner firey; do
    for v in 150 200; do
      magick "$IT/enclose-round4--alt-$a-$k-$v.png" -crop "$S+0+0" +repage "$OUT/alt-$a-$name-$v.png"
    done
  done
  magick montage "$OUT"/conv-$name-*.png "$OUT/oval-$name.png" -tile 4x -geometry +4+4 "$VIEW/r4-sweep-$name.png"
  magick montage "$OUT/conv-$name-150.png" "$OUT/alt-circle-$name-150.png" "$OUT/alt-corner-$name-150.png" "$OUT/alt-firey-$name-150.png" \
    "$OUT/conv-$name-200.png" "$OUT/alt-circle-$name-200.png" "$OUT/alt-corner-$name-200.png" "$OUT/alt-firey-$name-200.png" \
    -tile 4x -geometry +4+4 "$VIEW/r4-alts-$name.png"
  echo "$name $S"
done
magick "$IT/enclose-round4--neck-munkres-100.png" -crop 353x102+0+0 +repage "$OUT/munkres-neck-100.png"
magick "$IT/enclose-round4--neck-munkres-060.png" -crop 353x102+0+0 +repage "$OUT/munkres-neck-060.png"
magick "$IT/enclose-round4--neck-chart-accent-100.png" -crop 761x376+0+0 +repage "$OUT/chart-accent-neck-100.png"
magick "$IT/enclose-round4--neck-chart-accent-060.png" -crop 761x376+0+0 +repage "$OUT/chart-accent-neck-060.png"
