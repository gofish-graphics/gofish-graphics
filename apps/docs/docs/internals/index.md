---
title: Welcome
section: Overview
order: 0
status: stable
---

# GoFish Internals

This is the **internal architecture wiki** for GoFish Graphics — narrative essays
about how the library works, why it is built the way it is, and where it is going.

It is written for contributors and for Claude. Unlike the [JavaScript](/js/get-started)
and [Python](/python/get-started) docs, which teach you to _use_ GoFish, these pages
explain the _machinery_: the layout pipeline, the coordinate system, the type-level
tricks, the Python bridge, and the design philosophy behind it all.

## Start here

- New to the codebase? Read the [Architecture Overview](/internals/overview/architecture).
- Writing or editing an essay? See [How This Wiki Works](/internals/how-it-works)
  for the authoring conventions — frontmatter, sidebar sections, the `covers:` ↔
  code back-links, diagrams, and code samples.

The wiki is broken into seven sections:

- **Overview** — orientation: this page, the architecture map, the design
  philosophy, a glossary, and the case for the project at all.
- **Frontend** — the surface a chart author writes: pipeline syntax, marks and
  operators, axes, labels, color.
- **Core** — the foundational data model: underlying space, bounding boxes,
  the context system, name resolution and scoping.
- **Layout & Rendering** — the three-pass engine itself: the layout pass,
  scale resolution (positional, monotonic, color), coordinate transforms,
  and the actual draw to SVG.
- **Python** — the Python wrapper and its bridge to the JavaScript engine.
- **Design Evolution** — retrospective: how the surface arrived at its current
  shape, paths considered and rejected, comparisons with prior surfaces.
- **Speculative Notes** — design exploration and project direction that may never
  ship.
