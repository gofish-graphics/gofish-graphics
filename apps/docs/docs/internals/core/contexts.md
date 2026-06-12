---
title: The Context System
section: Core
order: 30
status: draft
---

# The Context System

GoFish threads several global contexts through the render passes rather than passing
them as explicit arguments everywhere. This essay will explain what each one holds and
when it is read and written.

## Planned contents

- `scopeContext` — variable scoping for named elements and references.
- `scaleContext` — color scales and axis/position scales.
- `keyContext` — tracking of named elements for axis labels and reference resolution (`ref` / `selectAll`).
- How contexts are established, nested, and torn down across the three passes.
- Why contexts (vs. threaded parameters) — and the tradeoffs.

## Source

Likely `covers:`: the context modules under `packages/gofish-graphics/src/ast/`. Add the
`covers:` frontmatter when writing this up, then run `pnpm --filter docs sync-backlinks`.
