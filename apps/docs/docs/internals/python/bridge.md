---
title: The Jupyter Bridge & RPC
section: Python
order: 20
status: draft
---

# The Jupyter Bridge & RPC

The Python package renders charts inside Jupyter via an `anywidget` widget, and supports
Python callbacks invoked from the JS engine. This essay will document that bridge and
its RPC design.

## Planned contents

- The `anywidget` widget: how a chart reaches the notebook front end.
- Trait-based RPC, and why writes must be serialized — fast in-tick sets get coalesced,
  so Python can otherwise see only the last value.
- Python→JS callbacks: registering a Python lambda plus an async JS arrow that fetches
  through the existing derive-server, rather than pre-resolving or injecting hidden
  derive operators.
- Failure modes and debugging tips.

## Source

Likely `covers:`: `packages/gofish-python/gofish/widget.py` and the widget source under
`packages/gofish-python/widget-src/`. Add the `covers:` frontmatter when writing this
up, then run `pnpm --filter docs sync-backlinks`.
