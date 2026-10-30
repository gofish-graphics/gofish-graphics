# Visual Snapshot Testing

DOM snapshot testing for GoFish Graphics, replacing Chromatic with a free, self-hosted system. Captures rendered DOM from every Storybook story, compares against checked-in baselines, and generates an HTML diff report on failure.

## Quick Start

```bash
# Install deps (if not done)
pnpm install
npx playwright install chromium

# Capture snapshots and compare against baselines
pnpm test:visual:js

# Accept current output as the new baselines
pnpm test:visual:update
```

## How It Works

### Batch Capture (no Storybook build required)

Instead of building a static Storybook and navigating Playwright to each story URL, the system uses a **Vite dev server** that imports all story modules via `import.meta.glob`. Each story renders in a fresh browser context that loads the runner page and calls the story's `render()` function directly, so no state leaks from one story to the next. Stories are captured concurrently, a few contexts at a time in one browser (default `min(4, cores)`, override with `CAPTURE_CONCURRENCY`). Logs and outputs are in story order either way.

### Pipeline

```
stories/**/*.stories.tsx
        │
        ▼
   Vite dev server (stories-runner.ts)
        │
        ▼  Playwright renders each story, extracts innerHTML
        │
   Normalize DOM (round floats, stable IDs, sort attrs)
        │
        ├──► tmp/js/<path>.html           (normalized DOM)
        ├──► tmp/js/<path>.warnings.txt   (layout warnings + console errors)
        └──► tmp/js/<path>.png            (screenshot)
                    │
          ┌─────────┴──────────────────────┐
          ▼                                ▼
  compare.ts: diff against        compare-python.ts: diff
  __snapshots__/dom/              tmp/python/ against tmp/js/
          │                                │
      ┌───┴───┐                        ┌───┴───┐
    pass     fail                    pass     fail
              │
              ▼
       diff-report.html
```

The regression check compares the JS capture against the accepted baselines. The parity check compares the Python capture against the JS capture of the same commit, not against the baselines, so it does not depend on whether a JS change has been reviewed yet.

### Warnings

A story's warnings are part of its snapshot. They are every line the story printed to the browser console that says something is wrong: each layout warning (a `[gofish:layout]` line, see `packages/gofish-graphics/src/ast/layoutWarnings.ts`), each `console.error` and each uncaught page error. The capture writes them, sorted, one per line, to `<path>.warnings.txt` next to `<path>.html`. The file is written even when it is empty. Only the first line of a message is kept, with the dev server's port and cache-busting query strings removed, so two captures of the same story agree. The snapshot branch stores the file next to the DOM baseline in `dom/`, and an accept copies it with the DOM and the screenshot (`scripts/story-warnings.ts`).

A change in a story's warnings is a regression to review, like a DOM change, even when the DOM is identical. A baseline recorded before warnings were captured has no warnings file. Its warnings are "unrecorded", which is not a diff on its own, so such a story does not fail. When the story is a diff for another reason, the review shows its current warnings as the new baseline that accepting it records. `snapshots/main` gets every story's warnings file on the first push to main after this change, since that push accepts every capture.

### DOM Normalization

Both JS and Python DOM go through identical normalization (`scripts/normalize-dom.ts`):

1. **Strip wrapper markup** — remove `initializeContainer()`'s `margin: 20px` div
2. **Round floats** — SVG attributes (`x`, `y`, `width`, `height`, `transform`, `d`) rounded to 4 decimal places
3. **Normalize IDs** — replace generated UUIDs/counters with sequential `__id0__`, `__id1__`, etc.
4. **Sort attributes** — alphabetical order per element
5. **Normalize whitespace** — consistent formatting

## Commands

| Command                       | Description                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `pnpm test:visual:js`         | Capture JS snapshots and compare against baselines                           |
| `pnpm test:visual:update`     | Capture and accept as new baselines                                          |
| `pnpm test:visual`            | Full test: JS capture + Python capture + compare                             |
| `pnpm test:visual:python`     | Capture Python snapshots and compare against the JS capture (needs tmp/js/)  |
| `pnpm test:visual:check-sync` | Check that changed JS stories have updated Python equivalents                |
| `pnpm capture-diff <ref>`     | Diff HEAD's rendered DOM and warnings against `<ref>` — no baselines, any OS |

## Local regression signal: `capture-diff`

`pnpm test:visual:js` only gives a pass/fail _in CI_ — the baselines live on a
snapshot branch and `update-baselines` must not be run on Mac (text-metric drift
vs CI Linux produces false regressions for every text-bearing story). So locally
there is no pass/fail signal for a layout change.

`capture-diff` fills that gap. It answers **"did my change move anything I didn't
intend?"** by capturing the normalized DOM of every story twice — once from the
current worktree (HEAD) and once from a throwaway git worktree checked out at a
base ref — and diffing the two per story. It diffs each story's warnings
too (see [Warnings](#warnings)): a story whose warnings changed has changed,
even when its DOM is identical. Both captures use the current
worktree's capture tooling (`tests/harness/` and `tests/scripts/`), so only the
library and the stories come from the base ref:

```bash
pnpm capture-diff main          # whole suite vs main
pnpm capture-diff HEAD~1        # vs the previous commit
pnpm capture-diff main bar      # only stories matching "bar" (faster)
pnpm capture-diff main streamgraph
```

The diff is over **normalized geometry/DOM, not rasterized pixels**, so it is
platform-stable — no baseline curation, works on any OS, and doesn't suffer the
text-metric drift that makes `update-baselines` unusable locally. The optional
second argument is a case-insensitive substring filter (matched against
`title/name` or story id) so you can scope to one story or a group.

Output:

```
tests/tmp/capture-diff/head/<path>.html           normalized DOM at HEAD
tests/tmp/capture-diff/head/<path>.warnings.txt   its warnings
tests/tmp/capture-diff/base/...                   the same at <ref>
tests/tmp/capture-diff/report.html                DOM diff and warnings diff (changed stories)
```

It prints the changed/added/removed stories, with the warnings lines each one
gained or lost, and exits non-zero when anything moved (a warnings-only change
counts), so it can gate an agent's inner loop. The base capture installs deps in
the temp worktree (`pnpm install --ignore-scripts`, mostly links from the shared
pnpm store) and is torn down automatically. Requires Playwright's chromium
(`npx playwright install chromium`).

## Developer Workflows

### Adding a new story

```bash
# 1. Write the JS story
vim packages/gofish-graphics/stories/forwardsyntax/Bar/BarNew.stories.tsx

# 2. Capture and accept baselines
pnpm test:visual:update

# 3. Write the Python equivalent
vim tests/python-stories/forwardsyntax/test_bar_new.py

# 4. Verify everything passes
pnpm test:visual:js

# 5. Commit (story + baselines)
git add .
```

### Intentional change (bug fix, feature)

```bash
# 1. Make the code change
vim packages/gofish-graphics/src/ast/shapes/rect.ts

# 2. Run tests — they fail showing what changed
pnpm test:visual:js
# "1 regression(s) detected. See tests/tmp/diff-report.html"

# 3. Review the HTML diff report (side-by-side before/after screenshots)
open tests/tmp/diff-report.html

# 4. If correct, accept new baselines
pnpm test:visual:update

# 5. Verify
pnpm test:visual:js
```

### Unintentional regression

```bash
# CI fails → download diff report artifact, or run locally:
pnpm test:visual:js
open tests/tmp/diff-report.html
# See before/after screenshots → fix the bug → re-run (should pass against existing baselines)
```

### CI

The `Visual Tests` workflow splits the work into these jobs:

- `js-capture` captures every story once (the slow part). It runs as a matrix of shards on parallel runners (`capture-js-dom.ts --shard i/N`), each uploading a `js-dom-capture-<i>` artifact; the job's comment in `visual-tests.yml` says how they merge.
- `python-capture` captures the Python stories at the same time, and uploads `tests/tmp/python/` as the `python-dom-capture` artifact.
- `visual-test` downloads the JS capture and runs `compare.ts --js-only` against the snapshot baselines. On failure it deploys the review site. For every story it lists, the review site shows the story's warnings before and after, with added and removed lines highlighted; the panel is open when the warnings changed and collapsed when they are unchanged. The "Warnings only" filter lists the stories whose DOM is identical and only their warnings changed. Accepting diffs there sends only the run id and the accepted story paths, as a `visual-baselines-accept` repository_dispatch. The `Accept Visual Baselines` workflow (`accept-visual-baselines.yml`) has two jobs. The `accept` job runs `scripts/accept-baselines.ts`. It first checks that the run is a Visual Tests run of that branch in this repository, and only then marks the PR's `Visual Diff Review` status as pending. It copies the accepted files from the run's `js-dom-capture-<i>` artifacts to `snapshots/<branch>` in one commit, through the same writer (`commitToSnapshotBranch` in `snapshot-branch.ts`) that updates `snapshots/main` after a merge. An accept that finds the branch moved is redone on top of the new head. A full update of `snapshots/main` fails instead, so older captures never overwrite newer baselines. The `rerun` job waits for the original run to finish, since GitHub refuses to rerun jobs while any job of the run is still in progress, and then re-runs its failed jobs. That re-runs only this job, which reuses the capture from the first attempt instead of capturing again. You can accept by hand too: `pnpm --filter @gofish/tests accept-baselines <run-id> <branch> --all [--dry-run]`, or `--accept-file`/`--remove-file` with one story path per line (absolute paths, since the command runs in `tests/`). `--all` accepts exactly the diffs the run reported, which are the ones its review site lists. The diff report writes that list to `diff-list.json`, which CI uploads in the `visual-diff-report` artifact next to `diff-report.html`. `--all` fails if the file is missing.
- `python-parity` downloads both captures and runs `compare-python.ts` on them. It runs at the same time as `visual-test` and does not wait on the visual review.

#### Which baselines a branch gets

Baselines live on snapshot branches: `snapshots/main`, which CI updates after every push to main, and `snapshots/<branch>`, which the first accept on a PR creates as a branch of `snapshots/main`. The baselines for a branch are the current `snapshots/main`, plus only the files `snapshots/<branch>` changed since it forked from `snapshots/main`. A file it added or modified is taken from `snapshots/<branch>`, and a file it deleted is deleted. So a PR that accepted some diffs still sees every later change to main, and does not report those changes as regressions. If main later changes a story the branch accepted too, the branch's version wins, and the story shows as a diff to accept again, because the accept was made against an older render. A branch with no `snapshots/<branch>` gets `snapshots/main` as it is.

One function applies this rule, `checkoutBaselines` in `scripts/snapshot-branch.ts`. The reader, `pullSnapshots`, uses it for `compare.ts` and the local review server. The writer, `commitToSnapshotBranch`, builds each commit on the same baselines (an accept, or the update of `snapshots/main` after a merge) and gives the commit both heads as parents, so the fork point moves up to the `snapshots/main` the accept was made on. A snapshot branch made by an older version of this script has no parent. Its fork point is the `snapshots/main` commit that was current when the branch's first commit was made, which is the tree that version copied, and its next accept records `snapshots/main` as a parent.

The `Prune Snapshot Branches` workflow (`prune-snapshot-branches.yml`) runs daily and deletes `snapshots/<branch>` 30 days after the last PR from `<branch>` was closed or merged, as long as no PR from it is open. A snapshot branch with no PR at all is deleted when `<branch>` itself is gone and its last commit is 30 days old. It never deletes `snapshots/main`. A manual run from the Actions tab is a dry run unless you untick `dry_run`, and logs what it would delete and why.

## Python Parity

Every Storybook story should have a Python equivalent in `tests/python-stories/` that produces identical DOM. The Python API calls into the same JS rendering engine via IR, so DOM output should match exactly.

### Python story format

```python
# tests/python-stories/forwardsyntax/test_bar_basic.py
from gofish import chart, spread, rect
from python_stories.data import SEAFOOD

def story_default():
    return (
        chart(SEAFOOD)
        .flow(spread("lake", dir="x"))
        .mark(rect(h="count")),
        {"w": 400, "h": 400, "axes": True},
    )
```

Stories with `derive()` (and lambda accessors and mark functions) use a Python HTTP server (`scripts/derive-server.py`) that executes the Python functions during rendering. The harness page (`harness/main.ts`) renders the IR through the same deserializer the notebook widget uses (`Serialize.renderIR`); only its `DeriveBridge` differs, sending rows over HTTP instead of AnyWidget RPC.

### Sync enforcement

`pnpm test:visual:check-sync` checks that when a JS story changes in a PR, the corresponding Python story is also updated. Stories listed in `tests/.python-sync-exempt` are excluded: a whole file, or one export (`file::Export`), in which case a change confined to exempt exports needs no Python update.

## Directory Structure

```
tests/
  scripts/
    capture-core.ts            # Shared headless-capture engine (Vite + Playwright)
    capture-js-dom.ts          # Batch capture via Vite + Playwright
    capture-diff.ts            # Diff HEAD's DOM vs a base ref (local regression signal)
    capture-one.ts             # Capture one story (or a filter) to tmp/iterate/ for the iterate-example loop
    capture-python-dom.ts      # Python story capture via harness
    compare.ts                 # Compare JS vs baselines (+ Python vs JS unless --js-only)
    compare-python.ts          # Compare Python vs the JS capture (CI parity gate)
    update-baselines.ts        # Accept current snapshots as baselines
    accept-baselines.ts        # Accept a CI run's captured diffs onto snapshots/<branch>
    diff-report.ts             # Generate HTML diff report
    normalize-dom.ts           # DOM normalization pipeline
    derive-server.py           # Python derive function HTTP server
    check-python-sync.sh       # Git-based JS↔Python sync checker
  harness/
    stories-runner.html/ts     # Batch story runner (import.meta.glob)
    index.html / main.ts       # Python story page: HTTP DeriveBridge + Serialize.renderIR
    vite.config.ts             # Shared Vite config (SolidJS + gofish alias)
  python-stories/
    data.py                    # Shared datasets (mirrors src/data/)
    forwardsyntax/             # Python equivalents of forward syntax stories
    vega_lite/                 # Python equivalents of vega-lite stories
  .python-sync-exempt          # Stories exempt from Python parity
__snapshots__/
  dom/                         # Checked-in DOM baselines (text, diffable in PRs)
  screenshots/                 # Checked-in PNGs (for diff reports)
```
