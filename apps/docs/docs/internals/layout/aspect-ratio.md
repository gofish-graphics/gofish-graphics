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

## Planned contents

- The `aspectRatio` property on `rect` and `ellipse`.
- How layout enforces `w = h * aspectRatio` while still respecting data encodings.
- Where chart templates set `aspectRatio` (e.g. circular charts).
- Failure modes and edge cases when a ratio conflicts with a size domain.

## Source

Likely `covers:`: `packages/gofish-graphics/src/ast/shapes/rect.tsx`,
`packages/gofish-graphics/src/ast/shapes/ellipse.tsx`. Add the `covers:` frontmatter
when writing this up, then run `pnpm --filter docs sync-backlinks`.
