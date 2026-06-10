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

Instead of building a static Storybook and navigating Playwright to each story URL, the system uses a **Vite dev server** that imports all story modules via `import.meta.glob`. A single Playwright page loads the runner, then renders each story in sequence by calling its `render()` function directly — no page navigation between stories. This makes capture very fast (~76 stories in a few seconds).

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
        ├──► tmp/js/<path>.html   (normalized DOM)
        └──► tmp/js/<path>.png    (screenshot)
                    │
                    ▼
        compare.ts: diff against __snapshots__/dom/
                    │
                ┌───┴───┐
              pass     fail → diff-report.html
```

### DOM Normalization

Both JS and Python DOM go through identical normalization (`scripts/normalize-dom.ts`):

1. **Strip wrapper markup** — remove `initializeContainer()`'s `margin: 20px` div
2. **Round floats** — SVG attributes (`x`, `y`, `width`, `height`, `transform`, `d`) rounded to 4 decimal places
3. **Normalize IDs** — replace generated UUIDs/counters with sequential `__id0__`, `__id1__`, etc.
4. **Sort attributes** — alphabetical order per element
5. **Normalize whitespace** — consistent formatting

## Commands

| Command                       | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `pnpm test:visual:js`         | Capture JS snapshots and compare against baselines              |
| `pnpm test:visual:update`     | Capture and accept as new baselines                             |
| `pnpm test:visual`            | Full test: JS capture + Python capture + compare                |
| `pnpm test:visual:check-sync` | Check that changed JS stories have updated Python equivalents   |
| `pnpm capture-diff <ref>`     | Diff HEAD's rendered DOM against `<ref>` — no baselines, any OS |

## Local regression signal: `capture-diff`

`pnpm test:visual:js` only gives a pass/fail _in CI_ — the baselines live on a
snapshot branch and `update-baselines` must not be run on Mac (text-metric drift
vs CI Linux produces false regressions for every text-bearing story). So locally
there is no pass/fail signal for a layout change.

`capture-diff` fills that gap. It answers **"did my change move anything I didn't
intend?"** by capturing the normalized DOM of every story twice — once from the
current worktree (HEAD) and once from a throwaway git worktree checked out at a
base ref — and diffing the two per story:

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
tests/tmp/capture-diff/head/<path>.html   normalized DOM at HEAD
tests/tmp/capture-diff/base/<path>.html   normalized DOM at <ref>
tests/tmp/capture-diff/report.html        side-by-side DOM diff (changed stories)
```

It prints the changed/added/removed stories and exits non-zero when anything
moved, so it can gate an agent's inner loop. The base capture installs deps in
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

Stories with `derive()` use a Python HTTP server (`scripts/derive-server.py`) that executes the Python functions during rendering, mirroring the AnyWidget RPC architecture.

### Sync enforcement

`pnpm test:visual:check-sync` checks that when a JS story changes in a PR, the corresponding Python story is also updated. Stories listed in `tests/.python-sync-exempt` are excluded.

## Directory Structure

```
tests/
  scripts/
    capture-core.ts            # Shared headless-capture engine (Vite + Playwright)
    capture-js-dom.ts          # Batch capture via Vite + Playwright
    capture-diff.ts            # Diff HEAD's DOM vs a base ref (local regression signal)
    capture-python-dom.ts      # Python story capture via harness
    compare.ts                 # Compare JS vs baselines + Python vs JS
    update-baselines.ts        # Accept current snapshots as baselines
    diff-report.ts             # Generate HTML diff report
    normalize-dom.ts           # DOM normalization pipeline
    derive-server.py           # Python derive function HTTP server
    check-python-sync.sh       # Git-based JS↔Python sync checker
  harness/
    stories-runner.html/ts     # Batch story runner (import.meta.glob)
    index.html / main.ts       # IR rendering harness for Python stories
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
