#!/bin/sh
# Type-check (and emit despite errors) each case, then run it with node.
# Usage: TSC=/path/to/tsc sh run.sh case-a case-b2 ...
# Defaults to the repo's TypeScript (5.7.2 when these results were taken).
ROOT=$(cd "$(dirname "$0")" && pwd)
TSC=${TSC:-$ROOT/../../../../../packages/gofish-graphics/node_modules/.bin/tsc}
for c in "$@"; do
  echo "=================== $c: tsc"
  (cd "$ROOT/$c" && "$TSC" -p tsconfig.json --pretty false --outDir out; echo "tsc exit=$?")
  echo "------------------- $c: node"
  (cd "$ROOT/$c" && node out/main.js 2>&1 | grep -v "^    at \|^Node.js\|^$" ; true)
done
