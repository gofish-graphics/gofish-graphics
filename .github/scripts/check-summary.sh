#!/bin/bash
set -e

# Checks the summary Claude wrote to summary.md. It drops any screenshot whose
# URL the PRs did not list, and it guarantees that every contributor appears
# by name at least once, appending a fallback shout-out for anyone the summary
# missed.
#
# Expects summary.md (from the "Summarize with Claude" step), plus
# contributors.tsv and images.txt (from build-summary-prompt.sh), in the
# current directory.

if [ ! -s summary.md ]; then
  echo "::error::Claude did not write a summary to summary.md (missing or empty)."
  exit 1
fi

if [ ! -f contributors.tsv ]; then
  echo "ERROR: contributors.tsv must exist in the current directory"
  echo "This file is created by build-summary-prompt.sh"
  exit 1
fi

if [ ! -f images.txt ]; then
  echo "ERROR: images.txt must exist in the current directory"
  echo "This file is created by build-summary-prompt.sh"
  exit 1
fi

# A screenshot is a line holding only ![caption](url), the shape the prompt
# asks for and post-to-discord.sh turns into an attachment. Keep it only when
# its URL is one a PR listed, so a made-up or mistyped URL never gets posted.
IMAGE_LINE='^[[:space:]]*!\[[^]]*\]\(([^)[:space:]]+)\)[[:space:]]*$'
SUMMARY=$(
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ $IMAGE_LINE ]]; then
      url="${BASH_REMATCH[1]}"
      if ! grep -Fxq -- "$url" images.txt; then
        echo "::warning::Dropped an image the PRs did not list: $url" >&2
        continue
      fi
    fi
    printf '%s\n' "$line"
  done < summary.md
)

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
