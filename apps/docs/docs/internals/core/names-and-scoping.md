---
title: Name Resolution & Scoping
section: Core
order: 40
status: draft
---

# Name Resolution & Scoping

Marks can be given names with `.name(...)` and referenced elsewhere — across charts —
via `ref(name)` (the single matching node) or `selectAll(name)` (one ref per matching
node). GoFish resolves those names with **hygienic**, bounded scoping rather than
letting every descendant name bubble up globally. This essay will explain the
resolution algorithm and the design rationale.

Layer-name registration now obeys the same component-boundary hygiene as string-name
`ref` resolution always has: a name registered inside a `createMark` component is
internal to that component and is not selectable from outside. The inline-layout lookup
and the chart-data (`ref`/`selectAll`) lookup therefore share one scoping rule.

## Planned contents

- How `.name()` registers a node and how `ref` / `selectAll` resolve it.
- Hygienic scoping: why names are bounded to a scope instead of bubbling to all
  descendants, and what bug class that prevents.
- Interaction with the context system and with the layout passes.
- Cross-chart references and `ref` marks.

## Source

Likely `covers:`: the name/scope resolution code under
`packages/gofish-graphics/src/ast/`. Add the `covers:` frontmatter when writing this up,
then run `pnpm --filter docs sync-backlinks`.
