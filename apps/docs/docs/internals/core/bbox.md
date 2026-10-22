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

## Rules already settled

**A node's baseline is its local zero.** The baseline is the node's origin,
which is not the same as the low edge of its box. It bubbles up: by default a
parent places a child with the child's baseline on its own. `align`'s
`baseline` anchor pins that origin, where `start` would pin the low edge and
slide content that overhangs its origin off the tick grid (#490).

**A box is measured after its children are placed.** An operator that leaves
its children unplaced on an axis first places them at their baselines, where
render draws them, and only then measures its own extent. It does not measure
unplaced children some other way. When a chain of constraints goes wrong
because a box is wrong, fix the box, not the constraints.

**An undefined translate means "my parent may still place me".** A layout
that has no opinion on a node's position leaves its translate undefined
rather than writing 0, which would fix the node in place. See
[Constraints as Core](/internals/design/constraints-as-core) and
[Coordinate flattening](/internals/layout/coord-flattening).

## Source

Likely `covers:`: `packages/gofish-graphics/src/util/bbox.ts`. Add the `covers:`
frontmatter when writing this up, then run `pnpm --filter docs sync-backlinks`.
