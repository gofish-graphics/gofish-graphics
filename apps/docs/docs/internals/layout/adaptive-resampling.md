---
title: Adaptive Resampling
section: Layout & Rendering
order: 71
group: Rendering
status: draft
---

# Adaptive Resampling

When a path is drawn through a non-linear coordinate transform, a straight segment in
data space becomes a curve on screen. Adaptive resampling subdivides segments just
enough to render that curve smoothly without over-tessellating. This essay will
document GoFish's implementation.

## Planned contents

- The problem: straight segments curve under coordinate transforms.
- GoFish's adaptive algorithm, adapted from D3's `d3-geo` resampling, generalized
  beyond spherical projections and extended to bezier `PathSegment`s.
- The subdivision criterion and how tolerance is chosen.
- Interaction with [coordinate transforms](/internals/layout/coordinate-transforms).

## Source

Likely `covers:`: `packages/gofish-graphics/src/adaptive-resampling.ts` (already
well-commented). Add the `covers:` frontmatter when writing this up, then run
`pnpm --filter docs sync-backlinks`.
