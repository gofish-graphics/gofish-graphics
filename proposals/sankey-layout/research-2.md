# Sankey node layout: research, round 2

Answers to Josh's round 1 feedback: variable column spacing, a name for the layered layout
that does not clash with `layer()`, tidy tree layout, and compositional ways to specify layout
phases. Round 1 is `research.md`.

## Terms

- **Gap.** The empty space between two adjacent columns (layers), where ribbons run.
- **Δy.** For one ribbon, the vertical distance between the center of its source end and the
  center of its target end. In a sankey both ends have the same width, so both edges of the
  ribbon move by the same Δy.
- **Vertical-offset ribbon.** A filled band whose top and bottom edges are the same curve shifted
  vertically by the link width `w`. GoFish's `ribbon` is this kind. Its thickness measured at a
  right angle to the band is `w / √(1 + m²)` where `m` is the slope, so a steep band looks thin.
- **Stroked link.** A curve drawn with `stroke-width = w`, as d3-sankey's
  `sankeyLinkHorizontal()` does. Its right-angle thickness stays `w`, but where the curve bends
  tighter than radius `w/2` the inner side of the stroke folds over itself.
- **Contour.** For a tree drawn top-down, the left (or right) outline of a subtree: for each depth,
  the leftmost (or rightmost) x any of its nodes reaches.

---

## 1. Variable column spacing

### 1.1 What spacing can and cannot fix

GoFish's bezier ribbon (`packages/gofish-graphics/src/ast/graphicalOperators/connect.tsx`,
edge mode, around lines 693-725) puts both control points at the middle of the gap with
horizontal tangents (d3's `linkHorizontal` convention): from `(x0, y0)` to `(x1, y1)` with
`control1 = (midX, y0)`, `control2 = (midX, y1)`. With gap `g = x1 − x0` and `d = y1 − y0`:

- `x(t) = g·(3t/2 − 3t²/2 + t³)`, `y(t) = d·(3t² − 2t³)`.
- The slope is steepest at the middle (`t = 1/2`): `dy/dx = 1.5d / 0.75g = 2d/g`. **The bezier
  is twice as steep at its middle as the straight line between the same ends** (`Curve.linear`,
  slope `d/g`).

**Crossings do not depend on the gap.** For both linear and bezier ribbons in one gap, `x(t)` is
the same for every ribbon and `y(t) = y0 + (y1 − y0)·s(t)` with the same `s`. The vertical
distance between two curves is `(a0 − b0)(1 − s) + (a1 − b1)s`, which changes sign exactly when
the order of the start points differs from the order of the end points. So two ribbons in the
same gap cross if and only if the column orders say so, whatever the gap width. Only the order
(crossing minimization) removes ribbon-over-ribbon overlap.

What the gap does change:

| Effect                                          | Depends on gap? | Rule                                                                                                      |
| ----------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- | --- | --------------------------------- |
| Ribbon-over-ribbon crossings (how many)         | no              | set by column order only (proof above)                                                                    |
| Area of each crossing's overlap                 | yes, grows      | about `w1·w2 /                                                                                            | m1 − m2 | `; slopes scale as `1/g`, so the area grows in proportion to `g` (a wider gap means a longer, shallower overlap) |
| Steepness and visible thinning (filled ribbon)  | yes, shrinks    | max slope `2                                                                                              | Δy      | /g`(bezier),`                                                                                                    | Δy  | /g`(linear); thickness`w/√(1+m²)` |
| Stroke folding (stroked links, d3-sankey)       | yes, shrinks    | needs min radius of curvature `≥ w/2`; see below                                                          |
| Ribbon passing behind a node in a middle column | no              | only links that skip a column do this; fixed by routing through placeholder (dummy) nodes, not by spacing |
| Ribbons bunched up next to a node               | yes             | part of the steepness problem                                                                             |

For the stroked case, the maximum curvature of this cubic (computed numerically) is:

| `    | Δy   | /g`  | max curvature `· g` | where (t) | max slope |
| ---- | ---- | ---- | ------------------- | --------- | --------- |
| 0.1  | 0.54 | 0.27 | 0.2                 |
| 0.25 | 1.20 | 0.24 | 0.5                 |
| 0.5  | 1.92 | 0.17 | 1                   |
| 1    | 3.06 | 0.07 | 2                   |
| 2    | 5.55 | 0.02 | 4                   |

For gentle slopes the curvature is about `5.4·|Δy|/g²`, so a stroked link of width `w` does not
fold when `g ≳ √(2.7·w·|Δy|)`.

So the precise rules per curve, for a gap whose ribbons have offsets `Δy_i` and widths `w_i`:

- **Max slope `s` (filled or stroked, any curve):** linear `g ≥ max|Δy_i| / s`; GoFish bezier
  `g ≥ 2·max|Δy_i| / s`. Example: keeping every filled bezier ribbon at least 70% of its width
  thick (`m ≤ 1`) needs `g ≥ 2·max|Δy_i|`.
- **No fold (stroked bezier):** `g ≥ max_i √(2.7·w_i·|Δy_i|)` for gentle slopes (use the table
  for steep ones).
- **Orthogonal (step) curves:** slope does not matter, but parallel vertical segments need
  their own lanes: ELK's rule is
  `g ≥ max(nodeNode, 2·edgeNode + (lanes − 1)·edgeEdge)` (below). For thick ribbons, add the sum of
  their widths.

So when Josh sees "a lot of overlap that spacing could take care of", what spacing actually fixes
is steepness, thinning and folding, plus the pile-up near nodes. It does not fix how many ribbons
cross or links passing behind nodes, and a wider gap makes each crossing's overlap area larger
(but shallower).

### 1.2 Do tools do it? Yes, ELK does; Lupton drafted it; sankey tools do not

**ELK Layered: per-gap width from the edges in that gap.** From `SplineEdgeRouter.java` and
`PolylineEdgeRouter.java` (https://github.com/eclipse/elk, `plugins/org.eclipse.elk.alg.layered/
src/org/eclipse/elk/alg/layered/p5edges/`):

- Polyline routing: the gap after a layer is `nodeNodeBetweenLayers + 0.4 · min(1, edgeEdge /
nodeNode) · maxVertDiff`, where `maxVertDiff` is "the maximum vertical span of any edge between
  this and the next layer", "to keep the edge slopes from becoming too steep" (constant
  `LAYER_SPACE_FAC = 0.4`).
- Spline routing: each gap is "usually `max{nodeNodeSpacing, 2 * edgeNodeSpacing + (slots-1) *
edgeEdgeSpacing}`", where a slot is "a vertical strip between a pair of layers in which a
  non-straight edge will be routed. The more edges in-between a pair of layers, the more slots are
  required." In `SLOPPY` mode (the default `edgeRouting.splines.mode`; values `CONSERVATIVE`,
  `CONSERVATIVE_SOFT`, `SLOPPY`), the gap may grow further to
  `sloppy.layerSpacingFactor (default 0.2) · min(1, edgeEdge/nodeNode) · maxVertDiff`
  ("the idea is to limit the angle of vertical segments").
- Related options: `spacing.nodeNodeBetweenLayers` (default 20), `spacing.edgeNodeBetweenLayers`
  ("spacing to be preserved between nodes and edges that are routed next to the node's layer",
  default 10), `spacing.edgeEdgeBetweenLayers` ("between pairs of edges that are routed between the
  same pair of layers", default 10). `layerUnzipping.strategy` (`NONE` default, `ALTERNATING`)
  splits a layer into sublayers while keeping the order; it widens the drawing to give edges room,
  rather than widening one gap.

So ELK's gap is a **minimum plus a term linear in the largest vertical span in that gap**, which is
the slope rule `g ≥ k·max|Δy|` with `k = 0.4` (polyline) or `0.2` (sloppy splines).

**d3-sankey-diagram (Lupton): drafted, then commented out.** `src/sankeyLayout/horizontal.js`
ships uniform columns (`dx = (width − nodeWidth) / maxRank`), but carries a commented-out version
that does exactly this: `minEdgeDx(w, y0, y1)` gives the horizontal room a link of width `w` needs
to go from `y0` to `y1` (with `ay = |dy| − w`, `dx = √(w² − ay²)`, matching its circular-arc link
shape in `linkPath.js`, whose arc radius is bounded below by `dy/2`); `minWidths[rank]` is the
max over the links leaving that rank; then "if `totalMinWidth > width`, allocate fairly
(`width·w/totalMinWidth`), else add the spare evenly". That is CSS Grid's `minmax(min, 1fr)`
per gap. Lupton's links are constant-thickness arcs, so his `minEdgeDx` is the no-fold rule for
arcs.

**Others.** Graphviz `ranksep` is "the minimum vertical distance between the bottom of the nodes
in one rank and the tops of nodes in the next"; `"equally"` spaces rank centers equally
(https://graphviz.org/docs/attrs/ranksep/). Nothing in the docs widens a rank gap for steep edges;
long edges become chains of virtual nodes instead. dagre: fixed `ranksep`; edge labels become
dummy nodes that take room. Nevron's layered layout has an overridable `GetSpacingAfterLayer`
whose built-in version returns the constant. **Every sankey tool I checked uses uniform columns**:
d3-sankey (`kx`), ECharts (`scaleNodeBreadths(nodes, kx)`, `sankeyLayout.ts:248`), SankeyMATIC
(`n.x = widthPerStage * n.stage`, `sankey.js:623`), RAWGraphs (d3-sankey), Plotly and Highcharts
(evenly spaced, unless the user sets `node.x` or `column`). ggalluvial is the exception by
construction: axes are x values in the data, so the user can space them unevenly by hand. I found
no sankey or alluvial paper that sizes gaps from link steepness; Zarate et al. 2018 and
Alemasoom et al. 2016 optimize order and vertical position with fixed columns. Storyline layouts
(Tanahashi and Ma 2012; Liu et al., StoryFlow 2013) minimize crossings and wiggles with x fixed
by time.

**Why barycenter can beat d3-sankey on crossings** (Josh's surprise). d3-sankey's loop is a
coordinate method: it moves nodes toward straight links, damped (`alpha = 0.99^i`), for only 6
rounds, and the order is whatever the y positions say after collision resolution. It never counts
crossings. Barycenter (and median) sweeps act on ranks and are the classic crossing heuristic
(Sugiyama 1981; Eades and Wormald 1994). Lupton's library replaced d3's relaxation with that
approach: `src/sortNodes/` has `weighted-median-sort.js`, `count-crossings.js`, `swap-nodes.js` and
`dummy-nodes.js`, the dagre-style order phase with weighted medians and transposition. Zarate et
al. report that the ILP (exact) has measurably fewer crossings than heuristics.

### 1.3 How GoFish could size gaps

The dependency points one way. Node y positions do not depend on the x gaps: σ_y, the stacks
and the column alignment are all set on y, and `ribbon` is a relational mark drawn afterward. So
"gap from the Δy of the ribbons in it" can be computed after the y layout without a cycle. What
needs care is that the gap reads relations between siblings (the ribbons join nodes in two
different columns), which a plain `spread` spacing cannot see.

Spellings to consider in the proposal (research only, no recommendation):

- **Per-gap spacing list with a minimum plus a flexible share**, Lupton's and CSS Grid's
  `minmax(min, 1fr)`: the x-spread's `spacing` takes a rule instead of a number, for example a
  `Gap.fit({ curve, maxSlope })` strategy. The rule's minimum comes from the ribbons in the gap;
  leftover width splits evenly. `fr` spacing already exists for the equal split.
- **The ribbon declares its own room**, as ELK's router does: the edge router asks for room and
  the layer placement grants it. In GoFish, a relational mark would add a claim on the gap. This is
  the more general route (any connector could ask for room), and it is new machinery.
- **A layout-phase option**, ELK-style: the layered operator's coordinate phase takes a
  `layerSpacing` strategy (`uniform`, `slope`).

---

## 2. Naming the layered operator (not `layered`)

GoFish words already taken: `layer` (paint stack), `.layer()` (chart tiers), "tier" (used about
500 times in source and docs for `.layer()` tiers), `levels` (axis levels, `ast/axes/levels.ts`),
`stack`, `spread`, `group`, `partition`, `treemap`, `pack`, `.flow()`. `rank` appears only
internally (matrix "rank-1/rank-2" writes in `_node.ts`, a level's rank in `schema.ts`).

Precedent names:

| System                      | Name                                                  |
| --------------------------- | ----------------------------------------------------- |
| d3-dag                      | `sugiyama()` (and `zherebko()`, `grid()`)             |
| ELK                         | `layered` (formerly KLay Layered; Cytoscape `klay`)   |
| Graphviz                    | `dot`; the concept is `rank` (`rank=same`, `ranksep`) |
| dagre                       | the library name; option `ranker`                     |
| yFiles                      | `HierarchicLayout` (newer releases: Hierarchical)     |
| OGDF                        | `SugiyamaLayout`                                      |
| MSAGL                       | `SugiyamaLayoutSettings`                              |
| GoJS                        | `LayeredDigraphLayout`                                |
| Cytoscape.js                | `breadthfirst`, `dagre`, `klay`, `elk`                |
| NetworkX                    | `multipartite_layout(G, subset_key="layer")`          |
| igraph                      | `layout_sugiyama`                                     |
| Mermaid                     | `flowchart` (diagram type)                            |
| Highcharts / ECharts sankey | `column` / `depth` per node; `levels` for styling     |
| ggalluvial                  | `axis`, `stratum` (node), `lode` (link end)           |

Candidates for GoFish:

1. **`ranked`** (or `rank`). Graphviz's word for the concept; dagre's `ranker`; ELK's phase is
   "layering" but its papers say rank. Pro: established, short, not used in GoFish's surface,
   directionless (works for x or y). Con: SQL and polars `rank()` is a window function giving
   ordinal positions, so `rank` as a layout operator could read as a data transform. `ranked`
   (adjective, like ELK's `layered`) avoids the verb clash but is unusual for a GoFish operator,
   which are nouns or verbs (`spread`, `stack`, `treemap`).
2. **`sugiyama`.** d3-dag, OGDF, MSAGL, igraph. Pro: unambiguous to graph-drawing people, a
   precedent in JS (d3-dag). Con: a person's name; the naming rules prefer designers' names over
   specialist names and plain words; it names one framework, which is odd if the strategies inside
   are swapped (a "sugiyama" with network-simplex ranks is still Sugiyama, so this is mild).
3. **`hierarchy`** (yFiles' hierarchic layout). Pro: designers know "hierarchical layout" from
   yFiles, Visio, draw.io. Con: d3-hierarchy and GoTree use "hierarchy" for trees, and GoFish has
   hierarchy layouts (#738) that are tree layouts; confusing next to `treemap` and `partition`.
4. **`dag`.** d3-dag, Airflow-style vocabulary. Pro: says the input shape. Con: names the data, not
   the arrangement; sankeys with cycles (Lupton's backward flows) are not DAGs after cycle removal is
   added; an operator named after a data structure breaks the GoFish pattern (`spread` names what it
   does).
5. **`flowchart`**. Mermaid. Pro: what users call the picture. Con: a chart-type name (the
   composition-not-enumeration essay argues against those), and `.flow()` is already a builder
   method.
6. **`strata`** (geology; ggalluvial's stratum). Pro: plain English for "horizontal bands in
   order", unused in GoFish. Con: ggalluvial uses stratum for a node, not a layer; d3 `stratify`
   means building a hierarchy from a table, a different thing.

The strongest are `ranked`/`rank` (established concept word) and `sugiyama` (established
operator name in JS). The proposal should show them on the real examples.

---

## 3. Tidy tree layout

### 3.1 The algorithms

- **Reingold and Tilford 1981**, "Tidier Drawings of Trees", IEEE TSE 7(2). Binary trees: nodes at
  their depth; place each subtree rigidly; push sibling subtrees together until their facing
  contours are `separation` apart at some depth; center the parent over its first and last child.
- **Walker 1990**, "A Node-Positioning Algorithm for General Trees", Software P&E 20(7). n-ary
  trees; when a subtree is pushed right, the smaller subtrees between are spaced out evenly
  (`apportion`).
- **Buchheim, Jünger and Leipert 2002/2006**, "Improving Walker's Algorithm to Run in Linear Time"
  (GD 2002; SP&E 36). Same layouts as Walker, linear time (threads and deferred shifts). This is
  d3's `tree()` (`d3-hierarchy/src/tree.js`).
- **van der Ploeg 2014**, "Drawing Non-layered Tidy Trees in Linear Time", SP&E 44(12). Nodes of
  different heights; a child sits directly below its parent instead of on a shared depth row, so
  contours are compared over y intervals. JS: `d3-flextree`.
- **Kennedy 1996**, "Drawing Trees", J. Functional Programming. The compositional spec: a subtree's
  extent is a list of (left, right) per depth; merging is pointwise; fitting two extents is the max
  of the pairwise deficits; absolute positions come in a later pass.

d3-hierarchy: `tree()` and `cluster()` both take `size([w, h])` or `nodeSize([dx, dy])` and
`separation(a, b)`, default `a.parent === b.parent ? 1 : 2` (cousins get twice the gap).

**d3.tree vs d3.cluster (dendrogram), and the sankey connection.** `cluster.js`: leaves are placed
one after another in depth-first order, `x += separation(node, previous)` (a spread of the leaves);
an internal node's x is the **mean** of its children's x (not the midpoint of the first and last
child, as in tidy trees); its y is `1 + max(children's y)`, its height, and the final y is
`root.y − node.y`. So **d3.cluster's levels are d3-sankey's `sankeyRight` layering** (column
`n − 1 − height`), and **d3.tree's levels are `sankeyLeft`** (column = depth). It is not
`sankeyJustify`: justify keeps internal nodes at their depth and only moves leaves to the last
column, while cluster moves internal nodes too. In a tree, cluster puts all leaves on one row,
like justify, but the two differ for internal nodes of uneven subtrees.

**ELK `mrtree`** (Mr. Tree) is ELK's tree layout, with options such as weighting and search order.
**Graphviz** has no tree layout as such; `dot` lays a tree out as a DAG with Sugiyama phases.

### 3.2 Tidy tree in GoFish terms

Reingold–Tilford's coordinate assignment is: for each node, lay its child subtrees out rigidly,
side by side, as close as their contours allow plus `separation`, then center the parent over
the children. In GoFish words that is **a nested `spread` along x where the gap is measured between
subtree outlines, not bounding boxes**, plus "center the parent over the first and last child".

The in-repo survey (`notes/design/modular-layout-algorithms.md` §2.2) already says this in
constraint terms: for adjacent siblings L, R and every shared depth `d`,
`x_R − x_L ≥ rightContour_L(d) − leftContour_R(d) + separation`, a difference constraint whose least
solution is a left-to-right max. It is the same max-plus arithmetic as GoFish's size fold, except
the claim that bubbles up is a per-depth list (the contour), not one number. Its caveat: GoFish's
`distribute` keeps sibling **bounding boxes** apart on one axis, so bounding-box tidy trees work
today and contour-tight ones need a richer claim.

**How GoFish and GoTree draw trees today.**

- `packages/gofish-gotree/stories/gallery/NodeLinkTree.stories.tsx`: `parentChild = combine({ x:
align middle, y: distribute spacing 90 })`, `sibling = combine({ x: distribute spacing 10, y:
align start })`. Siblings are kept apart by their **bounding boxes**, and the parent is centered
  on the **box of its child group** (not on the first and last child). This is a bounding-box tidy
  tree: no contour compaction, so a wide grandchild row pushes whole subtrees apart.
- `Dendrogram.stories.tsx`: x is `nest` (the parent box spans its subtree), y is distribute; leaves
  align at the bottom, d3.cluster's shape.
- GoTree's relations (Li et al. CHI 2020), as the ports record them: root relations `include`,
  `within`, `juxtapose`; sibling relations `flatten`, `align`. The port maps include → `nest`,
  juxtapose/flatten → `distribute`, within/align → `align`.
- `packages/gofish-graphics/stories/lowlevel/MixedOrientation.stories.tsx` has a "tidy tree drawn
  level by level": a `spreadY` of depth rows, each a centered `spreadX`. The parents are not
  centered over their children. That is a layered layout with only phases 1 and 2 (levels, then
  in-row order from data), the same shape as the sankey prototype.
- `stories/lowlevel/NestedBoxesTree.stories.tsx` and `NodeLink.stories.tsx` place by nesting and
  explicit positions.

**Does GoFish measure gaps on shapes anywhere?** Yes, in a few places, but never in `distribute`:

- `pack` grows each child's enclosing circle by `spacing / 2` and packs circles
  (`graphicalOperators/pack.tsx`).
- `Overlap.separate` and `noise` see each child as its enclosing circle (`OverlapItem = { at, r }`,
  `graphicalOperators/overlap.ts`).
- Every node has an outline (`ast/geometry/outline.ts`, `GoFishNode.geometry()`), used by labels
  ("does not cover the labeled marks") and by `enclose` (blob, arcs, hull;
  `graphicalOperators/enclose/arcs.ts`).
- `distribute` and `spread` measure boxes only.

So a contour gap is "spread with the gap measured on outlines": for each horizontal band (depth),
the distance between the right outline of the left child and the left outline of the right child,
minimized over bands. The outlines exist; the claim carrier that bubbles a per-band profile up does
not. The typographic precedent is **optical kerning**: a type tool spaces two glyphs by their
outlines, not their boxes.

### 3.3 Tidy tree and Sugiyama coordinate assignment

- Tidy tree = layered layout where layering is depth (`sankeyLeft`) or height (`sankeyRight`,
  cluster), the order is given by the tree (no crossings possible), and coordinate assignment is
  contour packing plus parent centering. A tree needs no crossing minimization.
- Brandes–Köpf (2001) generalizes "parent centered over children": each node is aligned with its
  **median** neighbor in the adjacent layer, forming vertical blocks; blocks are compacted left
  (a longest-path pass over separation constraints, the same push-together as tidy packing); this
  is done for four directions (up/down × left/right) and the results are averaged. On a tree with
  downward alignment the median child's block runs straight down, which approximates centering.
  The "average the extreme solutions" policy is the same one Kennedy uses for symmetric tidy trees
  (left-packed and right-packed, averaged).
- d3-sankey's relaxation is the weighted version: each node moves toward the value-weighted
  barycenter of its link ends. The mean (cluster), the midpoint of the extremes (tidy), the median
  (Brandes–Köpf) and the weighted barycenter (d3-sankey) are four choices of one rule: **place a
  node at a center of its neighbors in the adjacent layer, then remove overlap within the layer.**
  The parts that differ are which center and how overlap is removed (contours for rigid subtrees,
  boxes for blocks, 1-D collision passes for sankey nodes).

What this suggests for the proposal: the layered operator's coordinate phase and a tidy tree's
are one family, `center` (mean / median / midpoint / weighted barycenter) plus `separate`
(boxes / contours / 1-D push), and trees are the case where ordering is free.

---

## 4. Compositional specification of layout phases (deferred section)

- **d3-dag**: one builder slot per phase, each an operator with its own fluent options:
  `sugiyama().layering(layeringSimplex()).decross(decrossTwoLayer().order(twolayerAgg(aggMedian())))
.coord(coordQuad())`. Operators nest (an aggregator inside a two-layer method inside a decross
  method). Closest to GoFish strategy families with nested options.
- **ELK**: one flat strategy option per phase (`layering.strategy`, `crossingMinimization.strategy`,
  `nodePlacement.strategy`), plus per-node constraints (`layering.layerConstraint`, model order).
  Internally, each phase declares the intermediate processors it needs and an assembler builds the
  pipeline.
- **Constraint-based layered layout**: Dwyer and Koren, "DIG-CoLa: Directed Graph Layout through
  Constrained Energy Minimization" (InfoVis 2005) and Dwyer, Koren and Marriott, "IPSep-CoLa: An
  Incremental Procedure for Separation Constraint Layout of Graphs" (InfoVis 2006): layering becomes
  separation constraints `y_target ≥ y_source + gap` for every edge, solved with stress
  majorization. WebCoLa exposes this as `layout.flowLayout(axis, minSeparation)` alongside
  `avoidOverlaps(true)` and user constraints `{ type: "separation", axis, left, right, gap,
equality }` and `{ type: "alignment", axis, offsets }`. Here "phases" turn into constraint sets
  added to one solve.
- **Graphviz / dagre**: phases are fixed; the user writes constraints into the graph (`rank=same`,
  `minlen`, `weight`, `constraint=false`; dagre ordering constraints and `customOrder`).
- **Lupton's d3-sankey-diagram**: the results of the discrete phases are data (`ordering` as layers
  of bands of nodes; `rankSets`), so a user can replace a phase by writing its output.
- **Penrose**: `ensure` (constraints) and `encourage` (objectives) in a style program, one
  optimizer, no phases. **Bluefish**: relations (`Stack`, `Distribute`, `Align`) composed in a tree,
  with no global phases.

For GoFish the two readings are: (a) each phase is a strategy family (`Rank.longestPath()`,
`Order.median()`, `Coord.…`-like), d3-dag style; (b) each phase's output is a data field (column,
order) that later operators read, Lupton style, so a phase is replaced by computing the field
another way. They combine: a strategy is a way to compute the field.

---

## Sources

- ELK: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html; option pages
  `layered-spacing-edgeNodeBetweenLayers`, `layered-spacing-edgeEdgeBetweenLayers`,
  `layered-edgeRouting-splines-mode`, `layered-edgeRouting-splines-sloppy-layerSpacingFactor`,
  `layered-layerUnzipping-strategy`; source `SplineEdgeRouter.java`, `PolylineEdgeRouter.java` at
  https://github.com/eclipse/elk.
- Graphviz `ranksep`: https://graphviz.org/docs/attrs/ranksep/.
- d3-sankey-diagram: https://github.com/ricklupton/d3-sankey-diagram (`src/sankeyLayout/horizontal.js`,
  `src/linkPath.js`, `src/sortNodes/`).
- ECharts `src/chart/sankey/sankeyLayout.ts`; SankeyMATIC `build/sankey.js`
  (https://github.com/nowthis/sankeymatic).
- d3-hierarchy `src/tree.js`, `src/cluster.js`: https://github.com/d3/d3-hierarchy.
- Nevron layered layout: https://helpopenvision.nevron.com/diagram-layered-graph-layout.html.
- Li et al., GoTree, CHI 2020: https://doi.org/10.1145/3313831.3376297.
- arXiv:1912.05339 (summary of Alemasoom 2016 and Zarate 2018).
- Curve numbers: computed for the cubic in `connect.tsx` (control points at the middle of the gap,
  horizontal tangents).
