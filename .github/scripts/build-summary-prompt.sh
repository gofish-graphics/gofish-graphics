#!/bin/bash
set -e

# Builds the prompt for the weekly summary. The summary itself is written by
# the "Summarize with Claude" workflow step (claude-code-action), which reads
# prompt.md and writes summary.md (plain Markdown, reusable for Discord,
# release notes, the website, etc.).
#
# Expects prs.txt to exist in the current directory.
# Writes prompt.md: the full prompt for Claude.

# Check if required file exists
if [ ! -f prs.txt ]; then
  echo "ERROR: prs.txt must exist in the current directory"
  echo "This file should be created by previous workflow steps"
  exit 1
fi

# Build the prompt template
read -r -d '' PROMPT_TEMPLATE <<'ENDPROMPT' || true
You are summarizing a week of development on GoFish, a charting library for data visualization. Create a short weekly update in plain Markdown (it will be posted to Discord and may be reused for release notes).

## Merged PRs from the last 7 days:
PRS_PLACEHOLDER

Write a concise weekly summary in standard Markdown:
- Use `## Section Name` for section headers
- Use **double asterisks** for bold and _underscores_ for italics if needed
- Use `- ` for bullet points
- When mentioning any PR in the summary, format it as a Markdown link using the URL from the data above: [PR #NUMBER](PR_URL) (e.g. [PR #123](https://github.com/gofish-graphics/gofish-graphics/pull/123))
- Describe what changed, not who changed it: do not name or credit PR authors.
- Do not state how many PRs landed this week.
- Do not add a title line above the first section; one is added when the summary is posted.

Structure your response as two sections, in this order:
1. `## Highlights` - 2-3 sentence overview of the main thrust of work this week
2. `## What changed` - Group related changes by theme (e.g., "API improvements", "Bug fixes", "Documentation"). Use bullet points, keep each brief.

Keep the tone casual and informative. Use emoji sparingly. Total length should be readable in ~30 seconds.

## Output (MUST follow):
Write the final summary, and nothing else, to the file `summary.md` in the current working directory (the repository root). The file must start directly with `## Highlights`: no preamble, no title, and no code fence around the Markdown. Do not print the summary to chat.
ENDPROMPT

# Read data from file (avoids escaping issues with GitHub Actions outputs)
PRS_DATA=$(cat prs.txt)

PROMPT="${PROMPT_TEMPLATE//PRS_PLACEHOLDER/$PRS_DATA}"

printf '%s\n' "$PROMPT" > prompt.md

echo "Prompt written to prompt.md."
