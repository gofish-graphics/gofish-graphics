#!/bin/sh
# Crops the annotation-styles renders from capture-one's output into img/styles/.
cd "$(dirname "$0")/../../../.."
S=tests/tmp/iterate/proposals/annotations
D=proposals/annotations/img/styles
for p in 1:proximity 2:leader 3:callout 4:key 5:key-leader 6:region 7:rule 8:band 9:emphasis 10:badge; do
  n=${p%%:*}
  s=${p#*:}
  magick "$S/styles--$s.png" -trim -bordercolor white -border 8 +repage "$D/$n-$s.png"
done
