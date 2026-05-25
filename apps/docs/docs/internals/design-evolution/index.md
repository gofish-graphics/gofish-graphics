---
title: Overview
section: Design Evolution
order: 0
status: stable
---

# Design Evolution

This section is the wiki's _retrospective_ space — design history, paths
considered and rejected, comparisons with prior surfaces, and the worked
examples that drove a decision before it was settled. It is for ground that
has already been walked.

It is the deliberate counterpart to [Speculative
Notes](/internals/design/chart-templates) — that section is for direction
the project may take; this one is for direction it has already taken, and the
context that explains why.

The single rule for what belongs here: an essay belongs in Design Evolution if
removing it would erase a _decision_ the rest of the wiki implicitly relies
on — the why behind a piece of present-day design. Reference material that
documents the _current_ system belongs in Frontend, Core, or Python.

## Contents

- [Three Surfaces](/internals/design-evolution/three-surfaces) — `lib.ts`
  exports three surfaces (functional, component-style, fluent) for the same
  chart. How they relate, what each was reacting to, why the wiki has retired
  the version-numbered framing.
