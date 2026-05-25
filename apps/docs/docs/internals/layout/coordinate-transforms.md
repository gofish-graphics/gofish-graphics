---
title: Authoring Coordinate Transforms
section: Layout & Rendering
order: 72
group: Rendering
status: draft
---

# Authoring Coordinate Transforms

GoFish ships several coordinate systems — `linear`, `polar`, `bipolar`,
`arcLengthPolar`, `wavy`, `clock` — and they are pluggable. This essay will be a
contributor guide to the `CoordinateTransform` interface and how to add a new one.

## Planned contents

- The `CoordinateTransform` type: `transform`, `domain`, and `type`.
- How a transform is consumed during render, and by
  [`coord`'s scenegraph flattening](/internals/layout/coord-flattening).
- Walkthrough: implementing a new transform end to end.
- Gotchas — domains, grid lines, and [adaptive resampling](/internals/layout/adaptive-resampling).

## Source

Likely `covers:`: files under
`packages/gofish-graphics/src/ast/coordinateTransforms/`. Add the `covers:` frontmatter
when writing this up, then run `pnpm --filter docs sync-backlinks`.
