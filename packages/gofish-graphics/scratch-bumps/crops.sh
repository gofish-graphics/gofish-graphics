#!/bin/bash
# SCRATCH: the bump zoom crops (64x48 px of the render, 4x nearest neighbor).
# usage: crops.sh <in.png> <outprefix>
#  z1 upper-left S near the pink dot (members M17/M15 + links L35/L36)
#  z2 top edge over two dots (M16, M1)
#  z3 S edge with one dot (M13)
#  z4 lower edge over two dots (M10, M11)
#  z5 bottom edge over two dots (M24, M46)
set -e
in="$1"; out="$2"
magick "$in" -crop 64x48+336+170 +repage -filter point -resize 400% "${out}-z1.png"
magick "$in" -crop 64x48+426+176 +repage -filter point -resize 400% "${out}-z2.png"
magick "$in" -crop 64x48+420+266 +repage -filter point -resize 400% "${out}-z3.png"
magick "$in" -crop 64x48+380+250 +repage -filter point -resize 400% "${out}-z4.png"
magick "$in" -crop 64x48+444+298 +repage -filter point -resize 400% "${out}-z5.png"
