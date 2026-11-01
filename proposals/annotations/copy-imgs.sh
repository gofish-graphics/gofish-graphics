#!/bin/sh
# Copies the annotation proposal renders from capture-one's output into img/.
cd "$(dirname "$0")/../.."
S=tests/tmp/iterate/proposals/annotations
D=proposals/annotations/img
cp $S/ex1-peak-callout--a.png $D/ex1-peak-a.png
cp $S/ex1-peak-callout--b.png $D/ex1-peak-b.png
cp $S/ex2-rule-and-band--a.png $D/ex2-rule-band-a.png
cp $S/ex2-rule-and-band--ain-chart-mean.png $D/ex2-rule-band-a-mean-in-chart.png
cp $S/ex2-rule-and-band--b.png $D/ex2-rule-band-b.png
cp $S/ex3-highlight-series--a.png $D/ex3-highlight-a.png
cp $S/ex3-highlight-series--b.png $D/ex3-highlight-b.png
cp $S/ex4-enclosure-note--a.png $D/ex4-enclosure-a.png
cp $S/ex4-enclosure-note--aaim-at-member.png $D/ex4-enclosure-a-aim-at-member.png
cp $S/ex4-enclosure-note--b.png $D/ex4-enclosure-b.png
cp $S/ex5-math-augmentation--a.png $D/ex5-math-a.png
cp $S/d3-annotation-types--grid.png $D/d3a-grid.png
ls $D
