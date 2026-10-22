---
title: Authoring Coordinate Transforms
section: Layout & Rendering
order: 72
group: Rendering
status: draft
---

# Authoring Coordinate Transforms

GoFish ships several coordinate systems — `polar`, `clock`, `wavy`, `geo`,
and the internal identity `linear` — and they are pluggable. This essay will be a
contributor guide to the `CoordinateTransform` interface and how to add a new one.

## Planned contents

- The `CoordinateTransform` type: `transform`, `domain`, and `type`.
- How a transform is consumed during render, and by
  [`coord`'s scenegraph flattening](/internals/layout/coord-flattening).
- Walkthrough: implementing a new transform end to end.
- Gotchas — domains, grid lines, and [adaptive resampling](/internals/layout/adaptive-resampling).

## Rules already settled

**A point-like mark is a point to the transform.** For a circle or dot inside
a `coord`, only its center goes through the transform. Its box does not, and
it draws at its pixel size at the transformed center. So such marks are laid
out with `spread({ anchor: "middle", spacing })`, with `spacing` in the
transform's own units (radians along `theta` in polar), not edge to edge,
which would turn each pixel of box width into a radian. Data-sized extents
are for shapes that sweep through the space, such as polar bars and ribbons.

## Source

Likely `covers:`: files under
`packages/gofish-graphics/src/ast/coordinateTransforms/`. Add the `covers:` frontmatter
when writing this up, then run `pnpm --filter docs sync-backlinks`.
