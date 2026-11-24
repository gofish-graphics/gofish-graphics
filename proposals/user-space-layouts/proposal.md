# Layouts in user space

A design for writing layout algorithms as GoFish code, on the smallest set of layout primitives that covers them. Every d3 layout is checked against it. (today) marks a real render on today's public API. (sketch) marks proposed syntax that does not run yet.

## The design

- A layout algorithm has two parts. Its **decisions** are discrete: an order, a grouping into rows, which side a dot goes on. Its **relations** say how positions and sizes depend on each other once the decisions are made. A **solver** turns relations into positions.
- The relations today's solver handles come down to five primitives: a linear equation between positions, a minimum gap, one shared scale per scope, a coordinate map, and a choice. `stack`, `spread`, `tile`, a tidy tree and a sankey are compositions of those.
- Every d3 layout was written this way and compared with d3's own numbers. Pie, stack, partition, treemap, tree, cluster, chord arcs and a sankey without relaxation match exactly. Circle packing, force and sankey relaxation need relations today's solver does not have.
- Those are jobs for other solvers: one for geometry (touching, intersecting) and one that optimizes (pulls, repulsion). A scope picks its solver the way it picks a coordinate space, and solvers meet only at scope boundaries.
- User code writes decisions three ways: a function that calls `measure` on its children, a `choose` among alternatives, or a `layout` that reads the room it was given.
- Nothing is implemented except prototype stories, the minimum gap and the average of positions (in the engine since commit b960e601d), and the `Slack` family's `start`, `center`, `end` and `at(t)` on `layer` and `spread`.

**Decisions.** Discrete. Made by plan code, or by `choose`. _which items share a row, the order in a column, which two circles a new one rests on_

**Relations** Facts between shapes. Data, not code. these are 10 apart, this is at least clear of that, these touch

**A solver per scope.** Turns one scope's relations into positions. today: one symbolic solver. Later: geometry, optimization

This is the split issue \#485 asks for: a small relational core, and user-space algorithms that hand it their discrete commitments instead of final positions. A commitment survives a resize or a data edit. A position does not.

### The primitives

#### What today's symbolic solver needs

| Primitive                                | In math                                                      | In GoFish                                                                             | Status                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A linear equation between positions      | a = b; b − a = g; p = the average of a, b, c                 | `Constraint.align`, `Constraint.distribute`, `Constraint.position`, `Constraint.nest` | Today, except the average. A dendrogram puts a parent at the mean of its children, and nothing public says that.               |
| A minimum gap, with a rule for the slack | b − a ≥ g, then start, end, center or even                   | `Spacing.atLeast(g)`, `Spacing.contour(g)` on `distribute` and `spread` (sketch)      | In the engine since commit b960e601d. The slack rule is `Slack` on `layer` and `spread`, without `even`; see "The slack rule". |
| One scale per scope                      | size = value × scale; a container is the max of its contents | `rect({ h: "value" })`, shared across a scope                                         | Today. It solved d3-sankey's scale on its own.                                                                                 |
| A coordinate map                         | positions → f(positions), applied after the solve            | `Coord.polar()`, `Coord.clock()`                                                      | Today, except that an angle axis does not wrap.                                                                                |
| A choice                                 | the minimum over alternatives                                | `choose([a, b])` (sketch)                                                             | The choice proposal. Needs `min` in the size algebra (\#630).                                                                  |

The first three are one piece of mathematics: equations and lower bounds on differences of positions, a max, and one unknown scale. That is why one pass solves them. Every operator below lowers into these.

| Operator                  | Lowers into                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `stack`, `spread`         | equal positions across, an exact gap along. Today.                                                                           |
| `tile` (treemap)          | a decision (which items share a row), then nested stacks whose sizes are shares of the parent.                               |
| pie, sunburst, chord arcs | stacks and spreads along the angle, inside a coordinate map. Today.                                                          |
| a tidy tree, a dendrogram | minimum gaps between subtrees, an average for the parent.                                                                    |
| a sankey, a layered graph | minimum gaps for the columns, spreads on one shared scale for the nodes, stacks for the links, and a decision for the order. |

#### Relations for other solvers (sketch)

| Solver           | Its relations                                                          | What needs it                                                                                                                |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Symbolic (today) | equations and minimum gaps between positions, per axis, with one scale | charts, trees, treemaps, sankeys without relaxation                                                                          |
| Geometry         | touches, intersects, lies on, at a distance, at an angle               | circle packing (each circle touches two others), Voronoi cells (a cell is its region cut by lines), ribbons through a center |
| Optimizing       | pull toward a position, keep a distance, push apart, do not overlap    | force layouts, sankey relaxation, label avoidance, the beeswarm's above-or-below                                             |

```js
// Relations are one vocabulary. The scope's solver turns them into positions.
layer(nodes).relate((n) => [
  Constraint.align({ y: "start" }, [n.a, n.b, n.c]), // today
  Constraint.distribute({ dir: "x", spacing: 10 }, [n.a, n.b]), // today: exactly 10
  Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(10) }, [n.b, n.c]), // proposed: 10 or more
]);

// Later, another solver for another kind of relation. The solver is chosen
// where a coordinate space is chosen today: at the layer.
layer({ solver: Solver.geometry }, circles).relate((c) => [
  Constraint.touch([c.a, c.b]),
  Constraint.touch([c.c, c.a]),
  Constraint.touch([c.c, c.b]),
]);
```

The names `Solver.geometry` and `Constraint.touch` only show the shape of the idea. The point is that a relation is data in one vocabulary, a solver declares which relations it handles, and a relation handed to a solver that does not handle it is an error at the layer that declared it.

#### Solvers meet at scope boundaries

Across a scope boundary, solvers share no unknowns. What crosses is small and the same for every solver:

- **Down:** the room offered, as a box or a convex shape.
- **Up:** how much room the scope needs, and its geometry (box, enclosing circle, outline).
- **Nothing else.** No scale is shared across the boundary, and no length leaves the scope it was computed in.

**Inside a scope, solvers can share unknowns in one direction.** One runs first and the next reads its results as known. The engine already does this: the overlap step and label placement run after the symbolic solve, on the positions it fixed. That covers a beeswarm (x from the symbolic solver, the other axis from another), ribbons drawn after their nodes, and a circle placed against two circles that are already placed. It is an order of solvers, not an exchange between them.

**Nelson-Oppen does not give more than that for these solvers.** It combines solvers that share unknowns by passing equalities between them until nothing new appears. It needs the theories to have no operations in common, and the symbolic and geometry solvers both do arithmetic on the same coordinates. It answers whether a solution exists, not which one a slack rule or a cost would pick. And where a relation has an either-or consequence (a circle that touches two others has two possible places), it needs case splits, which here are the decisions. The design note in PR \#806 draws the same line: the lesson to keep is cooperation through a small shared set of facts, not the algorithm. Unknowns that two solvers constrain at the same time belong inside one solver whose relations cover both, which is the optimizing one.

This is the same boundary a `layout` function needs (below), and it is what issue \#806 calls cooperating layout theories. A geometry scope inside a chart is a child with a size. A chart inside a geometry scope is a shape to be placed. The symbolic solver asks one more thing of a scope that wants to take part in fitting a chart to its room: its size must be a function of the scale that never shrinks when the scale grows. Circle packing gives one when all its radii come from data, because the whole packing grows with the scale. That is what d3 does.

### Writing the decisions

#### Three ways, by when the structure is known

| Structure                                           | What user code writes                                 | What it can do                                                         | Example                                   |
| --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| Fixed. Values flow through it.                      | a function that calls `measure` and returns relations | Joins the one solve, takes part in fitting.                            | a tidy tree, a sankey                     |
| A choice among alternatives that all exist up front | `choose([a, b])`                                      | Every alternative is measured, one is picked, nothing is created late. | wrapped text, a row that becomes a column |
| Depends on a value known only late                  | `layout(children, body)`                              | A nested second run inside its box. The escape hatch.                  | squarify, which compares aspect ratios    |

```ts
// A length before the scale is chosen: a function of the scale that the
// engine can solve for. Inside the engine this is `Pwl.Value`, a
// piecewise-linear function of pixels per data unit.
type Length = {
  add(other: Length | number): Length;
  sub(other: Length | number): Length;
  scale(k: number): Length;
  // Its pixels, for a length with no scale in it. An error otherwise.
  readonly px: number;
};
declare const Length: { max(...lengths: (Length | number)[]): Length };

// A child's geometry, in lengths, before the scale is chosen.
declare function measure(child: Node): Geometry;

type Geometry = {
  box: { min: [Length, Length]; max: [Length, Length] };
  enclosingCircle: { cx: Length; cy: Length; r: Length };
  outline: Outline[];
};

// The space this node was offered, in pixels, after the scale is chosen,
// and the children it was given. The body returns an arrangement of those
// children.
declare function layout(
  children: Node[],
  body: (
    space: { w: number; h: number; shape?: Ring },
    children: Node[]
  ) => Node
): Node;
```

- `measure` answers in lengths. A length is a size before the scale is chosen. Arithmetic that stays inside `Length` (add, subtract, scale by a number, max) keeps the result solvable, which is the rule the engine's own code follows. `.px` leaves that world and is an error if the length depends on the scale.
- `layout` gives pixels, because room comes down after the scale is solved. Its body runs then, so a `layout` node asks for no room of its own, and what it returns is laid out in a second run inside its box.
- The children are an argument and the body only arranges them. Marks carry the data, names and colors, so they have to exist before the body runs. A mark created inside the body is an error.
- None of the three places anything. They return operators and relations, and the solver does the placing.

> **Fork: the names.** `layout` and `measure` are Typst's spellings for exactly these two things. The alternative is a second argument to `createMark`, which adds no top-level names but ties both to defining a mark. This page uses `layout` and `measure`.

#### `layout`: a treemap that reads its box (sketch)

![Built-in squarified treemap](img/tiling-builtin-squarify0.png)

**\*treemap({ tile: Tile.squarify })**, built-in\*

![The same treemap as nested stacks in user space](img/tiling-stacks-squarify.png)

_Nested stacks in user space today, with the size typed by hand. All 20 cells agree to 3e-14 px._

```js
// A tiling written in GoFish: read the box, plan the rows, and return
// stacks of the cells it was given.
const squarified = (cells, weights) =>
  layout(cells, ({ w, h }, cells) =>
    drawPlan(squarify(weights, [w, h]), cells)
  );

squarified(
  countries.map(cell),
  countries.map((d) => d.pop)
).render(container, { w: 360, h: 300 });
```

#### `measure`: a tree's contour fit, in lengths (sketch)

```js
// Kennedy's fit over lengths. It only subtracts, adds a number and takes a
// max, so its result is still a length and the tree takes part in fitting.
const fit = (p, q) =>
  Length.max(
    0,
    ...p.slice(0, q.length).map(([, right], d) => right.sub(q[d][0]).add(GAP))
  );
```

It only subtracts, adds a number and takes a max, so the result is still a length. With the minimum gap as a primitive, user code would not write this at all: `spread` with `Spacing.contour` is this fit.

#### `choose`: alternatives that exist up front (sketch)

```js
// A row when it fits, a column otherwise. Both arrangements exist up front,
// so nothing is created late and both are measured in lengths.
choose([spread({ dir: "x" }, cards), spread({ dir: "y" }, cards)]);
```

Wrapped text is this case. Every way of breaking the text exists up front. With a literal width nothing new is needed. With a width that comes from the room offered, the height has to be measured after the width is placed, which means finishing the x passes before the y measure pass. Only a trade between the two axes needs a set of alternatives carried upward, which is the frontier in the choice proposal.

#### In Python (sketch, not run)

```python
def squarified(cells, weights):
    return layout(
        cells,
        lambda space, cells: draw_plan(squarify(weights, (space.w, space.h)), cells),
    )
```

`layout` takes a function, so it goes through the callback runner, as `derive` does. A function that calls `measure` runs inside the engine, so it is a callback too. Relations and `choose` are data and need no callback.

## Every d3 layout

Each layout was written through GoFish's public API, the way GoFish already writes it where it has a way, and compared with d3's numbers for the same input. (exact) means the difference is rounding. (partly) means some of it matches. (not matched) means the prototype shows it does not fit. (on paper) means it was not run.

d3 layout

Decisions

Relations

Solver

Against d3

pie

a sort

a stack along the angle, sizes on one scale, a polar map

symbolic, today

(exact) angles identical. `padAngle` matches once the sweep is shortened by one gap by hand, because the angle axis does not wrap.

stack: none, expand, silhouette

the series order

a stack per x; normalized sizes; stacks aligned on their middle

symbolic, today

(exact) 0 px at every x, both orders

stack: wiggle

the series order

a stack per x on a baseline that d3 gives by a formula

symbolic, today, with a workaround

(exact) 1e-4 px. The prototype puts the baseline in as an invisible first band. `Baseline.wiggle()` landed on main after it was written (\#1375) and has not been compared with d3 yet.

treemap: squarify, binary, slice, dice

which items share a row

nested stacks whose sizes are shares of the parent

symbolic, today

(exact) 3e-14 px at spacing 0. d3's padding is a different relation from spacing.

partition: icicle, sunburst

none

each node stacked above the stack of its children; the same in a polar map

symbolic, today

(exact) 1e-4 px; angles identical. The sunburst's root disc is not drawn (a bug).

tree (tidy)

none

minimum gaps between subtree contours, slack spread by Walker's rule; the parent at the average of its first and last child

symbolic, with the minimum gap

(exact) node for node, on the test tree and 398 random trees. The left-packed and centered variants were run through the one solver. d3's spread was matched by direct code, not yet through the solver. The even rule alone matches 327 of 331 random trees ("The slack rule" tab).

cluster (dendrogram)

none

leaves in a spread; levels by minimum gaps packed to the end; the parent at the average of its children

symbolic, with the minimum gap and the average

(exact) all 24 nodes. The average is computed by hand.

sankey, no relaxation

node order, link order

columns by minimum gaps; each column a spread on one shared scale, slack shared evenly; links as stacks against each node's sides; ribbons

symbolic, with the minimum gap

(exact) 0 px for nodes and links, for all four of d3's alignments. GoFish solved d3's scale itself.

sankey, relaxed

node order

each node pulled toward the weighted mean of its neighbors, kept in order and apart

optimizing

(not matched) up to 68 px off. A pull is not a constraint.

pack

which two circles each new circle rests on

touches; the smallest enclosing circle

geometry

(partly) a different greedy rule packs within 4% of d3's radius. d3's own choices replayed as "touches" were not run.

chord

sorts

a spread of groups along the angle, each a stack of sub-arcs; ribbons through the center

symbolic for the arcs, geometry for the ribbons

(partly) arcs match to 1e-5 rad. Ribbons through the center cannot be drawn.

force

none

pulls toward positions, target distances, repulsion, no overlap

optimizing

(drawn only) d3 computed the positions and GoFish drew them.

Voronoi, Delaunay

site positions

a cell is its region cut by one line per other site; Delaunay is which sites are neighbors

geometry (a built-in today)

(exact) cells match d3-delaunay to 1e-4 px

histogram, hexbin, contour, bundle, geo

Not layouts in this sense. They are data transforms, curves and coordinate maps, and GoFish has them as `bin`, `Curve` and `Coord.geo`.

So the layouts that are equations and gaps come out exactly, with no new operator. The ones that do not are the ones whose core relation is touching or pulling. None needed anything outside the three solver families.

#### Pie, sunburst, icicle, chord: stacks and a coordinate map (today)

![Pie chart](img/d3-pie.png)

_Pie. The existing Pie story also matches **d3.pie** to 1e-5 rad._

![Icicle](img/d3-icicle.png)

_Icicle. Within 1e-4 px of **d3.partition**, as is the existing Icicle story._

![Sunburst](img/d3-sunburst.png)

_Sunburst: the same stacks in a polar map._

![Chord arcs](img/d3-chord.png)

_Chord arcs. Within 1e-5 rad of **d3.chord**._

```ts
// A pie, as GoFish already writes it: a stack along the angle.
chart(browsers, { coord: Coord.clock() })
  .flow(stack({ by: "name", dir: "x" }))
  .mark(rect({ w: "value", fill: "name" }));

// With d3's padAngle: a spread, and a sweep one gap short of the circle.
chart(browsers, { coord: Coord.clock({ centralAngle: 2 * Math.PI - PAD }) })
  .flow(spread({ by: "name", dir: "x", spacing: PAD }))
  .mark(rect({ w: "value", fill: "name" }));
```

```ts
// An icicle: each node above the stack of its children, widths from data.
const node = (t: Tree): any => {
  const self = rect({ w: v(total(t)), h: ROW, fill: v(t.name) });
  if (!t.children) return self;
  return stack({ dir: "y", alignment: "middle" }, [
    self,
    stack({ dir: "x", alignment: "start" }, t.children.map(node)),
  ]);
};
layer({ w: 360, h: 320 }, [node(budget)]);

// A sunburst: the same node in a polar coordinate space.
layer({ coord: Coord.clock() }, [node(budget)]);
```

**Chord arcs**

```ts
// Chord arcs: a spread of groups along the angle, each a stack of sub-arcs.
layer({ coord: Coord.clock({ centralAngle: 2 * Math.PI - PAD }) }, [
  spread(
    { dir: "x", spacing: PAD, y: 120 },
    matrix.map((row, i) =>
      stack(
        { dir: "x", w: v(sum(row)) },
        row.map((m) => rect({ w: v(m), h: 18, fill: v(names[i]) }))
      )
    )
  ),
]);
```

These are written the way GoFish already writes a pie. They have no plan at all. What is missing: an angle axis that wraps, so a spread around a circle has a gap after the last slice too, and a ribbon that crosses the center.

#### Stack and its offsets (today)

![Stacked areas](img/d3-stack-none.png)

**_stackOffsetNone_**

![Normalized stack](img/d3-stack-expand.png)

**_Expand_**

![Centered stack](img/d3-stack-silhouette.png)

**_Silhouette_**

![Streamgraph](img/d3-stack-wiggle-inside-out.png)

**\*Wiggle**, inside-out order\*

```js
// stackOffsetNone: a stack per x.
chart(rows, { w: 420, h: 300 })
  .flow(
    spread({ by: "x", dir: "x", spacing: 14, alignment: "start" }),
    stack({ by: "series", dir: "y" })
  )
  .mark(rect({ w: 4, h: "amount", fill: "series" }));

// stackOffsetExpand: each stack fills the height.
stack({ by: "series", dir: "y", size: field("amount").normalize() });

// stackOffsetSilhouette: the stacks centered on one line.
spread({ by: "x", dir: "x", spacing: 14, alignment: "middle" });
```

All match d3 at every x. In the prototype, wiggle's baseline and the inside-out order are plans (17 and 15 lines of d3's formulas). Main now has `Baseline.wiggle()`, which should replace the first. d3's diverging offset was not tested. It needs two stacks per x that meet at zero.

#### Treemap: one tiling, many settings (today)

![Squarified treemap](img/tiling-seq-squarify.png)

**\*squarify**. 0 px from the built-in.\*

![Strip treemap](img/tiling-seq-strip.png)

**_strip_**

![Spiral treemap](img/tiling-seq-spiral.png)

**_spiral_**

![Pivot treemap](img/tiling-seq-pivot.png)

**_pivot_**

Baudel and Broeksema (2012) show the rectangular treemaps are one algorithm with five small functions plugged in: the order, the size, a score that says when to close a row, whether to subdivide a closed row again, and a phrase that says which side the next row goes on. That is the decision. The relations are nested two-child stacks. It works one level at a time, which is what `tile` is.

```ts
const seq = (options) =>
  render(drawSequential(sequential(countries, [W, H], options)));

// squarify
seq({ size: pop, score: Score.squarified(), phrase: Phrase.bestDiscontinuous });
// strip, zigzag, spiral
seq({ size: pop, score: Score.bestMinAspectRatio, phrase: Phrase.strip });
seq({ size: pop, score: Score.bestMinAspectRatio, phrase: Phrase.zigzag });
seq({ size: pop, score: Score.bestMinAspectRatio, phrase: Phrase.spiral });
// grid
seq({ size: () => 1, score: Score.grid, phrase: Phrase.strip });
```

**The decision: 40 lines**

```ts
function sequential<T>(
  items: T[],
  [w, h]: [number, number],
  options: Options<T>
): SeqPlan<T> {
  const { order = (xs) => xs, size, score, phrase, recurse } = options;
  items = order(items);
  const sizes = items.map(size);
  const plan: SeqPlan<T> = [];
  let i = 0;
  while (i < items.length) {
    const remaining = sum(sizes.slice(i));
    const state = { w, h, remaining, total: sum(sizes), count: items.length };
    const config = phrase(plan[plan.length - 1], state);
    const chunk: Chunk<T> = { ...config, items: [], sizes: [], sum: 0 };
    let last = -Infinity;
    while (i < items.length) {
      const next = score(chunk, sizes[i], state);
      if (next < last) break;
      last = next;
      chunk.items.push(items[i]);
      chunk.sizes.push(sizes[i]);
      chunk.sum += sizes[i];
      i++;
    }
    const share = chunk.sum / remaining;
    const box: [number, number] = isColumn(chunk.side)
      ? [w * share, h]
      : [w, h * share];
    if (isColumn(chunk.side)) w *= 1 - share;
    else h *= 1 - share;
    const whole = chunk.items.length === items.length;
    plan.push(
      !whole && recurse?.(chunk)
        ? { ...chunk, subplan: sequential(chunk.items, box, options) }
        : chunk
    );
  }
  return plan;
}
```

**The relations: any plan as nested stacks, 24 lines**

```ts
function drawSequential<T extends Country>(plan: SeqPlan<T>): any {
  const [chunk, ...rest] = plan;
  const reverse = chunk.direction === "up" || chunk.direction === "left";
  const flip = <X>(xs: X[]) => (reverse ? [...xs].reverse() : xs);
  const here = chunk.subplan
    ? drawSequential(chunk.subplan)
    : stack(
        along(isColumn(chunk.side) ? "y" : "x", flip(chunk.sizes)),
        flip(chunk.items).map(cell)
      );
  if (rest.length === 0) return here;
  const parts = [
    { weight: chunk.sum, node: here },
    { weight: sum(rest.map((c) => c.sum)), node: drawSequential(rest) },
  ];
  if (chunk.side === "S" || chunk.side === "E") parts.reverse();
  return stack(
    along(
      isColumn(chunk.side) ? "x" : "y",
      parts.map((p) => p.weight)
    ),
    parts.map((p) => p.node)
  );
}
```

**Proposed: named tilings are presets (sketch)**

```js
// Tiling.squarify is this, by definition.
const squarify = Tiling.sequential({
  score: Score.squarified(),
  phrase: Phrase.bestDiscontinuous,
});

// A tiling GoFish does not have, with no new code in the library.
const spiral = Tiling.sequential({
  score: Score.bestMinAspectRatio,
  phrase: Phrase.spiral,
});

chart(countries)
  .flow(tile({ size: "pop", tiling: spiral }))
  .mark(rect({ fill: "continent" }));
```

> **Fork: what spacing means in a tiling.** d3 tiles the whole box and then shrinks each cell, on one side for a partition. A stack with gaps gives each child its share of the room that is left. Cell areas differ by up to 11% in a treemap at spacing 2, and edges by up to 28 px in an icicle. The built-in tilings can become presets with no pixel change only at spacing 0. This page leans to the stack meaning, since it is the one the primitives give.

#### Tree and dendrogram: minimum gaps and an average (today)

![Tree spaced by bounding boxes](img/trees-tree-boxes.png)

_Exact gaps between bounding boxes, which is all today's primitives give: 446 px._

![Tree spaced by contours](img/trees-tree-contours.png)

_Minimum gaps between contours: 314 px, **d3.tree**'s width._

![Slack at the start](img/trees-tree-symmetry-left.png)

\*Slack at the **start\***

![Slack centered](img/trees-tree-symmetry-mean.png)

**_center_**

![Slack shared evenly](img/trees-tree-symmetry-spread.png)

**\*Walker**. Equals **d3.tree**.\*

![Dendrogram](img/d3-cluster.png)

_Dendrogram. Equals **d3.cluster**._

Each subtree is at least its contour gap from every earlier sibling. Where the slack goes is the only choice, and d3's is Walker's spread, which is close to "shared evenly" but not the same. Nodes of different heights need no new idea: the contour is measured over vertical position, and a layered tree is the case where every node in a row has the same height.

**Proposed (sketch)**

```js
const kids = spread(
  { dir: "x", spacing: Spacing.contour(GAP), alignment: "start" },
  t.children.map((c, i) => tidyTree(c, `${path}.${i}`))
).name(`${path}/kids`);
```

**The minimum-gap solver, as the semantics of the constraint: 56 lines**

```ts
/** pos[before] - pos[after] >= gap. A lower bound `x >= p` is a separation
 *  of gap p from a fixed zero item. */
export type Sep = { after: string; before: string; gap: number };
export type Policy = "start" | "end" | "center";

/** Items in an order where every separation points forward. */
const topoOrder = (items: string[], seps: Sep[]): string[] => {
  const ins = new Map(items.map((id) => [id, 0]));
  for (const s of seps) ins.set(s.before, ins.get(s.before)! + 1);
  const ready = items.filter((id) => ins.get(id) === 0);
  for (let k = 0; k < ready.length; k++)
    for (const s of seps)
      if (s.after === ready[k]) {
        ins.set(s.before, ins.get(s.before)! - 1);
        if (ins.get(s.before) === 0) ready.push(s.before);
      }
  if (ready.length < items.length)
    throw new Error("solveSeparations: the separations have a cycle");
  return ready;
};

/** One pass in order: each item as near `base` as its separations allow. */
const nearest = (
  order: string[],
  into: (id: string) => [string, number][],
  base: number
): Map<string, number> => {
  const pos = new Map<string, number>();
  for (const id of order) {
    const from = into(id).map(([u, gap]) => pos.get(u)! + gap);
    pos.set(id, from.length ? Math.max(...from) : base);
  }
  return pos;
};

/** "start": every item as near the start as its separations allow.
 *  "end": as near the end. "center": the mean of the two. */
export function solveSeparations(
  items: string[],
  seps: Sep[],
  { policy = "start", upper }: { policy?: Policy; upper?: number } = {}
): Map<string, number> {
  const order = topoOrder(items, seps);
  const least = nearest(
    order,
    (id) => seps.filter((s) => s.before === id).map((s) => [s.after, s.gap]),
    0
  );
  if (policy === "start") return least;
  const top = upper ?? Math.max(...least.values());
  // The greatest solution is the least one of the mirrored problem.
  const mirrored = nearest(
    [...order].reverse(),
    (id) => seps.filter((s) => s.after === id).map((s) => [s.before, s.gap]),
    -top
  );
  return new Map(
    items.map((id) => {
      const greatest = -mirrored.get(id)!;
      return [
        id,
        policy === "end" ? greatest : (least.get(id)! + greatest) / 2,
      ];
    })
  );
}
```

**A dendrogram today: levels from the solver, the average by hand**

```ts
// The plan: a level per node, and an x per node in units of one leaf.
const levels = solveSeparations(
  nodes.map((n) => n.path),
  links.map((l) => ({ after: l.parent, before: l.child, gap: 1 })),
  { policy: "end" }
);
const x = new Map<string, number>();
let k = 0;
const walk = (t: Tree, path: string): number => {
  const v = t.children
    ? mean(t.children.map((c, i) => walk(c, `${path}.${i}`)))
    : k++;
  x.set(path, v);
  return v;
};
walk(root, "n");

// The drawing: leaves in a spread, every other node at its computed place.
const dot = (n: Node) => circle({ r: 5 }).name(n.path);
layer([
  spread({ dir: "x", spacing: Spacing.pitch(DX) }, leaves.map(dot)).name(
    "leaves"
  ),
  ...inner.map(dot),
]).relate((c) => [
  Constraint.position(
    { x: ((leaves.length - 1) / 2) * DX, y: levels.get(leaves[0].path)! * DY },
    [c.leaves]
  ),
  ...inner.map((n) =>
    Constraint.position(
      { x: x.get(n.path)! * DX, y: levels.get(n.path)! * DY },
      [c[n.path]]
    )
  ),
  ...links.map((l) => line({}, [ref(l.parent), ref(l.child)])),
]);
```

![Layered tree with nodes of different heights](img/trees-tree-layered-heights.png)

_Layered: 349 by 337 px._

![Non-layered tree](img/trees-tree-non-layered.png)

_Non-layered, contours over vertical position (van der Ploeg 2014): 434 by 204 px._

#### Sankey: gaps, one scale, and a decision (today)

![Sankey diagram without relaxation](img/d3-sankey-stacked.png)

_No relaxation. Nodes and links 0 px from **d3-sankey**._

![Sankey with an approximate relaxation](img/d3-sankey-relaxed.png)

_An attempt at d3's relaxation with two passes. Up to 68 px off._

| Step in d3-sankey        | What it is                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A node's column          | A minimum gap per link. Left is slack at the start, right is slack at the end, justify adds one lower bound per sink. d3's center is a two-step rule, so it is a decision. |
| A node's height          | Value on one scale shared by every column. GoFish solves it: each column is a spread with gaps, and the tightest column sets the scale.                                    |
| A node's vertical place  | A minimum gap between neighbors, with the slack shared evenly. The order is a decision.                                                                                    |
| A link's width and place | Its value on the same scale, stacked against its node's side.                                                                                                              |
| Relaxation               | A pull toward the weighted mean of neighbors, repeated six times with damping. Not a constraint.                                                                           |

```js
// Columns: every link's target is at least one column after its source.
const columnsOf = (nodes, links, align) => {
  const seps = links.map((l) => ({
    after: l.source,
    before: l.target,
    gap: 1,
  }));
  const left = solveSeparations(nodes, seps); // d3's sankeyLeft
  if (align === "left") return left;
  if (align === "right")
    return solveSeparations(nodes, seps, { policy: "end" }); // sankeyRight
  // sankeyJustify: the same, with every sink also held at the last column.
  const last = Math.max(...left.values());
  const sinks = nodes.filter((n) => !links.some((l) => l.source === n));
  return solveSeparations(
    ["zero", ...nodes],
    [...seps, ...sinks.map((n) => ({ after: "zero", before: n, gap: last }))]
  );
};
```

```js
// Node heights: GoFish solves d3's one scale (ky) itself. Each column is a
// spread with gaps, and all columns share one scale.
chart(rows, { w: 420, h: 300 })
  .flow(
    spread({ by: "column", dir: "x", spacing: 124, alignment: "start" }),
    spread({ by: "name", dir: "y", spacing: 10, alignment: "start" })
  )
  .mark(rect({ w: 12, h: "value" }));
```

**A node with its links, and a ribbon**

```js
// A node and its links: the links are ports stacked end to end against the
// node's two sides, on the same shared scale, and a ribbon joins each pair.
const sankeyNode = (n, value, outs, ins, links) => {
  const port = (l, side) =>
    blank({ w: 0, h: v(l.value) }).name(`${side}:${links.indexOf(l)}`);
  const ports = (ls, side) =>
    spread(
      { dir: "y", spacing: 0, alignment: "start" },
      ls.map((l) => port(l, side))
    );
  return layer([
    rect({ w: NODE_W, h: v(value), fill: "#2f3e46" }).name(n),
    ports(outs, "o").name(`${n}/out`),
    ports(ins, "i").name(`${n}/in`),
  ]).relate((c) => [
    Constraint.align({ x: "end", y: "start" }, [c[n], c[`${n}/out`]]),
    Constraint.align({ x: "start", y: "start" }, [c[n], c[`${n}/in`]]),
  ]);
};

ribbon({ dir: "x", curve: Curve.bezier() }, [ref(`o:${i}`), ref(`i:${i}`)]);
```

A layered graph is the same without sizes. Its layers come from the same minimum gaps, and ordering by barycenter sweeps took the test graph from 39 crossings to 6.

![Layered graph in input order](img/trees-graph-input-order.png)

_Input order: 39 crossings_

![Layered graph after ordering](img/trees-graph-barycenter.png)

_After four ordering sweeps: 6_

#### Circle packing: a decision and "touches" (today)

![Built-in circle packing](img/greedy-builtin-pack.png)

**\*pack()**, d3's front chain. Radius 149.\*

![Greedy packing](img/greedy-greedy-pack-centroid.png)

_A greedy rule in user space. Radius 144._

![Sliding-in packing](img/skyline-skyline-pack.png)

_Slide in along an angle. Radius 153._

![Greedy packing of squares](img/greedy-greedy-pack-squares.png)

_The greedy rule with squares._

d3 decides which two circles each new circle rests on. Given that, the positions follow from "touches", one circle at a time. Today's solver works on each axis separately, and touching ties x and y together through a square root, so this is the first layout that needs a geometry solver.

```js
// Circle packing as a plan and relations. The plan is d3's front chain: it
// only says which two circles each new circle rests against. A geometry
// solver finds the centers from "touches".
const packed = (children) =>
  layer({ solver: Solver.geometry }, children).relate((c) =>
    restingPairs(children).flatMap(({ circle, on: [a, b] }) => [
      Constraint.touch([c[circle], c[a]]),
      Constraint.touch([c[circle], c[b]]),
    ])
  );
```

- Keeping the list of pairs, instead of positions, means changed data moves the picture smoothly. A reused list can fail when new radii make a circle bump into a third one, so it needs an overlap check.
- It still fits a chart's scale. When every radius comes from data, the whole packing grows with the scale, so it runs once at scale 1 and reports a length. Pixel gaps break that (\#967).
- Two other rules were tried as the decision: "the free spot nearest the center", and "slide in along an angle until something is touched". Both pack within a few percent of d3 and neither is d3's rule.

**The greedy rule today: 31 lines**

```ts
type Pos = { x: number; y: number };
type Placed = Pos & { r: number };

function greedyPlace<T extends { r: number }>(
  items: T[],
  rule: {
    candidates: (item: T, placed: Placed[]) => Pos[];
    cost: (pos: Pos, item: T, placed: Placed[]) => number;
    collides: (pos: Pos, item: T, placed: Placed[]) => boolean;
  }
): Placed[] {
  const placed: Placed[] = [];
  for (const item of items) {
    let best = { x: NaN, y: NaN };
    let bestCost = Infinity;
    for (const pos of rule.candidates(item, placed)) {
      const c = rule.cost(pos, item, placed);
      if (c < bestCost && !rule.collides(pos, item, placed)) {
        best = pos;
        bestCost = c;
      }
    }
    placed.push({ ...best, r: item.r });
  }
  return placed;
}
```

```ts
const packed = greedyPlace(
  seafood.map((d) => ({ r: 4.5 * Math.sqrt(d.count) })),
  {
    candidates: (item, placed) =>
      placed.length === 0
        ? [{ x: 0, y: 0 }]
        : placed.length === 1
          ? [{ x: placed[0].r + item.r, y: 0 }]
          : placed.flatMap((a, i) =>
              placed.slice(i + 1).flatMap((b) => tangentToBoth(a, b, item.r))
            ),
    cost: (pos) => Math.hypot(pos.x, pos.y),
    collides: (pos, item, placed) => overlapsAny(pos, item.r, placed),
  }
);
```

#### Force and the beeswarm: pulls and either-or (today)

![Force-directed graph](img/d3-force-graph.png)

_d3-force computed the positions. GoFish only drew them._

![Beeswarm](img/greedy-builtin-swarm.png)

**\*Overlap.separate**. A greedy rule in user space matches it dot for dot.\*

| d3 force                          | What it is                                              |
| --------------------------------- | ------------------------------------------------------- |
| `forceX`, `forceY`, `forceRadial` | a pull toward a position or a circle                    |
| `forceLink`                       | a pull toward a distance between two marks              |
| `forceManyBody`                   | a push between every pair                               |
| `forceCollide`                    | no overlap, which is an either-or between directions    |
| `forceCenter`                     | an exact relation: the mean of all positions is a point |

None of these is an equation or a minimum gap, so a force layout is a different solver: one that minimizes, with a stopping rule and a seed. The beeswarm is on the border. "This dot is at least clear of that one" is a minimum gap, but each pair also needs "above or below", and deciding that is the greedy rule itself. Given those choices, the minimum-gap solver matches the built-in on all 342 dots. Without them it cannot place the swarm.

#### Voronoi and Delaunay (today)

![Voronoi cells of random sites](img/tiling-voronoi-relax0.png)

_Random sites_

![Relaxed Voronoi cells](img/tiling-voronoi-relax30.png)

_Sites moved to their cells' centers 30 times_

![Voronoi treemap](img/tiling-builtin-voronoi.png)

**\*Tile.voronoi**: the same loop with a weight per site\*

![Delaunay links](img/tiling-voronoi-neighbors.png)

_Delaunay links_

A cell is its region cut by one straight line per other site, which is how GoFish's own `Tile.voronoi` computes it. So a Voronoi diagram is "intersects" relations, and it belongs with the geometry solver. The decision is where the sites go, and a relaxed layout repeats the diagram with the sites moved. Delaunay is not a layout relation. It is which sites are neighbors, and drawing it needed only named points and `line`.

**Relaxation in user code, drawn by `partition`**

```ts
function relax(sites: Site[], steps: number): Site[] {
  for (let s = 0; s < steps; s++) {
    const voronoi = Delaunay.from(sites.map((d) => [d.x, d.y])).voronoi([
      0,
      0,
      W,
      H,
    ]);
    sites = sites.map((d, i) => {
      const [x, y] = centroid(voronoi.cellPolygon(i) as any);
      return { ...d, x, y };
    });
  }
  return sites;
}

const cells = (sites: Site[]) =>
  chart(framed(sites)) // two extra corner rows, see the list of walls
    .flow(
      partition({
        by: struct({ x: "x", y: "y" }).bin(Bin.voronoi({ seeds: sites })),
      })
    )
    .mark(region({ fill: "continent", stroke: "white", strokeWidth: 1.5 }));

const links = chart(edges)
  .flow(resolve(["source", "target"], { from: selectAll("sites") }))
  .mark(line({ from: "source", to: "target", stroke: "#222" }));
```

## What to build, and what is open

### What to build, by how much it unlocks

1.  **The minimum gap**, with a rule for the slack. Tidy trees, dendrogram levels, sankey columns, layered graphs. One pass, and it stays symbolic. It is a second kind of fact inside the solver: exact gaps glue items into rigid groups, and minimum gaps separate the groups.
2.  **An average of positions.** A parent over its children. The last missing piece of "a linear equation between positions".
3.  **`layout`: read the room offered.** Every tiling, and any mark that adapts to its box.
4.  **One sequential tiling with settings.** `squarify`, strip, spiral, pivot, `slice` and `dice` become presets of it. The built-in `binary` is not shown to be one.
5.  **Custom members (\#1101, \#692).** So a function that returns GoFish can be passed as `tiling:` and work in `.flow()`.
6.  **`measure`, in lengths.** Only the box exists in lengths in the engine today. The circle, the outline and a contour exist only in pixels after layout.
7.  **An angle axis that wraps.** Small, and it removes the workaround in the pie and chord prototypes. The other workaround, a baseline per group on `stack`, is already on main as `Baseline.wiggle()` (\#1375).
8.  **`choose`**, from the choice proposal, with `min` in the size algebra (\#630).
9.  **A relation vocabulary that names its solver.** Needed before a second solver exists, so the first one's relations are not special.

Not proposed: a geometry or optimizing solver now, a constraint that iterates, or a phase language for graph layout.

### What is not settled

#### Three forks

- **The names `layout` and `measure`**, or a second argument to `createMark`. Shown with the API on the first tab.
- **What spacing means in a tiling:** d3's inset or a stack's gap. Shown with the treemap on the second tab. It decides whether the built-in tilings can become presets with no pixel change.
- **The spelling of the minimum gap and its slack rule.** The slack rule tab compares four spellings and recommends one `Slack` rule per scope and axis.

#### Hard parts

- **Shapes in lengths.** A node tells its parent how big it is before the scale is chosen, as a box. For a contour fit or a packing to take part in fitting, the contour or the circle has to go up in lengths too. The silhouette note is the start of that design.
- **The contract a scope with another solver must meet.** To sit inside a fitted chart its size must be a function of the scale that never shrinks. A packing with data radii meets it. A packing with pixel gaps does not (\#967). A force layout has no such function and would need a fixed box.
- **A pass that creates nodes.** The layout literature avoids it. Ours is contained because what `layout` returns reuses the same node kinds and the same passes, inside a box whose size is set from outside. It still means incremental re-layout needs keyed reuse.
- **Pulls.** Sankey relaxation and graph straightening are not constraints. Solving "at least" and "at most" as one system contradicts itself. They need the optimizing solver, or they stay plan code.
- **Either-or.** The beeswarm and non-overlap in general need a side chosen per pair. The solver can check the choice but not make it.

#### What declared structure buys

| What is known                           | What it allows                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| The decisions did not change, only data | Solve the relations again. Do not decide again. d3's resquarify does this for treemaps. |
| Only the box changed                    | Size requests do not mention the box, so only the solve and the place pass run again.   |
| A node only measures                    | Its passes can be fused, and its children processed in parallel or as arrays.           |
| A scope is contained                    | A change inside cannot spread out, and separate scopes are independent.                 |
| A scope scales evenly                   | Run it once at scale 1 and multiply.                                                    |
| A cost adds up along a sequence         | `choose` can prune alternatives instead of trying every combination.                    |

None of this is measured on GoFish.

### Walls and bugs the prototypes hit

Each is a candidate issue. The stories mark every workaround with a comment.

- **User code cannot read its box, a scale, or a sibling's size.** Plans take the size by hand, and the beeswarm rebuilt GoFish's x scale from a rendered axis.
- **A mark cannot sit at a data value on one axis and a pixel offset on the other.** There is no way to say a coordinate is already in pixels. This also stops a packing from being drawn through `Coord.polar()`.
- **A `stack` nested in a stack or spread along the same axis has no size of its own.** It silently gets an equal share, or lands on top of its siblings. A stack of data-sized parts beside a data-sized rect in a `layer` breaks the rect's size, with no warning.
- **Sizes in nested stacks must be shares of the parent.** Raw weights share one scale across nesting levels.
- **Even slack cannot be stated beside data sizes.** `spacing: fr(1)` with data-sized rects gives the wrong scale.
- **A `distribute` between two nested operands is ignored with no warning**, and `Constraint.position` inside a spread with `alignment: "start"` or `"middle"` is discarded with no warning.
- **`stack({ dir: "y", alignment: "start" })` over a rect and a stack throws a placement conflict** on some trees. `"middle"` works.
- **In polar space:** a rect spanning the full circle draws nothing, a rect with a pixel height is drawn as a thick stroked arc (so `stroke` repaints it and its ends are not radial), a sunburst with data-sized rings gets its radii wrong, a spread along the angle does not wrap, and a `ribbon` runs around the ring instead of across it.
- **`Bin.voronoi` clips to the data's bounding box**, which cannot be set, and a `rect` inside a `Tile.voronoi` treemap draws its cell's bounding box with no error.
- **`stack` along y runs up and `spread` along y runs down** in the same frame.
- **A `.name()` inside a `.mark((d) => ...)` function does not register**, and a `createMark` prop declared `"raw"` arrives wrapped.
- **Rendering a combinator puts the legend inside `w`**, and a layer of positioned marks is shifted so its bounding box starts at the corner.

## The slack rule

Commit b960e601d added minimum gaps to the engine with a placeholder option, `Spacing.atLeast(8, { justify: "center" })`. The question it left is what `justify` means, and how anyone knows how much room is left over. This tab answers that, compares four ways to spell the choice on the same four examples, and recommends one.

#### How much room is left over

A set of minimum gaps does not fix a position. It fixes a range. Each item has an earliest place and a latest place, and the room left over for that item is the distance between them. Both ends come from the same pass the engine already runs.

![q and s at their earliest places, solid, and latest, dashed](img/slack-row-slack.png)

_p is pinned at 0 and r at 290. q and s must each be 8 px from their neighbors. Solid outlines are the earliest places, dashed are the latest. The bars are each item's slack, 156 px._

**Before the Slack family (the placeholder, now removed)**

```ts
// Before the Slack family (commit b960e601d's placeholder, now removed):
// the rule rode on each gap, and two linked gaps with different rules were
// an error.
layer([A, B, C, D, p, q, s, r]).relate((c) => [
  Constraint.align({ x: "start" }, [c.A, c.p]),
  Constraint.align({ x: "end" }, [c.D, c.r]),
  Constraint.distribute(
    { dir: "x", spacing: Spacing.atLeast(8, { justify: "center" }) },
    [c.p, c.q, c.s, c.r]
  ),
]);
```

### Terms

- **Least solution.** Every item as early as its minimum gaps allow. Scheduling calls each item's place its early start, or "as soon as possible" (ASAP). The engine computes it by longest path in order.
- **Greatest solution.** Every item as late as its gaps allow, while the whole span stays as short as the least one or ends at a pinned item. Scheduling calls this the late start, or "as late as possible" (ALAP). The engine computes it by the same pass run backward.
- **Slack.** For one item, its greatest place minus its least place. The critical path method calls this total float. High-level synthesis calls it mobility.
- **Tight item.** An item with no slack: a pinned item, or one on the longest chain of gaps. The longest chain is the critical path.
- **Run.** The items between two tight items along a chain.
- **Slack rule.** A rule that picks one place for every item inside its range, so that every gap still holds.

### What the four examples need

Each example below has a minimum gap and some slack. The d3 layout for each one picks a different place inside the range, so a single fixed rule does not cover them.

| Example                      | Minimum gaps                                                | What d3 does with the slack                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) A row of p, q, s, r      | 8 px between neighbors, p and r pinned                      | No d3 layout. CSS would say start, end, center or space-between.                                                                                        |
| (b) Sankey columns           | each link's target at least one column after its source     | `nodeAlign`: left is the least solution, right is the greatest, justify is the least with every sink in the last column, and center is a two-step rule. |
| (b) Sankey nodes in a column | a padding between neighbors, inside the column's height     | Node _i_ of _n_ moves down by (_i_ + 1) / (_n_ + 1) of the room left. That is CSS's space-evenly.                                                       |
| (c) Tidy tree siblings       | each subtree at least its contour gap from earlier siblings | Walker's rule: when one subtree is pushed right, the siblings between it and the one that pushed it take equal steps of the push.                       |
| (d) Dendrogram levels        | each child at least one level below its parent              | `d3.cluster` puts every node at the root's height minus its own height, which is the greatest solution.                                                 |

### Precedent

Every system below has a minimum and a rule for what is left. They differ in where the rule lives and whether it is one choice or a weight on every gap.

| System                                        | Where the choice lives       | The choices                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TeX glue                                      | each gap                     | A natural width, a stretch and a shrink. Stretch has orders (fil, fill, filll), and only the highest order present stretches. `\hfil` on both sides centers.                                 |
| CSS flexbox                                   | the container, and each item | `justify-content`: start, end, center, space-between, space-around, space-evenly. Items with `flex-grow` take the free space first, and then `justify-content` has nothing to place.         |
| CSS grid                                      | each track                   | `minmax(8px, 1fr)`. A flexible maximum is a weight, and leftover space is shared by weight after the fixed tracks are sized.                                                                 |
| Jetpack Compose                               | the row or column            | `Arrangement`: Start, End, Center, SpaceBetween, SpaceAround, SpaceEvenly, and `spacedBy(space, alignment)`, a minimum with a rule for the rest.                                             |
| Figma auto layout                             | the frame                    | A fixed gap, or "Auto", which spaces items between the edges.                                                                                                                                |
| Critical path method                          | the analysis                 | Early start, late start, and total float for each task. Tasks with no float form the critical path. It reports the range and leaves the choice to the planner.                               |
| High-level synthesis                          | the scheduler                | ASAP, ALAP, and mobility (ALAP minus ASAP). List schedulers place the least mobile operations first.                                                                                         |
| d3-sankey                                     | the layout, one option       | `nodeAlign`: left, right, center, justify, or any function of a node.                                                                                                                        |
| dagre, ELK, Brandes and Köpf                  | the layout, one option       | Four one-sided alignments (up-left, up-right, down-left, down-right) and their balanced average. dagre's `align` and ELK's `fixedAlignment` pick one.                                        |
| Graphviz dot                                  | an objective                 | No rule. It minimizes the weighted length of edges subject to the minimum separations, by network simplex.                                                                                   |
| Reingold and Tilford, Walker, Buchheim et al. | the algorithm                | A parent centered over its children. Walker adds the equal spread of smaller subtrees between two that pushed apart. Buchheim, Jünger and Leipert make it linear time with the same layouts. |
| VPSC, CoLa                                    | an objective                 | Separation constraints _u_ + _a_ ≤ _v_, and the placement nearest to given desired positions.                                                                                                |
| Cassowary                                     | each constraint              | Strengths: required, strong, medium, weak. A weak "stay" keeps a value where it was. Ties between equal strengths are not defined by the user.                                               |
| Bluefish                                      | the distribute               | `spacing`, `total`, or both. All are exact, and there is no minimum.                                                                                                                         |

Three findings matter for GoFish.

- The ends of the range already have names in scheduling, and d3's choices are those ends. Sankey left is ASAP, sankey right and `d3.cluster` are ALAP.
- The interface toolkits put the choice on the container, once per line. A weight on each gap (TeX stretch, `flex-grow`, `fr`) is a second, finer mechanism, and when both are present the weights win.
- The graph drawing tools put it on the layout as one option. The ones that do not (dot, VPSC) replace the rule with an objective.

Sources: MDN's `justify-content`, the CSS Grid 1 specification, the Compose `Arrangement` reference, Figma's auto layout help, the d3-sankey `align.js` source, the dagre wiki, ELK's option reference, Brandes and Köpf (2001) and its 2020 erratum (arXiv 2008.01252), Gansner et al. (1993), Dwyer, Marriott and Stuckey (2005), Badros, Borning and Stuckey (2001), and the Bluefish `Distribute` source. Walker (1990) and Buchheim et al. (2002) are described from their abstracts and from d3's code, not read in full. SwiftUI's `Spacer` and Typst's `fr` spacing were not checked.

### Sankey's even spread and Walker's are not the same rule

On one run they agree. Sankey's vertical spread is space-between over a column, with the two walls counted as items. Walker's spread is space-between over the siblings between two tight siblings. The only difference is what counts as the ends. With the walls as the ends, the even rule matches d3-sankey's node tops to 0 px.

They part when two pushes nest. Walker adds one ramp of steps for each push. The even rule makes one ramp per run from each item's total slack. The smallest tree where they differ has 18 nodes. Its root's four children are at −60, −16, 28 and 60 in d3. The even rule puts the second at −20.

![Walker's spread](img/slack-counter-walker.png)

**\*Walker**, equals **d3.tree\***

![The even rule](img/slack-counter-even.png)

**\*even**, 4 px off\*

![Glue on every gap](img/slack-counter-glue.png)

**\*glue**, 8 px off\*

Over 331 random trees, the even rule matched `d3.tree` to 0.05 px on 327, and was off by at most 24 px. Walker's steps are a procedure over the order the siblings arrive in, not a rule over the final ranges.

### Four approaches

#### A. One slack rule per scope and axis (today, except even)

A strategy family, `Slack`, set once on a layer or spread for each axis. Every item takes the same fraction _t_ of its own slack. `start`, `center` and `end` are _t_ = 0, 0.5 and 1, and `at(t)` is any point between. `even` shares the slack of each run in equal steps. A uniform _t_ always keeps every gap, on any set of gaps, because a gap that holds at both ends holds at every point between them.

```ts
// The family, once per scope and axis. Each item takes a fraction t of
// its slack: x = least + t * (greatest - least).
Slack.start(); // t = 0: the least solution (ASAP, early start)
Slack.end(); // t = 1: the greatest solution (ALAP, late start)
Slack.center(); // t = 1/2
Slack.at(0.25); // any t from 0 to 1; the three above are presets of it
Slack.even(); // on a chain: t grows by one step per gap between tight items (not built)
```

> **Fork: the name.** `slack: Slack.even()`, the word this page uses for the room, or `justify: Justify.even()`, CSS's word for the same choice on a line. Both follow the family rule (a noun, and its key the same word). `justify` is familiar but reads as "fill the line" in typography, which is only one member. Recommended: `Slack`.

![start](img/slack-row-start.png)

**\*start**, q at 38\*

![center](img/slack-row-center.png)

**\*center**, q at 116\*

![end](img/slack-row-end.png)

**\*end**, q at 194\*

![even](img/slack-row-even.png)

**\*even**, q at 90, s at 190\*

**Proposed, the row**

```ts
layer({ slack: { x: Slack.even() } }, [A, B, C, D, p, q, s, r]).relate((c) => [
  Constraint.align({ x: "start" }, [c.A, c.p]),
  Constraint.align({ x: "end" }, [c.D, c.r]),
  Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(8) }, [
    c.p,
    c.q,
    c.s,
    c.r,
  ]),
]);
```

```python
from gofish import Constraint, Slack, Spacing, layer, spread

row = layer([A, B, C, D, p, q, s, r], slack={"x": Slack.even()}).relate(
    lambda c: [
        Constraint.align([c.A, c.p], x="start"),
        Constraint.align([c.D, c.r], x="end"),
        Constraint.distribute(
            [c.p, c.q, c.s, c.r], dir="x", spacing=Spacing.at_least(8)
        ),
    ]
)

siblings = spread(
    [subtree(k) for k in children],
    dir="x",
    spacing=Spacing.contour(10),
    slack=Slack.even(),
)
```

> **Fork: where the choice lives.** On the scope, as here, or on each gap, as approach B does. On the scope, two linked gaps can never disagree, so today's error "all linked gaps must agree" goes away. On each gap, a row can share its slack unevenly. Recommended: on the scope.

![Sankey, start](img/slack-sankey-left.png)

**\*Slack.start**, equals d3 left\*

![Sankey, end](img/slack-sankey-right.png)

**\*Slack.end**, equals d3 right\*

![Sankey, justify](img/slack-sankey-justify.png)

**\*Slack.start** with the sinks aligned to the end, equals d3 justify\*

![Sankey, center](img/slack-sankey-mean.png)

**\*Slack.center**, half a column from d3 center\*

![Sankey, d3 center](img/slack-sankey-d3-center.png)

_d3 center is the least solution, then each source moved next to its first target. A decision in user space._

**Proposed, the sankey**

```ts
// Columns: every link's target at least one column after its source.
layer({ slack: { x: Slack.end() } }, nodes).relate((c) =>
  links.map((l) =>
    Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(COLUMN_GAP) }, [
      c[l.source],
      c[l.target],
    ])
  )
);
// Inside a column, a spread in the column's room: the walls are its edges.
spread(
  { dir: "y", spacing: Spacing.atLeast(10), slack: Slack.even() },
  column.map((n) => rect({ w: 12, h: v(value(n)) }))
);
```

![Tree, start](img/slack-wedge-start.png)

**\*start**, 45 px from d3.tree\*

![Tree, center](img/slack-wedge-center.png)

**\*center**, 15 px\*

![Tree, even](img/slack-wedge-even.png)

**\*even**, 0 px\*

![Tree, Walker](img/slack-wedge-walker.png)

**\*Walker**, d3.tree\*

**Proposed, the tree**

```ts
// Each set of siblings: at least their contour gap apart, slack shared.
spread(
  { dir: "x", spacing: Spacing.contour(10), slack: Slack.even() },
  children.map(subtree)
);
```

> **Fork: Walker as a member.** `even` matches `d3.tree` on this tree and 327 of 331 random ones. To match all of them, `Slack.walker()` could be a member, defined only on a chain of siblings. Or Walker stays a plan written in user space, as on the "Every d3 layout" tab, and the family keeps only rules over ranges. Recommended: keep it in user space, because its steps depend on the order of pushes, which a range does not record.

![Dendrogram, end](img/slack-dendro-end.png)

**\*Slack.end**, equals d3.cluster\*

![Dendrogram, start](img/slack-dendro-start.png)

**\*Slack.start**, a tidy tree's levels\*

**Proposed, the dendrogram**

```ts
layer({ slack: { y: Slack.end() } }, nodes).relate((c) => [
  ...edges.map(([parent, child]) =>
    Constraint.distribute({ dir: "y", spacing: Spacing.atLeast(70) }, [
      c[parent],
      c[child],
    ])
  ),
  ...inner.map((n) => Constraint.align({ x: "mean" }, [c[n], ...kids(c, n)])),
]);
```

For size, `start`, `end`, `center` and `at` need nothing new, since the engine already computes both solutions. `even` is 28 lines in the prototype. It is defined on a chain, so on a scope whose gaps are not a chain it is an error.

#### B. Glue: a weight on each gap (sketch)

Each minimum gap carries a `grow` weight, as TeX's stretch, `flex-grow`, and grid's `fr` do. The slack goes to the gaps in proportion to their weights. On a chain this is the even rule with weights, and `fr` on a spread already means it. On a set of gaps that is not a chain, "in proportion" has no closed form, and it becomes a least-squares problem.

![weights 1, 1, 1](img/slack-row-even.png)

_weights 1, 1, 1_

![weights 2, 1, 0](img/slack-row-glue210.png)

_weights 2, 1, 0, q at 142, s at 242_

![Sankey glue](img/slack-sankey-glue-columns.png)

_Sankey columns, weight 1 on every link. d3 center except Heat, at column 1.5_

![Tree glue](img/slack-wedge-glue.png)

_Tree, 0.001 px from d3.tree_

![Dendrogram glue](img/slack-dendro-glue.png)

_Dendrogram, leaves pinned. Inner nodes land between levels_

**Proposed, the row**

```ts
// Glue: each gap has a minimum and a weight for its share of the slack
// in its run (TeX's "plus", CSS flex-grow, grid's minmax(8px, 1fr)).
Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(8, { grow: 1 }) }, [
  c.p,
  c.q,
  c.s,
  c.r,
]);
// start: only the last gap grows. end: only the first. center: the first
// and the last. Uneven shares: list one spacing per gap.
Constraint.distribute(
  {
    dir: "x",
    spacing: [
      Spacing.atLeast(8, { grow: 2 }),
      Spacing.atLeast(8, { grow: 1 }),
      Spacing.atLeast(8, { grow: 0 }),
    ],
  },
  [c.p, c.q, c.s, c.r]
);
```

**Proposed, the dendrogram**

```ts
// The levels are not a chain, so "which gap grows" has no local answer.
// The nearest local spelling pins the leaves and lets every gap grow:
layer(nodes).relate((c) => [
  ...edges.map(([parent, child]) =>
    Constraint.distribute(
      { dir: "y", spacing: Spacing.atLeast(70, { grow: 1 }) },
      [c[parent], c[child]]
    )
  ),
  Constraint.align({ y: "end" }, leaves(c)),
]);
```

For size, off a chain it needs a quadratic program. The prototype is an 80-line dual coordinate ascent, accurate to about 0.02 px. That is an optimizing solver inside the symbolic one, which this design rules out. Nor can local weights state "every node as late as possible" on a graph, so sankey right and the dendrogram have no spelling.

#### C. No rule: always the least solution (works today)

A minimum gap always takes its least solution. Any other place is an exact relation the user adds, such as an align to a wall or a mean.

![Row, least](img/slack-row-start.png)

_The row, start only_

![Sankey tops packed](img/slack-sankey-tops-start.png)

_Sankey nodes packed to the top of each column, 95 px from d3_

![Dendrogram, leaves pinned](img/slack-dendro-wall-pins.png)

_Dendrogram, leaves aligned to the bottom. Inner nodes stay high, one level from d3.cluster_

```ts
// No rule: a minimum gap always takes the least solution.
Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(8) }, [
  c.p,
  c.q,
  c.s,
  c.r,
]);
// Anything else is an exact relation the user writes, e.g. q midway:
Constraint.align({ x: "mean" }, [c.q, c.p, c.r]);
```

```ts
// Leaves on the last level: an explicit align. Inner nodes stay at their
// depth, which is not d3.cluster.
layer(nodes).relate((c) => [
  ...edges.map(([parent, child]) =>
    Constraint.distribute({ dir: "y", spacing: Spacing.atLeast(70) }, [
      c[parent],
      c[child],
    ])
  ),
  Constraint.align({ y: "end" }, leaves(c)),
]);
```

For size, it needs nothing. But sankey right, the dendrogram and an even spread cannot be written without flipping the axis or adding a relation per node, and the even spread needs each item's slack, which the user cannot see.

#### D. An objective in the optimizing solver (sketch)

dot and VPSC treat the slack as an objective, such as the least total stretch or the nearest place to a wish. In this design that belongs to the optimizing solver of a scope, not to the minimum gap. It is shown only to mark the boundary. Approach B's 80-line solver is this approach on a small scale.

```ts
// The rule as an objective, in the optimizing solver of the main design:
// least squares on how far each gap stretches past its minimum.
layer({ solver: Solver.optimize({ cost: Cost.stretch() }) }, children).relate(
  (c) => gaps(c)
);
```

### Against d3

The largest difference from d3 for each rule and example. Columns and levels are in columns and levels; the rest is in pixels.

| Rule                              | Sankey columns (left, right, center, justify) | Sankey tops | Wedge tree | 18-node tree | 331 random trees       | Dendrogram levels |
| --------------------------------- | --------------------------------------------- | ----------- | ---------- | ------------ | ---------------------- | ----------------- |
| A start                           | (0), 1, 1, 1                                  | (94.75)     | (45)       | (20)         | (169 exact, worst 485) | (2)               |
| A end                             | 1, (0), 1, 1                                  |             |            |              |                        | (0)               |
| A center                          | 0.5, 0.5, 0.5, 0.5                            | (23.69)     | (15)       | (4)          | (319 exact, worst 65)  | (1)               |
| A start, sinks aligned to the end | 1, 1, 1, (0)                                  |             |            |              |                        |                   |
| A even                            |                                               | (0)         | (0)        | (4)          | (327 exact, worst 24)  |                   |
| Walker, in user space             |                                               |             | (0)        | (0)          | (331 exact)            |                   |
| B glue, weight 1                  | 1, 1, 0.5, 1                                  | (0.022)     | (0.001)    | (8)          | (327 exact, worst 44)  | (0.333)           |
| C, leaves aligned to the bottom   |                                               |             |            |              |                        | (1)               |

d3's center is the least solution followed by moving each source next to its first target. That two-step rule matches it exactly and is a decision, so it is written in user space. A blank cell was not measured, or the rule does not apply to that example. Exact means within 0.05 px. The sankey uses d3-sankey 0.12.3 with no relaxation passes, and the trees use `d3.tree().nodeSize([24, 40])`. Scripts: `scratch/slack/check.mjs.txt`.

### Trade-offs

|                          | A. One rule per scope                                       | B. Glue per gap                                  | C. No rule                          |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Covers the four examples | All but d3 center and Walker's nested case, which are plans | Row and tree; not sankey right or the dendrogram | Row start and sankey left only      |
| Stays symbolic           | Yes                                                         | Only on a chain                                  | Yes                                 |
| Can two gaps disagree    | No                                                          | Yes, by design                                   | No                                  |
| Uneven shares in one row | No                                                          | Yes                                              | By hand                             |
| Precedent                | justify-content, Arrangement, nodeAlign, dagre align        | TeX glue, flex-grow, grid fr                     | dot and VPSC, but with an objective |

### Recommendation

**Approach A.** One `Slack` rule per scope and axis, with `start`, `end`, `center`, `at(t)` and `even`, and the default `start`. `Spacing.atLeast(n)` loses its `justify` option. The first three are points of `at(t)`, and `even` is the weighted case of B with equal weights, so the family is one rule with presets. It reaches every d3 example that is a rule over ranges, it never solves an optimization, and it puts the choice where the toolkits and the graph layouts both put it.

**Runner-up: approach B.** It is the more general idea, and it is what `fr` on a spread already does. It loses because off a chain it is an optimization, and because it cannot say "as late as possible", which the dendrogram and sankey right need.

The pick would change if real examples need uneven shares inside one run often, for example a toolbar where one gap takes all the room. Then B's weights on a chain, which stay symbolic, could be added under A as a finer option, the way `flex-grow` sits under `justify-content`. The open `fr` issues (even slack beside data sizes, \#1292, \#1406) point the same way.

## Background

### Terms

- **Decision.** A discrete choice a layout makes: an order, a grouping, a side. Also called the plan.
- **Relation.** A fact between shapes that a solver can satisfy: these are 10 apart, these touch.
- **Solver.** The part of the engine that turns one scope's relations into positions.
- **Scope.** A group of nodes solved together. Today, the nodes that share a scale.
- **Length.** A size before the scale is chosen, as a function of the scale.
- **Scale.** Pixels per data unit, the one unknown the symbolic solver finds for a scope.
- **Minimum gap.** "At least this far apart, in this order." Each item takes the nearest position that satisfies all of them.
- **Slack.** The room a minimum gap leaves over. A rule says where it goes.
- **Contour.** The left and right outline of a subtree at each height.
- **Pass.** One sweep over the tree. GoFish has four: resolve what each axis means, measure, solve, place.

### How the passes run

#### The four passes, and where user code runs

```text
parPost Node { meaning } ;                 resolve what each axis means
parPost Node { size(scale) } ;             measure: user `measure` code runs here
[ solve the scale, once per scope ] ;      not a traversal
parPre  Node { x, y, w, h }                place
  { layout -> body ;                       user `layout` body runs here
              parPost { size(scale') } ;   and the same schedule runs again
              [ solve scale' ] ;           on the tree it returned
              parPre  { x, y, w, h } }
```

`parPost` is a bottom-up pass and `parPre` a top-down one, in the notation of Meyerovich and others (2013). A function that calls `measure` runs in the second pass and joins the one solve. A `layout` body runs in the last one, and the same passes then run again on what it returned, inside its box. Nothing ever loops back.

| Rule                                            | Where it comes from                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| A `layout` node's size is set from outside      | CSS container queries require containment; Flutter's relayout boundary       |
| It asks for no room of its own                  | Compose and Flutter refuse size questions through a builder                  |
| Its body arranges children and creates no marks | SwiftUI's `Layout` and CSS Houdini hand the children in                      |
| Its body is pure                                | Julia's generated functions                                                  |
| A length does not leave its scope               | scope extrusion in multi-stage languages                                     |
| Nothing loops back                              | Typst and LaTeX rerun layout; attribute-grammar layout engines reject cycles |

### Precedent

#### Issue \#485, Spytial

A small relational core, with user-space algorithms that hand it discrete commitments. The source of the decisions-and-relations split.

#### Baudel and Broeksema (2012)

Rectangular treemaps as one algorithm with five functions. The decision half of a tiling.

#### Kennedy (1996), van der Ploeg (2014)

A tidy tree as `fit` and `merge` over contours, by depth or by vertical position. The minimum gap for trees.

#### WebCoLa, VPSC

Separation constraints. The either-or part of non-overlap is decided first and only the rest goes to the solver.

#### Auto Layout, TeX glue

One constraint with a relation of equal, at least or at most. Exact and minimum gaps as one idea.

#### SwiftUI Layout, Compose, CSS Houdini, Typst

Offer space, measure children, place them. GoFish's engine runs the same steps inside. They pass boxes; GoFish passes shapes and scales.

#### Compose SubcomposeLayout, Flutter LayoutBuilder

Children built during layout. The model for `layout` and its rules.

#### Scala LMS

`Rep[T]` against `T`: the type says when a value is known. The model for `Length`.

#### Build Systems à la Carte (2018)

Dependencies known up front, chosen among fixed alternatives, or found while running. The three ways to write decisions. Applying it to layout is our reading.

#### Superconductor and its schedule synthesis

Layout as ordered passes over a tree, checked statically. Three to five passes for visualizations. A bottom-up request, a global step and a top-down response is their memory allocation and our measure, solve, place.

#### Spineless Traversal, Servo

Incremental layout needs a tree that does not change during layout. Servo's fixed passes grew from four to seven and were dropped. The cautions for `layout`.

#### Penrose, d3-force

Constraints and energies handed to an optimizer. The model for the third solver, and the reason it is separate.

#### Mojo, GHC, Lean

A small core, with built-ins written as library code on top of it. The test: can a built-in be replaced by library code with no change in output? For squarify, yes.

**Alternatives considered**

- **A function from geometry to geometry per family** (\#1101's first form): a tiling takes a region and weights and returns regions. Cheapest to build. It lowers into nothing, each family has its own signature, and it reaches Python only as a callback. It is a special case of a function that returns GoFish.
- **One solver for everything**, with non-overlap and costs as constraints, as Penrose does. Non-overlap is an either-or and ordering is a permutation, so the result stops being predictable, and nothing in the exact layouts needed it.
- **Positions out of the plan.** What the first prototypes did. It works, but a resize or a data edit has to decide everything again.
- **Circle packing as contour spacing in polar coordinates.** It holds in part: one function packs circles and places a beeswarm. Neither d3's packing nor the built-in beeswarm is that rule, because both use holes a straight slide cannot reach.

### Related issues

- **\#485**: a relational core with user-space solvers that emit commitments. This page is a concrete version.
- **\#806**: cooperating layout theories across a scope boundary. The solver boundary here.
- **\#1101, \#1279, \#692**: user functions as strategy members, the extensibility audit, public `defineOperator`.
- **\#631, \#610, \#355, \#541**: modular layout algorithms, a layout-program IR, decomposing treemap, tree and Sugiyama, treemap as generated constraints.
- **\#486, \#630, \#1194, \#122, \#40**: the choice operator, `min` in the size algebra, choices in chart chrome, wrap, pretty printing.
- **\#37, \#1334**: layout that depends on the offered size, lazy node operators.
- **\#967, \#973, \#974, \#1064**: `pack` fitting its room and its geometry queries.
- **\#1276, \#1355, \#1295**: delete slice and dice, rename treemap to tile, the Voronoi outer shape.
- **\#38, \#618, \#1163**: GoTree examples and parity, extension packages crossing to Python.

Names: this page uses `tile({ tiling: Tiling.squarify })`, decided on 11-17 (draft PR \#1366). The prototype stories run on main, where it is still `treemap({ tile: Tile.squarify })`. Stories: `packages/gofish-graphics/stories/_proposals/UserSpace*.stories.tsx`. Papers not obtained, so described from the papers that cite them: Kastens (1980), Vogt, Swierstra and Kuiper (1989), TreeFuser, Medea, Cassius.
