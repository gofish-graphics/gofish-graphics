# Background / hull: outside precedent survey

This survey covers how other systems draw a shape behind or around other shapes.
The three strategies in Josh's notes are **box** (axis-aligned bounding box),
**hull** (alpha shape; the convex hull is the special case), and **spine**
(bubble set). For each system it records the model (what the user writes and
what the system decides), the exact spelling, what works, and what does not fit
a composition model like GoFish.

Images live in `precedent/` next to this file. Each section names its image and
the source URL it was downloaded from.

Status of claims: everything quoted in a code block was read from the source or
the official docs during this survey, unless marked "(from memory)".

---

## 1. UI and layout systems

### 1.1 SwiftUI

**Model.** `.background` is a view modifier. The modified view decides the
layout size. The background content is proposed exactly that size and is drawn
behind it. The background never changes the size of the thing it decorates.
Apple's docs say it directly: "Use the background modifier when you want the
modified view to dominate the layout." A `ZStack` is the alternative when both
layers should take part in layout.

**Spelling.**

```swift
// one or more views behind; alignment applies to an implicit ZStack
Text("ABCDEF")
    .background(alignment: .leading) { Star(color: .red) }
    .background(alignment: .center) { Star(color: .green) }

// a shape style clipped to a shape
Text("Hi").padding(8).background(.blue, in: RoundedRectangle(cornerRadius: 8))

// the mirror image, drawn in front
view.overlay(alignment: .topTrailing) { Badge() }

// sets the shape that ContainerRelativeShape resolves to for descendants
view.containerShape(RoundedRectangle(cornerRadius: 20))
```

Padding is a separate modifier, and order matters:
`.padding(8).background(.blue)` paints the padding blue, while
`.background(.blue).padding(8)` does not (from memory; standard SwiftUI
behavior).

**Strengths.** One name for one idea. The decoration is attached to one view, so
it moves with that view. Padding is not a background parameter; it is ordinary
composition (`.padding().background()`). `background(_:in:)` separates "what
paint" from "what shape", which maps well to box / rounded box / capsule.
`.containerShape` lets nested shapes inherit a corner radius.

**Misfits.** It only decorates one view. To put a background behind a set of
views you must first make them one view (wrap them in a stack), which changes
the layout tree. There is no "background behind these three views that live in
different places". The shape is always the frame of the view, so there is no
hull or spine.

**Image.** Not obtained. Apple's doc images sit behind hashed CDN paths; the
documented paths (`images/com.apple.SwiftUI/View-background-2@2x.png`, from
`https://developer.apple.com/documentation/swiftui/view/background(alignment:content:).md`)
return 404/403 when fetched directly.

### 1.2 CSS

**Model.** Background is a property of a box, not an element. The box model has
four nested rectangles (content, padding, border, margin).
`background-clip: content-box | padding-box | border-box` picks which rectangle
is painted. Three related properties draw outside the box without changing
layout: `outline` with `outline-offset`, and `box-shadow` with its spread value.
`border` and `padding` do change layout.

**Spelling (from memory).**

```css
.card {
  background: #eef;
  padding: 8px;
  border-radius: 6px;
}
.focus {
  outline: 2px solid blue;
  outline-offset: 4px;
} /* no layout effect */
.glow {
  box-shadow: 0 0 0 6px rgba(0, 0, 255, 0.2);
} /* spread, no layout effect */

/* anchor positioning: a box that spans two other elements */
#a {
  anchor-name: --a;
}
#b {
  anchor-name: --b;
}
.hull-ish {
  position: absolute;
  left: anchor(--a left);
  top: anchor(--a top);
  right: anchor(--b right);
  bottom: anchor(--b bottom);
}
```

**Strengths.** The box model names the parameters cleanly: `padding` grows the
painted area inward of the border and changes layout; `outline-offset` and
`box-shadow` spread grow the paint without changing layout. That split (does the
expansion take up space or not?) is the key question for GoFish too. Anchor
positioning is the closest thing in CSS to an enclosure of several unrelated
elements: an element whose edges are read from other elements' edges. That is a
relation, not a modifier.

**Misfits.** Only rectangles (with rounded corners). Anchor positioning needs
the author to name which anchor gives which edge, so a box around N elements
needs the author to know which elements are extreme. No min/max over a set.

**Image.** None needed.

### 1.3 Typst

**Model.** `box` (inline) and `block` (block-level) are containers that carry
paint. `inset` is padding that changes layout. `outset` grows the painted
background without changing layout. That is the same split as CSS padding vs
`box-shadow` spread, but with both on one function.

**Spelling (from memory).**

```typst
#box(fill: luma(230), inset: 4pt, outset: (y: 3pt), radius: 2pt, stroke: 0.5pt)[text]
#block(fill: aqua, inset: 8pt, radius: 4pt, width: 100%)[...]
#rect(fill: red, inset: 6pt)[...]
```

**Strengths.** `inset` vs `outset` is the clearest naming anywhere for "padding
that takes space" vs "padding that only paints". `radius` and `stroke` sit next
to them.

**Misfits.** Wraps one content tree. No enclosure of non-adjacent content.

### 1.4 Jetpack Compose

**Model.** `Modifier.background(color, shape)` is a modifier in an ordered
chain. Each modifier wraps the next, so order decides whether padding is inside
or outside the paint.

**Spelling (from memory).**

```kotlin
Modifier.background(Color.Blue, shape = RoundedCornerShape(8.dp)).padding(8.dp) // padding painted
Modifier.padding(8.dp).background(Color.Blue, CircleShape)                       // padding not painted
Modifier.background(brush = Brush.verticalGradient(...), shape = RectangleShape, alpha = 0.5f)
```

**Strengths.** Paint plus shape in one call, like SwiftUI `background(_:in:)`.
The shape parameter is a value (`RectangleShape`, `CircleShape`,
`RoundedCornerShape`, `CutCornerShape`, or a custom `Shape`), which is a
strategy object in GoFish terms.

**Misfits.** Same as SwiftUI: decoration of one node only.

### 1.5 Flutter

**Model.** Decoration is a separate widget, `DecoratedBox`, with a
`position: DecorationPosition.background | foreground`. `Container` bundles
`padding`, `margin`, and `decoration` in one convenience widget.

**Spelling (from memory).**

```dart
DecoratedBox(
  decoration: BoxDecoration(color: Colors.blue, borderRadius: BorderRadius.circular(8),
                            shape: BoxShape.rectangle, boxShadow: [...]),
  position: DecorationPosition.background,
  child: Padding(padding: EdgeInsets.all(8), child: Text('hi')),
)
Container(padding: EdgeInsets.all(8), decoration: ShapeDecoration(shape: StadiumBorder(), color: c), child: ...)
```

**Strengths.** One widget does background and foreground through a `position`
option, so background and overlay are one construct. The shape is a value
(`BoxShape.circle`, `StadiumBorder()`).

**Misfits.** One child only.

### 1.6 React Native

**Model.** Background is a style property on `View`
(`backgroundColor`, `padding`, `borderRadius`). `ImageBackground` is a separate
component for image backgrounds.

**Strengths.** Shows the cheapest possible design: background as a paint
attribute of a container.

**Misfits.** No shape choice beyond border radius; no multi-element enclosure.

---

## 2. Diagramming systems

### 2.1 Bluefish (ground truth: `joshpoll/bluefish-monorepo`)

**Model.** `Background` is listed under **relations** in the API docs
(`docs/api-reference/relations/background.md`). Its first child is the
background shape. The rest are the things it encloses, and they can be `Ref`s to
elements that live elsewhere in the tree. Layout reads the children's bounding
boxes, takes min/max, adds `padding` on each side, and sizes the background
shape to that. Children whose position is not yet fixed get centered in the
background. The background's own position must be inferred; the code throws
`"Background x must be inferred from children"` if something else already owns
it.

**Spelling** (from `packages/bluefish-solid/src/background.tsx` and
`docs/learn/tutorial-2-relations.md`):

```tsx
// props: name, x?, y?, width?, height?, padding? (default 10), background?: () => JSX.Element
// default paint: stroke "black", fill "none", stroke-width 3
Background({ name: "planets", padding: 40, fill: "#859fc9", stroke: "none" }, [
  StackH({ spacing: 50 }, [Circle({ name: "mercury", r: 15 }), ...]),
]),

// relation form: encloses two elements by reference
Background({ padding: 40, fill: "#859fc9", stroke: "none" }, [
  Ref({ select: "label" }),
  Ref({ select: "mercury" }),
]),

// custom shape
Background({ padding: 20, background: () => Rect({ fill: "steelblue" }) }, [Text("I have a background!")])
```

The tutorial has a section titled "Change `Background` to `Arrow`". It first
"denests" the `Background` so its children are two `Ref`s, notes that "this
doesn't change our diagram! It just changes our spec", and then swaps
`Background` for `Arrow` with the same two `Ref` children. So in Bluefish,
`Background` and `Arrow` are the same kind of thing: a relation over a list of
referenced elements. One encodes the relation by containment, the other by
connection.

**Strengths.** One construct works both nested (wraps a subtree, like SwiftUI)
and denested (encloses refs, like TikZ `fit`). It is a relation, so it can be
swapped with other relations. A custom shape is a thunk.

**Misfits.** Box only. The `background` thunk lets you change the paint shape,
but the geometry is always the padded bounding box. Center-fills unplaced
children, which mixes "draw an enclosure" with "place the children".

**Images.** `precedent/bluefish-background-planets.png`
(source: https://raw.githubusercontent.com/joshpoll/bluefish-monorepo/main/docs/learn/assets/mercury-label-outside-background.png);
`precedent/bluefish-circle-stack-background.png`
(source: https://raw.githubusercontent.com/joshpoll/bluefish-monorepo/main/docs/learn/assets/circle-stack-with-background.png).

### 2.2 Penrose

**Model.** Set containment is an optimization constraint, not a drawn mark. A
set is a shape (often a circle) whose position and size are free variables. The
author writes `ensure contains(A.icon, B.icon, padding)`, and the optimizer
moves and resizes both shapes until the constraint holds. Euler diagrams come
from `contains`, `disjoint`, and `overlapping` constraints between set shapes.

**Spelling** (constraint table in `packages/core/src/lib/Constraints.ts`):

```
contains(s1, s2, padding = 0)     // "Require that a shape s1 contains another shape s2 ... with margin padding"
disjoint(s1, s2, padding = 0)
overlapping(s1, s2, padding = 0)
touching(s1, s2, padding = 0)
containsCircles / containsPolys / containsPolyCircle   // shape-specific bodies
```

```
-- Style program (from memory, shape of a typical Euler example)
forall Set A { A.icon = Circle { } }
forall Set A; Set B where IsSubset(B, A) { ensure contains(A.icon, B.icon, 5.0) }
forall Set A; Set B where Disjoint(A, B) { ensure disjoint(A.icon, B.icon) }
```

**Strengths.** The container influences where the members go. This is the
"set-aware layout" that the Alsallakh survey says overlays lack (section 4.3).
`padding` is the parameter name, same as Bluefish.

**Misfits.** The set shape is an ordinary shape chosen by the author, not
derived from members. There is no hull. Layout is global numerical
optimization, not a single compositional pass.

### 2.3 Graphviz clusters

**Model.** A subgraph whose name starts with `cluster` (or that sets
`cluster=true`) is laid out as a group and drawn as a box around its nodes. The
layout engine keeps cluster members together and keeps non-members out. Clusters
must nest as a tree; overlapping clusters are not supported (from memory; dot's
cluster model is a hierarchy).

**Spelling** (from https://graphviz.org/Gallery/directed/cluster.html):

```dot
subgraph cluster_0 {
  style=filled; color=lightgrey;
  node [style=filled,color=white];
  a0 -> a1 -> a2 -> a3;
  label = "process #1";
}
subgraph cluster_1 { node [style=filled]; b0 -> b1 -> b2 -> b3; label = "process #2"; color=blue }
```

Attribute doc for `margin`: "For clusters, margin specifies the space between
the nodes in the cluster and the cluster bounding box. By default, this is 8
points." Other cluster paint attributes: `bgcolor`, `fillcolor`, `pencolor`,
`penwidth`, `peripheries`, `style` (`filled`, `rounded`, `dashed`, ...).

**Strengths.** The enclosure affects layout: members are placed together. The
name is `margin`.

**Misfits.** Box only. Tree-shaped hierarchy, so a node cannot be in two
overlapping clusters, which rules out general hyperedges. The cluster is part of
graph structure, not a mark you can add after layout.

**Image.** `precedent/graphviz-cluster.svg`
(source: https://graphviz.org/Gallery/directed/cluster.svg; checked: no script
elements).

### 2.4 TikZ `fit` library and `backgrounds` library

**Model.** `fit` is an option on a node. The node computes the minimal bounding
box of the listed coordinates or nodes (for a node it uses the node's
north/south/east/west anchors), then sizes itself to that box plus its normal
`inner sep`. The node's own `shape` decides the drawn outline, so
`fit` with `circle` or `ellipse` gives the circle or ellipse that circumscribes
the same box. `rotate fit=<angle>` fits a rotated box. Separately, the
`backgrounds` library provides layers (`on background layer`) so the fitted node
can be drawn behind the things it fits.

**Spelling** (from https://tikz.dev/library-fit):

```latex
\usetikzlibrary{fit}
\node[draw=red, fit=(a) (b) (c) (d) (e)] {box};
\node[draw, circle, fit=(a) (b) (c) (d) (e)] {};
\node[draw=red, rotate fit=30, fit=(a) (b) (c) (d) (e)] {};
% every fit/.style applies to all fit nodes; inner sep is the padding
\begin{tikzpicture}[every fit/.style={ellipse,draw,inner sep=-2pt}] ...
  \node [fit=(d) (e) (b) (b's parent), label=above left:$F^{(b,R)}$] {};
```

```latex
% (from memory) backgrounds library
\usetikzlibrary{backgrounds}
\begin{scope}[on background layer]
  \node[fill=yellow!20, rounded corners, fit=(a)(b)] {};
\end{scope}
```

**Strengths.** Very close to the requested design. Enclosure is a node like any
other, so it can be named, labeled (`label=`), and referenced. The outline shape
is a separate choice from the fitting rule (`fit` + `circle`). Paint order is a
separate concern handled by layers. Padding is `inner sep`, the same key used
for any node.

**Misfits.** Box-derived only: a circle fit is the circle around the box, not
around the points. The fit node must come after the fitted nodes in source
order. No hull or spine. The docs note that text inside a fit node is hard to
position, and recommend an empty fit node plus separate labels.

**Images.** `precedent/tikz-fit-box-circle.png`
(source: https://tikz.dev/pgfmanual-images/image-2382.png);
`precedent/tikz-fit-tree-ellipses.png`
(source: https://tikz.dev/pgfmanual-images/image-2384.png).

### 2.5 Mermaid subgraphs

**Spelling (from memory).**

```
flowchart LR
  subgraph one [Title]
    direction TB
    a1 --> a2
  end
  style one fill:#eef,stroke:#88f
```

**Model and fit.** Same as Graphviz: a structural group that the layout honors,
drawn as a box. Nesting only. Edges can target the subgraph itself
(`one --> two`), so the enclosure is also a node that can be connected.

### 2.6 ELK hierarchical graphs and dagre compound nodes

**Model (from memory).** ELK treats a group as a parent node with children. The
parent's size is computed from its children plus `elk.padding`
(`"[top=12,left=12,bottom=12,right=12]"`). `elk.hierarchyHandling:
INCLUDE_CHILDREN` lays out across levels. Hierarchical ports let edges cross the
parent's border at defined points. dagre uses a compound graph
(`new Graph({ compound: true })`, `g.setParent("a", "cluster1")`), and the
cluster is drawn as a box around its members.

**Strengths.** ELK's hierarchical ports show that an enclosure can also be a
connection endpoint with its own anchors. `padding` with per-side values.

**Misfits.** Tree hierarchy, box only, and the group is a layout node, not a
paint layer.

### 2.7 D2 containers

**Spelling (from memory).**

```d2
cloud: {
  style.fill: "#eef"
  db; api
  api -> db
}
cloud.api -> client
```

**Model and fit.** Containment is written by nesting or by dotted keys
(`cloud.api`). The container is a node that can carry a label, a shape, and
edges. Tree hierarchy only.

---

## 3. Visualization grammars and libraries

### 3.1 ggforce `geom_mark_*` (the closest match)

**Model.** A family of geoms that enclose groups of points. One geom per
strategy: `geom_mark_rect`, `geom_mark_ellipse`, `geom_mark_circle`,
`geom_mark_hull`. Grouping comes from the usual aesthetics (`fill`, `group`, ...).
`filter` is an aesthetic that picks which groups get a mark. Each mark can carry
a `label` and a `description`, which are placed outside the shape and joined to
it by a connector line. The shape is computed at draw time in absolute units, so
it changes when the plot is resized.

**Spelling** (from the ggforce reference pages):

```r
geom_mark_rect   (..., expand = unit(5, "mm"), radius = unit(2.5, "mm"), label.*, con.*)
geom_mark_ellipse(..., expand = unit(5, "mm"), radius = expand, n = 100, tol = 0.01, ...)
geom_mark_circle (..., expand = unit(5, "mm"), radius = expand, n = 100, ...)
geom_mark_hull   (..., expand = unit(5, "mm"), radius = unit(2.5, "mm"), concavity = 2, ...)

ggplot(iris, aes(Petal.Length, Petal.Width)) +
  geom_mark_hull(aes(fill = Species, filter = Species != 'versicolor'), concavity = 1) +
  geom_point()

geom_mark_hull(aes(fill = Species, label = Species, description = desc,
                   filter = Species == 'setosa'))
```

Parameter docs: `expand` "how much the hull is grown outward. Negative values
shrink it", "a plain number is read as a proportion of the plot area width".
`radius` works like expand but "controls how rounded the hull's corners are".
`concavity`: "Lower values produce more concave shapes, and higher values push
the hull toward convex." The hull page says it uses concaveman, and that "while
convex hulls are most common due to their clear definition, they can lead to
large areas covered that does not contain points".

**Strengths.** The same box/ellipse/circle/hull family as the proposal, with
shared parameter names across the family: `expand` (outward offset), `radius`
(corner rounding), and one strategy-specific knob (`concavity` for hull, `tol`
for ellipse). Labels and connectors are built in, which treats the enclosure as
something that can be annotated. `expand` in physical units, not data units.

**Misfits.** One geom per strategy, so changing strategy means changing the
function name, not an option. The enclosure is a geom over raw rows, not over
already-drawn marks, so it encloses points, not the extent of the marks (a big
circle mark can stick out of its hull). No spine strategy. Label placement is a
separate, hard-coded layout pass.

**Images.** `precedent/ggforce-mark-hull.png`
(source: https://ggforce.data-imaginist.com/reference/geom_mark_hull-1.png);
`precedent/ggforce-mark-hull-concavity1.png` (concavity = 1;
source: https://ggforce.data-imaginist.com/reference/geom_mark_hull-2.png);
`precedent/ggforce-mark-hull-labels.png`
(source: https://ggforce.data-imaginist.com/reference/geom_mark_hull-4.png);
`precedent/ggforce-mark-rect.png`
(source: https://ggforce.data-imaginist.com/reference/geom_mark_rect-1.png).

### 3.2 ggalt `geom_encircle`

**Model.** Convex hull (`grDevices::chull`) of each group, expanded and smoothed
with an X-spline. One or two points get a small diamond so a shape still
appears.

**Spelling** (from `hrbrmstr/ggalt` `R/geom_encircle.r`):

```r
# default_aes: s_shape = 0.5, expand = 0.05, spread = 0.1
gg + geom_encircle(s_shape = 1, expand = 0) + geom_point()
gg + geom_encircle(s_shape = 0.5, expand = 0.1, colour = "purple") + geom_point()
```

**Strengths.** Names `expand` again. Handles the degenerate 1- and 2-point
cases explicitly (`spread`), which every hull strategy must decide.

**Misfits.** Parameters are passed as aesthetics, undocumented in the help page.
Convex only.

### 3.3 ggplot2 `stat_ellipse`, ggraph

`stat_ellipse(type = "t", level = 0.95)` draws a statistical confidence
ellipse, not a geometric enclosure: points can fall outside it on purpose. This
is a different concept from the proposal and should not share its name. ggraph
uses ggforce's `geom_mark_*` for node groups and adds `geom_node_voronoi` for
cell-based grouping (from memory).

### 3.4 Vega-Lite and Vega

No hull mark and no hull transform. The **box** strategy can be written today
with an aggregate plus a ranged `rect`:

```json
{
  "transform": [
    {
      "aggregate": [
        { "op": "min", "field": "x", "as": "x0" },
        { "op": "max", "field": "x", "as": "x1" },
        { "op": "min", "field": "y", "as": "y0" },
        { "op": "max", "field": "y", "as": "y1" }
      ],
      "groupby": ["species"]
    }
  ],
  "mark": { "type": "rect", "opacity": 0.2 },
  "encoding": {
    "x": { "field": "x0" },
    "x2": { "field": "x1" },
    "y": { "field": "y0" },
    "y2": { "field": "y1" },
    "color": { "field": "species" }
  }
}
```

(from memory). Padding must be added in data units, and the box encloses data
points, not drawn marks. Hulls require precomputing polygons outside the spec.
Vega has `voronoi`, `contour`, and `kde2d` transforms but no hull.

### 3.5 Observable Plot `hull` (and `delaunay`, `voronoi`)

**Model.** A mark whose geometry is the convex hull of its points. Grouping into
separate hulls comes from `z`, which defaults to `fill`, then `stroke`.

**Spelling** (from `observablehq/plot` `docs/marks/delaunay.md`):

```js
Plot.plot({
  marks: [
    Plot.hull(penguins, {
      x: "culmen_depth_mm",
      y: "culmen_length_mm",
      fill: "species",
      fillOpacity: 0.2,
    }),
    Plot.dot(penguins, {
      x: "culmen_depth_mm",
      y: "culmen_length_mm",
      stroke: "species",
    }),
  ],
});
```

Docs: "Draws a convex hull around the points given by the x and y channels.
The stroke option defaults to currentColor and the fill option defaults to
none." "If a z channel is specified, the input points are grouped by z, and
separate convex hulls are constructed for each group. If the z channel is not
specified, it defaults to either the fill channel, if any, or the stroke
channel, if any." It sits in the same family as `Plot.delaunayLink`,
`Plot.delaunayMesh`, `Plot.voronoi`, `Plot.voronoiMesh`.

**Strengths.** The name `hull` for the mark. Grouping by the color channel by
default, so `fill: "species"` gives one hull per species with no extra syntax.

**Misfits.** Convex only, no padding, no rounding. Hull of point positions, not
of drawn mark extents. The Plot docs put it next to Delaunay and Voronoi, i.e.
in the computational-geometry family, not the annotation family.

**Image.** `precedent/observable-plot-hull.jpg` (source: Observable notebook
thumbnail for `@observablehq/plot-convex-hull`,
https://static.observableusercontent.com/thumbnail/4683a176f33520b8dc98da0411232392748991ecaa6c06f0776f1a353d9785f6.jpg).

### 3.6 D3 and hull libraries: the parameter names

| Library             | Call                                                           | Parameter   | Meaning                                                                                   |
| ------------------- | -------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| d3-polygon          | `d3.polygonHull(points)`                                       | none        | Convex hull; returns `null` for fewer than 3 points                                       |
| concaveman (mapbox) | `concaveman(points, concavity = 2, lengthThreshold = 0)`       | `concavity` | Relative; 1 = detailed, `Infinity` = convex. `lengthThreshold` stops refining short edges |
| hull.js             | `hull(points, concavity = 20)`                                 | `concavity` | Max edge length; `Infinity` = convex                                                      |
| Shapely 2           | `shapely.concave_hull(geom, ratio = 0.0, allow_holes = False)` | `ratio`     | 0..1; 1 = convex                                                                          |
| PostGIS             | `ST_ConcaveHull(geom, param_pctconvex, param_allow_holes)`     | `pctconvex` | 0..1; 1 = convex                                                                          |
| CGAL                | `Alpha_shape_2(points, alpha, mode)`                           | `alpha`     | Squared radius of the empty disk; large alpha = convex; also `find_optimal_alpha`         |
| alphashape (Python) | `alphashape.alphashape(points, alpha)`                         | `alpha`     | 0 = convex hull; larger = tighter                                                         |

(All from memory except concaveman, which ggforce cites.) Two warnings fall out
of this table. First, **`alpha` points in opposite directions** in CGAL
(radius; bigger is more convex) and the alphashape package (inverse radius;
bigger is more concave). Second, **`concavity` also points the "wrong" way** in
concaveman and ggforce: a bigger number is _more convex_. Shapely's `ratio` and
PostGIS's `pctconvex` say what they mean (fraction toward convex). Any GoFish
parameter here should name its direction plainly.

### 3.7 Matplotlib and seaborn

No enclosure mark. The usual workaround is `scipy.spatial.ConvexHull` plus a
`matplotlib.patches.Polygon`. The one built-in background is on text:
`ax.text(x, y, "label", bbox=dict(boxstyle="round,pad=0.3", fc="w"))`, where the
padding lives inside the box-style string (from memory). That is the SwiftUI
modifier model on a single text artist.

### 3.8 Atom

Atom (Park et al.) arranges unit marks inside nested containers, but the
containers are layout regions, not drawn marks. I did not find an enclosure or
background primitive in the paper's grammar. (Not verified against source.)

### 3.9 bubblesets-js (and the Bubble Sets paper)

**Model.** Bubble Sets (Collins, Penn, Carpendale, InfoVis 2009, "Bubble Sets:
Revealing Set Relations with Isocontours over Existing Visualizations") draws a
set as an isocontour around its members over a layout it does not change. It
works in two steps. First, it routes **virtual edges** that connect the members
into a tree, bending around non-members. Second, it builds an energy field that
is positive near members and edges and negative near non-members, and traces
the contour with marching squares. So the outline is "a thickened connector
tree": a connection structure, inflated until it reads as a region. That is
exactly the "spine" strategy.

**Spelling** (from `upsetjs/bubblesets-js`, README and `src/BubbleSets.ts`):

```js
const bubbleSets = new BubbleSets.BubbleSets();
bubbleSets.pushMember(BubbleSets.rect(30, 30, 50, 20));
bubbleSets.pushMember(BubbleSets.circle(240, 40, 10));
const path = bubbleSets.compute().sample(8).simplify(0).bSplines().simplify(0);

// functional form
createOutline(members, (nonMembers = []), (edges = []), (options = {}));
```

Options and defaults:

```
virtualEdges: true          // route connectors between members around obstacles
maxRoutingIterations, maxMarchingIterations, pixelGroup
morphBuffer: 10             // "space to move the virtual edge when wrapping around obstacles"
nodeR0: 15, nodeR1: 50      // distance from nodes at which energy is 1 / 0
edgeR0: 10, edgeR1: 20      // distance from edges at which energy is 1 / 0
threshold: 1, memberInfluenceFactor, edgeInfluenceFactor, nonMemberInfluenceFactor
```

**Strengths.** The input is three lists: members, non-members (obstacles), and
edges. The `edges` list means a caller can pass real connections (for example
the drawn links of a graph) as the spine, instead of the virtual ones. Members
can be rectangles or circles, i.e. drawn mark extents, not just points.

**Misfits.** Many tuning parameters with field-physics names (`nodeR0`,
`edgeR1`, `threshold`) that a chart author cannot reason about. Non-members
must be passed explicitly. Output is a pixel-sampled path that must be smoothed.
The routing order of virtual edges is a hidden choice that changes the shape.

**Image.** `precedent/bubblesets-js.png`
(source: https://user-images.githubusercontent.com/4129778/83879077-60607800-a73d-11ea-9d1d-4f76752280ee.png).

### 3.10 KelpFusion, LineSets, Kelp diagrams, MapSets

- **LineSets** (Alper et al. 2011): one smooth line per set through its
  members, ordered by a traveling-salesman heuristic. Pure connection.
- **Kelp diagrams** (Dinkla et al. 2012): members joined by a minimum-cost
  graph, links routed around non-members. Connection with node discs.
- **KelpFusion** (Meulemans et al. 2013): uses lines and filled regions
  together. Alsallakh et al.: it lets "the shape of the area in a set to vary
  from a minimum spanning tree to the convex hull of a point set". This is one
  continuous parameter between spine (MST) and hull (convex). It is the best
  evidence that spine and hull are two ends of one family.
- **MapSets** (Efrat et al. 2014; from memory): non-overlapping polygons per
  set built from spanning trees on a map.

**Image.** `precedent/alsallakh-setvis-hybrid-kelpfusion.png` (Figure 10 of
Alsallakh et al., crop of page 243; source PDF:
https://vis.uib.no/wp-content/papercite-data/pdfs/Alsallakh_et_al-2016-Computer_Graphics_Forum.pdf).

---

## 4. Design tools

- **Figma.** "Frame selection" (Option-Command-G) wraps the selected layers in a
  new frame sized to their bounds; "Group" (Command-G) does the same without
  fill or clipping. With auto layout, the frame's size comes from its children
  plus `padding`, and the frame's fill is the background. So the designer's
  "background" is a parent container that hugs its children. This is the
  modifier model, applied after the fact to any selection.
- **Illustrator.** Object > Path > Offset Path (Offset, Joins: Miter / Round /
  Bevel, Miter limit) grows an outline by a distance. Pathfinder / Shape Builder
  unite several offset shapes into one blob. A hand-made rounded hull is
  "offset each member, then unite", which is a sum of discs, close in spirit to
  an alpha shape with rounded joins.
- **Keynote.** No enclosure tool. Users draw a shape and "Send to Back".

(All from memory.)

---

## 5. Research: containment vs connection for hyperedges

- **Mäkinen (1990), "How to draw a hypergraph".** Splits hypergraph drawings
  into the **subset standard** (each hyperedge is a closed region around its
  vertices, as in Euler and Venn diagrams) and the **edge standard** (each
  hyperedge is drawn as connecting lines, for example a star through an extra
  node or a tree). Later work (Bertault and Eades 2001, "Drawing hypergraphs in
  the subset standard") keeps the terms. (Classification as reported by later
  reviews found in search; original not read.)
- **Alsallakh et al. (2016), "The State-of-the-Art of Set Visualization"
  (CGF).** Six categories: Euler and Venn diagrams; overlays; node-link
  diagrams; matrix-based; aggregation-based; scatter plots and other. Overlays
  are split by visual element into **region-based** (Bubble Sets, convex hulls
  as in Vizster, texture splatting), **line-based** (LineSets, Kelp diagrams,
  parallel tag clouds), glyphs and icons, and **hybrid** (KelpFusion, which
  "combines lines and regions"). Bubble Sets is filed under region-based. The
  survey notes two things relevant here. First, region overlays follow the
  Gestalt law of closure and line overlays give it up to use less ink.
  Second, "Overlay techniques ... offer limited possibilities as the layout of
  the overlays cannot influence the element placement", and it calls for
  set-aware layout.
- **Fischer, Frings, Keim, Seebacher (2021), "Towards a Survey on Static and
  Dynamic Hypergraph Visualizations" (IEEE VIS short paper, arXiv 2107.13936).**
  Top-level split is node-link-based, timeline-based, and matrix-based. Bubble
  Sets is listed first under **Node-Link-based Approaches**: "Collins et al.
  describe hulls with contouring (marching squares) encompassing connected
  elements." Kelp diagrams and KelpFusion are in the same section. The
  introduction calls Venn and Euler diagrams the traditional hypergraph drawing
  and notes their scalability is limited by color.

**What follows for Josh's tension.** The two surveys file Bubble Sets in
different bins. The set survey calls it a region (containment). The hypergraph
survey calls it node-link (connection). Both are right, because of how Bubble
Sets is built: it routes a connecting tree and then inflates it into a region.
KelpFusion makes the same point as a single dial from spanning tree (pure
connection) to convex hull (pure containment). So the literature supports
treating box, hull, and spine as one family of drawings of the same hyperedge,
differing in how much connection structure they show. It does not support
treating spine as a different kind of construct from hull.

**Images.** `precedent/alsallakh-setvis-region-vs-line-overlays.png`
(Figures 7 and 8 of Alsallakh et al.: region-based vs line-based overlays,
including Bubble Sets [CPC09] and Vizster convex hulls; crop of page 242; source
PDF above). The Fischer et al. short paper has only a methodology figure, so no
image was taken from it.

---

## 6. Synthesis

### (a) Naming precedent

**Strategy names.**

| Strategy         | Names in the wild                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| box              | ggforce `geom_mark_rect`; TikZ `fit` (default rectangle); Bluefish `Background`; Graphviz `cluster`; Figma "Frame selection"; SwiftUI/Compose `background` (always the frame)                             |
| circle / ellipse | ggforce `geom_mark_circle`, `geom_mark_ellipse`; TikZ `fit` + `circle` / `ellipse` (circumscribes the box, not the points)                                                                                |
| hull             | Observable Plot `hull`; ggforce `geom_mark_hull`; d3 `polygonHull`; ggalt `geom_encircle`; concaveman / hull.js / Shapely `concave_hull`; CGAL / alphashape "alpha shape"                                 |
| spine            | Bubble Sets ("bubble", "isocontour", "virtual edges"); KelpFusion ("kelp"); LineSets (line only). No library uses "spine"; the closest technical term is the bubblesets-js `edges` / `virtualEdges` input |

**Parameter names.**

| Concept                               | Names                                                                                                                                                                                                             | Notes                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Outward offset                        | `padding` (Bluefish, Penrose, SwiftUI, Compose, Figma, CSS, ELK), `expand` (ggforce, ggalt), `margin` (Graphviz clusters), `inner sep` (TikZ), `inset` (Typst), `pad` (matplotlib boxstyle), Offset (Illustrator) | `padding` is the majority. ggforce's `expand` allows negatives (shrink).                                                 |
| Offset that paints but takes no space | `outset` (Typst), `outline-offset` and `box-shadow` spread (CSS)                                                                                                                                                  | The "does it change layout" question.                                                                                    |
| Corner rounding                       | `radius` (ggforce, Typst), `cornerRadius` (SwiftUI), `border-radius` (CSS), `rounded corners` (TikZ), `rx` (SVG, Bluefish passes it through)                                                                      | `radius` is the plain shared name.                                                                                       |
| Hull tightness                        | `concavity` (ggforce, concaveman, hull.js; bigger = more convex), `alpha` (CGAL bigger = more convex; alphashape bigger = more concave), `ratio` (Shapely, 1 = convex), `pctconvex` (PostGIS)                     | Direction is inconsistent across libraries. Pick a name whose direction is obvious, and treat convex as the limit value. |
| Spine routing                         | `virtualEdges`, `edges`, `morphBuffer`, `nodeR0/R1`, `edgeR0/R1` (bubblesets-js)                                                                                                                                  | Physics names; not author-facing.                                                                                        |
| Which members                         | `z` / `fill` / `stroke` grouping (Plot), `group` / `fill` + `filter` (ggforce), list of refs (Bluefish, TikZ)                                                                                                     | Data-driven grouping vs explicit refs.                                                                                   |

### (b) Decoration of one thing vs enclosure of a set

Systems fall into three groups.

1. **Modifier on one node** (SwiftUI `.background`, Compose
   `Modifier.background`, Flutter `DecoratedBox`, CSS `background`, Typst
   `box(fill:)`, React Native style, matplotlib text `bbox`). The decorated node
   sets the size. Padding is a separate step or a parameter. A set must first be
   made into one node by wrapping it. Only box-like shapes.
2. **Structural compound** (Graphviz clusters, Mermaid subgraphs, D2
   containers, ELK compound nodes, dagre `setParent`, Figma frames). The group is
   part of the tree, it affects layout (members kept together), and it can be
   connected to. Tree hierarchy only, so no overlapping groups. Box only.
3. **Relation or mark over a set of references** (Bluefish `Background` with
   `Ref`s, TikZ `fit=(a)(b)`, CSS anchor positioning across two anchors,
   ggforce `geom_mark_*`, Plot `hull`, bubblesets-js, Penrose `contains`). The
   enclosure reads the extents of things that live elsewhere. Overlaps are
   allowed. Only Penrose lets the enclosure push back on member layout; the
   rest are overlays that cannot, which Alsallakh et al. name as a limit.

Bluefish is the one system that spans 1 and 3 with one construct: the same
`Background` wraps a subtree or encloses refs, and the tutorial shows the
"denest" step between them changing nothing in the output. The tutorial also
swaps `Background` for `Arrow` over the same refs, which puts enclosure and
connection in the same category (relations). TikZ is next closest: the fit
node is an ordinary node, so it can be labeled, named, and connected.

Two smaller patterns recur. First, the **outline shape is a separate choice
from the fitting rule** (SwiftUI `background(_:in: Shape)`, Compose `shape =`,
Flutter `ShapeDecoration`, TikZ `fit` + node shape). Second, **paint order is a
separate concern** (TikZ `backgrounds` layers; SwiftUI `background` vs
`overlay`; Flutter `DecorationPosition.background | foreground`).

### (c) What the hypergraph literature says about containment vs connection

- The oldest split (Mäkinen 1990) is subset standard (regions) vs edge standard
  (lines). Box and hull are subset standard.
- Bubble Sets is filed as a region by the set-visualization survey and as
  node-link by the hypergraph survey. Its algorithm explains why: it connects
  the members with routed edges, then inflates the result into a region. It is
  both.
- KelpFusion turns that into one parameter from minimum spanning tree to
  convex hull, so connection and containment are two ends of one dial, not
  two constructs.
- Region drawings get Gestalt closure; line drawings use less ink and scale to
  more sets. Overlaps between region overlays can be artifacts that "encode no
  information" (Alsallakh on Bubble Sets).
- The main open problem the survey names is set-aware layout: overlays cannot
  move members. Graphviz clusters and Penrose `contains` are the two precedents
  here where the enclosure does constrain placement.

For the proposal, this supports one construct with three strategies on a
spectrum (box, hull, spine), where spine accepts an optional list of real
connections to use as its skeleton (as bubblesets-js `edges` does). It also
supports Josh's sense that the construct belongs with relational marks:
Bluefish already files `Background` beside `Arrow`, and the hypergraph survey
files Bubble Sets beside node-link drawings.
