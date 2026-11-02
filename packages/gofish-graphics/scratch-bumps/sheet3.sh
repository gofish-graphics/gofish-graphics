#!/bin/bash
# SCRATCH: contact sheet of round-3 captures.
# usage: sheet3.sh <out.png> <crop WxH+X+Y> <cols> <slug>...
set -e
IT=/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify/tests/tmp/iterate/scratch
out="$1"; crop="$2"; cols="$3"; shift 3
files=()
for s in "$@"; do files+=("$IT/enclose-round3--$s.png"); done
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sheet.XXXX")
i=0
for f in "${files[@]}"; do
  magick "$f" -crop "$crop" +repage -bordercolor '#ddd' -border 1 "$tmp/$(printf %03d $i).png"
  i=$((i+1))
done
magick montage "$tmp"/*.png -tile "${cols}x" -geometry +4+4 "$out"
rm -rf "$tmp"
