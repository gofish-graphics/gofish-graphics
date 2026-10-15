#!/bin/bash
set -e

# Checks the summary Claude wrote to summary.md. It drops any screenshot whose
# URL the PRs did not list and any image markup that is not a screenshot line,
# and it guarantees that every contributor appears by name at least once
# outside the screenshot captions, appending a fallback shout-out for anyone
# the summary missed.
#
# Expects summary.md (from the "Summarize with Claude" step), plus
# contributors.tsv and images.txt (from build-summary-prompt.sh), in the
# current directory.

if [ ! -s summary.md ]; then
  echo "::error::Claude did not write a summary to summary.md (missing or empty)."
  exit 1
fi

for file in contributors.tsv images.txt; do
  if [ ! -f "$file" ]; then
    echo "ERROR: $file must exist in the current directory"
    echo "This file is created by build-summary-prompt.sh"
    exit 1
  fi
done

# Image markup is legal only as a screenshot line (see image-line.sh), and
# such a line is kept only when its URL is one a PR listed, so a made-up or
# mistyped URL never gets posted. Image markup anywhere else, such as inside a
# bullet, is removed. The summary is then left with no image but vetted
# screenshot lines.
# shellcheck source=image-line.sh
source "$(dirname "${BASH_SOURCE[0]}")/image-line.sh"
SUMMARY=$(
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ $IMAGE_LINE ]]; then
      url="${BASH_REMATCH[2]}"
      if ! grep -Fxq -- "$url" images.txt; then
        echo "::warning::Dropped an image the PRs did not list: $url" >&2
        continue
      fi
    else
      while [[ "$line" =~ $IMAGE_MARKUP ]]; do
        echo "::warning::Removed image markup that is not a screenshot line: ${BASH_REMATCH[0]}" >&2
        line="${line/"${BASH_REMATCH[0]}"/}"
      done
    fi
    printf '%s\n' "$line"
  done < summary.md
)

# The summary as Discord shows it as text: a screenshot line becomes an
# attachment, and its caption only alt text, so a name there does not count.
VISIBLE=$(
  while IFS= read -r line; do
    [[ "$line" =~ $IMAGE_LINE ]] || printf '%s\n' "$line"
  done <<< "$SUMMARY"
)

MISSING_CALLOUTS=$(
  while IFS=$'\t' read -r author pr url title; do
    if ! grep -iqE "(^|[^[:alnum:]_])${author}([^[:alnum:]_]|$)" <<< "$VISIBLE"; then
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
