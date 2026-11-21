#!/bin/sh
# The fake packages each case imports ("lib", "plugin-tooltip", ...) are
# checked in as fake_node_modules/ so the repo never holds a node_modules
# folder. Copy this folder somewhere scratch, then run this script there to
# rename them back to node_modules/ before running any case.
cd "$(dirname "$0")" || exit 1
for d in \
  a1/case-f/fake_node_modules/plugin-tooltip/fake_node_modules \
  a1/case-f2/fake_node_modules/plugin-tooltip/fake_node_modules \
  a1/case-e/fake_node_modules a1/case-f/fake_node_modules \
  a1/case-f2/fake_node_modules a1/case-f3/fake_node_modules \
  a1/case-h/fake_node_modules a1/fake_node_modules \
  a2/fake_node_modules a4/fake_node_modules; do
  [ -d "$d" ] && mv "$d" "$(dirname "$d")/node_modules"
done
echo "renamed fake_node_modules -> node_modules"
