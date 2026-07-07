# GoTree Gallery → GoFish combine() specs

Mapping of every example in [BIT-VIS/gotree](https://github.com/BIT-VIS/gotree) `gallery/`
onto a gofish-gotree `combine({ x, y })` spec. Relation → kind: `include`→**nest**,
`juxtapose`/`flatten`→**distribute**, `within`/`align`→**align**.

`combine` columns are `(x-kind, y-kind)`. All examples (cartesian + polar) are ported
as Storybook stories under `stories/gallery/` (match = self-rated 1–5 vs the reference
PNG). Polar fidelity is rough — see the polar gaps section.

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

## Polar (ported — rough; polar support is still maturing)

All polar examples are ported as stories under `stories/gallery/` with `coord: polar()`
(x → θ radians, y → r). Fidelity is limited by the polar gaps listed below; each story
carries a `// NOTES:` block documenting its specific gaps. `copy/` (a stray duplicate of
the sunburst family) is skipped.

| Example                  | parentChild              | sibling                  | node      | link            | match | notes                                      |
| ------------------------ | ------------------------ | ------------------------ | --------- | --------------- | :---: | ------------------------------------------ |
| ClockTree                | (distribute, align)      | (distribute, align)      | rectangle | -               |  2/5  | InnerRadius hole not expressible           |
| ClockTreeWithLink        | (distribute, align)      | (distribute, align)      | rectangle | curveStepBefore |  3/5  | InnerRadius hole; step→linear              |
| FlowerTree               | (nest, align)            | (distribute, align)      | circle    | straight        |  3/5  | nest-θ petals                              |
| HierarchicalSectorChart  | (nest, distribute)       | (distribute, align)      | rectangle | hidden          |  4/5  | sector wedges                              |
| MultilevelSilhouetteTree | (align, distribute)      | (distribute, align)      | circle    | straight        |  4/5  | radial node-link reading                   |
| OakTreeVis               | (align, nest)            | (distribute, distribute) | circle    | curveStepBefore |  3/5  | nest-r embedded; step→linear               |
| OrthogonalGridEmbedding  | (align, distribute)      | (distribute, align)      | circle    | orthogonal      |  3/5  | orthogonal links→linear                    |
| RadialPhylogeneticTree   | (nest, distribute)       | (distribute, align)      | hidden    | straight        |  3/5  | hidden nodes; spokes confined to arc       |
| RadialTree               | (align, distribute)      | (distribute, align)      | circle    | straight        |  3/5  | exemplar/template; radial node-link        |
| RadialTreeIncline        | (distribute, distribute) | (distribute, align)      | circle    | straight        |  3/5  |                                            |
| RotationTree             | (distribute, align)      | (distribute, align)      | circle    | arccurve        |  2/5  | radial collapse (align-r both); arc→linear |
| SectorTree               | (distribute, align)      | (distribute, align)      | rectangle | -               |  3/5  |                                            |
| SectorTree2              | (nest, distribute)       | (distribute, align)      | rectangle | curve           |  4/5  | sector wedges; curve→none                  |
| SideTree                 | (distribute, distribute) | (align, distribute)      | circle    | straight        |  3/5  |                                            |
| SpiralLayout             | (distribute, distribute) | (distribute, distribute) | circle    | straight        |  4/5  | spiral via dual-axis distribute            |
| TornadoTree              | (distribute, nest)       | (distribute, distribute) | rectangle | -               |  3/5  | nest-r embedded                            |
| TornadoTree2             | (distribute, nest)       | (distribute, distribute) | rectangle | -               |  3/5  | nest-r; neg margin not expressible         |
| TyreTree                 | (nest, align)            | (distribute, align)      | rectangle | -               |  4/5  | concentric wedge rings                     |
| ViolinTree               | (distribute, nest)       | (distribute, distribute) | rectangle | -               |  3/5  | nest-r; value radial thickness             |
| deep-tree                | (nest, distribute)       | (distribute, align)      | circle    | curve           |  3/5  | curve links→linear                         |
| icicleplot               | (nest, distribute)       | (distribute, align)      | circle    | curve           |  4/5  | polar icicle wedges                        |
| outside-in-tree          | (nest, distribute)       | (distribute, align)      | circle    | curve           |  3/5  | reverse radial; curve→linear               |
| radial-deep              | (nest, distribute)       | (distribute, align)      | circle    | curve           |  4/5  | curve→linear                               |
| sunburst                 | (nest, distribute)       | (distribute, align)      | circle    | curve           |  4/5  | wedge via embedded θ-dim                   |

### Polar gaps surfaced (no hacks used — flagged for follow-up)

1. **No angular auto-fit.** Angle is not allocated by subtree leaf-count, so sibling θ-spacing is a fixed constant; wide/deep trees overflow the 2π budget and wrap (or render a partial arc). This is the dominant fidelity limiter. GoTree allocates θ adaptively (`SubtreeWidth: adaptive`).
2. **`polar()` takes no options.** `InnerRadius` (donut hole / clock rim), `Direction`, `CentralAngle`, `StartAngle`, `PolarCenter` are not expressible — the disc is always centered and starts at r=0 (so e.g. ClockTree/TyreTree can't make a hollow ring).
3. **No θ/r axis swap.** GoFish's `polar()` always maps x→θ, y→r and has no transposed variant, so the dsl's `PolarAxis: x-axis` θ/r swap is not expressible. (The former `polarTransposed()` was a geometrically-identical no-op and was deleted.)
4. **Embedded vs non-embedded dimensions.** Filled wedges need a dimension _embedded_ in the transform (rect `emX` width in θ-units that sweeps an arc); point nodes (circles) must NOT embed (use `mode:"center"`). `nest` on θ or r (angular/radial containment) needs a growable mark, so it's awkward with point/circle nodes and only partly works.
5. **Non-linear links** (curve/arc/step/orthogonal) fall back to linear, which then bow under the transform rather than rendering as authored polar curves.

## Feature gaps surfaced by the port

These GoTree techniques can't be expressed with the current gofish-gotree API; ports note them inline as `// TODO`:

1. ~~**Per-depth alternating combiners.**~~ **DONE.** `parentChild`/`sibling` now accept a depth-indexed combiner via `alternate([...])` / `perDepth(d => ...)` (resolved at each node's depth in `renderSubtree`). This unlocked the H-tree/HVDrawing axis-swap and the recursive slice-and-dice treemaps (Treemap, CascadedTreemap, TreemapOval, NestedPieTree, BeamTree). Remaining nuance: asymmetric per-side nest padding (BeamTree's overhang) still isn't expressible.
2. **Non-linear links.** Only `linear` (and `bezier`) render today. Needed: `orthogonal` (GardenLayout, ReadableTreeLayout, OrthogonalTree step links), `curve` (WeaveTree, cartesian-deep-tree), `arc`/`arccurve` (arc-tree), `curveStep*` brackets (dendrogram).
3. **More node shapes.** No `triangle` mark (cheops). Also `hidden` nodes are faked with a transparent zero-size rect.
4. **Single-axis nest with point nodes.** `nest` grows a bbox; a `circle` can't grow on only one axis, so Jewelry/arc-style strings fall back to rounded rects.
5. **Value-driven proportional sizing.** Leaf areas are set with explicit pixel math; eventually these should ride gofish's scales for automatic value→size mapping.
