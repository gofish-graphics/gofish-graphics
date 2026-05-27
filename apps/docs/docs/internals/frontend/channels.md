---
title: Mark Channel Types
section: Frontend
order: 40
status: draft
---

# Mark Channel Types

A frontend mark's options are not all alike. A channel is classified by its
**aggregation semantics** — size, position, color, or raw — and that
classification, not naming convenience, determines how the channel behaves
under operators. This essay will document the channel taxonomy.

## Planned contents

- The four channel kinds: `size`, `pos`, `color`, `raw` — and what each means.
- Why a channel is chosen by aggregation semantics rather than by what feels natural.
- How operators treat each channel kind differently.
- Worked examples of picking the right channel type for a new mark option.

## Source

Likely `covers:`: the mark factory and channel code under
`packages/gofish-graphics/src/ast/marks/`. See also
[The Mark Factory](/internals/frontend/mark-factory). Add the `covers:` frontmatter when
writing this up, then run `pnpm --filter docs sync-backlinks`.
