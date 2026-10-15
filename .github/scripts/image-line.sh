#!/bin/bash
# Sourced by check-summary.sh and post-to-discord.sh, so both read the
# summary's screenshots the same way, and by the scripts that run prs.jq, so
# it only lists URLs a screenshot line can carry.
#
# The regexes are POSIX EREs with POSIX classes only, so bash's =~ and jq's
# regexes (Oniguruma, reading them from the environment) match exactly the
# same text.

# A URL a screenshot line can carry: http(s), with no ")" (it would end the
# markup) and no whitespace. prs.jq lists only such URLs, so every one it
# lists round-trips through ![alt](url) and IMAGE_LINE.
export IMAGE_URL='https?://[^)[:space:]]+'

# A screenshot is a line holding only ![caption](url), the shape the prompt
# asks for. check-summary.sh vets its URL and post-to-discord.sh turns it into
# an attachment. Group 1 is the caption and group 2 the URL.
export IMAGE_LINE="^[[:space:]]*!\\[([^]]*)\\]\\((${IMAGE_URL})\\)[[:space:]]*\$"

# Image markup anywhere in a line. check-summary.sh removes every match that
# is not a whole IMAGE_LINE, so the summary shows no image it did not vet.
export IMAGE_MARKUP='!\[[^]]*\]\([^)]*\)'
