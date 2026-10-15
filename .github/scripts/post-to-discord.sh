#!/bin/bash
set -e

# Posts the weekly summary to Discord, with its screenshots as uploaded files.
#
# Expects summary.md (checked by check-summary.sh) in the current directory.
# Environment:
# - TITLE: the title line to put above the summary.
# - DISCORD_WEBHOOK_URL: the webhook to post to. If it is not set, the post is
#   skipped.
# - DRY_RUN=1: print each message's content and attachments instead of
#   posting. The images are still downloaded, so a dry run shows which ones
#   would be skipped. It needs no webhook.
#
# The summary marks a screenshot as a line holding only ![caption](url) (see
# image-line.sh). Such a line is never posted as text. Instead the image is
# uploaded as a file on the message that ends with the bullet above it, so
# each image shows right after the bullet it illustrates. The
# messages set SUPPRESS_EMBEDS so PR links do not unfurl into preview cards;
# that also hides embedded images, but uploaded files still show.

if [ ! -s summary.md ]; then
  echo "ERROR: summary.md must exist in the current directory"
  exit 1
fi

if [ "$DRY_RUN" != "1" ] && [ -z "$DISCORD_WEBHOOK_URL" ]; then
  echo "⚠️  DISCORD_WEBHOOK_URL secret not set. Skipping Discord post."
  exit 0
fi

# shellcheck source=image-line.sh
source "$(dirname "${BASH_SOURCE[0]}")/image-line.sh"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Discord caps a message at 10 files and, without a server boost, a webhook
# upload at 10 MiB. A file over the size cap fails its download (curl
# --max-filesize) and is skipped like any other broken image.
MAX_FILES=10
MAX_FILE_BYTES=10485760

# Split the summary into messages. First cut it into segments at each image
# line: a segment is the text up to an image (or a run of images) plus those
# images. A Discord message's content field is capped at 2000 chars, so each
# segment's text is then chunked at line boundaries, staying under 1900 to
# leave headroom, and any single line that is itself too long is hard-wrapped.
# When a chunk would end on a header line, that header is carried over to
# start the next chunk instead. The segment's last chunk carries its images.
# The output is a list of {content, images: [{alt, url}]}.
jq -n \
  --arg title "$TITLE" \
  --rawfile summary summary.md \
  --argjson max 1900 \
  --arg image_line "$IMAGE_LINE" \
  '
    def chunk($limit):
      reduce (./"\n")[] as $line ({chunks: [], cur: ""};
        (if ($line | length) == 0 then [""]
         else ($line | [while(length > 0; .[$limit:]) | .[:$limit]]) end) as $parts
        | reduce $parts[] as $p (.;
            if (.cur | length) == 0 then .cur = $p
            elif ((.cur | length) + 1 + ($p | length)) <= $limit
              then .cur = .cur + "\n" + $p
            else
              (.cur / "\n") as $ls
              | if ($ls | length) > 1 and ($ls[-1] | startswith("#"))
                   and (($ls[-1] | length) + 1 + ($p | length)) <= $limit
                then .chunks += [$ls[:-1] | join("\n")] | .cur = $ls[-1] + "\n" + $p
                else .chunks += [.cur] | .cur = $p
                end
            end))
      | .chunks + (if (.cur | length) > 0 then [.cur] else [] end);
    def image_line:
      [match($image_line) | .captures | {alt: .[0].string, url: .[1].string}]
      | first;
    def blank: test("^\\s*$");
    # Blank lines between an image and the next text are dropped: the
    # message break already separates them.
    (($title + "\n\n" + $summary) / "\n")
    | reduce .[] as $line ([{lines: [], images: []}];
        ($line | image_line) as $img
        | if $img != null then .[-1].images += [$img]
          elif (.[-1].images | length) == 0 then .[-1].lines += [$line]
          elif ($line | blank) then .
          else . + [{lines: [$line], images: []}]
          end)
    | map(
        (.lines | until(length == 0 or (.[-1] | blank | not); .[:-1]) | join("\n")) as $text
        | ($text | chunk($max)) as $chunks
        | .images as $images
        | ($chunks[:-1] | map({content: ., images: []}))
          + [{content: $chunks[-1], images: $images}])
    | add
  ' > "$WORK_DIR/messages.json"

# Download one image to the given path, following redirects (GitHub's
# user-attachments URLs redirect to signed storage). Prints
# "<filename>\t<content type>" on success. On failure it prints a
# warning and nothing else, so a broken image is skipped and never fails the
# post. The filename comes from the URL, with the extension taken from the
# content type, since user-attachments URLs have none and Discord only shows
# a file inline when its name has an image extension.
download_image() {
  local url="$1" dest="$2" type ext stem
  if ! type=$(curl -fsSL --max-filesize "$MAX_FILE_BYTES" -o "$dest" \
      -w '%{content_type}' "$url"); then
    echo "::warning::Skipped an image that failed to download: $url" >&2
    return 0
  fi
  type="${type%%;*}"
  case "$type" in
    image/png) ext=png ;;
    image/jpeg) ext=jpg ;;
    image/gif) ext=gif ;;
    image/webp) ext=webp ;;
    *)
      echo "::warning::Skipped an image with content type '$type': $url" >&2
      return 0
      ;;
  esac
  stem="${url%%[?#]*}"
  stem="${stem##*/}"
  stem="${stem%.*}"
  stem=$(printf '%s' "$stem" | tr -c 'A-Za-z0-9._-' '_')
  printf '%s\t%s\n' "${stem:-image}.$ext" "$type"
}

# Post one message per entry, in order. Each is sent as multipart/form-data:
# payload_json holds the content and lists the attachments by id, and
# files[n] holds the bytes of attachment n. With ?wait=true Discord returns
# HTTP 200 and the created message; on rejection it returns a 4xx with an
# error body. curl does not fail on an error status, so check it explicitly;
# otherwise a rejected post leaves the job green and the failure goes
# unnoticed. allowed_mentions.parse = [] keeps a summary from ever pinging
# @everyone, roles, or users. flags = 4 is SUPPRESS_EMBEDS: the PR links stay
# clickable but Discord does not unfurl them into GitHub preview cards that
# bury the summary.
COUNT=$(jq 'length' "$WORK_DIR/messages.json")
i=0
while IFS= read -r MESSAGE; do
  i=$((i + 1))

  # Download this message's images, keeping the ones that arrive. Attachment
  # n is both files[n] in the form and {id: n, filename, description} in
  # payload_json, where the description is the image's caption (Discord's alt
  # text).
  FORM=(-F "payload_json=<$WORK_DIR/payload.json;type=application/json")
  ATTACHMENTS='[]'
  n=0
  while IFS=$'\t' read -r URL ALT; do
    if [ "$n" -ge "$MAX_FILES" ]; then
      echo "::warning::Skipped an image past Discord's $MAX_FILES-file limit: $URL" >&2
      continue
    fi
    FILE=$(download_image "$URL" "$WORK_DIR/image-$i-$n")
    if [ -z "$FILE" ]; then
      continue
    fi
    IFS=$'\t' read -r NAME TYPE <<< "$FILE"
    FORM+=(-F "files[$n]=@$WORK_DIR/image-$i-$n;filename=$NAME;type=$TYPE")
    ATTACHMENTS=$(jq -c --argjson id "$n" --arg filename "$NAME" --arg description "$ALT" \
      '. + [{id: $id, filename: $filename, description: $description}]' <<< "$ATTACHMENTS")
    n=$((n + 1))
  done < <(jq -r '.images[] | [.url, .alt] | @tsv' <<< "$MESSAGE")

  jq -n \
    --argjson message "$MESSAGE" \
    --argjson attachments "$ATTACHMENTS" \
    '{
      content: $message.content,
      allowed_mentions: {parse: []},
      flags: 4,
      attachments: $attachments
    }' > "$WORK_DIR/payload.json"

  if [ "$DRY_RUN" = "1" ]; then
    echo "===== Message $i/$COUNT ($(jq '.content | length' "$WORK_DIR/payload.json") chars, $n attachment(s)) ====="
    jq -r '.content' "$WORK_DIR/payload.json"
    jq -r '.attachments[] | [.id, .filename, .description] | @tsv' "$WORK_DIR/payload.json" \
      | while IFS=$'\t' read -r id name alt; do
          echo "----- attachment $id: $name ($(wc -c < "$WORK_DIR/image-$i-$id" | tr -d ' ') bytes) caption: \"$alt\""
        done
    continue
  fi

  HTTP_CODE=$(curl -sS -X POST "$DISCORD_WEBHOOK_URL?wait=true" \
    "${FORM[@]}" \
    -w "%{http_code}" -o "$WORK_DIR/discord_response.txt")
  RESPONSE=$(cat "$WORK_DIR/discord_response.txt")
  echo "Discord responded HTTP $HTTP_CODE for message $i/$COUNT ($n attachment(s))"

  if [ "${HTTP_CODE:0:1}" != "2" ]; then
    echo "::error::Discord rejected the weekly summary (HTTP $HTTP_CODE): $RESPONSE"
    exit 1
  fi
  # Stay clear of the webhook rate limit between messages.
  if [ "$i" -lt "$COUNT" ]; then
    sleep 1
  fi
done < <(jq -c '.[]' "$WORK_DIR/messages.json")

if [ "$DRY_RUN" = "1" ]; then
  echo "✅ Dry run: $COUNT message(s) would be posted to Discord."
else
  echo "✅ Weekly summary posted to Discord ($COUNT message(s))."
fi
