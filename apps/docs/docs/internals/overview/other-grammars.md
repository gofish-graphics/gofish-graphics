---
title: Other Grammars
section: Overview
order: 30
status: draft
---

# Where GoFish Sits

This essay places GoFish in the existing landscape of visualization grammars
and component frameworks. It is not a review and not a critique — it is
orientation. Where does each system start from, where does GoFish part ways,
and what is GoFish borrowing back?

## The Grammar of Graphics lineage

The systems descended from Wilkinson's _Grammar of Graphics_ are the most
direct ancestors.

**ggplot2** (Wickham) is the seminal implementation. A chart is a mark
("geom") plus a set of aesthetic mappings, optionally faceted. ggplot2 set the
template that the rest of the family follows.

**Vega-Lite** (Satyanarayan et al.) and its Python wrapper **Altair** push the
declarative angle further: a JSON spec compiles to Vega, which compiles to a
runtime. The compiler-pipeline framing of GoFish has a sibling here, although
Vega-Lite's core is much wider than GoFish targets.

**Observable Plot** is the modern descendant — terse, fluent, fast, intentionally
narrow. Plot's `auto` mark and its general appetite for sensible-default
inference are what GoFish deliberately does _not_ do (see the [Design
Philosophy](/internals/design/philosophy) on internal-vs-external correctness).

**plotnine** ports ggplot2 to Python. **lets-plot** does the same with
multi-language bindings.

GoFish's frontend belongs to this family by lineage but parts ways on one
thing: recursive composition is the _main_ mode, not the bolt-on. A ggplot2
facet is a special case in the grammar; in GoFish, faceting is `spread` of
charts — built from the same primitives a single chart is built from. The
[Three Surfaces](/internals/design-evolution/three-surfaces) essay traces how
the frontend arrived at the recursive shape.

## Specialized grammars built on top

A second tier of work _extends_ a base grammar to a particular chart family.

**Atom** (Park et al.) is a unit-chart grammar. **productplots** (Wickham &
Hofmann) is a grammar for mosaics. **gemini** and **animated-Vega-Lite** are
animation grammars over Vega-Lite. **ggdist** does distribution charts on top
of ggplot2. **gganimate**, **ggraph**, **ggrepel**, **ggrastr** each carry one
piece further.

The recurring story is that each extension reimplements the base machinery
because the base did not expose enough of itself. GoFish's compositional bet
(see the [PL essay](/internals/design/principles)) is that with a small core
and an extension story for marks and operators, the same authors could ship
their work as packages of GoFish marks/operators rather than separate
compilers. Whether this pans out is open.

## Pictorial and bespoke

**PICCL** (a research grammar for pictorial charts — see
[PICCL](/internals/design/piccl)) extends the GoG with image-compositing
operators and pointSnap constraints. The PICCL essay walks through what its
flower-chart example looks like as a GoFish spec — a useful exercise in how
far the frontend's recursive composition will stretch.

**Encodable** (Wongsuphasawat, IEEE VIS 2020) is not a chart grammar but a
_per-component_ channel grammar — a parser that turns user encoding specs
into rendering parameters. GoFish's [mark](/internals/frontend/mark-factory)
and [operator](/internals/frontend/operator-factory) factories are direct
adaptations of this pattern, lifted from single components to whole layout
operators.

## UI-component-framework lineage

The other lineage GoFish belongs to is the one most charting libraries
ignore: UI component frameworks.

**Bluefish** (Pollock et al., UIST 2024) is the direct ancestor — a
diagramming framework with relational composition, named refs, and
linear-time local-propagation layout. GoFish carries Bluefish's conclusions
forward; see [UI Component
Frameworks](/internals/design/component-frameworks) for the borrowing.

**SwiftCharts** is built in SwiftUI: a chart is a tree of SwiftUI views.
**D3** is jQuery for SVG: selections, joins, transitions — direct DOM
descendants. Vega's signal system is structurally a sibling of modern
reactive-UI signals (Solid, MobX, Signals proposal). Each of these is a piece
of evidence for the broader thesis explored in [Charts Are User
Interfaces](/internals/design/ui-as-charts): a chart and a UI are made of the
same stuff.

## What GoFish takes from each

| from          | what GoFish borrows                                                            |
| ------------- | ------------------------------------------------------------------------------ |
| ggplot2 / GoG | the grammar idea: marks × channels × composition                               |
| Vega-Lite     | the compiler-pipeline framing — surface → core → passes                        |
| Plot          | terseness as a design goal (the frontend's fluent shape)                       |
| Encodable     | per-component channel grammar (the mark/operator factories)                    |
| PICCL         | pictorial composition and snap-based constraints (aspirational; see the essay) |
| Bluefish      | relations, named refs, local-propagation layout                                |
| GHC / Lean    | a small typed core under a large surface                                       |
| React/SwiftUI | components, composition, declarative layout                                    |
| Solid         | reactive runtime (GoFish renders through SolidJS)                              |

The bet GoFish makes is that none of these alone is enough, and the
combination — when actually built, not just sketched — is qualitatively
different.

## Planned contents

- A worked side-by-side: the same chart in ggplot2, Plot, Vega-Lite, and the
  GoFish frontend.
- The same chart authored at each level: with a chart-template (when those
  exist), with the fluent frontend, and as raw core nodes.
- A pointer table from each grammar's surface feature → its equivalent GoFish
  primitive.
