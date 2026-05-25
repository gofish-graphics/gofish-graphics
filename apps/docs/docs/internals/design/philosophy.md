---
title: Overview
section: Overview
order: 20
group: Design Philosophy
status: stable
---

# Design Philosophy

GoFish is a data-visualization library, and it starts where modern visualization
does: the **Grammar of Graphics** (Wilkinson, and its descendants ggplot2 and
Vega-Lite) — the idea that a chart is a declarative mapping from data onto visual
marks. The Grammar of Graphics, together with the component-framework approach of
[Bluefish](/internals/design/component-frameworks), is the prior GoFish set out
from.

From there, GoFish is a blender. It brings three traditions to bear on
visualization: **programming languages & compilers**, **UI component frameworks**,
and **graphic design**. These traditions are not strangers to _each other_ — graphic
design and component frameworks overlap, and programming-languages ideas run deep
through component frameworks. What is rare is connecting them to _visualization_ —
and rarer still to connect all three at once. That is the bet: no single one of the
three is enough on its own, but the combination, brought to charts, is.

::: starfish example:internal-three-traditions-venn hidden
:::

## Three traditions

**Programming languages & compilers.** A chart is a program; the renderer is a
multi-pass compiler. A large, friendly surface API desugars into a small, uniform
core, and the hard passes only ever see the core. This is where GoFish gets its
_discipline_ — a small core, desugaring over special-casing, a pipeline of passes.
→ [PL & Compilers](/internals/design/principles)

**UI component frameworks.** Marks and operators are _components_: declarative,
composable, extensible. And GoFish lays them out the way React, SwiftUI, and
Jetpack Compose lay out interfaces — linear-time local propagation over a tree, not
a global constraint solver. This is where GoFish gets its _composition model_ and
its _layout architecture_.
→ [UI Component Frameworks](/internals/design/component-frameworks)

**Graphic design.** A chart that is merely correct is not yet good. GoFish treats
the craft of graphic design — visual hierarchy, gestalt, typography, the lineage of
Bertin and Tufte — as a first-class concern, not an afterthought.
→ [Graphic Design](/internals/design/graphic-design)

## Why blend them

Each tradition answers a question the other two cannot. Compilers ask: _how do you
keep a system tractable as its surface grows?_ Component frameworks ask: _how do you
compose graphics, and lay them out fast enough to feel instant?_ Graphic design
asks: _what makes the finished chart actually good?_

A charting library needs all three answers at once. Lean only on compilers and you
get something principled but cold. Lean only on component frameworks and you get
something composable that still has no taste. Lean only on graphic design and you
get beautiful one-offs that do not generalize. GoFish's design philosophy is the
refusal to pick — and the three essays in this section are the three ingredients,
one at a time.
