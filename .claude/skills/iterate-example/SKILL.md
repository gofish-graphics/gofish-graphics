---
name: iterate-example
description: Render a GoFish Storybook example to an image, look at it, and fix mistakes in a feedback loop. Use when authoring or debugging a chart example/story and you want to visually verify and refine the output (not just edit the code blind).
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
---

# Iterate on a GoFish example

Author/refine a chart example by actually **looking** at the rendered output and
fixing what's wrong — instead of editing the `.stories.tsx` blind and stopping.

The enabling primitive is `tests/scripts/capture-one.ts`: it renders a single
Storybook story headlessly and writes a PNG you can `Read`.

## Prerequisites (check once per session)

1. `node_modules` present — if pre-commit/dev tooling is broken, run `pnpm install`.
2. `packages/gofish-graphics/dist/` exists — the render harness eagerly imports
   every story, and one regression story imports the built `dist/`. If `dist/` is
   missing the harness fails to initialize. If a capture errors with
   "Stories runner failed to initialize", run `pnpm --filter gofish-graphics build`
   once. You do **not** need to rebuild after editing `src/` — the harness aliases
   `gofish-graphics` to live `src/lib.ts`, so source and story edits are picked up
   on the next capture automatically.

## The loop

1. **Identify the target story and the intent.** The user does **not** need to give
   an exact story id — a freeform description is fine (e.g. `/iterate-example
   implement a pulley diagram` or "fix the scatter example"). Resolve it to a story:
   - **Existing story:** any substring works — `capture-one` matches case-insensitively
     against `Title/StoryName`, so `"pulley"` or `"scatter"` is enough. If the
     description is ambiguous, run `pnpm --filter @gofish/tests capture-one` with no
     argument to list stories and pick the best match (confirm with the user if
     genuinely unclear).
   - **New example that doesn't exist yet** (e.g. "implement a pulley diagram"):
     first **author the story** — add a `.stories.tsx` under
     `packages/gofish-graphics/stories/` (follow a sibling story's structure: a
     default `meta` with a `title`, and a named export with a `render`). Then iterate
     on it with the loop below.

   Either way, pin down what the chart is *supposed* to show before capturing — that
   intent is what you critique the rendered image against.

2. **Capture it.**

   ```bash
   pnpm --filter @gofish/tests capture-one "<substring>"
   ```

   The substring is matched case-insensitively against `Title/StoryName`
   (e.g. `"bar/grouped"`, `"scatter"`). It prints the PNG path(s) it wrote under
   `tests/tmp/iterate/`. Watch the command output for `FAILED:` lines and
   `[browser]` console errors — a render-time exception is itself a finding to fix.

3. **Look at it.** `Read` the printed PNG path. Also `Read` the sibling `.html`
   (normalized DOM/SVG) when you need exact coordinates, sizes, or to confirm an
   element rendered at all.

4. **Critique against intent + a chart-quality checklist:**
   - Does it match what the example is meant to demonstrate?
   - Marks overlapping, clipped, or escaping the frame; zero/negative sizes.
   - Axes: correct domain/range, sensible ticks, no overlap, readable labels.
   - Encodings: right channel for the data (size/pos/color/raw); legible color.
   - Spacing, alignment, empty space, aspect ratio.
   - Empty render or console errors (a blank PNG usually means a thrown error).

5. **Fix.** Edit the story, or the library source under
   `packages/gofish-graphics/src/` if the bug is in the engine. Keep changes
   minimal and in the surrounding style.

6. **Re-capture and re-look.** Repeat steps 2–5 until the chart matches intent or
   you've made ~5 passes with no further improvement. If you stall, say what's
   still off rather than declaring success.

7. **Report.** Summarize what you changed and show the final image. Note any
   issue you believe is a library bug rather than an example mistake.

## Notes

- This is **visual-judgment** review of a (possibly new) example — it does not
  diff against a baseline. Pixel-diff regression testing is the separate
  `pnpm test:visual` flow; do not run `update-baselines` here (baselines are
  CI-Linux-specific and drift on Mac).
- `capture-one` uses Vite port 3002, so it won't collide with a running
  `pnpm storybook` (6006) or the full `capture-js` harness (3001).
- If the user is also running `pnpm storybook`, they can watch the same story
  live in the browser while you iterate; the capture is just how *you* see it.
