# GoTree Gallery → GoFish combine() specs

Mapping of every example in [BIT-VIS/gotree](https://github.com/BIT-VIS/gotree) `gallery/`
onto a gofish-gotree `combine({ x, y })` spec. Relation → kind: `include`→**nest**,
`juxtapose`/`flatten`→**distribute**, `within`/`align`→**align**.

`combine` columns are `(x-kind, y-kind)`. Cartesian examples are ported as Storybook
stories under `stories/gallery/` (match = self-rated 1–5 vs the reference PNG).

## Cartesian (ported)

| Example             | parentChild              | sibling                    | node      | link            | match | notes                                                                 |
| ------------------- | ------------------------ | -------------------------- | --------- | --------------- | :---: | --------------------------------------------------------------------- |
| BeamTree            | (nest, nest)             | alternate(spreadX/spreadY) | rectangle | -               |  4/5  | nested beams via alternate(); asymmetric overhang pad not expressible |
| CascadedTreemap     | (nest, nest)             | alternate(dice/slice)      | rectangle | -               |  5/5  | alternating slice/dice via alternate()                                |
| ElasticHierarchy    | (nest, nest)             | (distribute, align)        | rectangle | -               |  4/5  |                                                                       |
| GardenLayout        | (align, distribute)      | (distribute, align)        | circle    | orthogonal      |  4/5  | orthogonal links→linear                                               |
| HTreeLayout         | (align, align)           | alternate(spreadX/spreadY) | circle    | straight        |  5/5  | H-fractal via alternate()                                             |
| HVDrawing           | alternate(H/V)           | alternate(H/V)             | circle    | straight        |  4/5  | per-depth axis swap via alternate()                                   |
| IndentedTree        | (align, distribute)      | (align, distribute)        | rectangle | -               |  4/5  | vertical outline orientation                                          |
| Jewelry             | (nest, align)            | (distribute, align)        | circle    | straight        |  3/5  | circle can't grow bbox on 1 nest axis→rect                            |
| NestedPieTree       | (nest, nest)             | alternate(slice/dice)      | rectangle | -               |  5/5  | cartesian alternating slice/dice via alternate()                      |
| NodeLinkTree        | (align, distribute)      | (distribute, align)        | circle    | straight        |  5/5  |                                                                       |
| OrthogonalTree      | (distribute, distribute) | (distribute, distribute)   | circle    | curveStepBefore |  4/5  | step links→linear                                                     |
| ReadableTreeLayout  | (align, distribute)      | (distribute, align)        | circle    | orthogonal      |  4/5  | orthogonal links→linear                                               |
| StairTree           | (distribute, nest)       | (distribute, distribute)   | rectangle | -               |  4/5  | exemplar/template                                                     |
| Treemap             | (nest, nest)             | alternate(dice/slice)      | rectangle | -               |  5/5  | alternating slice/dice via alternate()                                |
| TreemapOval         | (nest, nest)             | alternate(slice/dice)      | ellipse   | -               |  5/5  | alternating slice/dice via alternate()                                |
| WeaveTree           | (distribute, align)      | (distribute, distribute)   | circle    | curve           |  3/5  | curve links→linear                                                    |
| arc-tree            | (distribute, align)      | (distribute, align)        | circle    | arccurve        |  3/5  | arc links→linear                                                      |
| barcodetree         | (distribute, nest)       | (distribute, align)        | rectangle | -               |  5/5  |                                                                       |
| cartesian-deep-tree | (nest, distribute)       | (distribute, align)        | circle    | curve           |  4/5  | curve links→linear                                                    |
| cheops              | (nest, distribute)       | (distribute, align)        | triangle  | -               |  3/5  | needs triangle mark                                                   |
| dendrogram          | (nest, distribute)       | (distribute, align)        | hidden    | curveStepAfter  |  4/5  | step/orthogonal links→linear; hidden nodes                            |
| iptp                | (distribute, distribute) | (distribute, align)        | rectangle | -               |  4/5  |                                                                       |
| treemap-slice       | (nest, nest)             | (distribute, align)        | rectangle | hidden          |  4/5  |                                                                       |

## Polar (spec only — not yet ported)

| Example                  | parentChild              | sibling                  | node      | link            |
| ------------------------ | ------------------------ | ------------------------ | --------- | --------------- |
| ClockTree                | (distribute, align)      | (distribute, align)      | rectangle | -               |
| ClockTreeWithLink        | (distribute, align)      | (distribute, align)      | rectangle | curveStepBefore |
| FlowerTree               | (nest, align)            | (distribute, align)      | circle    | straight        |
| HierarchicalSectorChart  | (nest, distribute)       | (distribute, align)      | rectangle | hidden          |
| MultilevelSilhouetteTree | (align, distribute)      | (distribute, align)      | circle    | straight        |
| OakTreeVis               | (align, nest)            | (distribute, distribute) | circle    | curveStepBefore |
| OrthogonalGridEmbedding  | (align, distribute)      | (distribute, align)      | circle    | orthogonal      |
| RadialPhylogeneticTree   | (nest, distribute)       | (distribute, align)      | hidden    | straight        |
| RadialTree               | (align, distribute)      | (distribute, align)      | circle    | straight        |
| RadialTreeIncline        | (distribute, distribute) | (distribute, align)      | circle    | straight        |
| RotationTree             | (distribute, align)      | (distribute, align)      | circle    | arccurve        |
| SectorTree               | (distribute, align)      | (distribute, align)      | rectangle | -               |
| SectorTree2              | (nest, distribute)       | (distribute, align)      | rectangle | curve           |
| SideTree                 | (distribute, distribute) | (align, distribute)      | circle    | straight        |
| SpiralLayout             | (distribute, distribute) | (distribute, distribute) | circle    | straight        |
| TornadoTree              | (distribute, nest)       | (distribute, distribute) | rectangle | -               |
| TornadoTree2             | (distribute, nest)       | (distribute, distribute) | rectangle | -               |
| TyreTree                 | (nest, align)            | (distribute, align)      | rectangle | -               |
| ViolinTree               | (distribute, nest)       | (distribute, distribute) | rectangle | -               |
| copy                     | (nest, distribute)       | (distribute, align)      | circle    | curve           |
| deep-tree                | (nest, distribute)       | (distribute, align)      | circle    | curve           |
| icicleplot               | (nest, distribute)       | (distribute, align)      | circle    | curve           |
| outside-in-tree          | (nest, distribute)       | (distribute, align)      | circle    | curve           |
| radial-deep              | (nest, distribute)       | (distribute, align)      | circle    | curve           |
| sunburst                 | (nest, distribute)       | (distribute, align)      | circle    | curve           |

## Feature gaps surfaced by the port

These GoTree techniques can't be expressed with the current gofish-gotree API; ports note them inline as `// TODO`:

1. ~~**Per-depth alternating combiners.**~~ **DONE.** `parentChild`/`sibling` now accept a depth-indexed combiner via `alternate([...])` / `perDepth(d => ...)` (resolved at each node's depth in `renderSubtree`). This unlocked the H-tree/HVDrawing axis-swap and the recursive slice-and-dice treemaps (Treemap, CascadedTreemap, TreemapOval, NestedPieTree, BeamTree). Remaining nuance: asymmetric per-side nest padding (BeamTree's overhang) still isn't expressible.
2. **Non-linear links.** Only `linear` (and `bezier`) render today. Needed: `orthogonal` (GardenLayout, ReadableTreeLayout, OrthogonalTree step links), `curve` (WeaveTree, cartesian-deep-tree), `arc`/`arccurve` (arc-tree), `curveStep*` brackets (dendrogram).
3. **More node shapes.** No `triangle` mark (cheops). Also `hidden` nodes are faked with a transparent zero-size rect.
4. **Single-axis nest with point nodes.** `nest` grows a bbox; a `circle` can't grow on only one axis, so Jewelry/arc-style strings fall back to rounded rects.
5. **Value-driven proportional sizing.** Leaf areas are set with explicit pixel math; eventually these should ride gofish's scales for automatic value→size mapping.
