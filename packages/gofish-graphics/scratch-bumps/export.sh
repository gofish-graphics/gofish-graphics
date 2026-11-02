#!/bin/bash
# SCRATCH: full renders + zoom crops of every candidate into artifact-page/img/bumps/
set -e
ROOT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify
IT=$ROOT/tests/tmp/iterate/scratch
OUT=$ROOT/artifact-page/img/bumps
mkdir -p "$OUT"
one() {
  local slug="$1" name="$2"
  cp "$IT/enclose-shape-compare--$slug.png" "$OUT/$name-full.png"
  magick "$IT/enclose-shape-compare--$slug.png" -crop 270x180+320+150 +repage -filter point -resize 200% "$OUT/$name-cluster-2x.png"
  bash "$ROOT/packages/gofish-graphics/scratch-bumps/crops.sh" "$IT/enclose-shape-compare--$slug.png" "$OUT/$name"
}
one ca-proto-arcs-spine24 00-current-arcs24-spine0
one ca-bump-no-spine24 01-diag-arcs24-nospine
one ca-bump-spine7r24 02-diag-arcs24-spine7-linkwidth-eq-dot
one ca-bump-spine0r40 03-cand-arcs40-spine0
one ca-bump-spine0r60 04-cand-arcs60-spine0
one ca-bump-relax6 05-cand-relax-s6-reject
one ca-bump-outward6 06-cand-outward-only-s6-reject
one ca-bump-field4 07-cand-field-s4
one ca-bump-field8 08-cand-field-s8
one ca-bump-blur4 09-cand-blur-s4
one ca-bump-blur6 10-cand-blur-s6-RECOMMENDED
one ca-bump-blur8 11-cand-blur-s8
one ca-bump-blur6-local20 12-cand-blur-s6-local20
