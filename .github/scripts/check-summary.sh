#!/bin/bash
set -e

# Checks the summary Claude wrote to summary.md and guarantees that every
# contributor appears by name at least once, appending a fallback shout-out
# for anyone the summary missed.
#
# Expects summary.md (from the "Summarize with Claude" step) and
# contributors.tsv (from build-summary-prompt.sh) in the current directory.

if [ ! -s summary.md ]; then
  echo "::error::Claude did not write a summary to summary.md (missing or empty)."
  exit 1
fi

if [ ! -f contributors.tsv ]; then
  echo "ERROR: contributors.tsv must exist in the current directory"
  echo "This file is created by build-summary-prompt.sh"
  exit 1
fi

SUMMARY=$(cat summary.md)

MISSING_CALLOUTS=$(
  while IFS=$'\t' read -r author pr url title; do
    if ! grep -iqE "(^|[^[:alnum:]_])${author}([^[:alnum:]_]|$)" <<< "$SUMMARY"; then
      printf -- "- %s: Shipped %s (%s).\n" "$author" "[PR #${pr}](${url})" "$title"
    fi
  done < contributors.tsv
)

if [ -n "$MISSING_CALLOUTS" ]; then
  SUMMARY="${SUMMARY}

## Contributor shout-outs (added for full coverage)
${MISSING_CALLOUTS}"
fi

echo "$SUMMARY" > summary.md

echo "Summary checked successfully!"
cat summary.md
