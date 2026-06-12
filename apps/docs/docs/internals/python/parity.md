---
title: Parity Testing
section: Python
order: 30
status: draft
---

# Parity Testing

Because Python and JavaScript serialize to the same [Frontend IR](/internals/frontend/serialization), a chart
built in either language should render pixel-identically. Parity testing enforces that.
This essay will document the workflow and its CI wiring.

## Planned contents

- How parity is captured and compared (JS DOM snapshots vs. Python-built charts).
- The story/example format parity tests expect.
- Common failure modes and how to triage them.
- CI wiring: the `python-parity` job depends on the `visual-test` job, so a JS visual
  regression skips parity entirely — worth knowing when a parity run looks "green".

## Source

Likely `covers:`: the parity test harness under `tests/` and
`packages/gofish-python/tests/`. Add the `covers:` frontmatter when writing this up,
then run `pnpm --filter docs sync-backlinks`.
