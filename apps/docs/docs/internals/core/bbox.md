---
title: The Bounding-Box Model
section: Core
order: 20
status: draft
---

# The Bounding-Box Model

Bounding boxes are the common currency of layout: nearly every pass produces, consumes,
or unions them. This essay will document the `BoundingBox` type and its operations.

## Planned contents

- The `BoundingBox` representation and its invariants (`minX <= maxX`, etc.).
- Construction and validation helpers (`bbox`, `empty`).
- Geometric operations — `union`, intersection, transformation.
- How bounding boxes flow through domain inference, layout, and placement.
- The relationship between intrinsic dims, transforms, and final boxes.
- **Baseline.** A node's bbox carries more than just min/max along each axis;
  it also carries a `baseline` — a per-axis reference offset that lets a
  parent align children by something other than their geometric center or
  edge (e.g. typographic baseline for text, the wide point of an arrow head,
  the center-of-mass of an irregular shape). Cover where the baseline is
  consumed (alignment in `stackX`/`stackY`, `position`, label placement) and
  how a shape declares its own baseline rather than letting the default
  geometric one stand.

## Source

Likely `covers:`: `packages/gofish-graphics/src/util/bbox.ts`. Add the `covers:`
frontmatter when writing this up, then run `pnpm --filter docs sync-backlinks`.
