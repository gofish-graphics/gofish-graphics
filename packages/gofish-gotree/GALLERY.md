# GoTree Gallery → GoFish combine() specs

Mapping of every example in [BIT-VIS/gotree](https://github.com/BIT-VIS/gotree) `gallery/`
onto a gofish-gotree `combine({ x, y })` spec. Relation → kind: `include`→**nest**,
`juxtapose`/`flatten`→**distribute**, `within`/`align`→**align**.

`combine` columns are `(x-kind, y-kind)`. All examples (cartesian + polar) are ported
as Storybook stories under `stories/gallery/` (match = self-rated 1–5 vs the reference
PNG). Polar wedge fidelity is now high, and the point-node radial family is too — every
radial node-link story now uses the #627 data-position approach (see the polar section).

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

## Polar (ported — the filled-wedge family is now high-fidelity)

All polar examples are ported as stories under `stories/gallery/` with `coord: polar()`
(x → θ radians, y → r). The filled-wedge family (sunbursts, sector/clock/tyre rings,
polar icicles) now renders at high fidelity: `polar()` takes shape options (#620) and the
coord is a fit-frame on both axes, so WEDGE (rect) nodes carrying `thetaSize: datum(1)`
get real angular auto-fit — θ is allocated by leaf weight and fits the 2π budget (#622).
Point-node (circle) radial layouts sidestep the remaining DSL gaps via the #627
data-position approach (a story-local pass computes raw θ radians / r pixels and places
marks explicitly); each story carries a `// NOTES:` block documenting its decoded layout
rule. `copy/` (a stray duplicate of the sunburst family) is skipped.

The `parentChild`/`sibling` columns below record the GoTree dsl _intent_; migrated stories
may realize it differently — filled wedges via nest-θ + `datum(1)` angular auto-fit, and
the radial node-link family (radial-deep, RadialTree, RadialTreeIncline,
RadialPhylogeneticTree, RotationTree, MultilevelSilhouetteTree, outside-in-tree) via
per-leaf data-position box packing (#627).

| Example                  | parentChild              | sibling                  | node      | link            | match | notes                                                                                                                                                               |
| ------------------------ | ------------------------ | ------------------------ | --------- | --------------- | :---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ClockTree                | (distribute, align)      | (distribute, align)      | rectangle | -               |  4/5  | hollow rim now renders (innerRadius, #620); ring under-fills 2π, wedges centered on band                                                                            |
| ClockTreeWithLink        | (distribute, align)      | (distribute, align)      | rectangle | curveStepBefore |  4/5  | hollow rim now renders (innerRadius); links linear not step brackets                                                                                                |
| FlowerTree               | (nest, align)            | (distribute, align)      | circle    | straight        |  3/5  | nest-θ petals                                                                                                                                                       |
| HierarchicalSectorChart  | (nest, distribute)       | (distribute, align)      | rectangle | hidden          |  4/5  | sector wedges                                                                                                                                                       |
| MultilevelSilhouetteTree | (align, distribute)      | (distribute, align)      | mixed     | straight        |  4/5  | data-positioned multi-template (#627): root disc + wedge silhouettes + node-link fans; fan selection decoded from PNG (not in committed dsl)                        |
| OakTreeVis               | (align, nest)            | (distribute, distribute) | circle    | curveStepBefore |  3/5  | nest-r embedded; step→linear                                                                                                                                        |
| OrthogonalGridEmbedding  | (align, distribute)      | (distribute, align)      | circle    | orthogonal      |  3/5  | orthogonal links→linear                                                                                                                                             |
| RadialPhylogeneticTree   | (nest, distribute)       | (distribute, align)      | hidden    | straight        |  5/5  | data-positioned (#627); hidden nodes, links only; screen-projected chords keep Link=straight exact (linear frame, no polar coord)                                   |
| RadialTree               | (align, distribute)      | (distribute, align)      | circle    | straight        |  5/5  | exemplar/template; data-positioned box packing (#627), m=−0.20 interleaves fans; fan links bow slightly (linear-in-θ/r, #637)                                       |
| RadialTreeIncline        | (distribute, distribute) | (distribute, align)      | circle    | straight        |  4/5  | data-positioned (#627); incline = parent at box leading edge (juxtapose-θ), m=−0.13 space-between                                                                   |
| RotationTree             | (distribute, align)      | (distribute, align)      | circle    | arccurve        |  4/5  | data-positioned radial collapse (#627): root center, all else on one ring; swirls = θ-lag spirals via linear-in-θ/r resampling; arccurve petals approximated (#637) |
| SectorTree               | (distribute, align)      | (distribute, align)      | rectangle | -               |  3/5  |                                                                                                                                                                     |
| SectorTree2              | (nest, distribute)       | (distribute, align)      | rectangle | curve           |  4/5  | sector wedges; curve→none                                                                                                                                           |
| SideTree                 | (distribute, distribute) | (align, distribute)      | circle    | straight        |  3/5  |                                                                                                                                                                     |
| SpiralLayout             | (distribute, distribute) | (distribute, distribute) | circle    | straight        |  4/5  | spiral via dual-axis distribute                                                                                                                                     |
| TornadoTree              | (distribute, nest)       | (distribute, distribute) | rectangle | -               |  3/5  | nest-r embedded                                                                                                                                                     |
| TornadoTree2             | (distribute, nest)       | (distribute, distribute) | rectangle | -               |  3/5  | nest-r; neg margin not expressible                                                                                                                                  |
| TyreTree                 | (nest, align)            | (distribute, align)      | rectangle | -               |  4/5  | donut hub now renders (innerRadius); coarser angular subdivision than reference                                                                                     |
| ViolinTree               | (distribute, nest)       | (distribute, distribute) | rectangle | -               |  3/5  | nest-r; value radial thickness                                                                                                                                      |
| deep-tree                | (nest, distribute)       | (distribute, align)      | circle    | curve           |  3/5  | curve links→linear                                                                                                                                                  |
| icicleplot               | (nest, distribute)       | (distribute, align)      | circle    | curve           |  4/5  | polar icicle wedges                                                                                                                                                 |
| outside-in-tree          | (nest, distribute)       | (distribute, align)      | circle    | curve           |  5/5  | reference renders as a filled inverted sunburst (no circles/links) — ported as data-positioned wedge rings (#627), root annulus outermost                           |
| radial-deep              | (nest, distribute)       | (distribute, align)      | circle    | curve           |  4/5  | data-positioned leaf packing (#627); only curve links missing (linear)                                                                                              |
| sunburst                 | (nest, distribute)       | (distribute, align)      | circle    | curve           |  4/5  | wedge via embedded θ-dim                                                                                                                                            |

### Polar gaps surfaced (no hacks used — flagged for follow-up)

1. **Angular auto-fit: wedges DONE, point nodes worked around story-side.** Filled WEDGE (rect) nodes get real angular auto-fit: tag them `thetaSize: datum(1)` and the coord (now a fit-frame on θ) allocates angle by subtree leaf weight and fits the 2π budget (#622) — this is what closes the sunburst/sector/clock/tyre rings. POINT nodes (circles) still get no DSL-level angular allocation, but every radial node-link story (radial-deep, RadialTree, RadialTreeIncline, RadialPhylogeneticTree, RotationTree, MultilevelSilhouetteTree) now uses the #627 workaround: a story-local data pass computes per-leaf slot positions via GoTree's decoded box packing (leaf box = 1; internal box = Σ(children)/(1−m), margin m per the dsl, negative m interleaves) and emits raw radians/px. Compiling these flatten-θ point layouts down to real fields/scales so the DSL can express them remains the open follow-up on #627. Point marks also hit a center-offset under the coord transform (#678).
2. **`polar()` options (#620).** `polar()` now takes `{ innerRadius, centralAngle, startAngle, direction, center }`, and `clock()` is a polar preset; scope-bounded `theta`/`r`/`thetaSize`/`rSize` axis aliases are available on marks inside the coord. `innerRadius` (the donut hole / clock rim) is used by ClockTree (0.72), ClockTreeWithLink (0.79) and TyreTree (0.25). Still not expressible: a polar-space anchor for `PolarCenter` — the dsl wants "bottom"/"left", but `center` is only a screen-space offset.
3. **No θ/r axis swap.** GoFish's `polar()` always maps x→θ, y→r and has no transposed variant, so the dsl's `PolarAxis: x-axis` θ/r swap is not expressible. (The former `polarTransposed()` was a geometrically-identical no-op and was deleted.)
4. **Single-axis nest with point nodes.** The #622 embedding pass landed, so filled wedges embed a θ/r dimension in the transform (rect `emX` width in θ-units sweeps an arc) and tile correctly. The remaining awkwardness is a single-axis `nest` (angular or radial containment) on a POINT node: a circle can't grow on only one axis, so nest-θ / nest-r with circle nodes only partly works.
5. **Non-linear links** (curve/arc/step/orthogonal) fall back to linear, which then bows under the transform rather than rendering as authored polar curves. The route→curve API lands in draft PR #637 (note: bezier control-point resampling _spirals_ under polar, also #637). The bowing cuts both ways: RotationTree exploits it (a linear connect between anchors at lagged θ resamples into the reference's spiral swirls), while dead-straight reference links either bow slightly (RadialTree fans) or force a screen-space projection outside the coord (RadialPhylogeneticTree). Layering/ordering inside a coord has its own open issues — zOrder is ignored (#676) and ref resolution is silently order-dependent (#677).
6. **Full-2π wedges degenerate.** A rect wedge spanning exactly 2π has start angle ≡ end angle and resamples to a zero-width sliver, so a "root ring/disc" must be split into sub-2π sectors (outside-in-tree and MultilevelSilhouetteTree draw the root as four quarter-annuli/pies with seam-hiding strokes).

## Feature gaps surfaced by the port

These GoTree techniques can't be expressed with the current gofish-gotree API; ports note them inline as `// TODO`:

1. ~~**Per-depth alternating combiners.**~~ **DONE.** `parentChild`/`sibling` now accept a depth-indexed combiner via `alternate([...])` / `perDepth(d => ...)` (resolved at each node's depth in `renderSubtree`). This unlocked the H-tree/HVDrawing axis-swap and the recursive slice-and-dice treemaps (Treemap, CascadedTreemap, TreemapOval, NestedPieTree, BeamTree). Remaining nuance: asymmetric per-side nest padding (BeamTree's overhang) still isn't expressible.
2. **Non-linear links.** Only `linear` (and `bezier`) render today. Needed: `orthogonal` (GardenLayout, ReadableTreeLayout, OrthogonalTree step links), `curve` (WeaveTree, cartesian-deep-tree), `arc`/`arccurve` (arc-tree), `curveStep*` brackets (dendrogram).
3. **More node shapes.** No `triangle` mark (cheops). Also `hidden` nodes are faked with a transparent zero-size rect.
4. **Single-axis nest with point nodes.** `nest` grows a bbox; a `circle` can't grow on only one axis, so Jewelry/arc-style strings fall back to rounded rects.
5. **Value-driven proportional sizing.** Leaf areas are set with explicit pixel math; eventually these should ride gofish's scales for automatic value→size mapping.
