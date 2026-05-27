---
title: Axes
section: Frontend
order: 50
status: draft
---

# Axes

GoFish draws axes — tick marks, tick labels, and axis titles — automatically from the
position scales it infers. This essay will document how axes are generated and
configured.

## Planned contents

- How axes are derived from inferred position domains and scales.
- Tick generation and tick-label placement.
- Axis titles and the render-option surface that controls them.
- Ordinal vs. continuous axes, and how a `coord` transform changes axis rendering.

## Source

Likely `covers:`: the axis-rendering code under `packages/gofish-graphics/src/ast/`. Add
the `covers:` frontmatter when writing this up, then run
`pnpm --filter docs sync-backlinks`.
