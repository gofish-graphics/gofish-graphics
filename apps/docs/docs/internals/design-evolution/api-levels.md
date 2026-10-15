---
title: The API Levels
section: Design Evolution
order: 5
status: stable
handwritten: true
---

# The API Levels

::: info Moved from the GitHub wiki
This page is _The API Levels_ page of the project's GitHub wiki (last edited
November 2025), moved here verbatim. It describes the API as it was then
planned. What has changed:

- There are no longer four levels. `lib.ts` exports two surfaces over one core:
  the fluent `chart(...).flow(...).mark(...)` builder and the low-level
  combinator form, and each operator has one lowercase name that works in both.
  See [Three Surfaces](/internals/design-evolution/three-surfaces).
- Level 1, the high-level chart API, has only `barChart` (`src/charts/bar.ts`).
  Its design is still open; see [Chart Templates](/internals/design/chart-templates).
- Level 2, the "mid-level API," is the fluent builder. See [Pipeline
  Syntax](/internals/frontend/pipeline-syntax) and [Pipeline
  Types](/internals/frontend/pipeline-types).
- Level 3 survives as the lowercase combinator form. Its capitalized
  component spellings (`StackX`, `Frame`, and so on) were removed (#416) and
  the node-level operators are internal (#146), so `layer` is not a level 3
  concept but one lowercase operator that works in both surfaces. See [Three
  Surfaces](/internals/design-evolution/three-surfaces).
- Level 4, the extension points, is `createMark` and `createRelationalMark` in
  the public API. `createOperator` is internal and not exported from `lib.ts`.
  See [The Mark Factory](/internals/frontend/mark-factory) and [The Operator
  Factory](/internals/frontend/operator-factory).

:::

GoFish has four API levels:

1. A high-level, grammar-of-graphics style API for basic chart types like bar, area, and scatterplot. This level is designed for users who are looking to reuse things people have already made.
2. A mid-level API designed for creating almost any statistical graphic with a few basic shapes and operators. This level is for people who want to make bespoke charts, or for people looking to compose existing charts in interesting ways like spreading or nesting them.
3. A low-level API based on Bluefish, which is in turn based on UI component frameworks. At this level, everything is (that's the goal at least) explicit including all shapes, axes, and data transformations. This level is best for people who want to make really bespoke diagrams and researchers developing new features.
4. The extension points for creating new basic shapes and operators.

The first three levels are designed to interoperate. A user can mix and match primitives at all levels. This is possible because each level is written in the next level down so all the levels produce `GoFishNode`s. In fact, when people at level 1 or 2 use `layer`, they are invoking a level 3 concept!

We designed GoFish this way to optimize for system extensibility and a smooth complexity curve. This has many advantages. First, the complexity of the system grows with the user. Users can begin with a fairly nice and familiar entry point at level 1. They may stay there for the entire time they use the library. But if they are looking for just a bit more functionality, even just faceting or layering, they will gradually begin to invoke features at levels 2 and 3. At the extreme end, levels 3 and 4, researchers interested in creating primitives for new domains have maximum flexibility for designing new primitives that will still work seamlessly with the rest of the system.

This design is in contrast to other visualization ecosystems. The major GoG-style systems are Vega-Lite/Altair, Observable Plot, and ggplot2. Each of these depends on a completely separate low-level system --- Vega, D3, and ggproto, respectively --- with a different API design. As a result, writing new extensions to the high-level languages typically requires writing some Frankensteined compiler extension (as we did with Animated Vega-Lite and Tactile Vega-Lite, for example) or else just writing completely in the low-level language and figuring out how the internal APIs work.
