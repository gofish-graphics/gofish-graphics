#!/bin/bash
# Sourced by check-summary.sh and post-to-discord.sh, so both read the
# summary's screenshots the same way.
#
# A screenshot is a line holding only ![caption](url), the shape the prompt
# asks for. check-summary.sh vets its URL and post-to-discord.sh turns it into
# an attachment. Group 1 is the caption and group 2 the URL. It is a POSIX ERE
# with POSIX classes only, so bash's =~ and jq's regexes (Oniguruma, passed in
# with --arg) match exactly the same lines.
export IMAGE_LINE='^[[:space:]]*!\[([^]]*)\]\(([^)[:space:]]+)\)[[:space:]]*$'
