# Background and hull: an API proposal

**Summary.**
GoFish already has a box-only `enclose` (also exported as `background`). This proposal turns it into one relational mark that can draw three shapes around a set of nodes: a box, a hull, and a spine.
The three shapes are values of one strategy family, `Shape`, chosen with a `shape` option, the same way `Curve` is chosen with `curve` on `line`.
The construct keeps working in all three places `enclose` works today (around fresh children, around refs, and mixed), and gains the bag form that `line` and `ribbon` have, so "one hull per species" needs no manual loop.

**Recommendation.** Rebuild `enclose` with `createRelationalMark` and give it `shape: Shape.box() | Shape.hull({ alpha }) | Shape.spine({ avoiding, via })`, with `padding` and paint shared on `enclose`. Delete the `background` alias. Do not add a `.background()` modifier now; keep it as the runner-up, to add later as exact sugar if per-group backgrounds turn out to be common.

```js
// one hull per species (bag form, fused over the flow)
chart(penguins)
  .flow(
    group({ by: "Species" }),
    scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" })
  )
  .mark(circle({ r: 3, fill: "Species" }))
  .layer(
    enclose({ shape: Shape.hull(), padding: 6, fill: "Species", opacity: 0.2 })
  );

// a set that contains a and c but not b (combinator form over refs)
layer([a, b, c]).relate(({ a, b, c }) => [
  enclose({ shape: Shape.spine({ avoiding: [b] }), fill: "#ff2400" }, [a, c]),
]);
```

All pictures in this document are real renders of throwaway prototype stories in
`packages/gofish-graphics/stories/_proposals/BackgroundHull.stories.tsx`. Because
`Shape` does not exist yet, those stories place their members at fixed pixel
positions and compute each outline with story-local code (a convex hull, an alpha
shape built on Delaunay triangles, a bubble set assembled from `bubblesets-js` parts,
and a KelpFusion prototype for section 6b), then draw it with `polygon`. The box panels use the real `enclose`. The code shown beside each
picture is the proposed spelling, not the story's code.

---

## 1. Terminology

- **Box.** The axis-aligned bounding box (often shortened to AABB) of the members: the smallest rectangle, with sides parallel to the axes, that holds them all. This is what `enclose` draws today.
- **Convex hull.** The smallest convex shape that holds the members. A shape is convex when the straight line between any two of its points stays inside it, so a convex hull never has dents.
- **Alpha shape.** A generalization of the convex hull that can have dents. Picture a disc of radius _alpha_ rolling around the points: it carves out every opening wide enough for it to enter. A very large disc carves nothing, so it gives the convex hull. A small disc follows the points closely.
- **Bubble set, spine.** A shape built in two steps (Collins et al., 2009). First, connect the members with a tree of lines that bends around things that are not members. Second, draw a smooth outline at a fixed distance around that tree and the members. Josh calls the strategy **spine** after that connecting tree.
- **Member, non-member.** The nodes a shape must contain, and the nodes it must keep out.
- **Hyperedge.** An edge that joins any number of nodes rather than exactly two. A set of nodes drawn as one region is a hyperedge.
- **Relational mark.** A mark whose geometry comes from other, already placed nodes (its **operands**), like `line` and `ribbon`. It is built with `createRelationalMark` and gets the combinator form, the bag form, fusion into a flow, and painting below its operands for free.
- **Strategy family.** A capitalized namespace of option values, such as `Curve.monotone()` or `Overlap.separate()` (#1013).
- **Modifier.** A chained method that applies to any mark or operator, such as `.name()`, `.label()` and `.zOrder()`.
- **Padding.** Distance in pixels between the members and the outline (#1005 settled `padding` as "inset around the outer edge", as opposed to `spacing` between siblings).

## 2. Josh's tensions, answered

**"Somewhere in between a relational mark and an operator, because you may want the background to be a component."**
In GoFish this is not a choice between two kinds of construct. Issue #707 (one combinator indexed by operand kind) and its essay `operators-over-placed-nodes.md` already show that what decides "operator" versus "relational mark" is the kind of operands, not the construct: all fresh children behave like an operator, all refs plus drawn ink behave like a connector, and a mix is an open term. `enclose` is the one construct used in all three rows today. So the proposal keeps one construct and makes it a relational mark, which still has the combinator form `enclose(opts, [children])`. Over fresh children that form _is_ the component: it lays out its children, has a box, takes up space, can be `.name()`d and pointed at with an arrow, just like a TikZ `fit` node or a Mermaid subgraph. Over refs it is a relation. The planets picture below is the component case, rendered by today's code.

There is a second reading of "component": the drawn shape itself being something the user supplies, as Bluefish's `Background` takes a `background={() => <Rect/>}` callback and the Math3ma story passes a hand-made `Blob`. In this proposal that is the function escape hatch of the `Shape` family, which #1101 (one extensibility model for strategy families) is designing for every family at once: a user function that receives the members' outlines and returns a path.

**"SwiftUI exposes it as a modifier, so maybe we could do that?"**
SwiftUI's `.background` decorates exactly one view, and that view decides the size. GoFish can say the same thing already, because `enclose(opts, [node])` wraps any one node. A `.background()` modifier would be exact sugar for that wrap, and on an operator it could give one background per group, the way `.label()` on an operator gives one label per group (#750). It cannot express the hard cases: a modifier attaches to one node of the tree, so it cannot enclose nodes that live in different places (the Topology a/c set, a hyperedge in a graph, one species across several lakes). Section 6 shows it as Approach B, and the recommendation keeps it as the runner-up (Approach C).

**"Spine is a bubble set, in between containment and connection; maybe the syntax should reflect that."**
The literature agrees and gives a reason. The set-visualization survey (Alsallakh et al., 2016) files Bubble Sets as a region, and the hypergraph survey (Fischer et al., 2021) files it as node-link, because the algorithm first connects the members and then inflates the connection into a region. KelpFusion turns this into one dial from a spanning tree (pure connection) to a convex hull (pure containment). So box, hull and spine are one family that differs in how much connection structure it shows. The proposal reflects that in three ways:

1. The construct is a relational mark, the same family as `line` and `ribbon`, which GoFish uses for connection. Containment is not moved into a separate operator.
2. The strategies sit on one `shape` option, ordered from pure containment (`box`) to containment drawn around a connection (`spine`).
3. `Shape.spine({ via })` can take real connections, such as the edges of a graph, as its skeleton. Then the same edges are drawn once as lines and once as the spine of the set (see the hyperedge picture).

## 3. Related issues

- **#397** Bring back a bubble-set enclosure after the `wrap` operator was deleted; floats `bubbleset: true` on `enclose` versus a separate operator.
- **#717** Concave hulls for `enclose`. Josh's comment there proposes one `enclose` with `shape: "rect" | "ellipse" | "hull" | "alpha" | "bubble"`, an `avoiding` list, and "relation, not function".
- **#974** A `boundary` geometry query (a node's outline as points). Hull enclosures are named as its first user.
- **#1138** Roadmap: "Hulls: a group of marks in, a path out", an agent one-shot.
- **#707** Operators over placed nodes: one combinator indexed by operand kind; plural refs never auto-map.
- **#929** Remaining `relate()` steps, including `.each` templates and item 6, drawing clauses missing the paint-below default.
- **#986** Relational paint-below default not applied to `.relate()` drawing clauses. The box panel in the strategy grid shows this today: the real `enclose` paints its fill over the gray non-members.
- **#935** (parked) relate() follow-ups; uses `background([a, b])` as an example. Not re-asked here.
- **#752** Default split for fused relational marks; its design note says enclose follows the same rule with order ignored, and defers an option word ("over").
- **#1101** Extensibility model for strategy families (custom curves, tiles, overlaps).
- **#1013** One uppercase namespace per strategy family.
- **#802** Operators cannot be `.name()`d, which limits selecting the groups an operator makes.
- **#844** A `ref()` to a constraint-placed sibling lands at the origin; its repro is an `enclose` over a ref.
- **#171** Enclose broken for the nested waffle chart (the story has it commented out).
- **#1109** Annotation tutorial; "enclose around selected marks" as the elaborated form.
- **#1084** Venn docs example (an Euler-diagram neighbor of this feature).
- **#396, #713, #714, #716** History: `wrap` deleted; enclose keeps placed refs in place ("enclose = layer + hull ink"); enclose gets paint options and paints behind its children.

## 4. Nearby GoFish decisions and how this design lines up

| Decision                                                                               | What was decided                                                                                                                                                                                                       | This design                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy namespaces (#1013)                                                            | An option whose value is one of several strategies, some with arguments, gets an uppercase family: `Overlap.separate()`, calls only, family type inside the namespace (`Curve.Curve`), Python module bound as `Curve`. | **Matches.** `Shape.box()`, `Shape.hull()`, `Shape.spine()`, type `Shape.Shape`, `gofish-graphics/shape` subpath, Python `from gofish import Shape`.                                                 |
| One-strategy options (three-surfaces.md, `pack`)                                       | An option with one strategy has no option at all.                                                                                                                                                                      | **Matches.** Three strategies, so the option earns its place.                                                                                                                                        |
| Closed families plus escape hatch (#1101)                                              | Families are closed; a user function is the planned escape hatch.                                                                                                                                                      | **Matches.** Bluefish's custom background shape becomes that escape hatch, not a new option.                                                                                                         |
| `curve` on `line`/`ribbon` (#637)                                                      | One key picks the drawn geometry of a relational mark; every curve is computed in screen space after placement.                                                                                                        | **Matches.** `shape` is to `enclose` what `curve` is to `line`. Outlines are computed in screen space after layout, so they work under polar and other coordinate transforms the same way curves do. |
| Relational marks and `.layer()` (#745)                                                 | Relational marks paint below their operands by default; `.layer()` hands each tier the previous tier's marks; `.connect()` deleted.                                                                                    | **Matches.** A background is the clearest case of "paint below what it relates".                                                                                                                     |
| Blank fusion (#748)                                                                    | `.mark(R(opts))` becomes `.mark(blank(anchor)).layer(R(rest))`; all paint goes to the relational mark.                                                                                                                 | **Matches**, inherited from `createRelationalMark`.                                                                                                                                                  |
| Default split (#752)                                                                   | A fused relational mark splits on every flow grouping except the path tier; `along` names the path tier; for enclose the order half is vacuous and the option word is deferred.                                        | **Matches.** `group(Species)` then `scatter` plus `.layer(enclose())` gives one hull per species with no option. No `along`/`over` is proposed, since no example needs it.                           |
| Plural refs never auto-map (#707)                                                      | `enclose(opts, points)` is one outline around the whole selection; per-element needs `.each`.                                                                                                                          | **Matches.**                                                                                                                                                                                         |
| `relate()` drawing clauses (#878, #930)                                                | Clauses may hold ink such as `background` over refs and open terms.                                                                                                                                                    | **Matches**, and inherits the #986 paint-order gap, which this feature makes more visible.                                                                                                           |
| `padding` vs `spacing` (#1005)                                                         | `padding` = inset around the outer edge; `spacing` = gap between siblings.                                                                                                                                             | **Matches.** `padding` grows every strategy's outline.                                                                                                                                               |
| Geometry queries (#966, #968, #974)                                                    | One file per query; `boundary` enters with its first user.                                                                                                                                                             | **Matches.** Hull and spine read each member's `boundary` (falling back to box corners). This is the first user #974 waits for.                                                                      |
| Modifier versus option (shape geometry, 10-03)                                         | `overlap` stays an option because modifiers apply to any mark or operator; the `.jitter()` modifier was dropped.                                                                                                       | **Consistent.** A background passes the "applies to anything" test, so a modifier is legitimate (Approach B/C). It is deferred on the "one concept, one spelling" rule, not ruled out.               |
| `.label()` on operators (#741, #750)                                                   | A modifier on an operator yields one label per group, lowered to ordinary marks.                                                                                                                                       | **Precedent** for Approach B's per-group `.background()`.                                                                                                                                            |
| Refs inside a strategy argument (route vs interpolation note, `Curve.bundle({ via })`) | Secondary geometry is a strategy argument, never columns in the flow. Not shipped.                                                                                                                                     | **Matches** in spirit: `Shape.spine({ avoiding, via })` takes selections as arguments. Reuses the word `via`. New wire detail: a strategy parameter that holds refs.                                 |
| No back-compat; delete, don't gate                                                     | No aliases, no accepted-and-ignored options, migrate call sites.                                                                                                                                                       | **Matches.** `background` alias deleted; `rx`/`ry` move into `Shape.box()` instead of being ignored by hull and spine; `avoiding` exists only where it means something.                              |
| Python surface (#1008)                                                                 | Children positional, snake_case kwargs, `Family.member()` strategies.                                                                                                                                                  | **Matches.** `enclose([a, c], shape=Shape.spine(avoiding=[b]), padding=8)`.                                                                                                                          |
| Designer names, survey first (#196, #404, #762)                                        | Prefer names designers know; survey precedent before naming.                                                                                                                                                           | Partly. `box` and `hull` have strong precedent. `spine` is Josh's name; precedent says "bubble" (see 5).                                                                                             |

**Where it departs, and why.**

- From Josh's #717 comment: shapes are family calls instead of strings (#1013 came later); `avoiding` lives on `Shape.spine()` instead of on `enclose` with a warning for the other shapes (no accepted-and-ignored options); `ellipse` is left out of the first cut (Josh's note asks for three; see decision 7).
- From #397's leaning (`bubbleset: true`): a boolean cannot grow into three strategies.
- From today's `enclose`: `rx`/`ry` move into `Shape.box()`. `rect` also spells corner rounding `rx`/`ry`, so the names stay.

Not re-asked: #935 (parked relate() follow-ups), #954, #1053/#1054, #290.

## 5. Precedent

Full survey: `survey-precedent.md`. The short version:

| System          | Spelling                                                                     | Model                                                                                   | Image                                       |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| SwiftUI         | `view.background(.blue, in: RoundedRectangle(cornerRadius: 8))`              | Modifier on one view; the view sets the size. Shape is a value.                         | none obtained                               |
| Bluefish        | `Background({ padding: 40 }, [Ref("label"), Ref("mercury")])`                | A relation over refs; filed beside `Arrow`; box only; custom shape callback.            | `precedent/bluefish-background-planets.png` |
| TikZ            | `\node[draw, circle, fit=(a)(b)(c)] {};`                                     | A node fitted to other nodes; outline shape chosen separately; nameable and labelable.  | `precedent/tikz-fit-box-circle.png`         |
| Graphviz        | `subgraph cluster_0 { ... }`                                                 | Structural group that the layout honors; box only; tree only.                           | `precedent/graphviz-cluster.svg`            |
| ggforce         | `geom_mark_hull(aes(fill = Species), concavity = 1, expand = unit(5, "mm"))` | One geom per shape (`rect`, `ellipse`, `circle`, `hull`); shared `expand` and `radius`. | `precedent/ggforce-mark-hull.png`           |
| Observable Plot | `Plot.hull(penguins, { x, y, fill: "species" })`                             | Convex hull mark; groups by `z`, which defaults to the fill channel.                    | `precedent/observable-plot-hull.jpg`        |
| bubblesets-js   | `createOutline(members, nonMembers, edges, options)`                         | Members, non-members and optional real edges in; contour out.                           | `precedent/bubblesets-js.png`               |
| KelpFusion      | (paper)                                                                      | Graph dial `t` from spanning tree to convex hull, plus a face-size limit `A` (see 6b).  | `precedent/kelpfusion-fig5-t-sweep.png`     |

What GoFish should take: one name with a shape value (SwiftUI, Compose, TikZ), a relation over refs that also nests (Bluefish), a shared `padding` plus one knob per strategy (ggforce), members, non-members and real edges as the spine's inputs (bubblesets-js). What it should not take: one function per shape (ggforce), grouping inferred from the color channel (Plot; GoFish uses the flow's grouping instead), field-physics knobs (`nodeR0`, `edgeR1`).

**Names.** `box` matches TikZ's default and ggforce's `rect`. `hull` matches Plot, ggforce, d3 and the roadmap. For the third strategy no library uses "spine"; Bubble Sets, bubblesets-js and Josh's own #717 comment say "bubble". On its merits, `spine` names the mechanism, the connecting skeleton that makes the shape a hyperedge, and it reads well with `via` ("a spine via these edges"). `bubble` names the look and is what readers of the set-visualization literature will search for. The docs also use the phrase "space-filling spine" descriptively for mosaic layouts; that prose could be reworded later if `spine` becomes an API name. This proposal uses `spine` and lists it as decision 3.

**The hull knob.** Libraries disagree on direction. `concavity` in ggforce and concaveman gets _more convex_ as it grows; `alpha` is a radius in CGAL (bigger is more convex) and an inverse radius in Python's `alphashape` (bigger is more concave); Shapely's `ratio` and PostGIS's `pctconvex` are fractions toward convex. The proposal uses `alpha` as a **length in pixels** (the radius of the carving disc), which fixes the direction by its unit: a bigger disc fits into fewer openings, so the shape gets closer to convex, and `alpha: Infinity` (the default) is exactly the convex hull. A pixel length also matches `padding`. The cost: a pixel length changes meaning when the visualization is resized, which a relative ratio would not.

## 6. The strategy grid

Same members (blue, a U-shaped cluster) and the same two non-members (gray) in each panel. `padding: 8` everywhere.

| `Shape.box()`                                                                              | `Shape.hull()`                                              | `Shape.hull({ alpha: 40 })`                                                                      | `Shape.spine({ avoiding: others })`                                                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| ![box](img/strategy-box.png)                                                               | ![convex hull](img/strategy-hull-convex.png)                | ![concave hull](img/strategy-hull-concave.png)                                                   | ![spine](img/strategy-spine.png)                                                             |
| The padded bounding box. Real `enclose` (note its fill painting over the gray dots, #986). | Convex hull of the padded member outlines. Never has dents. | Alpha shape: openings wider than the disc are carved out. Depends only on where the members are. | Routes a connecting tree around the listed non-members and draws a smooth outline around it. |

The concave hull and the spine look alike here, but they answer different questions. The hull's dent comes from the members' own spacing, so it would not appear if the U were drawn with sparse points, and it ignores the gray dots. The spine's dent comes from the `avoiding` list, so it keeps out exactly what is named. The Topology example below is the case only the spine can draw.

## 6b. KelpFusion and bubble sets

Josh asked whether KelpFusion has the convex hull as a special case, and how it compares to a bubble set. This section answers from the two papers, then puts both, and the convex hull, on the same four examples.

Sources: Meulemans, Henry Riche, Speckmann, Alper, Dwyer, "KelpFusion: A Hybrid Set Visualization Technique", IEEE TVCG 19(11), 2013 (author copy: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/kelpfusion_tvcg2013.pdf). Collins, Penn, Carpendale, "Bubble Sets: Revealing Set Relations with Isocontours over Existing Visualizations", IEEE TVCG 15(6), 2009 (author copy: https://vialab.ca/wp-content/publication_media/pdf/col2009c.pdf). Kelp Diagrams (Dinkla et al., 2012) and LineSets (Alper et al., 2011) are described below as the KelpFusion paper describes them; I did not read those two papers directly.

### How KelpFusion is built

KelpFusion draws each set separately, in three steps.

1. **Connect the members.** First it builds a candidate graph. For every pair of members, the candidate edge is the shortest route between them that stays clear of every other node, member or not. "Clear" means it keeps out of each node's _allocation area_, a disc of radius `r` around the node (cut down to the node's Voronoi cell, the part of the plane closer to that node than to any other), with an extra margin of half the drawn edge width `w`. Then it keeps only some of those candidates, using a _shortest-path graph_ with one parameter `t ≥ 1`. Each edge gets the weight (its length) to the power `t`, and an edge is kept only if no other path in the graph between its two ends is lighter. At `t = 1` every candidate is kept: the graph is complete, and its outline is the convex hull. As `t` grows, long edges lose to chains of short ones, and as `t` goes to infinity the graph becomes the _minimum spanning tree_ (the tree of shortest total length that connects all members). The steps in between are nested: an edge kept at some `t` is kept at every smaller `t`. In practice the paper's own implementation only considers pairs that are neighbors in the _Delaunay triangulation_ (the standard way to split a point set into well-shaped triangles), which makes it fast.
2. **Fill some faces.** A _face_ is a region fully enclosed by kept edges. A face is filled only if (1) its area divided by one more than its number of corner nodes is below a second parameter `A`, (2) it contains no node outside the set, and (3, 4) it does not hide the edges of a set drawn beneath it, and does not share an edge with such a set unless all its nodes belong to that set.
3. **Draw.** The set is the union of the node discs, the kept edges drawn with width `w`, and the filled faces. That union is smoothed, and every non-member's allocation area is cut back out of it.

The paper's Figure 5 shows `t` going from 4.5 (a tree) down to 1 (the convex hull):

![KelpFusion t sweep](precedent/kelpfusion-fig5-t-sweep.png)

**Is the convex hull an exact special case?** For the graph, yes: at `t = 1` the outline of the shortest-path graph is exactly the convex hull of the member points, and the paper says so. For the drawn shape, only under conditions. The faces must all be fillable, so `A` must be large enough and no non-member may sit inside the hull (rule 2 leaves any face that holds one open). Even then, the drawing is the hull plus discs of radius `r` at the nodes and half-width `w/2` along the edges, which is not the same as the hull grown evenly by a padding. So at `t = 1` KelpFusion gives "the convex hull, minus the faces that would cover a non-member", which is a set-aware hull. Our `Shape.hull()` ignores non-members.

### How a bubble set is built

1. **Connect the members with virtual edges.** Starting from the member nearest the set's center and working outward, each member is joined to the already visited member that minimizes distance times the number of non-members on the straight line between them. Any of these _virtual edges_ that crosses a non-member's bounding box is bent around a corner of that box, pushed out by a buffer; if that fails, other corners and smaller buffers are tried, up to an iteration limit. If the data has real edges, they can be used instead.
2. **Build an energy field.** Every pixel gets a score: members and edges add energy that falls from 1 at distance `R0` to 0 at distance `R1`; non-members subtract (weight −0.8). Only the nearest segment of each routed edge counts, to avoid bulges at the bends.
3. **Trace the outline.** The set's outline is the curve where the energy equals a threshold (an _isocontour_), found with marching squares. If some member ends up outside, the threshold is lowered, then member weights are raised and non-member weights lowered, until all members are inside. The result is smoothed with splines.

The paper says plainly that it "cannot guarantee that non-set member items will be excluded"; such items are marked with a white border instead.

![Bubble Sets virtual edge routing](precedent/bubblesets-fig3-virtual-edge-routing.png)

### Side by side on the same data

Each grid reads from line-like to area-like: KelpFusion at `t = ∞`, 2, 1.5 and 1, then the plain convex hull and a bubble set. KelpFusion here is a story-local prototype of the paper's three steps with `A = ∞` (fill every allowed face). Simplifications, all declared in the story: allocation areas are discs (or the bar grown by the padding) without the Voronoi cut, filled faces keep straight sides even where an edge bends, rules 3 and 4 are skipped (they only matter between overlapping sets), and there is no smoothing pass.

**Topology, the set {a, c} avoiding b.** With two members there is only one edge, so every `t` gives the same picture: a bent tube around b. Only the convex hull covers b.

![KelpFusion compared on Topology](img/kelp-compare-topology.png)

**Set C of the hyperedge example.** KelpFusion uses positions only, so its edges do not follow the graph's own edges; at `t = 1` it fills the triangle 3, 7, 9, which covers the graph edges 4 to 6 and 6 to 7. The bubble set uses the graph edges as its skeleton (`via`).

![KelpFusion compared on hyperedges](img/kelp-compare-hyperedges.png)

**Trout across lakes.** Every face between trout bars holds a bass or perch bar, so rule 2 keeps all faces empty and KelpFusion stays a set of lines at every `t`; lowering `t` only adds longer routed edges over the tops. The hull end of the dial cannot be reached here.

![KelpFusion compared on bars](img/kelp-compare-bars.png)

**One penguin species (Gentoo) among the others.** This is where KelpFusion shines: at `t = 2` and 1.5 the dense core fills in while the stragglers stay attached by lines. At `t = 1` it is the convex hull with a bite taken out where Chinstrap and Adelie points sit inside it.

![KelpFusion compared on penguins](img/kelp-compare-penguins.png)

|             | KelpFusion                                                                                                                                                                                                                                                                                                                                               | Bubble set                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input       | Node positions and set membership. Builds its own graph; does not take data edges.                                                                                                                                                                                                                                                                       | Item shapes (boxes) and membership; can follow real data edges instead of virtual ones.                                                                                                                     |
| Non-members | Every edge is routed around every other node's allocation area; faces that hold a non-member stay open; non-member areas are cut out after smoothing.                                                                                                                                                                                                    | Virtual edges are bent around non-member boxes by a corner heuristic with an iteration limit; non-members push the outline away with negative energy. Can still enclose a non-member, which is then marked. |
| Extremes    | `t = ∞`: minimum spanning tree drawn as lines and node discs. `t = 1`: the convex hull, minus faces holding non-members.                                                                                                                                                                                                                                 | None built in. Large `R1` gives blobby regions, small `R1` gives thin tubes; the skeleton is always a tree (or the given edges).                                                                            |
| Parameters  | `t` (graph density; larger is sparser, unitless, and the graph does not change when the drawing is scaled); `A` (largest face to fill, an area per node, so it does change with scale); `r` and `w` (drawing sizes).                                                                                                                                     | `R0`, `R1` for nodes and for edges, the routing buffer, the energy weights, the threshold and its decay. All are pixel distances or weights.                                                                |
| Stability   | Discrete. Each edge switches on at its own `t`, which can be precomputed, so dragging `t` is smooth in time but jumps in shape. The paper lists stability under added or removed items as future work. Inferred: a small move of a point can change the Delaunay neighbors and so the edges and faces.                                                   | Discrete too (inferred). The visiting order, the corner chosen for each bend and the threshold loop can all flip under a small move.                                                                        |
| Cost        | `O(n⁴)` with full routing; `O(n² log n)` with Delaunay pairs (paper).                                                                                                                                                                                                                                                                                    | `O(K·N·(N + H·W))` for `K` sets, `N` items and an `H × W` pixel grid (paper).                                                                                                                               |
| User study  | 13 people, four overlapping sets on a map: accuracy 86.5% versus 54.5% for Bubble Sets (LineSets 84.3%); mean time 12.4 s versus 17.2 s (LineSets 14.2 s). People also rated it less cluttered and better at showing groups than Bubble Sets. The authors note that Bubble Sets was designed for sets that do not overlap, which the study did not test. | Same study, from the other side. The original paper has case studies, not a controlled comparison.                                                                                                          |

**The line end of the spectrum.** LineSets draws each set as one smooth curve through its members, which reads as an order even when the set has none; it is pure connection. Kelp Diagrams draws node discs joined by a sparse graph: a minimum spanning tree plus extra edges that shorten detours enough, routed around other nodes. KelpFusion keeps the Kelp look and replaces the detour rule with the shortest-path graph, which adds short edges inside clusters first and so produces small faces worth filling.

### What it means for the strategy factoring

KelpFusion's dial looks like an argument for merging hull and spine into one strategy with a parameter. The renders say it is not quite that.

- **Its hull end is not our hull.** At `t = 1` it avoids non-members, and its outline is node discs plus edge strips, not an even padding. Our `Shape.hull()` is the plain padded hull that Plot and ggforce draw, and `alpha` (dents from the members' own spacing) has no KelpFusion equivalent.
- **Its line end is not our spine.** It ignores real edges, so it cannot do `via`, which is the point of the hyperedge example. Its edges are straight polylines, not a smooth outline.
- **Its middle is new.** "Filled where dense, lines where sparse" (penguins at `t = 1.5`) is something neither hull nor spine draws.

So KelpFusion overlaps both strategies in part and replaces neither. Adding it as a fourth member would leave users choosing between strategies that each draw some of the same pictures.

What it does show is a better kernel. All three non-box strategies can be built as one pipeline: **a skeleton graph, a rule for which of its faces to fill, and an outline grown from the result by `padding`.** The convex hull is the complete graph with every face filled. The alpha shape is the Delaunay triangulation with triangles larger than `alpha` left empty. The spine is a tree routed around non-members (or the `via` edges) with no faces. KelpFusion is the shortest-path graph at `t` with faces up to a size. Growing the result by `padding` with round joins, instead of tracing an energy field, also gives the clean, even tubes that the bubble-set renders below needed careful tuning to approach.

**Recommendation.** Keep the three strategies as proposed, but implement `hull` and `spine` on that shared kernel rather than on two libraries (Delaunay for hulls, bubblesets-js for spines). Do not add `Shape.kelp()` in the first cut. If a real example wants "dense core plus stragglers", add it later as `Shape.kelp({ t })` on the same kernel, with no new mechanism. This is a decision for Josh (decision 10).

## 7. Where it lives: three approaches

The approaches differ in where the construct lives. How its strategies and parameters are spelled is a separate axis, covered in section 8; all three approaches below use the recommended `shape: Shape.*` spelling.

### Approach A: `enclose` becomes a relational mark (recommended)

`enclose` is rebuilt with `createRelationalMark` (today it is a `createNodeOperator`). It keeps the combinator form for fresh children, refs, or a mix, and gains the bag form and fusion.

**Example 1, the component case (fresh children).** Unchanged except for the corner option.

```js
enclose(
  {
    padding: 20,
    fill: "#252150",
    stroke: "none",
    shape: Shape.box({ rx: 16, ry: 16 }),
  },
  [
    spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      planets.map((d) => circle(d))
    ),
  ]
);
```

```python
enclose([spread([circle(**d) for d in planets], dir="x", spacing=50, alignment="middle")],
        padding=20, fill="#252150", stroke="none", shape=Shape.box(rx=16, ry=16))
```

![planets](img/planets-box-component.png)

**Example 2, one hull per group (bag form).** Hard real example: Palmer penguins, three species.

```js
chart(penguins)
  .flow(
    group({ by: "Species" }),
    scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" })
  )
  .mark(circle({ r: 3, fill: "Species" }))
  .layer(
    enclose({ shape: Shape.hull(), padding: 6, fill: "Species", opacity: 0.2 })
  );
```

```python
(chart(penguins)
   .flow(group(by="Species"), scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
   .mark(circle(r=3, fill="Species"))
   .layer(enclose(shape=Shape.hull(), padding=6, fill="Species", opacity=0.2)))
```

| `Shape.hull()`                                      | `Shape.box()`, same data                           |
| --------------------------------------------------- | -------------------------------------------------- |
| ![penguin hulls](img/penguins-hull-per-species.png) | ![penguin boxes](img/penguins-box-per-species.png) |

The boxes overlap so much that they stop separating the species; the hulls show where each species actually lies. (Prototype: axes are hand-drawn, and the hull is computed from pixel positions.)

**Example 3, a set that avoids a point (refs).** Hard real example: the Bluefish Topology port, whose a/c neighborhood is today a hand-transcribed Bezier path (#717).

```js
layer([a, b, c]).relate(({ a, b, c }) => [
  enclose({ shape: Shape.hull(), padding: 16, fill: "#009dff" }, [a, b]),
  enclose(
    { shape: Shape.spine({ avoiding: [b] }), padding: 14, fill: "#ff2400" },
    [a, c]
  ),
]);
```

```python
layer([a, b, c]).relate(lambda a, b, c: [
    enclose([a, b], shape=Shape.hull(), padding=16, fill="#009dff"),
    enclose([a, c], shape=Shape.spine(avoiding=[b]), padding=14, fill="#ff2400"),
])
```

| `Shape.hull()` for {a, c}: covers b                        | `Shape.spine({ avoiding: [b] })` for {a, c}             |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| ![topology hull](img/topology-ac-convex-hull-covers-b.png) | ![topology spine](img/topology-ac-spine-avoiding-b.png) |

Future work, not part of this proposal: this example may be drawn best by placing the points and the region together, with an energy that pushes shapes apart and rewards symmetry, as Penrose and Keenan Crane's work do. Every strategy here draws around shapes that are already placed, so that would be a change to layout, not a new shape.

**Example 4, hyperedges over a node-link diagram.** Each row of `memberships` is `{ set, node }`. The graph's edges are the spine.

```js
layer([
  graph, // nodes named "nodes", edges named "edges"
  chart(memberships)
    .flow(resolve(["node"], { from: selectAll("nodes") }), group({ by: "set" }))
    .mark(
      enclose({
        members: "node", // new: the column whose refs are the operands, like line's from/to
        shape: Shape.spine({
          via: selectAll("edges"),
          avoiding: selectAll("nodes"),
        }),
        padding: 9,
        fill: "set",
        opacity: 0.25,
      })
    ),
]);
```

```python
layer([
    graph,
    chart(memberships)
      .flow(resolve(["node"], from_=select_all("nodes")), group(by="set"))
      .mark(enclose(members="node", shape=Shape.spine(via=select_all("edges"), avoiding=select_all("nodes")),
                    padding=9, fill="set", opacity=0.25)),
])
```

![hyperedges](img/hyperedges-spine-over-graph.png)

This example needs one more option than the others: rows that hold refs in a column need a way to say which column is the operand list, as `line({ from, to })` does for pairs. The sketch calls it `members` (decision 9). `avoiding: selectAll("nodes")` lists every node; the rule is "avoid each listed node that is not a member", so the user never computes a set difference. Node 3 is in sets A and C, and both spines reach it.

**Example 5, members that are not next to each other in a visualization.** One species across four lakes in a grouped bar chart. A box or a convex hull would cover the other species' bars.

```js
chart(catch)
  .flow(spread({ by: "lake", dir: "x" }), spread({ by: "species", dir: "x", spacing: 9 }))
  .mark(rect({ h: "count", fill: "species" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(filter((d) => d.species === "trout"))
      .mark(enclose({ shape: Shape.spine({ avoiding: selectAll("bars") }), stroke: "#d6580c" }))
  )
```

| `avoiding`: the other bars and the axis band                 | `avoiding`: the other bars only                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| ![trout across lakes](img/bars-trout-spine-across-lakes.png) | ![trout routed under the axis](img/bars-trout-spine-avoiding-bars-only.png) |

This is the hardest case. With the other bars as the only obstacles, the bubble-set routing sends the Huron to Michigan connection under the baseline, because it goes around whichever side of a box cuts off less of it, and below a bar is open space. With the axis line and its labels also treated as an obstacle, every connection runs as a thin tube over the bar tops and no non-member bar is covered. The spelling above does not say that yet: either the axis has to be listed in `avoiding`, or the spine has to stay inside the plot area by rule (decision 11).

**How it composes.** `enclose(opts, operands)` is `layer(operands)` plus one outline node computed after the operands are placed; that is the framing #713 already uses ("enclose = layer + hull ink"). The outline is a path computed from each operand's `boundary` (#974; box corners when a mark has no better answer) and the strategy. No new core node kind: the existing enclose node gains a geometry strategy. The bag form, fusion, the #752 split, per-group paint with homogeneity collapse, and the paint-below default all come from `createRelationalMark`. Under a coordinate transform the outline is computed in screen space after placement, like curves. Its box is the box of the drawn outline (#707's ink rule: own ink plus fresh operands; refs add nothing). Under animation the outline is recomputed each frame from placed members; how a changing outline should tween is out of scope.

**Overlap check.**

- `layer`: exact composition (enclose = layer + outline). Fine.
- `Constraint.nest` with a `rect` outer: agrees with box mode over fresh children (a small degenerate case). `nest` sizes a user's mark from its contents; enclose draws ink. Build box mode's padded union through the same code `nest` uses so they cannot drift.
- `rect` + `Constraint.align({ x: "span", y: "span" })`: agrees with box mode at zero padding over refs. Degenerate.
- `line`/`ribbon`: a spine of two members looks like a thick rounded line. Degenerate; a spine always encloses its members.
- `subtract` (region compositing): not an overlap. `avoiding` routes the outline around a node; `subtract` would cut a hole of the node's shape.
- `pack`: its enclosing circle is a possible future `Shape.circle()` (decision 7), not an overlap.

**Trade-offs.** One name, one mental model, every hard example expressible. New terms: `Shape`, `alpha`, `spine`, `avoiding`, `via`. Cost to extend: a new member of a closed family, or #1101's function hatch. Awkward: the per-group "background behind each lake" needs `chart(selectAll("bars")).flow(group({ by: "lake" })).mark(enclose())`, which is longer than a modifier would be.

### Approach B: a `.background()` modifier only (SwiftUI)

`.background(opts)` on any mark or operator. On a mark it encloses that mark; on an operator it encloses each group the operator makes, as `.label()` labels each group.

```js
text("H").background({ padding: 4, fill: "#ffe8a3" })
chart(catch)
  .flow(spread({ by: "lake", dir: "x" }).background({ padding: 8, fill: "#f0f1f3" }),
        spread({ by: "species", dir: "x", spacing: 9 }))
  .mark(rect({ h: "count", fill: "species" }))
```

```python
(chart(catch)
   .flow(spread(by="lake", dir="x").background(padding=8, fill="#f0f1f3"),
         spread(by="species", dir="x", spacing=9))
   .mark(rect(h="count", fill="species")))
```

![one box per lake group](img/bars-box-per-lake-group.png)

(Prototype: drawn with story-local boxes; `enclose` per group would draw the same.)

**How it composes.** Desugars to the `enclose` combinator wrapped around the node, so it needs the same core. **Overlap check.** Exact composition with `enclose`. **Trade-offs.** Short and familiar for one-node decorations and per-group panels. Fails every hard example: the Topology a/c set, hyperedges, and the trout set are not single nodes of the tree, so a modifier has nowhere to attach. It would also need the `enclose` combinator anyway for the refs case, which makes it a second spelling, not a replacement.

### Approach C: Approach A plus the modifier as sugar (runner-up)

Everything in A, plus `.background(opts)` defined by the rewrite `x.background(opts)` = `enclose(opts, [x])` (and per group on operators). This is the "exact composition" regime of api-design.md, so it is allowed, but it gives one concept two names. It also raises a naming question: if the construct is `enclose`, the modifier is either `.enclose()` (reads oddly on a text mark) or `.background()` (a second word). **What would make it the pick:** a run of real examples where a per-node or per-group background inside a flow is the common case, such as label pills, facet panel backgrounds and zebra stripes, so that the long `selectAll` + `group` spelling becomes the norm.

## 8. How strategies and parameters are spelled (independent axis)

**S1, one option with a family (recommended).** `shape: Shape.box({ rx, ry }) | Shape.hull({ alpha }) | Shape.spine({ avoiding, via })`. `padding` and the paint options (`fill`, `stroke`, `strokeWidth`, `strokeDasharray`, `opacity`) stay on `enclose` because every strategy uses them. Each strategy carries only the parameters it uses. Default `shape` is `Shape.box()`, today's behavior.

**S2, one function per strategy (ggforce).** `box()`, `hull({ alpha })`, `spine({ avoiding })` as three relational marks. Changing strategy means changing the function. It splits one concept into three operators, against "one concept is one operator" (api-design.md) and the #397/#717 direction.

**S3, string values with flat options (#717 comment).** `shape: "box" | "hull" | "spine"` with `alpha` and `avoiding` on `enclose`. Rejected by #1013: a family with arguments is a namespace of calls, and flat options would be accepted and ignored by the strategies that do not use them.

## 9. Recommendation

Approach A with S1.

- **It desugars into the existing core.** The enclose node stays; the outline is one more geometry computed from `boundary`, which #974 has been waiting to ship with exactly this user (principles.md, "Why keep the core small").
- **One concept, one construct.** Box, hull and spine are one family in the literature (KelpFusion's single dial) and one construct here. Its overlaps with `nest`, `align span`, `layer` and `line` are degenerate or exact (api-design.md, "Overlap is fine at the edges").
- **Few new terms, matching precedent.** `box` and `hull` are the common names; `Shape` mirrors SwiftUI, Compose and TikZ, where the outline is a separate shape value.
- **Closed family plus a function escape hatch,** like `Curve`, `Tile` and `Overlap` (#1013, #1101).
- **Same shape in JS and Python.**
- **It answers all of Josh's tensions with existing machinery:** the component case is the combinator form, the relation case is the refs form, and connection versus containment is the `shape` dial plus `via`.

Runner-up: Approach C. What would change the pick: per-group backgrounds inside flows becoming common (see C), or Josh preferring the SwiftUI spelling for the easy case enough to accept two names.

## 10. Decisions for Josh

1. Keep `enclose` as the one name and delete the `background` alias? (Alternatives: keep `background` and delete `enclose`; or rename to `hull`.)
2. Make `enclose` a relational mark now, and defer any `.background()` modifier?
3. Strategy names `box`, `hull`, `spine`: keep `spine`, or use `bubble` (Bubble Sets precedent)?
4. Option key and family `shape: Shape.*`, or `outline: Outline.*`?
5. Hull knob: `alpha` as a pixel radius, convex by default (`Infinity`)?
6. `avoiding` and `via` only on `Shape.spine()`, with "avoid each listed node that is not a member"?
7. Leave `Shape.ellipse()` / `Shape.circle()` (TikZ, ggforce, Topology's ellipses) for later?
8. Move `rx`/`ry` from `enclose` into `Shape.box({ rx, ry })`?
9. For rows that carry refs (the hyperedge example), name the ref column with a `members` option, by analogy with `line({ from, to })`?
10. Build `hull` and `spine` on one shared kernel (skeleton graph, filled faces, outline grown by `padding`), and leave a KelpFusion strategy (`Shape.kelp({ t })`) out of the first cut?
11. In a chart, should a spine stay inside the plot area by rule, or should the user list the axis in `avoiding`?

## 11. User-facing syntax changes to review

| Today                                                    | Proposed                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `background({ padding: 20, rx: 16, ry: 16, fill }, [x])` | `enclose({ padding: 20, shape: Shape.box({ rx: 16, ry: 16 }), fill }, [x])` |
| `enclose({ padding: 6 }, [a, b, c])`                     | unchanged (default `Shape.box()`)                                           |
| no way to draw one outline per group                     | `.layer(enclose({ shape: Shape.hull() }))` over a grouped flow              |
| hand-drawn concave `polygon` (Topology)                  | `enclose({ shape: Shape.spine({ avoiding: [b] }) }, [a, c])`                |
| `background = enclose` in Python                         | removed; `enclose([...], shape=Shape.hull(alpha=40), padding=8)`            |
| new import                                               | `import { Shape } from "gofish-graphics"` / `from gofish import Shape`      |

Docs follow-up if approved: the handwritten Basics and Diagrams tutorials teach `background()`. Their code blocks can be migrated, but their prose names the construct "background", so an issue would record what went stale rather than rewriting it.

## 12. Prototype notes

- The stories live in `packages/gofish-graphics/stories/_proposals/BackgroundHull.stories.tsx` (title "Proposals/Background Hull"). They are throwaway and import `delaunator` by a relative path into the pnpm store, since it is not a declared dependency.
- The prototype's alpha shape grows the outline with sharp corners at dents; a real implementation would round them.
- Spine outlines use bubblesets-js's routing and contour tracing, but the energy field is assembled in the story, closer to the paper than the library's own `compute()`. Three changes fixed the earlier sagging and lumpy renders. Each non-member's box is grown by the tube's half-width plus a gap before routing, so the drawn tube clears it, not only the tube's center line. Each routed edge counts as one shape whose distance is the distance to its nearest segment (the paper's rule; the library adds every segment, which bulges at each bend). Energy falls off over a short distance (a few pixels), so neighboring fields do not add up into lumps. The earlier trout render also passed hand-made `via` edges at the bar tops, which pulled the outline across non-member bars; it now routes on its own.
- The KelpFusion prototype (section 6b) follows the paper's three steps with the simplifications listed there. Like the paper's implementation, it only considers Delaunay neighbors as candidate edges.
