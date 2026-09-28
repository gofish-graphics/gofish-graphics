#!/usr/bin/env bash
# Accept visual-test diffs as new baselines, using the files a CI run captured.
#
# Downloads the `js-dom-capture` artifact of a Visual Tests run (it holds
# <story>.html and <story>.png for every story, under tests/tmp/js in CI),
# copies the accepted stories into the snapshot branch `snapshots/<branch>`,
# deletes the baselines of accepted removals, and pushes ONE commit. On the
# snapshot branch the files live at dom/<story>.html and
# screenshots/<story>.png; PNGs are stored with Git LFS (.gitattributes).
#
# If `snapshots/<branch>` does not exist yet, the new branch starts as an
# orphan commit whose tree is snapshots/main's tree plus the accepted
# changes, so the PR branch inherits every other baseline.
#
# The `accept-visual-baselines.yml` workflow runs this when someone clicks
# Accept on the review site. You can also run it locally; it needs `gh`
# (authenticated), `git`, `git-lfs` and (for --all) `jq`, and must run inside a clone of
# the repository. Files always come from the CI run, never from a local
# capture, so baselines are never rendered on a developer machine.
#
# Usage:
#   tests/scripts/accept-baselines.sh <run-id> <branch> --all
#   tests/scripts/accept-baselines.sh <run-id> <branch> \
#       [--accept-file FILE] [--remove-file FILE] [--dry-run]
#
#   <branch>        code branch of the run, e.g. "my-feature" (not "snapshots/...")
#   --all           accept exactly the diffs the run reported, as its review
#                   site lists them: its regressions and new stories, and its
#                   removed stories (whose baselines are deleted). The list is
#                   diff-list.json in the run's `visual-diff-report` artifact;
#                   the script fails if it is missing (older runs) or invalid
#   --accept-file   file with one story path per line (e.g. "forward-syntax/bar--basic.html")
#   --remove-file   file with one story path per line whose baseline to delete
#   --dry-run       build the commit but do not push it
#
# Environment:
#   GH_REPO         owner/repo (default: the repository `gh` resolves here)
#
# Outputs (appended to $GITHUB_OUTPUT when set): commit, accepted, removed.

set -euo pipefail

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
  exit 2
}

[ $# -ge 2 ] || usage
RUN_ID=$1
BRANCH=$2
shift 2

ALL=0
DRY_RUN=0
ACCEPT_FILE=""
REMOVE_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --all) ALL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --accept-file) ACCEPT_FILE=$2; shift ;;
    --remove-file) REMOVE_FILE=$2; shift ;;
    -h | --help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
  shift
done

if ! [[ "$RUN_ID" =~ ^[0-9]+$ ]]; then
  echo "error: run id must be numeric, got '$RUN_ID'" >&2
  exit 1
fi
if ! git check-ref-format --branch "$BRANCH" > /dev/null 2>&1; then
  echo "error: invalid branch name '$BRANCH'" >&2
  exit 1
fi
if [ "$ALL" = 1 ] && { [ -n "$ACCEPT_FILE" ] || [ -n "$REMOVE_FILE" ]; }; then
  echo "error: --all cannot be combined with --accept-file/--remove-file" >&2
  exit 1
fi
if [ "$ALL" = 0 ] && [ -z "$ACCEPT_FILE" ] && [ -z "$REMOVE_FILE" ]; then
  echo "error: pass --all, --accept-file or --remove-file" >&2
  exit 1
fi

# PNGs must go through the LFS filter that the snapshot branch's
# .gitattributes names; without git-lfs they would be committed as raw blobs.
if ! git lfs version > /dev/null 2>&1; then
  echo "error: git-lfs is not installed (run 'git lfs install')" >&2
  exit 1
fi

REPO=${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
export GH_REPO=$REPO
SNAP_BRANCH="snapshots/$BRANCH"
REPO_ROOT=$(git rev-parse --show-toplevel)

# Only accept files from a Visual Tests run of this same branch, so a request
# can never copy one branch's capture onto another branch's baselines.
read -r RUN_WORKFLOW RUN_BRANCH < <(
  gh api "repos/$REPO/actions/runs/$RUN_ID" --jq '[.path, .head_branch] | @tsv'
)
if [ "$RUN_WORKFLOW" != ".github/workflows/visual-tests.yml" ]; then
  echo "error: run $RUN_ID is from '$RUN_WORKFLOW', not the Visual Tests workflow" >&2
  exit 1
fi
if [ "$RUN_BRANCH" != "$BRANCH" ]; then
  echo "error: run $RUN_ID is for branch '$RUN_BRANCH', not '$BRANCH'" >&2
  exit 1
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/accept-baselines.XXXXXX")
WT="$WORK/snap"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WT" > /dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "Downloading js-dom-capture from run $RUN_ID..."
gh run download "$RUN_ID" --name js-dom-capture --dir "$WORK/capture"
CAPTURE="$WORK/capture"
# An empty capture means something went wrong upstream, not that every story
# was deleted; never mass-remove baselines on it.
if [ -z "$(find "$CAPTURE" -name '*.html' | head -1)" ]; then
  echo "error: the capture of run $RUN_ID contains no stories" >&2
  exit 1
fi

# A story path is relative, ends in .html, and never leaves its directory.
valid_path() {
  [[ "$1" == *.html && "$1" != /* && "/$1/" != */../* && "$1" != *$'\r'* ]]
}

read_list() {
  local file=$1
  [ -n "$file" ] || return 0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    if ! valid_path "$line"; then
      echo "error: invalid story path '$line' in $file" >&2
      exit 1
    fi
    printf '%s\n' "$line"
  done < "$file"
}

# Checks out the baseline to build on into $WT and sets PARENT (empty when
# the snapshot branch does not exist yet and the commit starts an orphan).
# PNGs are left as LFS pointers: only the accepted ones are rewritten.
checkout_base() {
  git -C "$REPO_ROOT" worktree remove --force "$WT" > /dev/null 2>&1 || true
  local base_ref
  if git -C "$REPO_ROOT" ls-remote --exit-code origin "refs/heads/$SNAP_BRANCH" > /dev/null; then
    base_ref=$SNAP_BRANCH
  elif git -C "$REPO_ROOT" ls-remote --exit-code origin "refs/heads/snapshots/main" > /dev/null; then
    base_ref=snapshots/main
  else
    echo "error: neither $SNAP_BRANCH nor snapshots/main exists" >&2
    exit 1
  fi
  git -C "$REPO_ROOT" fetch --quiet --no-tags origin "refs/heads/$base_ref"
  local base_sha
  base_sha=$(git -C "$REPO_ROOT" rev-parse FETCH_HEAD)
  GIT_LFS_SKIP_SMUDGE=1 git -C "$REPO_ROOT" worktree add --quiet --detach "$WT" "$base_sha"
  if [ "$base_ref" = "$SNAP_BRANCH" ]; then
    PARENT=$base_sha
    echo "Building on $SNAP_BRANCH at $base_sha."
  else
    PARENT=""
    echo "$SNAP_BRANCH does not exist; starting it from snapshots/main's tree ($base_sha)."
  fi
}

# Applies the accept and remove lists to $WT and creates the commit in
# COMMIT (empty when nothing changed).
build_commit() {
  local accepted=0 removed=0 p png
  local -a staged=()
  while IFS= read -r p; do
    if [ ! -f "$CAPTURE/$p" ]; then
      echo "error: $p is not in the capture of run $RUN_ID" >&2
      exit 1
    fi
    png="${p%.html}.png"
    mkdir -p "$(dirname "$WT/dom/$p")"
    cp "$CAPTURE/$p" "$WT/dom/$p"
    staged+=("dom/$p")
    if [ -f "$CAPTURE/$png" ]; then
      mkdir -p "$(dirname "$WT/screenshots/$png")"
      cp "$CAPTURE/$png" "$WT/screenshots/$png"
      staged+=("screenshots/$png")
    fi
    accepted=$((accepted + 1))
  done < "$WORK/accept.txt"
  while IFS= read -r p; do
    png="${p%.html}.png"
    git -C "$WT" rm --quiet --ignore-unmatch -- "dom/$p" "screenshots/$png"
    removed=$((removed + 1))
  done < "$WORK/remove.txt"
  if [ ${#staged[@]} -gt 0 ]; then
    # Paths go through a file so a long list never hits the argument limit.
    printf '%s\n' "${staged[@]}" > "$WORK/staged.txt"
    git -C "$WT" add --pathspec-from-file="$WORK/staged.txt"
  fi

  ACCEPTED=$accepted
  REMOVED=$removed
  COMMIT=""
  if git -C "$WT" diff --cached --quiet; then
    echo "Nothing to commit: the baselines already match."
    return
  fi

  local -a parts=()
  [ "$accepted" -gt 0 ] && parts+=("Accept $accepted visual diff(s)")
  [ "$removed" -gt 0 ] && parts+=("remove $removed stale baseline(s)")
  local message
  message=$(IFS=,; echo "${parts[*]}" | sed 's/,/, /g')

  local tree
  tree=$(git -C "$WT" write-tree)
  if [ -n "$PARENT" ]; then
    COMMIT=$(git -C "$WT" commit-tree "$tree" -p "$PARENT" -m "$message")
  else
    COMMIT=$(git -C "$WT" commit-tree "$tree" -m "$message")
  fi
  echo "Created $COMMIT: $message"
}

# --all: accept exactly the diffs the run reported. The diff report writes
# them to diff-list.json (uploaded in the `visual-diff-report` artifact) from
# collectReviewDiffs(), the same list the review site shows. Regressions and
# new stories are accepted; removed stories have their baselines deleted.
# Nothing is recomputed against the snapshot branch as it is now.
if [ "$ALL" = 1 ]; then
  echo "Downloading visual-diff-report from run $RUN_ID..."
  if ! gh run download "$RUN_ID" --name visual-diff-report --dir "$WORK/report"; then
    echo "error: run $RUN_ID has no visual-diff-report artifact (it reported no diffs, or the artifact expired)" >&2
    exit 1
  fi
  LIST="$WORK/report/diff-list.json"
  if [ ! -f "$LIST" ]; then
    echo "error: run $RUN_ID predates the machine-readable diff list (diff-list.json), so --all cannot tell what it reported; pass --accept-file/--remove-file instead" >&2
    exit 1
  fi
  if ! jq -e --arg run "$RUN_ID" \
    '(.runId == null or .runId == $run) and (.diffs | type == "array")' \
    "$LIST" > /dev/null; then
    echo "error: $LIST is not a diff list for run $RUN_ID" >&2
    exit 1
  fi
  UNKNOWN=$(jq -r '.diffs[] | select(.kind != "regression" and .kind != "new" and .kind != "removed") | "\(.kind) \(.path)"' "$LIST")
  if [ -n "$UNKNOWN" ]; then
    echo "error: the diff list has entries --all cannot accept:" >&2
    echo "$UNKNOWN" >&2
    exit 1
  fi
  ACCEPT_FILE="$WORK/reported-accept.txt"
  REMOVE_FILE="$WORK/reported-remove.txt"
  jq -r '.diffs[] | select(.kind == "regression" or .kind == "new") | .path' "$LIST" > "$ACCEPT_FILE"
  jq -r '.diffs[] | select(.kind == "removed") | .path' "$LIST" > "$REMOVE_FILE"
  echo "Run $RUN_ID reported $(wc -l < "$ACCEPT_FILE" | tr -d ' ') diff(s) to accept and $(wc -l < "$REMOVE_FILE" | tr -d ' ') removal(s):"
  sed 's/^/  accept: /' "$ACCEPT_FILE"
  sed 's/^/  remove: /' "$REMOVE_FILE"
fi

for attempt in 1 2 3 4 5; do
  checkout_base
  read_list "$ACCEPT_FILE" > "$WORK/accept.txt"
  read_list "$REMOVE_FILE" > "$WORK/remove.txt"
  build_commit

  if [ -z "$COMMIT" ] || [ "$DRY_RUN" = 1 ]; then
    [ "$DRY_RUN" = 1 ] && [ -n "$COMMIT" ] && git -C "$WT" show --stat --format='%H %s' "$COMMIT" | tail -5
    break
  fi

  # Upload the accepted PNGs' LFS objects first. The push itself does not
  # run the LFS pre-push hook when core.hooksPath points elsewhere (husky
  # does this), and pushing by object id uploads only the new screenshots
  # instead of every object the tree references (most of which are not
  # downloaded here).
  # (No mapfile: macOS ships bash 3.2.)
  OIDS=()
  while IFS= read -r f; do
    oid=$(git -C "$WT" cat-file -p ":$f" | sed -n 's/^oid sha256://p')
    [ -n "$oid" ] && OIDS+=("$oid")
  done < <(git -C "$WT" diff --cached --diff-filter=AM --name-only -- screenshots)
  if [ ${#OIDS[@]} -gt 0 ]; then
    git -C "$WT" lfs push --object-id origin "${OIDS[@]}"
  fi
  # A plain (non-force) push: if the branch moved since we fetched it, the
  # push is rejected and the loop rebuilds the commit on top of the new head.
  # GIT_LFS_SKIP_PUSH: the objects are already uploaded above, and the LFS
  # pre-push hook (when it runs) would try to push every object the tree
  # references, most of which are not downloaded here.
  if GIT_LFS_SKIP_PUSH=1 git -C "$WT" push origin "$COMMIT:refs/heads/$SNAP_BRANCH"; then
    echo "Pushed $COMMIT to $SNAP_BRANCH."
    break
  fi
  if [ "$attempt" = 5 ]; then
    echo "error: could not push to $SNAP_BRANCH after $attempt attempts" >&2
    exit 1
  fi
  echo "Push rejected; $SNAP_BRANCH moved. Retrying on top of it..."
  sleep $((attempt * 2))
done

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "commit=$COMMIT"
    echo "accepted=$ACCEPTED"
    echo "removed=$REMOVED"
  } >> "$GITHUB_OUTPUT"
fi
