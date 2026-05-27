---
title: Overview
section: Layout & Rendering
order: 70
group: Rendering
status: draft
---

# Rendering

The final pass turns a laid-out tree into SVG. This essay will document the rendering
pass — how each node emits SVG and how SolidJS keeps it reactive.

## Planned contents

- The placement / render pass: assigning final absolute positions and emitting SVG.
- How rendering uses SolidJS for reactive updates without a full rebuild.
- Mark embedding modes, and how coordinate transforms are applied at render time.
- Where path-heavy marks meet [adaptive resampling](/internals/layout/adaptive-resampling).

## Source

Likely `covers:`: `packages/gofish-graphics/src/ast/gofish.tsx` and the shape `render`
methods. Add the `covers:` frontmatter when writing this up, then run
`pnpm --filter docs sync-backlinks`.
