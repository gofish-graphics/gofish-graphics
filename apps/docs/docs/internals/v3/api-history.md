---
title: Why Three API Versions
section: Frontend
order: 80
status: draft
---

# Why Three API Versions

GoFish exports three API surfaces from `src/lib.ts`: v1 (lowercase functional), v2
(capitalized component-style), and v3 (the fluent `chart(...).flow(...).mark(...)`
builder). This essay will explain how they relate and why they coexist.

## Planned contents

- v1, v2, v3 side by side — the same chart in each.
- What each version was reacting to; the lessons that produced the next.
- v3 as the recommended surface, and how v1/v2 desugar onto the same AST.
- The migration story and what (if anything) is planned for the older surfaces.

## Source

Likely `covers:`: `packages/gofish-graphics/src/lib.ts`. Add the `covers:` frontmatter
when writing this up, then run `pnpm --filter docs sync-backlinks`.
