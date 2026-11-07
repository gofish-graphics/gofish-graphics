# Edge routing and the kinds of stacking, as read

Research notes for the stacking design. Findings only, no API proposal. Read on 2026-11-07. Each section says what was fetched. Where a source could not be read, the section says so and does not guess at its content.

The question comes from a new idea. A line or a ribbon could answer a geometry query that gives it as a family of intervals along a 1D parameter, one interval at each x. A line has a stroke, so its intervals have a width. The box (AABB, the axis-aligned bounding box) is the hull of the intervals, so one can be turned into the other. Then `stack` would stack boxes or interval families. Two questions follow.

1. How do graph layout and routing systems represent an edge, and would an interval family work for edge routing?
2. Are box stacking and interval stacking the only two kinds, or is there a third?

Terms used below.

- **Interval family.** A map from a parameter t to an interval [lo(t), hi(t)] measured in some direction. A ribbon over x is one, with t = x and the interval measured along y.
- **Spine.** The center curve of a thick line or a strand.
- **Cross-section.** The direction in which the interval at t is measured. It is either a fixed axis (vertical for a ribbon over x) or the normal of the spine (at a right angle to the spine at that point).
- **Rigid placement.** Each child gets one offset, a single number, and keeps its shape.
- **Pointwise placement.** Each child gets an offset at each t, so its shape can change. A band in a stacked area takes its bottom from the band below at each x.

## Part 1. What an edge is in layout and routing systems

### Graphviz dot

Read: the dot user's guide, https://www.graphviz.org/pdf/dotguide.pdf (full text), the TSE 1993 paper by Gansner, Koutsofios, North and Vo, https://graphviz.org/documentation/TSE93.pdf (full text), and the `penwidth` page, https://graphviz.org/docs/attrs/penwidth/.

- **What an edge is.** In the output, "Every edge is assigned a pos attribute, which consists of a list of 3n + 1 locations. These are B-spline control points" (dotguide, appendix on the attributed DOT format). So the final edge is a curve with no width.
- **Long edges.** "Edges that span more than one rank are broken into chains of 'virtual' nodes and unit-length edges" (dotguide, section 1). The parameter is the rank. Each virtual node is a node with a size, and the x positions keep the spacing rho(a, b) = (xsize(a) + xsize(b)) / 2 + nodesep(G) between neighbors on a rank (TSE93, section 4). An edge label is "represented as off-center virtual nodes" (TSE93).
- **Routing.** A spline is fit through a chain of boxes: "Given B_0, ..., B_m ... where B_i are boxes parallel to the coordinate axes, such that B_i has edges in common with B_i-1 and B_i+1 ... find ... the control points of a piecewise Bezier curve" (TSE93, section 5). The boxes alternate "inter-rank boxes and virtual node boxes". After a spline is drawn, "the virtual node boxes are updated according to the BB_i, so splines computed afterward will be able to use all the space remaining". So the route is reserved as a stack of boxes, one per rank, before it is a curve. The authors add, "If we were writing this program again, we would try general polygons instead of boxes."
- **Several edges between the same two nodes.** "a spline is computed for one of the edges, and the rest of the edges are drawn by adding an increasing X coordinate displacement to each one (multiples of nodesep(G) work well). Space for multiple edges must be reserved in the previous pass" (TSE93, section 5.1.1). This is an offset along a fixed axis (x), not along the normal of the curve.
- **Width.** `penwidth` is "the width of the pen, in points, used to draw lines and curves." The page does not say it affects layout, and nothing in the TSE93 routing reads it. So edge thickness is a paint property in dot.
- **Merging.** `concentrate=true` merges edges that "run parallel, have a common endpoint and have length greater than 1" (dotguide, section 3.3).

### dagre

Read: the dagre wiki, https://github.com/dagrejs/dagre/wiki. Not read: the source file that splits long edges (`lib/normalize.js` returned 404 at the path tried).

- **What an edge is.** After layout each edge has `points`, an array of `{x, y}`, which include "where the edge intersects with the node, assuming a rectangular shape."
- **Width.** The edge attributes `width` and `height` are "The width of the edge label in pixels", not the edge's thickness. There is no edge thickness.
- **Parameter.** `minlen` is "The number of ranks to keep between the source and target of the edge." The wiki credits the Gansner et al. pipeline. It does not describe dummy nodes.

### ELK (Eclipse Layout Kernel)

Read: the graph data structure page, https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure.html, the ELK Layered page, https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html, and the `spacing.edgeEdge` page, https://eclipse.dev/elk/reference/options/org-eclipse-elk-spacing-edgeEdge.html.

- **What an edge is.** "The path an edge takes through a diagram is described by its list of ElkEdgeSection instances." A section "has x and y coordinates for its start and end points and a possibly empty list of bend points." A hyperedge has several sections. Edges attach to ports, and "Each port belongs to exactly one node."
- **Width.** ELK Layered lists an "Edge Thickness" option, default 1. The page gives only its name and default. The data structure page gives x, y, width and height to "nodes, ports, and labels," not to edges.
- **Spacing between edges.** `spacing.edgeEdge` is "Spacing to be preserved between any two edges", default 10, with the note "while this can somewhat easily be satisfied for the segments of orthogonally drawn edges, it is harder for general polylines or splines." Layered also has `spacing.edgeEdgeBetweenLayers` (default 10).
- **Long edges.** The Layered page names a "Long Edge Ordering Strategy" with default `DUMMY_NODE_OVER`, so dummy nodes exist. The page does not describe the phases further.

### libavoid (Adaptagrams)

Read: the libavoid overview, https://www.adaptagrams.org/documentation/libavoid.html, the `Avoid` namespace reference, https://www.adaptagrams.org/documentation/namespaceAvoid.html, the `Router` class page, https://www.adaptagrams.org/documentation/classAvoid_1_1Router.html, and issue 67, https://github.com/mjwybrow/adaptagrams/issues/67. Read second hand: the account of Wybrow et al.'s nudging in "Orthogonal Edge Routing for the EditLens", https://arxiv.org/pdf/1612.05064. Not read: Wybrow, Marriott and Stuckey, "Orthogonal Connector Routing" (GD 2009, DOI 10.1007/978-3-642-11805-0_22) and "Orthogonal Hyperedge Routing" (Diagrams 2012). No open copy was reachable (ResearchGate refused, 403).

- **What an edge is.** A `PolyLine` is "A multi-segment line, represented with the Polygon class." A connector has no width in the reference.
- **Nudging.** Routes are found first and may share segments. Then nudging moves segments apart. From issue 67: "The channel for a given horizontal segment is a rectangle whose x-interval equals that of the segment." Segments are partitioned "into groups whose channels overlap". Each segment is "Free" ("allowed to wind up anywhere within its channel") or "Fixed". A VPSC problem (variable placement with separation constraints, a quadratic program) with "Separation constraints to achieve the desired nudging" places them. If it fails, the code "decreases the nudging distance and tries again", at most 10 times. A first pass places free segments of shared paths at the same position so "they have correct nudging orders determined for them".
- **The spacing.** `idealNudgingDistance` is "the spacing distance that will be used for nudging apart overlapping corners", default 4. Options control whether end segments at shapes are nudged and whether shared paths with a common end point are nudged.
- **Ordering.** The EditLens paper says the Wybrow et al. nudging "uses the available space to spread edges as much as possible and a global strategy to minimize their edge crossings."

So in orthogonal routing each straight segment is an interval along its own axis (its x-interval for a horizontal segment), and parallel segments in one channel are a 1D placement problem across the channel, with an order and a minimum gap. The parameter is not shared by the whole edge. It changes at every bend, because a horizontal segment and a vertical segment are measured along different axes.

### Edge routing with ordered bundles (MSAGL)

Read: Bereg, Holroyd, Nachmanson and Pupyrev, "Edge Routing with Ordered Bundles", https://ar5iv.arxiv.org/html/1209.4227 (GD 2011, full text via ar5iv). Not read: the MSAGL source, and the 2016 Computational Geometry version.

- **What an edge is.** A path is a sequence of straight "bundle segments" joined by curved "hub segments": "we connect the segments pi_uv and pi_vw by a smooth curve called a hub segment." Hub segments are biarcs tangent to the bundle segments.
- **Width.** Each path has a width. A bundle's ideal width is "the sum of all path widths of the bundle, together with the total of the separations between them", e.g., "for a bundle with three paths of widths 1, 2 and 2, and a path separation of 1, the bundle width is 7." That is a 1D stack with glue equal to the separation.
- **Direction of the stack.** The paths on an edge are drawn "as distinct curves parallel to uv" (section 3). So the stack is across the bundle segment, at a right angle to it.
- **Order.** "We fix a direction of the edge, and construct the ordering on it by sorting P_uv" (section 6.1). The order is chosen per edge to minimize crossings (Problem 4, a form of metro-line crossing minimization).
- **Hubs.** The hub radius is at least mu times the bundle width (mu = 1/sqrt(2) in the implementation) and is chosen so "any two bundles are separated before entering the hub by at least the given edge separation." The hub is where one stack ends and the next begins with a different order.

### Metro lines and storylines

Read: the abstract of Fink and Pupyrev, "Metro-Line Crossing Minimization: Hardness, Approximations, and Tractable Cases", https://arxiv.org/abs/1306.2079, and the model section of van Dijk et al., "Computing Storyline Visualizations with Few Block Crossings", https://ar5iv.labs.arxiv.org/html/1709.01055. Not read: Nöllenburg's MLCM paper (https://i11www.iti.kit.edu/extra/publications/n-iamlc-10.pdf, found but not opened), the Argyriou, Bekos, Kaufmann and Symvonis JGAA paper, Tanahashi and Ma 2012, and StoryFlow (Liu et al. 2013). No open copy of the last two was found.

- **Metro lines.** "Given an embedded graph and a set L of simple paths, called lines, order the lines on each edge so that the total number of crossings is minimized." In the MLCM-P variant, "line ends must be placed in outermost position on their edges." The representation is an order of lines per edge. The geometry of the parallel strands is left to drawing.
- **Storylines.** "Each character is represented by an x-monotone curve from left to right." The layout is "a sequence of permutations", one per time, and the characters of a meeting "must be a contiguous block" in the permutation. So a storyline is an order at each time step, and the drawing places lines in that order with gaps. The paper does not give the spacing.

Both are interval or point placements per x (or per edge), in an order that changes. The ribbon chart in `proposal.md` has the same shape.

### Sankey and alluvial diagrams

Read: the d3-sankey README, https://github.com/d3/d3-sankey/blob/master/README.md, plotly/d3-sankey pull request 2, https://github.com/plotly/d3-sankey/pull/2, and the ggalluvial `geom_flow` reference, https://corybrunson.github.io/ggalluvial/reference/geom_flow.html. Not read: Riehmann, Hanfler and Froehlich, "Interactive Sankey Diagrams" (InfoVis 2005). No open copy was found.

- **d3-sankey.** A link has `y0`, "the link's vertical starting position (at source node)", `y1`, the same at the target, and `width`, "the link's width (proportional to link.value)". `sankeyLinkHorizontal` returns a path from `[source.x1, y0]` to `[target.x0, y1]`, and the README draws it with `.attr("stroke-width", d => d.width)`. So a link is a spine with one constant width, and a stroke measures width along the normal. Link strands are stacked at each node along y: the y0 values of a node's links are a 1D stack of widths.
- **The cross-section problem.** Pull request 2 on plotly's fork drew links as filled shapes between two curves instead of a stroke. The author lists the cost: "when the link is thick, and slope is steep, the link appears to be thinner in the middle than at the nodes." A reviewer (alexcjohnson) says the vertical width "doesn't, in itself, mean anything". He says the perpendicular width is what shows how much flows, and the stroke kept it. He asks for something between "constant perpendicular thickness" and "constant vertical thickness". The filled form "fixes fat-link artifacts, avoids overlaps in multi-part links, and allows link outline strokes."
- **ggalluvial.** `geom_flow` "plots filled x-splines between each such pair" of strata, with "filled rectangles at either end". The boundaries are "parallel x-splines". The page does not say which cross-section stays constant, but two curves that are the same curve shifted along y keep a constant vertical width, so ggalluvial uses the vertical cross-section.

So two conventions exist and both are in use. A stroked link (d3-sankey) has a constant width along the normal. A filled link between two curves shifted in y (plotly's fork, ggalluvial) has a constant width along y. They agree only where the link is flat. The streamgraph notes in `streamgraphs.md` record the same issue for SineStream (the eye reads the gap at a right angle).

### Thick lines and variable-width strokes

Read: SVG Strokes, https://www.w3.org/TR/svg-strokes/, Figma's `VariableWidthStrokeProperties`, https://developers.figma.com/docs/plugins/api/VariableWidthStrokeProperties, and Wikipedia's "Parallel curve", https://en.wikipedia.org/wiki/Parallel_curve. Not read: Skia's stroker source.

- **SVG.** The stroke shape is a union of dash shapes, caps and joins. The join construction sets lines "at a distance of 'stroke-width' / 2 to the left and to the right" of each segment, so width is measured along the normal. `stroke-width` takes one value. SVG has no width profile.
- **Figma.** A variable-width stroke is a spine plus a list of `VariableWidthPoint`s, each with a `position` "from 0 (the start of the stroke) to 1 (the end of the stroke)" and a `width` "as a fraction of the stroke weight". So the representation is a spine with a width function over a parameter along the spine. The page does not say whether the parameter is arc length. Variable-width strokes do not work on branching vector networks.
- **Offset curves fail at tight bends.** A parallel curve is "a curve whose points are at a constant normal distance from a given curve", and parallel curves "will have cusps when the distance from the curve matches the radius of curvature." So a strand stacked along the normal of a spine is defined only where its distance from the spine is less than the spine's radius of curvature. Inside a tight bend, the inner strands fold over themselves.
- **GoFish today.** An `Outline` in `packages/gofish-graphics/src/ast/geometry/outline.ts` already carries `width`, "the width of the band a pen draws along the path, on an open or a closed outline alike." So a line's outline is already a spine plus a constant width.

### Would an interval family work for edge routing?

What the systems above use for an edge:

| System          | What an edge is                                       | Width                                 | Side by side                                                       | Parameter                 |
| --------------- | ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| dot             | B-spline control points, reserved as one box per rank | paint only (`penwidth`)               | multi-edges offset in x by multiples of `nodesep`                  | rank                      |
| dagre           | `points`                                              | none                                  | not described                                                      | rank                      |
| ELK Layered     | sections with start, end and bend points; ports       | "Edge Thickness" option               | `spacing.edgeEdge`                                                 | layer, then per segment   |
| libavoid        | polyline                                              | none                                  | nudging: ordered segments in a channel with separation constraints | per straight segment      |
| ordered bundles | bundle segments plus hub biarcs                       | per path                              | sum of widths plus separations, across each segment                | per bundle segment        |
| d3-sankey       | spine from (x1, y0) to (x0, y1)                       | `width`, stroked, so along the normal | stacked in y at each node                                          | x                         |
| ggalluvial      | filled region between two x-splines                   | vertical                              | stacked in y at each axis                                          | x                         |
| Figma           | spine plus width points                               | width function                        | none                                                               | position along the stroke |

Findings.

1. **The layered systems already use an interval family, over the rank.** In dot, a long edge is a chain of virtual nodes, one per rank, each with a width that `nodesep` spaces like any node. That is an interval at each rank. The curve is fit afterward through the boxes. So an interval family over a discrete parameter (the rank) is enough for layered layout. Note that dot measures the interval in x, a fixed axis, and adds multi-edges as x offsets. It does not use the normal.
2. **Orthogonal routing uses an interval per segment, not per edge.** libavoid's channel is the segment's own extent on its own axis. A route with bends changes which axis is the parameter at every bend. A single interval family over x cannot hold a vertical segment, because at that x the edge covers a whole range of y and that range is not a thickness.
3. **Bundles and metro lines stack along the normal of each piece.** The ordered-bundles paper stacks path widths plus separations across each bundle segment and switches order at hubs. That is an interval family over arc length with the normal as the cross-section, one per bundle segment.
4. **The cross-section direction is part of the data.** Sankey practice shows both conventions, and they give different pictures for the same numbers. The vertical one keeps the sum exact at each x, which is what a stacked area needs. The normal one keeps the stroke look and the flow width that a reader sees, which is what a sankey strand or a bundle needs.

What an interval family over x loses.

- **Paths that are not x-monotone.** A path that goes back in x (a loop, an S that overhangs, an orthogonal route with a vertical segment, a self-loop) has more than one interval at some x, or a vertical run that is not an interval of thickness. Storylines avoid this by definition ("x-monotone curve").
- **The normal cross-section.** An interval family over x measured in y cannot say "constant width along the normal". A stroke of width w on a spine with slope s covers about w times sqrt(1 + s^2) in y. That is the plotly thinning, seen from the other side.
- **Tight bends.** Measured along the normal, an interval family is valid only while the half width is less than the radius of curvature. A box per rank, as in dot, has no such limit, but it also does not follow the curve.
- **Junctions.** At a node or a hub, strands leave one stack and join another with a new order. A single family over one parameter has no place to say that. Each system above keeps an order per edge or per segment and treats the joints separately (ports in ELK, hubs in the bundles paper, node stacks in d3-sankey).

What a representation would need to carry, from the systems above.

- The spine, a curve.
- The parameter kind, one of x (or another data axis), rank, or arc length along the spine.
- The cross-section direction, a fixed axis or the spine's normal.
- The width function over the parameter (constant for a stroke, `h(x)` for a ribbon, Figma's points for a variable stroke).
- For a box hull, the interval family plus its parameter range. The hull is simple for a fixed axis. For the normal it needs the offset curves, which fail at tight bends.

With x as the parameter and y as the cross-section, the family is a ribbon, and it is exactly what a stacked area adds. With arc length and the normal, it is a stroke, and it is what a bundle or a sankey node stacks. The two are the same data type with a different parameter and direction. They do not give the same picture, and one cannot be turned into the other except where the spine is flat.

## Part 2. The kinds of stacking

Every case below glues children along some direction so that neighbors touch. They differ in two things.

- **What the operator reads from each child**, e.g., a box, an interval family, an outline.
- **How each child is moved.** A rigid move gives the child one offset. A pointwise move gives it an offset at each t, so the child takes the shape of the one below.

Whether amounts add follows from these two. Amounts add when the operator reads a thickness that is a data amount and the glue makes no gap, so the total thickness is the sum.

### Additive along an axis, with boxes

- **Example.** Stacked bars, `stack({ by, dir: "y" })` over `rect`. d3 `stack`, Vega-Lite `stack`, ggplot2 `position_stack`.
- **Reads.** The child's extent along `dir`, one interval.
- **Move.** Rigid. Each box sits on the box below.
- **Amounts add.** Yes, in length, in the data unit (CanSum).
- **Reduces to.** Box stacking. This is the base case.

Also here.

- **Waterfall and cumulative line.** One stack along x, already in `proposal.md`.
- **Animation sequence (stacking in time).** Each clip's duration is an interval on the time axis, and clips placed end to end make the total duration the sum. This is box stacking on the time axis. The memory notes on the animation grammar (#697) treat time as an axis, so it reduces.
- **Pictograph bars (images in a row).** Each image is a box. Placed end to end with no gap, they are box stacking. The amount is a count of images.
- **Wilkinson dot plots, the stacking step.** ggplot2's `geom_dotplot` cites Wilkinson (1999) for its binning. After binning, dots in a bin stack up, and `stackratio` "default of 1 has dots just touching." So the height of a column is the count times the dot diameter. That is box stacking of each dot's box, with count as the amount. Read: https://ggplot2.tidyverse.org/reference/geom_dotplot.html. Not read: Wilkinson's paper itself (a copy is listed at https://www.cs.uic.edu/~wilkinson/Publications/dotplots.pdf, not opened).

### Additive pointwise, with interval families

- **Example.** Stacked area and streamgraph. Byron and Wattenberg 2008, d3 `stackOffset*`. See `streamgraphs.md`.
- **Reads.** The child's thickness `h(x)` at each x, an interval family over x measured in y.
- **Move.** Pointwise. Each band's bottom is the top of the band below at that x, so the band's shape is not its own.
- **Amounts add.** Yes, in length at each x.
- **Reduces to.** Interval stacking. This is the second base case.

Box stacking is the case where each child's interval family is constant. Then a pointwise move and a rigid move are the same thing.

### Typesetting: TeX boxes and glue

Read: TeX for the Impatient (Abrahams, Hargreaves, Berry), the "Concepts" chapter, https://mirrors.huaweicloud.com/CTAN/documentation/impatient/concepts.tex, and the "Pages" chapter, https://mirrors.huaweicloud.com/CTAN/documentation/impatient/pages.tex. Not read: the TeXbook, pages 78 to 80, which those chapters cite for the exact rule.

- **The box.** "A box has height, depth, and width." The reference point "is the point where the left edge of the box intersects its baseline." So a TeX box is a box with a baseline inside it, which is GoFish's baseline (a node's local 0).
- **The stack.** `\vbox` constructs "a box by appending smaller boxes vertically from top to bottom". "For \vbox, the reference point of the constructed vbox is derived from that of the last (and usually bottommost) constituent list item, but for \vtop, it's that of the first." So the stack has a baseline, and the stack chooses which child's baseline it reports up.
- **Glue.** "Glue is blank space that can stretch or shrink." A glue item has a natural size, a stretch and a shrink, e.g., `\hskip 6pt plus 2pt minus 3pt`. When TeX builds a box of a given size it changes the glue to fit.
- **Interline glue.** TeX "makes the distance from the baseline of one box to the baseline of the next one equal to \baselineskip. It does this by inserting interline glue equal to \baselineskip minus the depth of the upper box ... and the height of the lower box. But if this interline glue would be less than \lineskiplimit ... TeX inserts the \lineskip glue instead." And "\baselineskip and \lineskip measure different things: the distance between baselines on the one hand and the distance between the bottom of one box and the top of the next box on the other hand." `\offinterlineskip` turns this off so the user sets the spacing, e.g., with struts.

What this shows for the design.

- TeX's vertical list is box stacking with glue between boxes, where glue is a length that can change within limits. A GoFish `stack` is the case where every glue item is 0 and cannot stretch.
- TeX mixes two rules in one list. Lines are placed at a fixed pitch between baselines, which is a spread with a fixed pitch measured between anchors, not between extents. When two lines would come too close, TeX falls back to a fixed gap between extents, which is box contact plus a gap. So TeX's interline spacing is the larger of a pitch spacing and a contact spacing.
- The given whole of `proposal.md` (a box of a given size) is TeX's `\vbox to <size>`, which stretches or shrinks glue to fill the size. In TeX the glue changes, not the parts. In a GoFish divide the parts change to shares. Those are two different ways to meet a given whole.
- TeX reads only boxes. A tall formula in a line pushes the whole line down, as the example in "Pages" shows, even if the formula is narrow. TeX has no outline query.

So TeX reduces to box stacking, with glue that has a size and a stretch, and with spacing that can be measured between baselines. It is the closest precedent for "stack is spread with glue." It is box stacking only.

### Contact stacking of rigid shapes

- **Examples.**
  - The beeswarm by Observable Plot's `dodge`, which GoFish has as `Overlap.separate` (`packages/gofish-graphics/src/families/overlap.ts`).
  - Ridgelines spaced so they never overlap, and tidy trees (Reingold and Tilford, d3 `tree`), both named in `proposal.md` as contour spacing.
  - Skyline bin packing.
- **Reads.** An outline, or the lowest and highest y at each x of a shape (a pixel profile).
- **Move.** Rigid. Each shape moves by one offset until it touches the shapes already placed.
- **Amounts add.** No. The offset is the largest overlap between the top profile below and the bottom profile above, which depends on shape, not on amount.

Sources read.

- Plot's `dodge` source, https://raw.githubusercontent.com/observablehq/plot/main/src/transforms/dodge.js. For each circle it queries placed circles whose x interval overlaps, computes "the y-positions that place this circle tangent to these other circles" with dy = sqrt(dr^2 - dx^2), and takes the first candidate (closest to the anchor) that falls inside no blocked interval. It reads only x and r.
- d3 `tree`, https://d3js.org/d3-hierarchy/tree. "The tree layout produces tidy node-link diagrams of trees using the Reingold-Tilford 'tidy' algorithm" (the page uses an en dash), with a `separation(a, b)` that defaults to 1 for siblings and 2 otherwise. The papers it links (Reingold and Tilford, Buchheim et al.) were not opened.
- Skyline bin packing, `SkylineBinPack.h` in https://github.com/juj/RectangleBinPack. The skyline is a list of `SkylineNode`s, each "a single level (a horizontal line) of the skyline/horizon/envelope" with a start x, a y and a width. Rectangles are placed with rules such as `LevelBottomLeft`. Jylänki's survey (RectangleBinPack.pdf) was not opened.

Does it reduce? Box stacking is contact stacking where the outlines are boxes. With boxes the contact offset is the height of the box below, so amounts add. With any other outline the offset is a maximum over x of a difference of profiles, so amounts do not add. Contact stacking does not reduce to interval stacking either, because interval stacking moves each x on its own and contact stacking moves the whole shape at once. So rigid contact on a profile is a third kind. It reads the same profile as interval stacking, but it combines the profiles with a maximum instead of a sum, and it gives one offset instead of one per x.

Beeswarm and skyline packing also choose where to put a shape among several gaps, i.e., they search. That is a further step. A ridgeline or a tidy tree has a fixed order and one direction, so it does not search.

### Stacking along a curve's normal

- **Examples.**
  - Sankey strands at a node and along a link (d3-sankey).
  - Paths in an ordered bundle (Bereg et al., width sum plus separations).
  - Metro lines along a route (MLCM).
- **Reads.** Each strand's width, as an interval family over arc length along a shared spine, measured along the normal.
- **Move.** Pointwise along the spine. Each strand sits beside the one before at each arc length.
- **Amounts add.** Yes, in width across the spine. A bundle's width is the sum of path widths plus separations.

Does it reduce? It is interval stacking in the curve's own coordinate (arc length along the spine, distance along the normal). That coordinate is a warp of the plane, the same kind of thing as `Coord.wavy`. So it reduces to interval stacking in a warped coordinate, with two limits found in Part 1.

- The warp is valid only while the total width on each side is less than the spine's radius of curvature. Past that, the offset curves have cusps.
- Strands share one spine only between junctions. At a hub or a node the order and the spine change, so a whole network is many such stacks joined at ports or hubs, not one stack.

### Area-additive stacking

- **Example.** A radial stacked bar chart. Each ring's area, not its width, shows the amount.
- **Source.** d3 `scaleRadial`, https://d3js.org/d3-scale/linear#scaleRadial. "Radial scales are a variant of linear scales where the range is internally squared so that an input value corresponds linearly to the squared output value. These scales are useful when you want the input value to correspond to the area of a graphical mark and the mark is specified by radius, as in a radial bar chart."
- **Reads.** Each child's amount.
- **Move.** Rigid in r squared.
- **Amounts add.** Yes, in area. The radii add in r squared. The data stack is computed first and the scale then maps the sum to a radius.

Does it reduce? Yes. It is box stacking (or interval stacking, for a radial area over angle) in a warped coordinate where the radial axis is r squared. The memory notes on scale transforms already record this, as `scaleRadial = Coord.clock({radius: "area"})`. Concentric circles whose rings show amounts by area are the same case.

### Stacking in a hierarchy

- **Example.** Icicle and sunburst (`proposal.md`, "Icicle and sunburst").
- **Reads.** Each node's total.
- **Move.** Rigid, nested. Each level is a divide of its parent's interval, and the levels are stacked along the other axis.
- **Amounts add.** Yes, in length (icicle) or angle (sunburst), at every level.

It reduces. It is box stacking (or divide), applied at each level of the tree, with sunburst in polar coordinates. Mosaic and marimekko are the same thing with the axis switched at each level.

### Unit stacking: waffle and isotype rows

- **Example.** Observable Plot's `waffle` mark.
- **Source.** Plot's `waffle` source, https://raw.githubusercontent.com/observablehq/plot/main/src/marks/waffle.js. The mark imports `maybeStackX` and `maybeStackY`, so the values are stacked first. Then it turns each stacked interval [y1, y2] into cells with `wafflePoints(round(Y1[i] / unit), round(Y2[i] / unit), multiple)`. The comment says it cannot use the projected y values "because these assume that y-values are distributed linearly along y rather than wrapping around in columns." A waffle interval is drawn with at most 8 points, a rectangle with up to two corner cuts.
- **Reads.** Each child's count.
- **Move.** Rigid in the 1D stack. Then each cell index is folded into a row and a column.
- **Amounts add.** Yes, in count.

It reduces. It is box stacking along a 1D cell index, followed by a fold of that index into a grid (GoFish's `wrap`). The fold is a warp from 1D to 2D. Rounding to whole units is the one part that is not a stack. Isotype rows are the same with images as cells.

### 2D tiling with glue on every side

- **Examples.**
  - Squarified treemaps.
  - Voronoi treemaps (GoFish `Tile.voronoi`, `packages/gofish-graphics/src/ast/geometry/voronoiTiling.ts`).
  - Contiguous cartograms.
- **Reads.** Each child's amount.
- **Move.** Each cell's shape is computed.
- **Amounts add.** Yes, in area. The cells fill the parent with no gaps, so their areas add to the parent's area.

Does it reduce? A squarified treemap and a slice-and-dice treemap reduce to nested 1D divides. Squarify picks the rows by aspect ratio, but each row is a 1D divide. A Voronoi treemap does not reduce. Every cell shares boundaries with several neighbors in no order, and no 1D parameter exists along which the cells are glued. The glue is in 2D. The cells are fit by changing weights until each area matches (the memory notes on #1222 mention a Newton fit for this). A contiguous cartogram is the same kind of problem. This is a divide in two dimensions, not a stack.

### 2D contact packing

- **Examples.**
  - Circle packing (d3 `pack`, GoFish `pack`).
  - Word clouds.
  - 2D bin packing such as skyline packing with a free x.
- **Reads.** An enclosing circle or an outline.
- **Move.** Rigid, in two directions.
- **Amounts add.** No.

This is contact stacking in 2D. It does not reduce to the 1D kinds, because the free direction is not fixed. It is closer to `Overlap.separate` and `pack` than to `stack`.

### Not stacking, for contrast

- Ridgelines with overlap (ggridges `scale`). Each ridgeline is placed at a fixed pitch and allowed to overlap the next. ggridges' page says "A value of 1 indicates that the heights are taken as is" (https://wilkelab.org/ggridges/reference/geom_ridgeline.html). It does not say how overlap is controlled. This is a spread, as `proposal.md` says.
- Storylines. Each time step places lines in an order with gaps. Lines do not touch and no amount adds, so this is a spread per x with an order, not a stack.

## Summary table

| Kind              | Example                                                                      | Reads                       | Move                    | Adds             | Reduces to                                                                                              |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------- | ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| Box stack         | stacked bars, waterfall, animation sequence, pictograph bar, dot plot column | extent along dir            | rigid                   | length or count  | box stacking                                                                                            |
| Interval stack    | stacked area, streamgraph                                                    | h(x)                        | pointwise               | length at each x | interval stacking                                                                                       |
| TeX vertical list | lines of a paragraph                                                         | height, depth, baseline     | rigid, glue can stretch | no, glue fills   | box stacking with stretchable glue and pitch spacing                                                    |
| Normal stack      | sankey strands, bundles, metro lines                                         | width over arc length       | pointwise along spine   | width            | interval stacking in the spine's coordinate, valid below the radius of curvature, one stack per segment |
| Area stack        | radial stacked bar                                                           | amount                      | rigid in r squared      | area             | box or interval stacking in an r squared warp                                                           |
| Hierarchy         | icicle, sunburst, mosaic                                                     | totals                      | nested                  | length or angle  | nested box stacking or divide                                                                           |
| Unit stack        | waffle, isotype                                                              | count                       | rigid, then folded      | count            | box stacking along a cell index, then a fold                                                            |
| Contact stack     | beeswarm, non-overlapping ridgelines, tidy tree                              | outline or pixel profile    | rigid                   | no               | does not reduce                                                                                         |
| 2D tiling         | Voronoi treemap, cartogram                                                   | amount                      | shape computed          | area             | does not reduce                                                                                         |
| 2D packing        | circle pack, word cloud                                                      | enclosing circle or outline | rigid in 2D             | no               | does not reduce                                                                                         |

## Kinds that do not reduce to box or interval stacking

1. **Rigid contact on a profile.** Each shape moves by one offset until its outline touches the outline below. The offset is the largest overlap of two profiles, so amounts do not add. Box stacking is the special case where the profiles are flat, and that is the only case where contact gives a sum. Evidence: Plot's `dodge` source (tangent positions from x and r), d3 `tree` (Reingold and Tilford contours), the skyline data structure, and GoFish's own `Overlap.separate`. This is the third kind the maintainer asked about. It reads the same data as interval stacking (a profile per child) and combines the profiles another way, with a maximum and one offset instead of a sum at each x. So the honest split is by the move: rigid or pointwise. Box stacking and contact stacking are rigid. Interval stacking and normal stacking are pointwise. Box stacking is the one place where the two moves give the same answer.
2. **2D tiling with glue on every side.** Voronoi treemaps and contiguous cartograms glue each cell to several neighbors with no order and no 1D parameter. Evidence: GoFish's own `Tile.voronoi` fits cell areas by changing weights, not by a running sum.
3. **2D contact packing.** Circle packing and word clouds move shapes in two directions. They are contact stacking with no fixed direction.

Two more are near misses that reduce only with limits.

- **Normal stacking** reduces to interval stacking in the spine's coordinate only between junctions and only where the stack is thinner than the spine's radius of curvature. Evidence: the parallel curve cusp rule, the hubs in Bereg et al., and the stroke against fill discussion in plotly/d3-sankey pull request 2.
- **TeX's interline rule** reduces to box stacking, but it measures spacing between baselines and falls back to contact only when lines come too close. Its glue can stretch to meet a given size, which is a different answer to a given whole than rescaling the parts.

## Not read

- Wybrow, Marriott and Stuckey, "Orthogonal Connector Routing" (GD 2009) and "Orthogonal Hyperedge Routing" (Diagrams 2012). The nudging account above is from libavoid's docs, issue 67, and the EditLens paper.
- Nöllenburg's MLCM paper, Argyriou et al. (JGAA 2010), Tanahashi and Ma 2012, StoryFlow (Liu et al. 2013).
- Riehmann, Hanfler and Froehlich 2005, "Interactive Sankey Diagrams".
- Wilkinson 1999, "Dot Plots".
- Reingold and Tilford 1981, Buchheim et al. 2002, Jylänki's bin packing survey, the TeXbook.
- The dagre source for dummy nodes, the MSAGL source, and Skia's stroker.
- Observable Plot's `dodge` and `waffle` doc pages returned 429. The source files were read instead.
