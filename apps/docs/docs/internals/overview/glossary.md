---
title: Glossary
section: Overview
order: 30
status: draft
---

# Glossary

Short definitions of the vocabulary used across this wiki. Seeded — expand as essays
land.

- **AST / `GoFishNode`** — the tree a chart compiles to. Every mark and operator is a
  node. See [Architecture Overview](/internals/overview/architecture).
- **Mark** — a node with an appearance: `rect`, `ellipse`, `line`, `ribbon`, `text`.
- **Operator** — a node that arranges children but draws nothing itself: `stackX`,
  `spread`, `layer`, `coord`, …
- **Underlying space** — what a dimension _is_: a position, a size, ordinal, or
  undefined. Drives which layout machinery runs. See
  [Underlying Space](/internals/core/underlying-space).
- **Domain** — the data range a dimension spans, inferred in pass 1.
- **Scale** — a mapping from a data domain to a visual range (pixels, color).
- **Bounding box (bbox)** — the rectangle a node occupies; the common currency of
  layout. See [The Bounding-Box Model](/internals/core/bbox).
- **Monotonic** — a monotonically-increasing function tracked symbolically so the
  engine can reason about data-to-pixel flow. See
  [The Monotonic Module](/internals/core/monotonic).
- **Scenegraph flattening** — collapsing a nested subtree into an absolutely-positioned
  flat list, done by `coord`. See [Flattening the Scenegraph](/internals/layout/coord-flattening).

## Planned contents

- Finish the term list (channel, flow/pipeline, ref, selection, coordinate transform).
- Link each term to its defining essay.
