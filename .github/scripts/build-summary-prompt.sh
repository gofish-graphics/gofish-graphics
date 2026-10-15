#!/bin/bash
set -e

# Builds the prompt for the weekly summary. The summary itself is written by
# the "Summarize with Claude" workflow step (claude-code-action), which reads
# prompt.md and writes summary.md (plain Markdown, reusable for Discord,
# release notes, the website, etc.).
#
# Expects prs.json in the current directory: the `gh pr list` output with
# each PR's screenshots added (see prs.jq). MAINTAINER names the maintainer,
# whose PRs (like bots') get no Author line and no shout-out.
# Writes, deriving the first three from prs.json with prs.jq:
# - prs.txt: the PR list as the prompt shows it.
# - contributors.tsv: one line per outside contributor (author, first PR
#   number, URL, title), which check-summary.sh uses to guarantee contributor
#   coverage.
# - images.txt: one image URL per line, every screenshot a PR listed.
#   check-summary.sh drops any image the summary shows that is not on this
#   list, so Claude cannot post an image the PRs did not ship.
# - prompt.md: the full prompt for Claude.

# Check if required file exists
if [ ! -f prs.json ]; then
  echo "ERROR: prs.json must exist in the current directory"
  echo "This file should be created by previous workflow steps"
  exit 1
fi
: "${MAINTAINER:?MAINTAINER must name the maintainer}"

# Runs one prs.jq view over prs.json. prs.jq reads IMAGE_URL.
# shellcheck source=image-line.sh
source "$(dirname "${BASH_SOURCE[0]}")/image-line.sh"
prs() {
  jq -r -L "$(dirname "${BASH_SOURCE[0]}")" "include \"prs\"; $1" prs.json
}
prs prompt_view > prs.txt
prs contributors | sort > contributors.tsv
prs image_urls > images.txt

# Build contributor callout guidance.
CONTRIBUTOR_CALLOUTS=$(
  while IFS=$'\t' read -r author pr url title; do
    printf -- "- %s: [PR #%s](%s) - %s\n" "$author" "$pr" "$url" "$title"
  done < contributors.tsv
)

if [ -z "$CONTRIBUTOR_CALLOUTS" ]; then
  CONTRIBUTOR_CALLOUTS="(None this week.)"
fi

# Build the prompt template
read -r -d '' PROMPT_TEMPLATE <<'ENDPROMPT' || true
You are summarizing a week of development on GoFish, a charting library for data visualization. Create a short weekly update in plain Markdown (it will be posted to Discord and may be reused for release notes).

## Merged PRs from the last 7 days:
PRS_PLACEHOLDER

## Contributors to credit (MUST follow):
CONTRIBUTOR_CALLOUTS_PLACEHOLDER

Write a concise weekly summary in standard Markdown:
- Use `## Section Name` for section headers
- Use **double asterisks** for bold and _underscores_ for italics if needed
- Use `- ` for bullet points
- When mentioning any PR in the summary, format it as a Markdown link using the URL from the data above: [PR #NUMBER](PR_URL) (e.g. [PR #123](https://github.com/gofish-graphics/gofish-graphics/pull/123))
- Credit only the contributors listed above: each must be called out by name with at least one specific contribution. Do not name or credit anyone else.
- Do not state how many PRs landed this week.
- Do not add a title line above the first section; one is added when the summary is posted.

Screenshots (optional):
- Some PRs above list **Images**: screenshots from the PR description. You may show a few of them to illustrate new charts or new user-visible capabilities.
- To show one, put a line containing only `![short caption](URL)` directly under the bullet it illustrates. Write your own short caption (a few words saying what the image shows); do not put the image inside the bullet text.
- Use only URLs listed under Images above, copied exactly. Never invent, edit, or guess a URL.
- Use at most about 4 images in total.
- When a PR shows before and after images, pick the after one. Prefer charts and visualizations over screenshots of internal tooling (CI, review sites, dev workflow).
- If nothing visual shipped this week, use no images.

Structure your response as these sections, in this order:
1. `## Highlights` - 2-3 sentence overview of the main thrust of work this week
2. `## What changed` - Group related changes by theme (e.g., "API improvements", "Bug fixes", "Documentation"). Use bullet points, keep each brief.
3. `## Contributor shout-outs` - One bullet per contributor listed above, each explicitly naming the person and one concrete contribution (preferably linked PR). Omit this section entirely if no contributors are listed.

Keep the tone casual and informative. Use emoji sparingly. Total length should be readable in ~30 seconds.

## Output (MUST follow):
Write the final summary, and nothing else, to the file `summary.md` in the current working directory (the repository root). The file must start directly with `## Highlights`: no preamble, no title, and no code fence around the Markdown. Do not print the summary to chat.
ENDPROMPT

# Read data from file (avoids escaping issues with GitHub Actions outputs)
PRS_DATA=$(cat prs.txt)

# Prints $1 with its one placeholder $2 replaced by $3, inserted literally.
# It cuts $1 at the placeholder rather than using ${1//$2/$3}, whose
# replacement cannot be written to be literal on every bash: unquoted, bash
# 5.2 (ubuntu-latest) turns each & in it into the placeholder, and quoted,
# bash 3.2 (macOS) keeps the quotes in.
fill() {
  printf '%s%s%s' "${1%%"$2"*}" "$3" "${1#*"$2"}"
}
PROMPT=$(fill "$PROMPT_TEMPLATE" PRS_PLACEHOLDER "$PRS_DATA")
PROMPT=$(fill "$PROMPT" CONTRIBUTOR_CALLOUTS_PLACEHOLDER "$CONTRIBUTOR_CALLOUTS")

printf '%s\n' "$PROMPT" > prompt.md

echo "Prompt written to prompt.md."
