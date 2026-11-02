#!/bin/bash
# SCRATCH: crop round-3 captures to their content (from the top-left, so
# axes stay) into artifact-page/img/round3/, and a side-by-side view.
# usage: pairs.sh <slug> <outname> [<suffixA> <suffixB>]
#   copies enclose-round3--<slug>-<A>.png -> round3/<outname>-<A>.png etc.
set -e
ROOT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify
IT=$ROOT/tests/tmp/iterate/scratch
OUT=$ROOT/artifact-page/img/round3
VIEW=$ROOT/packages/gofish-graphics/scratch-bumps/out
mkdir -p "$OUT" "$VIEW"
slug="$1"; name="$2"; A="${3:-current}"; B="${4:-new}"
fa="$IT/enclose-round3--$slug-$A.png"; fb="$IT/enclose-round3--$slug-$B.png"
W=0; H=0
for f in "$fa" "$fb"; do
  t=$(magick "$f" -format '%@' info:)
  w=${t%%x*}; rest=${t#*x}; h=${rest%%+*}; rest=${rest#*+}; x=${rest%%+*}; y=${rest#*+}
  [ $((x + w + 8)) -gt $W ] && W=$((x + w + 8))
  [ $((y + h + 8)) -gt $H ] && H=$((y + h + 8))
done
magick "$fa" -crop "${W}x${H}+0+0" +repage "$OUT/$name-$A.png"
magick "$fb" -crop "${W}x${H}+0+0" +repage "$OUT/$name-$B.png"
magick "$OUT/$name-$A.png" "$OUT/$name-$B.png" -bordercolor '#888' -border 1 +append "$VIEW/pair-$name.png"
echo "$OUT/$name-$A.png $OUT/$name-$B.png (${W}x${H})"
