#!/bin/bash
set -e

# Checks that Claude wrote a summary to summary.md.
#
# Expects summary.md (from the "Summarize with Claude" step) in the current
# directory.

if [ ! -s summary.md ]; then
  echo "::error::Claude did not write a summary to summary.md (missing or empty)."
  exit 1
fi

echo "Summary checked successfully!"
cat summary.md
