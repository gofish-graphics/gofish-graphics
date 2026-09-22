#!/bin/bash
set -e

# Builds the prompt for the weekly summary. The summary itself is written by
# the "Summarize with Claude" workflow step (claude-code-action), which reads
# prompt.md and writes summary.md (plain Markdown, reusable for Discord,
# release notes, the website, etc.).
#
# Expects prs.txt to exist in the current directory.
# Writes:
# - prompt.md: the full prompt for Claude
# - contributors.tsv: one line per contributor (author, first PR number, URL,
#   title), which check-summary.sh uses to guarantee contributor coverage

# Check if required file exists
if [ ! -f prs.txt ]; then
  echo "ERROR: prs.txt must exist in the current directory"
  echo "This file should be created by previous workflow steps"
  exit 1
fi

# Collect each contributor's first PR from the PR data.
# Expected PR blocks look like:
# - "### PR #123: Title"
# - "- **Author:** username"
# - "- **URL:** https://..."
awk '
  /^### PR #[0-9]+:/ {
    line = $0
    sub(/^### PR #/, "", line)
    split(line, parts, ": ")
    pr = parts[1]
    title = substr(line, length(pr) + 3)
  }
  /^- \*\*Author:\*\* / {
    author = $0
    sub(/^- \*\*Author:\*\* /, "", author)
  }
  /^- \*\*URL:\*\* / {
    url = $0
    sub(/^- \*\*URL:\*\* /, "", url)
    if (author != "" && !(author in seen)) {
      seen[author] = 1
      firstPr[author] = pr
      firstTitle[author] = title
      firstUrl[author] = url
    }
    author = ""
    pr = ""
    title = ""
    url = ""
  }
  END {
    for (a in seen) {
      print a "\t" firstPr[a] "\t" firstUrl[a] "\t" firstTitle[a]
    }
  }
' prs.txt | sort > contributors.tsv

# Build contributor callout guidance.
CONTRIBUTOR_CALLOUTS=$(
  while IFS=$'\t' read -r author pr url title; do
    printf -- "- %s: [PR #%s](%s) - %s\n" "$author" "$pr" "$url" "$title"
  done < contributors.tsv
)

if [ -z "$CONTRIBUTOR_CALLOUTS" ]; then
  CONTRIBUTOR_CALLOUTS="(No named contributors detected.)"
fi

# Count merged PRs to include in Highlights.
PR_COUNT=$(grep -c '^### PR #' prs.txt || true)

# Build the prompt template
read -r -d '' PROMPT_TEMPLATE <<'ENDPROMPT' || true
You are summarizing a week of development on GoFish, a charting library for data visualization. Create a short weekly update in plain Markdown (it will be posted to Discord and may be reused for release notes).

## Merged PRs from the last 7 days:
PRS_PLACEHOLDER

## Weekly PR count:
PR_COUNT_PLACEHOLDER

## Contributor coverage requirements (MUST follow):
CONTRIBUTOR_CALLOUTS_PLACEHOLDER

Write a concise weekly summary in standard Markdown:
- Use `## Section Name` for section headers
- Use **double asterisks** for bold and _underscores_ for italics if needed
- Use `- ` for bullet points
- When mentioning any PR in the summary, format it as a Markdown link using the URL from the data above: [PR #NUMBER](PR_URL) (e.g. [PR #123](https://github.com/gofish-graphics/gofish-graphics/pull/123))
- Contributor coverage is REQUIRED: every contributor listed above must be called out by name with at least one specific contribution.
- In the Highlights section, explicitly mention the number of PRs that landed this week using the PR count above.
- Do not add a title line above the first section; one is added when the summary is posted.

Structure your response as three sections, in this order:
1. `## Highlights` - 2-3 sentence overview of the main thrust of work this week
2. `## What changed` - Group related changes by theme (e.g., "API improvements", "Bug fixes", "Documentation"). Use bullet points, keep each brief.
3. `## Contributor shout-outs` - One bullet per contributor, each explicitly naming the person and one concrete contribution (preferably linked PR).

Keep the tone casual and informative. Use emoji sparingly. Total length should be readable in ~30 seconds.

## Output (MUST follow):
Write the final summary, and nothing else, to the file `summary.md` in the current working directory (the repository root). The file must start directly with `## Highlights`: no preamble, no title, and no code fence around the Markdown. Do not print the summary to chat.
ENDPROMPT

# Read data from file (avoids escaping issues with GitHub Actions outputs)
PRS_DATA=$(cat prs.txt)

PROMPT="${PROMPT_TEMPLATE//PRS_PLACEHOLDER/$PRS_DATA}"
PROMPT="${PROMPT//PR_COUNT_PLACEHOLDER/$PR_COUNT}"
PROMPT="${PROMPT//CONTRIBUTOR_CALLOUTS_PLACEHOLDER/$CONTRIBUTOR_CALLOUTS}"

printf '%s\n' "$PROMPT" > prompt.md

echo "Prompt written to prompt.md ($PR_COUNT PRs)."
