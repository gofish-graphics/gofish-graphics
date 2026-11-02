#!/bin/bash
# SCRATCH: cusp zoom crops (4x nearest neighbor) before / after, round 3.
set -e
ROOT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify
IT=$ROOT/tests/tmp/iterate/scratch
OUT=$ROOT/artifact-page/img/round3
mkdir -p "$OUT"
z() { # <slug> <crop> <out>
  magick "$IT/enclose-round3--$1.png" -crop "$2" +repage -filter point -resize 400% "$OUT/$3"
}
for v in before after after-smooth; do
  z "cusp-r40-$v" 70x100+180+38 "cusp-r40-upperleft-$v.png"
  z "cusp-r40-$v" 44x40+347+40 "cusp-r40-loneTop-$v.png"
  z "cusp-r40-$v" 60x44+293+104 "cusp-r40-mid-$v.png"
  z "cusp-r40-$v" 60x44+236+208 "cusp-r40-tail-$v.png"
  z "cusp-r24-pad10-$v" 72x72+178+38 "cusp-r24-pad10-upperleft-$v.png"
  z "cusp-r24-pad10-$v" 72x56+232+210 "cusp-r24-pad10-tail-$v.png"
done
# full charts, cropped like the others
for s in cusp-r40 cusp-r24-pad10; do
  for v in before after after-smooth; do
    magick "$IT/enclose-round3--$s-$v.png" -crop 761x380+0+0 +repage "$OUT/$s-full-$v.png"
  done
done
