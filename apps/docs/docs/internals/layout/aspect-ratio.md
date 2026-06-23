---
title: Fixed Aspect Ratio
section: Layout & Rendering
order: 52
group: Layout
status: draft
---

# Fixed Aspect Ratio

Some marks must keep a fixed width-to-height ratio — a circular pie needs `aspectRatio:
1` no matter what the data encodes. This essay will explain how aspect-ratio locking
interacts with data-driven sizing during the layout pass.

Two distinct mechanisms wear the `aspectRatio` name, at different levels:

- **Mark-level** (`rect`/`ellipse` `aspectRatio: number`, a `w/h` ratio): locks
  one mark's _box_ shape, transferring the size-request slope across axes at
  space-resolution time. Per-mark, the planned subject below.
- **Chart-level** (`chart`/`render` `aspectRatio: "square" | "<w>:<h>" | {w,h}`,
  #582): couples the two axes' _data→pixel scales_ so one data unit measures the
  same on both axes — circles stay circular, a 45° line looks 45°. This is the
  "scale-level coupling" of
  [design: what may set a size](/internals/design/size-claims#aspect-ratio-three-candidate-homes)
  (option 3), implemented at the root scope in `gofish.tsx` (see
  [the layout passes](/internals/layout/passes)). The binding axis fills its
  dimension; the other centers in the slack. It is a single-coordinate-space
  coupling and does not reach sizes solved in separate nested operator scopes
  (e.g. a packed unit mosaic).

## Planned contents

- The `aspectRatio` property on `rect` and `ellipse`.
- How layout enforces `w = h * aspectRatio` while still respecting data encodings.
- Where chart templates set `aspectRatio` (e.g. circular charts).
- Failure modes and edge cases when a ratio conflicts with a size domain.
- The relationship to the chart-level scale coupling above (same name, different
  level — box shape vs. scale equality).

## Source

Likely `covers:`: `packages/gofish-graphics/src/ast/shapes/rect.tsx`,
`packages/gofish-graphics/src/ast/shapes/ellipse.tsx`. Add the `covers:` frontmatter
when writing this up, then run `pnpm --filter docs sync-backlinks`.
