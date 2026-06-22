---
title: Three Surfaces
section: Design Evolution
order: 10
status: draft
covers:
  - packages/gofish-graphics/src/lib.ts
---

# Three Surfaces, One Tree

`src/lib.ts` exports three different surfaces for writing the same chart. The
rest of the wiki treats only the latest of them — the `chart(...).flow(...)
.mark(...)` fluent builder — as _the_ frontend. This essay is the place where
the other two are still spoken about, and where the history of how the API
landed where it did is recorded.
The module also re-exports a few lodash data helpers (`groupBy`, `sumBy`,
`orderBy`, `meanBy`) for convenience; those are implemented with per-helper
entrypoint imports so the public surface is stable in native ESM runtimes.

A naming note before anything else: internally, these surfaces were "v1",
"v2", and "v3", and a lot of code still uses those names. The wiki has
otherwise retired the version-numbered framing — it papered over the fact that
all three desugar onto the same core AST, and made the newest surface sound
provisional in a way it isn't. They are three _surfaces_ over one core, not
three _versions_ of a library that supersedes itself.

Casing is the user-visible seam between the surfaces. The capitalized,
component-style surface owns the capitalized names (`Rect`, `Stack`, `Layer`,
…), so the fluent builder is deliberately lowercase-only: its entry point is
`chart`, with no capitalized `Chart` alias — that alias was removed to keep
the casing convention unambiguous (capital `Layer`, for instance, still
exports, but only as the capitalized-surface combinator, distinct from the
fluent builder's `.layer()` method). The fluent surface also carries the
operators used inside `.flow(...)` — `spread`, `stack`, `scatter`, `group`,
`derive`, and `resolve` (the last dereferences reference columns into drawn
node refs, driving the ribbon / node-link / labeling patterns via
`.layer()` + `resolve`).

## Planned contents

- The three surfaces side by side — the same chart in each.
- What each surface was reacting to; the lesson the next one carried forward.
- The fluent builder as the recommended surface, and how the other two desugar
  onto the same AST.
- The migration story, and what (if anything) is planned for the older
  surfaces.

## Source

`covers:` is `packages/gofish-graphics/src/lib.ts`. After editing, run
`pnpm --filter docs sync-backlinks` to regenerate the `@wiki` comment.
