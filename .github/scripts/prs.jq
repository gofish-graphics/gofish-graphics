# The weekly summary's views of the merged PRs. The workflow saves the
# `gh pr list --json number,title,body,author,mergedAt,url` output once, with
# each PR's screenshots added as an images list (with_images), as prs.json.
# build-summary-prompt.sh derives everything else from that one file.
#
# Load it with `source .github/scripts/image-line.sh` (for IMAGE_URL) and
# `jq -L .github/scripts 'include "prs"; ...'`.

# Bodies embed screenshots as Markdown (![alt](url), maybe with a title) or as
# HTML (<img src="...">, which GitHub's uploader writes). A Markdown URL with
# "(" in it is not matched: Markdown allows only balanced parentheses there,
# so stopping at the first ")" would cut such a URL short.
def markdown_image: "!\\[(?<alt>[^\\]]*)\\]\\((?<url>[^()\\s]+)(?:\\s+\"[^\"]*\")?\\)";
def html_image: "<img\\b[^>]*>";

# The body as GitHub shows it, for finding images: HTML comments and fenced
# code blocks are removed, so commented-out or example images are not
# offered. An unclosed comment or fence runs to the end of the body, as it
# does on GitHub.
def shown:
  gsub("<!--(?s:.*?)(?:-->|\\z)"; "")
  | gsub("(?m)^ {0,3}(?<f>(?<c>[`~])\\k<c>{2,})[^\\n]*(?s:.*?)(?:^ {0,3}\\k<f>\\k<c>*[ \\t]*$|\\z)"; "");

# An attribute value as written in HTML, decoded.
def html_decode:
  gsub("&(?<e>amp|quot|apos|#39|lt|gt);";
       {amp: "&", quot: "\"", apos: "'", "#39": "'", lt: "<", gt: ">"}[.e]);

# The URLs a screenshot line can carry: IMAGE_URL from image-line.sh, which
# also builds IMAGE_LINE from it, so the two cannot drift apart.
def image_url:
  "^(?:\($ENV.IMAGE_URL
         // error("IMAGE_URL is not set: source image-line.sh before running prs.jq")))$";

# The screenshots a PR body embeds, as [{alt, url}]: each image once, in body
# order (an image embedded twice keeps its first place), keeping only URLs a
# screenshot line can carry.
def images:
  shown
  | [ (match(markdown_image; "g")
      | {offset, alt: .captures[0].string, url: .captures[1].string}),
    (match(html_image; "gi")
      | .offset as $o | .string as $tag
      | {offset: $o,
         url: ($tag | capture("\\bsrc\\s*=\\s*[\"'](?<u>[^\"']+)[\"']"; "i").u | html_decode),
         alt: ([$tag | capture("\\balt\\s*=\\s*[\"'](?<a>[^\"']*)[\"']"; "i").a | html_decode] | first // "")})
  ]
  | map(select(.url | test(image_url)))
  | group_by(.url) | map(min_by(.offset))
  | sort_by(.offset)
  | map({alt, url});

def with_images: map(.images = (.body // "" | images));

# The maintainer's PRs (and bots') get no Author line and no shout-out, so the
# summary only credits outside contributors. MAINTAINER names the maintainer.
def credited: (.author.is_bot or .author.login == $ENV.MAINTAINER) | not;

# The PR list as the prompt shows it. The description is cut to 300 chars
# after its image markup is removed, since the screenshots are listed under
# Images as ready-to-copy ![alt](url) lines. The alt text loses brackets and
# line breaks so each of those lines stays valid Markdown.
def prompt_entry:
  [ "### PR #\(.number): \(.title)",
    (if credited then "- **Author:** \(.author.login)" else empty end),
    "- **Merged:** \(.mergedAt[:10])",
    "- **URL:** \(.url)",
    "- **Description:** \(.body // "No description"
        | gsub(markdown_image; "") | gsub(html_image; ""; "i")
        | split("\n")[0:3] | join(" ") | .[0:300])",
    (if (.images | length) > 0 then
       "- **Images:**",
       (.images[] | "  - ![\(.alt | gsub("[\\[\\]\\r\\n]"; " "))](\(.url))")
     else empty end)
  ] | join("\n");

def prompt_view:
  if length == 0 then "No PRs merged this week."
  else map(prompt_entry) | join("\n\n") end;

# One line per credited contributor: author, first PR number, URL, title,
# tab-separated. unique_by keeps each author's first PR in list order.
def contributors:
  map(select(credited))
  | unique_by(.author.login)[]
  | [.author.login, (.number | tostring), .url, .title] | join("\t");

# Every listed screenshot URL, once: the allowlist check-summary.sh enforces.
def image_urls: [.[].images[].url] | unique[];
