# Pulley Diagram

A constraint-based physics diagram ported from
[Bluefish's example gallery](https://github.com/bluefish-vis/bluefish). Three
pulley wheels, two hanging weights, brown rope segments threading between them,
and single-letter dimension labels — all positioned by declarative constraints
rather than absolute coordinates.

The diagram demonstrates several mid-level features in concert:

- **Nested layer tiers** — tier 1 places the shapes, tier 2 lays down the
  ropes that read those placed shapes, tier 3 places the dimension labels
  beside the ropes.
- **`createName` tokens** — global names that let cross-tier
  [`ref`](/js/api/marks/ref) lookups (the ropes in the outer layer) resolve
  shapes declared inside an inner layer.
- **[`Connect`](/js/api/operators/connect) anchor sugar** — `source` /
  `target` accept `start | middle | end` per axis (and per-axis tuples) to
  pick where each rope attaches.
- **Relative z-order constraints** — `Constraint.zAbove` / `zBelow` declare
  partial-order paint relations between named children; the engine
  topologically sorts them into a total order. This is what carves out the
  "rope passes _between_ two pulley wheels" effect.

::: starfish example:pulley
:::
