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

Two distinct mechanisms sit nearby and must not be confused — only the first is
"aspect ratio":

- **Mark-level aspect ratio** (`rect`/`ellipse` `aspectRatio: number`, a `w/h`
  ratio): locks one mark's _box_ shape, transferring the size-request slope
  across axes at space-resolution time. Per-mark, the planned subject below. (A
  graphic-box aspect ratio — fixing the rendered frame's w:h — is the natural
  future home for the same `aspectRatio` name; tracked separately.)
- **Chart-level equal scale** (#582) — _not_ aspect ratio: when x and y carry the
  **same unit of
  measure**, their _data→pixel scales_ are equated so one data unit measures the
  same on both axes — circles stay circular, a 45° line looks 45°. This is **not**
  an `aspectRatio` knob: it follows from measure equality
  (`field(name, measure)` on both axes), the same type rule the circle mark uses.
  It is the "scale-level coupling" of
  [design: what may set a size](/internals/design/size-claims#aspect-ratio-three-candidate-homes-open)
  (option 3), implemented at the root scope in `gofish.tsx` (see
  [the layout passes](/internals/layout/passes)): `spaceMeasure(x) ===
  spaceMeasure(y)` triggers `min(...)` + centering of the slack axis. It is a
  single-coordinate-space coupling and does not reach sizes solved in separate
  nested operator scopes (e.g. a packed unit mosaic).

## Planned contents

- The `aspectRatio` property on `rect` and `ellipse`.
- How layout enforces `w = h * aspectRatio` while still respecting data encodings.
- Where chart templates set `aspectRatio` (e.g. circular charts).
- Failure modes and edge cases when a ratio conflicts with a size domain.
- How it differs from chart-level equal scale above (box shape, set explicitly,
  vs. scale equality, derived from a shared measure).

## Source

Likely `covers:`: `packages/gofish-graphics/src/ast/shapes/rect.tsx`,
`packages/gofish-graphics/src/ast/shapes/ellipse.tsx`. Add the `covers:` frontmatter
when writing this up, then run `pnpm --filter docs sync-backlinks`.
