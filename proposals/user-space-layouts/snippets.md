# Code blocks for the proposal

Each block is named by the comment above it. `page.html` places a block with `{{code:name}}`, and `build.py` builds `index.html` and `proposal.md` from the two. Blocks are formatted with prettier (JS and TS) and black (Python).

<!-- id: p-api -->

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

<!-- id: p-choose-responsive -->

```js
// A row when it fits, a column otherwise. Both arrangements exist up front,
// so nothing is created late and both are measured in lengths.
choose([spread({ dir: "x" }, cards), spread({ dir: "y" }, cards)]);
```

<!-- id: p-schedule -->

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

<!-- id: p-layout -->

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

<!-- id: p-measure -->

```js
// Circle packing in user space. The packing needs real radii, so it asks
// each length for its pixels. That is an error if a radius depends on the
// scale, which is the error the built-in `pack` raises today.
const packed = (children) => {
  const circles = children.map((c) => measure(c).enclosingCircle);
  const at = frontChain(circles.map((c) => c.r.px)); // plain JS
  return layer(
    children.map((c, i) => position({ x: at[i].x, y: at[i].y }, [c]))
  );
};
```

<!-- id: p-fit-lengths -->

```js
// Kennedy's fit over lengths. It only subtracts, adds a number and takes a
// max, so its result is still a length and the tree takes part in fitting.
const fit = (p, q) =>
  Length.max(
    0,
    ...p.slice(0, q.length).map(([, right], d) => right.sub(q[d][0]).add(GAP))
  );
```

<!-- id: p-api-py -->

```python
def squarified(cells, weights):
    return layout(
        cells,
        lambda space, cells: draw_plan(squarify(weights, (space.w, space.h)), cells),
    )
```

<!-- id: sq-plan -->

```ts
type Plan = { dir: Dir; row: Country[]; rest?: Plan };
const PHI = (1 + Math.sqrt(5)) / 2;

function squarify(
  items: Country[],
  [w, h]: [number, number],
  ratio = PHI
): Plan | undefined {
  if (items.length === 0) return undefined;
  const alpha = Math.max(w / h, h / w) / (total(items) * ratio);
  const worst = (row: Country[]) => {
    const beta = total(row) ** 2 * alpha;
    const ws = row.map((d) => d.pop);
    return Math.max(Math.max(...ws) / beta, beta / Math.min(...ws));
  };
  let k = 1;
  while (
    k < items.length &&
    worst(items.slice(0, k + 1)) <= worst(items.slice(0, k))
  )
    k++;
  const dir = w < h ? "y" : "x";
  const share = total(items.slice(0, k)) / total(items);
  const rest: [number, number] =
    dir === "x" ? [w * (1 - share), h] : [w, h * (1 - share)];
  return { dir, row: items.slice(0, k), rest: squarify(items.slice(k), rest) };
}
```

<!-- id: sq-draw -->

```ts
const shares = (ws: number[]) => ws.map((w) => v(w / sum(ws)));
const along = (dir: Dir, weights: number[]) => ({
  dir,
  reverse: dir === "y", // a stack along y runs upward; the built-in runs down
  size: shares(weights),
});
const cell = (d: Country) => rect({ fill: v(d.continent) });

function drawSquarify({ dir, row, rest }: Plan): any {
  const cells = stack(
    along(
      across(dir),
      row.map((d) => d.pop)
    ),
    row.map(cell)
  );
  if (!rest) return cells;
  return stack(along(dir, [total(row), total(flatten(rest))]), [
    cells,
    drawSquarify(rest),
  ]);
}

layer({ w: 360, h: 300 }, [
  drawSquarify(squarify(countries, [360, 300])!),
]).render(container, { axes: false });
```

<!-- id: bin-draw -->

```ts
const drawBinary = (s: Split): any =>
  "pop" in s
    ? cell(s)
    : stack(along(s.dir, s.weights), s.parts.map(drawBinary));
```

<!-- id: strip-draw -->

```ts
const drawStrip = (rows: Country[][]) =>
  stack(
    along("y", rows.map(total)),
    rows.map((row) =>
      stack(
        along(
          "x",
          row.map((d) => d.pop)
        ),
        row.map(cell)
      )
    )
  );
```

<!-- id: seq-use -->

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

<!-- id: seq-plan -->

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

<!-- id: seq-draw -->

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

<!-- id: p-presets -->

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

<!-- id: greedy-helper -->

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

<!-- id: swarm-use -->

```ts
// The x scale GoFish will pick, rebuilt by hand from the rendered axis.
const xPx = (mass) => ((mass - 2500) / (6500 - 2500)) * 420;

const swarm = greedyPlace(
  weighed.map((p) => ({ x: xPx(p["Body Mass (g)"]), r: 3 })),
  {
    candidates: (item, placed) => [
      { x: item.x, y: 0 },
      ...placed.flatMap((p) => {
        const dr = item.r + p.r + 1;
        const dx = item.x - p.x;
        if (Math.abs(dx) >= dr) return [];
        const dy = Math.sqrt(dr * dr - dx * dx);
        return [
          { x: item.x, y: p.y - dy },
          { x: item.x, y: p.y + dy },
        ];
      }),
    ],
    cost: (pos) => Math.abs(pos.y),
    collides: (pos, item, placed) => overlapsAny(pos, item.r, placed, 1),
  }
);
```

<!-- id: pack-use -->

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

<!-- id: tree-boxes -->

```ts
const boxTree = (t: Tree, path = "n"): any => {
  const node = nodeMark(path); // circle(...).name(path)
  if (!t.children?.length) return node;
  const kids = spread(
    { dir: "x", spacing: GAP, alignment: "start" },
    t.children.map((c, i) => boxTree(c, `${path}.${i}`))
  ).name(`${path}/kids`);
  return layer([node, kids]).relate((c) => [
    Constraint.distribute({ dir: "y", spacing: LEVEL }, [
      c[path],
      c[`${path}/kids`],
    ]),
    Constraint.align({ x: "middle" }, [c[path], c[`${path}/kids`]]),
  ]);
};
```

<!-- id: p-tree -->

```js
const kids = spread(
  { dir: "x", spacing: Spacing.contour(GAP), alignment: "start" },
  t.children.map((c, i) => tidyTree(c, `${path}.${i}`))
).name(`${path}/kids`);
```

<!-- id: fit-both -->

```ts
// Per depth (Kennedy): one [left, right] pair per level.
const fitEdges = (p: Extent, q: Extent): number =>
  Math.max(0, ...p.slice(0, q.length).map(([, r], d) => r - q[d][0] + GAP));

// By vertical position (van der Ploeg): pieces { top, bottom, left, right }.
const fitPieces = (p: Pieces, q: Pieces): number => {
  let x = 0;
  for (let i = 0, j = 0; i < p.length && j < q.length; ) {
    x = Math.max(x, p[i].right - q[j].left + GAP);
    const [pb, qb] = [p[i].bottom, q[j].bottom];
    if (pb <= qb) i++; // advance whichever piece ends higher, or both
    if (qb <= pb) j++;
  }
  return x;
};
```

<!-- id: graph-draw -->

```ts
const layeredGraph = (rows: string[][]) =>
  layer([
    spread(
      { dir: "x", spacing: 42, alignment: "middle" },
      rows.map((row) =>
        spread(
          { dir: "y", spacing: 30, alignment: "middle" },
          row.map(graphNode)
        )
      )
    ),
  ]).relate(() => graphLinks(graph.links));
```

<!-- id: vor-relax -->

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

<!-- id: sep-plans -->

```ts
// Layering: every link's target is at least 1 layer after its source.
export const sepLayers = (nodes: string[], links: Link[], policy: Policy) =>
  solveSeparations(
    nodes,
    links.map((l) => ({ after: l.source, before: l.target, gap: 1 })),
    { policy }
  );

// Tidy tree, inside the recursion: child j clears every earlier child i,
// by their two contours alone.
const seps = kids.flatMap((b, j) =>
  kids.slice(0, j).map((a, i) => ({
    after: ids[i],
    before: ids[j],
    gap: fitPair(a.contour, b.contour),
  }))
);
const x = solveSeparations(ids, seps, { policy });
```

<!-- id: p-separation -->

```js
// A minimum gap is a spacing, so it goes where a gap goes today.
Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(10) }, [a, b]);

// Contour spacing lowers to one of these per pair of siblings, with the
// gap read from their two contours, and `slack` says where the slack goes.
spread(
  { dir: "x", spacing: Spacing.contour(10, { slack: Slack.center() }) },
  subtrees
);

// Layering: every link's target is at least one column after its source.
layer(nodes).relate((n) =>
  links.map((l) =>
    Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(112) }, [
      n[l.source],
      n[l.target],
    ])
  )
);
```

<!-- id: sep-solver -->

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

<!-- id: skyline-use -->

```ts
// A beeswarm: the ray is given by the data.
const swarm = skyline(
  weighed.map((p) => ({ x: xPx(p["Body Mass (g)"]!), r: DOT })),
  cartesian,
  { lane: (d) => d.x, floor: DOT, pad: 1 }
);

// A circle packing: rays from an origin, and the ray is chosen.
const notchPack = skyline(circles, polar);
const goldenPack = skyline(circles, polar, {
  lane: (_, i) => (i * 137.50776 * Math.PI) / 180,
});

// The two coordinate systems: vertical rays over x, and rays from an origin.
const cartesian: Rays = { at: (x, y) => ({ x, y }), laneOf: (p) => p.x };
const polar: Rays = {
  at: (t, d) => ({ x: d * Math.cos(t), y: d * Math.sin(t) }),
  laneOf: (p) => Math.atan2(p.y, p.x),
};
```

<!-- id: p-func -->

```js
// A strip tiling as a function from a region to one rectangle per child.
const strip = (region, weights) =>
  stripRows(weights, region).flatMap((row) => row.cells);

chart(countries)
  .flow(tile({ size: "pop", tiling: strip }))
  .mark(rect({ fill: "continent" }));
```

<!-- id: p-constraints -->

```js
layer(circles).relate((c) => [
  Constraint.separate({ padding: 1 }, all(c)), // no two overlap
  Constraint.minimize(Cost.distance({ from: "center" }), all(c)),
]);
```

<!-- id: p-choose -->

```js
// Beeswarm: each dot takes the y nearest the axis that touches no earlier dot.
scatter({
  x: "Body Mass (g)",
  y: choose(Placement.touching({ padding: 1 }), { cost: Cost.distance() }),
});

// Circle packing: each circle takes the free spot nearest the center.
scatter({
  at: choose(Placement.touching(), { cost: Cost.distance({ from: "center" }) }),
});

// Strip treemap: close a row when one more item would make its cells less square.
stack({ dir: "x", size: "pop", wrap: { cost: Cost.aspect() } });
```

<!-- id: p-python -->

```python
def draw_squarify(plan):
    cells = stack(
        [cell(d) for d in plan.row],
        **along(across(plan.dir), [d["pop"] for d in plan.row]),
    )
    if plan.rest is None:
        return cells
    return stack(
        [cells, draw_squarify(plan.rest)],
        **along(plan.dir, [total(plan.row), total(flatten(plan.rest))]),
    )
```

<!-- id: p-relations -->

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

<!-- id: p-pack-relations -->

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

<!-- id: d3-cluster -->

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

<!-- id: d3-partition -->

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

<!-- id: d3-pie -->

```ts
// A pie, as GoFish already writes it: a stack along the angle.
chart(browsers, { coord: Coord.clock() })
  .flow(stack({ by: "name", dir: "x" }))
  .mark(rect({ w: "value", fill: "name" }));

// With d3's padAngle: a spread. It fills a full turn, so it leaves as
// many gaps as slices, half a gap at each end, where d3.arc draws them.
chart(browsers, { coord: Coord.clock() })
  .flow(spread({ by: "name", dir: "x", spacing: PAD }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: d3-chord -->

```ts
// Chord arcs: a spread of groups along the angle, each a stack of sub-arcs.
// `ends: [0, 1]` starts the first group at 12 o'clock, as d3.chord does.
layer({ coord: Coord.clock() }, [
  spread(
    { dir: "x", spacing: Spacing.box(PAD, { ends: [0, 1] }), y: 120 },
    matrix.map((row, i) =>
      stack(
        { dir: "x", w: v(sum(row)) },
        row.map((m) => rect({ w: v(m), h: 18, fill: v(names[i]) }))
      )
    )
  ),
]);
```

<!-- id: d3-sankey-columns -->

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

<!-- id: d3-sankey-scale -->

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

<!-- id: d3-sankey-node -->

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

<!-- id: d3-stack -->

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

<!-- id: slack-today -->

```ts
// Commit b960e601d's placeholder, before the Slack family. The rule rode
// on each gap under the name `justify`. The branch keeps it on the gap,
// renamed: Spacing.atLeast(8, { slack: Slack.center() }).
layer([A, B, C, D, p, q, s, r]).relate((c) => [
  Constraint.align({ x: "start" }, [c.A, c.p]),
  Constraint.align({ x: "end" }, [c.D, c.r]),
  Constraint.distribute(
    { dir: "x", spacing: Spacing.atLeast(8, { justify: "center" }) },
    [c.p, c.q, c.s, c.r]
  ),
]);
```

<!-- id: slack-a-family -->

```ts
// The family, an option of the minimum gap. Each item takes a fraction t
// of its slack: x = least + t * (greatest - least).
Slack.start(); // t = 0: the least solution (ASAP, early start)
Slack.end(); // t = 1: the greatest solution (ALAP, late start)
Slack.center(); // t = 1/2
Slack.at(0.25); // any t from 0 to 1; the three above are presets of it
Slack.even(); // on a chain: t grows by one step per gap between tight items (not built)
```

<!-- id: slack-a-row -->

```ts
layer([A, B, C, D, p, q, s, r]).relate((c) => [
  Constraint.align({ x: "start" }, [c.A, c.p]),
  Constraint.align({ x: "end" }, [c.D, c.r]),
  Constraint.distribute(
    { dir: "x", spacing: Spacing.atLeast(8, { slack: Slack.even() }) },
    [c.p, c.q, c.s, c.r]
  ),
]);
```

<!-- id: slack-a-sankey -->

```ts
// Columns: every link's target at least one column after its source. The
// gaps are linked, so the rule is stated on each, the same every time.
layer(nodes).relate((c) =>
  links.map((l) =>
    Constraint.distribute(
      {
        dir: "x",
        spacing: Spacing.atLeast(COLUMN_GAP, { slack: Slack.end() }),
      },
      [c[l.source], c[l.target]]
    )
  )
);
// Inside a column, a spread in the column's room: the walls are its edges.
spread(
  { dir: "y", spacing: Spacing.atLeast(10, { slack: Slack.even() }) },
  column.map((n) => rect({ w: 12, h: v(value(n)) }))
);
```

<!-- id: slack-a-tree -->

```ts
// Each set of siblings: at least their contour gap apart, slack shared.
spread(
  { dir: "x", spacing: Spacing.contour(10, { slack: Slack.even() }) },
  children.map(subtree)
);
```

<!-- id: slack-a-dendro -->

```ts
layer(nodes).relate((c) => [
  ...edges.map(([parent, child]) =>
    Constraint.distribute(
      { dir: "y", spacing: Spacing.atLeast(70, { slack: Slack.end() }) },
      [c[parent], c[child]]
    )
  ),
  ...inner.map((n) =>
    Constraint.align({ x: "middle" }, [c[n], mean(kids(c, n))])
  ),
]);
```

<!-- id: slack-b-row -->

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

<!-- id: slack-b-dendro -->

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

<!-- id: slack-c-row -->

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

<!-- id: slack-c-dendro -->

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

<!-- id: slack-d-sketch -->

```ts
// The rule as an objective, in the optimizing solver of the main design:
// least squares on how far each gap stretches past its minimum.
layer({ solver: Solver.optimize({ cost: Cost.stretch() }) }, children).relate(
  (c) => gaps(c)
);
```

<!-- id: slack-a-py -->

```python
from gofish import Constraint, Slack, Spacing, layer, spread

row = layer([A, B, C, D, p, q, s, r]).relate(
    lambda c: [
        Constraint.align([c.A, c.p], x="start"),
        Constraint.align([c.D, c.r], x="end"),
        Constraint.distribute(
            [c.p, c.q, c.s, c.r],
            dir="x",
            spacing=Spacing.at_least(8, slack=Slack.even()),
        ),
    ]
)

siblings = spread(
    [subtree(k) for k in children],
    dir="x",
    spacing=Spacing.contour(10, slack=Slack.even()),
)
```

<!-- id: rv-closed-pie -->

```ts
// Both variants: the same code, no option. A full turn closes.
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(spread({ by: "name", dir: "x", spacing: 0.04 }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-closed-seam-coord -->

```ts
// On the coord
chart(browsers, { coord: Coord.clock({ closed: false }), w: 360, h: 320 })
  .flow(spread({ by: "name", dir: "x", spacing: 0.04 }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-closed-seam-op -->

```ts
// On the operator
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(spread({ by: "name", dir: "x", spacing: 0.04, closed: false }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-closed-half -->

```ts
// Both variants: the same code. A half turn has two ends.
chart(browsers, {
  coord: Coord.clock({ centralAngle: Math.PI }),
  w: 360,
  h: 320,
})
  .flow(spread({ by: "name", dir: "x", spacing: 0.04 }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-closed-chord -->

```ts
// Both variants: the same code. The chain of groups closes; the sub-arcs
// of a group are a stack, so they have no gaps.
layer({ coord: Coord.clock(), w: 360, h: 320 }, [
  spread(
    { dir: "x", spacing: 0.05, y: 120 },
    trips.map((row, i) =>
      stack(
        { dir: "x", w: v(rowTotal(row)) },
        row.map((m) => rect({ w: v(m), h: 18, fill: v(districts[i]) }))
      )
    )
  ),
]);
```

<!-- id: rv-closed-nested -->

```ts
// Both variants: the same code. The outer chain fills the turn and closes
// (three gaps of 0.12). Each inner chain fills a share of it and stays open.
chart(sales, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(
    spread({ by: "quarter", dir: "x", spacing: 0.12 }),
    spread({ by: "product", dir: "x", spacing: 0.03 })
  )
  .mark(rect({ w: "value", fill: "quarter" }));
```

<!-- id: rv-closed-err-coord -->

```text
Coord.clock({ centralAngle: Math.PI, closed: true })

Thrown when the space is made, before anything renders:

Coord.clock({ closed: true }): only a full turn can be closed, and
centralAngle is 3.141592653589793, so the angle is an interval with two
ends. Drop `closed`, or sweep the full turn (centralAngle: 2 * Math.PI).
```

<!-- id: rv-closed-err-op -->

```text
Thrown at render, from the pass where the chain learns it fills its room.
Each starts:

[gofish] spread({ closed: true }): a chain closes only when it fills a
whole periodic axis (a full-turn polar angle), and ...

... ends one of three ways, by where the spread is:

1. Under Coord.clock({ centralAngle: Math.PI }):
   "its space's theta is no full turn, so it has two ends."
2. In a chart with no coord:
   "its room is layer's own size, an interval with two ends."
   (Without a chart `w`: "its room is the canvas, ...")
3. As the inner spread of a nested pie:
   "it is a part of another chain along theta, so its room is a share
   of the axis."

and all three end: Drop `closed`, or lay the chain around a full turn.

A fourth, for a distribute inside .relate():

[gofish] Constraint.distribute({ closed: true }): only a chain that lays
out a whole layer (a spread) can close.
```

<!-- id: rv-ends-pie -->

```ts
// No option. The chain fills a full turn, so its two ends share one gap:
// half at each end under (H), all of it after the last slice under (F).
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(spread({ by: "name", dir: "x", spacing: 0.04 }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-ends-pie-stated -->

```ts
// (H) stated, whatever the default is
spread({ by: "name", dir: "x", spacing: Spacing.box(0.04, { ends: 0.5 }) });

// (F) stated
spread({ by: "name", dir: "x", spacing: Spacing.box(0.04, { ends: [0, 1] }) });
```

<!-- id: rv-ends-chord -->

```ts
// No option. The chain of groups fills the turn; the sub-arcs of a group
// are a stack, so they have no gaps.
layer({ coord: Coord.clock(), w: 360, h: 320 }, [
  spread(
    { dir: "x", spacing: 0.05, y: 120 },
    trips.map((row, i) =>
      stack(
        { dir: "x", w: v(rowTotal(row)) },
        row.map((m) => rect({ w: v(m), h: 18, fill: v(districts[i]) }))
      )
    )
  ),
]);
```

<!-- id: rv-ends-seam -->

```ts
// No room at the ends: a seam at 12 o'clock
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(
    spread({ by: "name", dir: "x", spacing: Spacing.box(0.04, { ends: 0 }) })
  )
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-ends-half -->

```ts
// A half turn has two ends, so the default is 0, as on a line
chart(browsers, {
  coord: Coord.clock({ centralAngle: Math.PI }),
  w: 360,
  h: 320,
})
  .flow(spread({ by: "name", dir: "x", spacing: 0.04 }))
  .mark(rect({ w: "value", fill: "name" }));

// Half a gap at each end, stated
spread({ by: "name", dir: "x", spacing: Spacing.box(0.04, { ends: 0.5 }) });
```

<!-- id: rv-ends-nested -->

```ts
// The outer chain fills the turn, so its ends share one gap of 0.12. Each
// inner chain fills a share of the turn, so its ends are 0.
chart(sales, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(
    spread({ by: "quarter", dir: "x", spacing: 0.12 }),
    spread({ by: "product", dir: "x", spacing: 0.03 })
  )
  .mark(rect({ w: "value", fill: "quarter" }));
```

<!-- id: rv-ends-rings -->

```ts
// Each ring's chain fills the turn, so each ring has the default
chart(sales, { coord: Coord.clock({ innerRadius: 0.3 }), w: 360, h: 320 })
  .flow(
    spread({ by: "quarter", dir: "y", spacing: 4 }),
    spread({ by: "product", dir: "x", spacing: 0.08 })
  )
  .mark(rect({ w: "value", fill: "product" }));
```

<!-- id: rv-ends-radar -->

```ts
// Spokes one share apart. The first spoke is at 12 o'clock under (F), and
// half a step past it under (H). Under (H), `ends: [0, 1]` puts it at 12.
chart(skills, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(
    spread({
      by: "metric",
      dir: "x",
      spacing: Spacing.pitch(fr(1), { at: "start" }),
    })
  )
  .mark(rect({ w: 0, h: "value", stroke: "#bbb" }))
  .layer(line({ stroke: "#555", strokeWidth: 2 }));
```

<!-- id: rv-ends-bars -->

```ts
// Bars one share apart, with no room at the ends (the default on a line)
chart(fruit, { w: 320, h: 160 })
  .flow(spread({ by: "name", dir: "x", spacing: Spacing.box(fr(1)) }))
  .mark(rect({ h: "count", fill: "#4e79a7" }));

// Half a gap at each end
spread({ by: "name", dir: "x", spacing: Spacing.box(fr(1), { ends: 0.5 }) });

// A whole gap at each end
spread({ by: "name", dir: "x", spacing: Spacing.box(fr(1), { ends: 1 }) });
```

<!-- id: rv-ends-bars-today -->

```ts
// Bars that touch, each drawn in by a quarter of its width. The inset is
// paint only, so the boxes still touch and the ends stay at 0.
chart(fruit, { w: 320, h: 160 })
  .flow(spread({ by: "name", dir: "x", spacing: 0 }))
  .mark(rect({ h: "count", fill: "#4e79a7", inset: percent(25) }));
```

<!-- id: rv-ends-fixed -->

```ts
// A spread 360 px wide: 12 px gaps, two gaps (24 px) at each end, and
// three boxes that share what is left in the ratio 1 : 2 : 1
spread(
  { dir: "x", spacing: Spacing.box(12, { ends: 2 }), w: 360 },
  [1, 2, 1].map((k) => rect({ w: fr(k), h: 40, fill: "#f28e2b" }))
);
```

<!-- id: rv-ends-atleast -->

```ts
// At least 10 px between, and 10 px more past the first and last box
spread(
  { dir: "x", spacing: Spacing.atLeast(10, { ends: 1 }), w: 300 },
  [40, 70, 55].map((w) => rect({ w, h: 40, fill: "#59a14f" }))
);
```

<!-- id: rv-ends-spelling -->

```ts
// Recommended: an option of the spacing strategy
spread({ by: "name", spacing: Spacing.box(fr(1), { ends: 0.5 }) });
spread({ by: "metric", spacing: Spacing.pitch(fr(1), { ends: 0.5 }) });

// Alternative: an option of spread, next to spacing
spread({ by: "name", spacing: fr(1), ends: 0.5 });
```

<!-- id: rv-spread-slack -->

```ts
// The same picture under Slack.start(), Slack.center() and Slack.end().
spread(
  { dir: "x", spacing: Spacing.atLeast(8), slack: Slack.center() },
  [60, 40, 50, 70].map((w) => rect({ w, h: 24, rx: 3, fill: "#a8dadc" }))
);
```

<!-- id: rv-row-all -->

```ts
// Top row: A B and C D glued, at least 16 apart. Bottom row: p under A's
// start, r under D's end, q at least 8 from each. The layer's slack on x
// places q.
const rowOfRects = (slack: Slack.Slack) =>
  layer({ slack: { x: slack } }, [A, B, C, D, p, q, r]).relate((c) => [
    Constraint.distribute({ dir: "x", spacing: 2 }, [c.A, c.B]),
    Constraint.distribute({ dir: "x", spacing: 2 }, [c.C, c.D]),
    Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(16) }, [
      c.B,
      c.C,
    ]),
    Constraint.align({ x: "start" }, [c.A, c.p]),
    Constraint.align({ x: "end" }, [c.D, c.r]),
    Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(8) }, [
      c.p,
      c.q,
      c.r,
    ]),
    Constraint.align({ y: "start" }, [c.A, c.B, c.C, c.D]),
    Constraint.align({ y: "start" }, [c.p, c.q, c.r]),
    Constraint.distribute({ dir: "y", spacing: 12 }, [c.A, c.p]),
  ]);

spread(
  { dir: "y", spacing: 24, alignment: "start" },
  [Slack.start(), Slack.center(), Slack.end()].map(rowOfRects)
);
```

<!-- id: rv-row-quarter -->

```ts
// A quarter of the way from the least solution to the greatest.
rowOfRects(Slack.at(0.25));
```

<!-- id: rv-row-pinned -->

```ts
// p and r an exact 160 apart, q between them at least 8 from each:
// 160 - 40 - 16 = 104 px of room, placed by the layer's slack.
const pinnedRow = (slack: Slack.Slack) =>
  layer({ slack: { x: slack } }, [p, q, r]).relate((c) => [
    Constraint.distribute({ dir: "x", spacing: 160 }, [c.p, c.r]),
    Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(8) }, [
      c.p,
      c.q,
      c.r,
    ]),
    Constraint.align({ y: "start" }, [c.p, c.q, c.r]),
  ]);
```

<!-- id: rv-dendrogram -->

```ts
// The leaves one pitch apart; each parent at the mean of its children;
// each child at least a level below its parent, and the slack on y at the
// end, so every leaf lands on the last level (d3.cluster).
layer({ slack: { y: Slack.end() } }, [
  spread(
    { dir: "x", spacing: Spacing.pitch(20, { at: "middle" }) },
    leaves.map((n) => dot(n.path))
  ),
  ...inner.map((n) => dot(n.path)),
]).relate((c) => [
  ...inner.map((n) =>
    Constraint.align({ x: "middle" }, [
      c[n.path],
      mean(n.children.map((k) => c[k.path])),
    ])
  ),
  ...links.map((l) =>
    Constraint.distribute({ dir: "y", spacing: Spacing.atLeast(70) }, [
      c[l.parent],
      c[l.child],
    ])
  ),
  ...links.map((l) =>
    line({ stroke: "#9aa7b1" }, [ref(l.parent), ref(l.child)])
  ),
]);
```

<!-- id: rv-tidy -->

```ts
// A subtree: its node above its children's subtrees. At each depth, every
// node at least 10 from the next, whichever subtree it is in. The node at
// the mean of its first and last child.
const tidy = (t: Tree, path = "n") => {
  const self = circle({ r: 7, fill: "#457b9d" }).name(path);
  if (!t.children?.length) return self;
  const kids = t.children.map((_, i) => `${path}.${i}`);
  return layer([
    self,
    layer(t.children.map((k, i) => tidy(k, kids[i])))
      .relate((c) => [
        Constraint.align({ y: "start" }, subtreesOf(c, t, kids)),
        ...rowsByDepth(t, path).map((row) =>
          Constraint.distribute(
            { dir: "x", spacing: Spacing.atLeast(10) },
            row.map((p) => c[p])
          )
        ),
      ])
      .name(`${path}/kids`),
  ]).relate((c) => [
    Constraint.distribute({ dir: "y", spacing: 40 }, [
      c[path],
      c[`${path}/kids`],
    ]),
    Constraint.align({ x: "middle" }, [
      c[path],
      mean([c[kids[0]], c[kids[kids.length - 1]]]),
    ]),
  ]);
};
```

<!-- id: rv-rose -->

```ts
// Six months edge to edge around the circle, each a stack of two bars
// with a literal width along the angle, and no emX. OneWidth passes
// WEDGE for both bars; TwoWidths passes 0.8 * WEDGE for the inner one.
const WEDGE = (Math.PI * 2) / 6;
const rose = (innerWidth: number) =>
  layer({ coord: Coord.clock(), w: 300, h: 300 }, [
    spread(
      { dir: "x", spacing: 0 },
      months.map(([a, b]) =>
        stack({ dir: "y" }, [
          rect({ w: innerWidth, h: v(a), fill: "#457b9d" }),
          rect({ w: WEDGE, h: v(b), fill: "#e9c46a" }),
        ])
      )
    ),
  ]);
```

<!-- id: rv-lone-bar -->

```ts
// A lone bar 0.6 wide along the angle, touching nothing.
layer({ coord: Coord.clock(), w: 200, h: 200 }, [
  rect({ w: 0.6, h: v(5), fill: "steelblue" }),
]);
```

<!-- id: rv-pixel-bar-alone -->

```ts
// Proposals/Polar Edge To Edge, PixelBarAlone: written as 16 px wide.
layer({ coord: Coord.clock(), w: 300, h: 300 }, [
  rect({ w: 16, h: v(5), fill: "steelblue" }),
]);
```

<!-- id: rv-radians-rule -->

```ts
// coord.tsx: the space declares, per axis, whether a plain number there is
// a quantity of the space. The polar angle has HasCycle, so it is radians.
coordNode._space = {
  aliases: coordTransform.aliases,
  type: coordTransform.type,
  closed: [closesOn(coordTransform, 0), closesOn(coordTransform, 1)],
  quantities: [
    coordTransform.axisTraits?.[0]?.HasCycle !== undefined,
    coordTransform.axisTraits?.[1]?.HasCycle !== undefined,
  ],
};

// _node.ts, resolveEmbedding: a third route beside the data size (B) and
// the shared edge (A).
const embedded =
  (baseEmbedded(box) && !(within && this.isGlyph(dir))) ||
  (typeof dim.size === "number" &&
    this.aspectLock === undefined &&
    this.plainNumbersAreSpace(dir)) ||
  sharesEdge(edges, dir);
```

<!-- id: rv-nodelink-sunburst -->

```ts
// GoTree / Node-Link, Sunburst: every ring 38 px thick, siblings aligned
// at the middle along the radius.
const sunburstNode = (d) =>
  rect({ w: d.width * leafTheta, h: 38, emX: true, fill: greens[d.depth] });

tree(
  {
    node: sunburstNode,
    link: "none",
    parentChild: distribute({ dir: "y", spacing: 0, alignment: "middle" }),
    sibling: distribute({ dir: "x", spacing: 0, alignment: "middle" }),
    coord: Coord.clock(),
  },
  deepBalancedTree
);
```

<!-- id: rv-pies -->

```ts
const pie = (coord) =>
  chart(slices, { coord, w: 200, h: 200, color: palette })
    .flow(spread({ by: "name", dir: "x", spacing: 0.06 }))
    .mark(rect({ w: "value", fill: "name" }));

pie(Coord.polar()); // 0 at 3 o'clock, counter-clockwise
pie(Coord.clock()); // 0 at 12 o'clock, clockwise
pie(Coord.clock({ baselineAngle: 0 })); // 0 at 3 o'clock, clockwise
```

<!-- id: rv-pies-preset -->

```ts
// If Coord.clock is a preset, it takes no baselineAngle or direction, and
// "clockwise from 3 o'clock" is written on the kind. Same render, same DOM.
pie(Coord.polar({ baselineAngle: 0, direction: -1 }));
```

<!-- id: rv-pie-spaced -->

```ts
// UserSpaceD3Hierarchy, PieSpaced: plain Coord.clock(), no option.
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(spread({ by: "name", dir: "x", spacing: 0.04 }))
  .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: rv-sunburst -->

```ts
// A node: its ring, then its children's subtrees end to end along the
// angle, the two laid out along the radius with no gap.
const partitionNode = (t: Tree, ring: number) => {
  const self = rect({ w: v(total(t)), h: ring, fill: v(t.name) });
  if (!t.children) return self;
  return spread({ dir: "y", spacing: 0, alignment: "middle" }, [
    self,
    stack(
      { dir: "x", alignment: "start" },
      t.children.map((c) => partitionNode(c, ring))
    ),
  ]);
};

layer({ coord: Coord.clock(), w: 360, h: 320 }, [partitionNode(budget, 37.5)]);
```

<!-- id: rv-gotree-sunburst -->

```ts
// GoTree / Gallery / sunburst
const node = (d) =>
  rect({
    ...(d.height === 0 ? { w: datum(1) } : {}),
    h: 42,
    emY: true,
    fill: byDepth()(d),
    stroke: "white",
    strokeWidth: 1.5,
  });

tree(
  {
    node,
    link: "none",
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: { kind: "distribute", spacing: 42 },
    }),
    sibling: combine({ x: { kind: "distribute", spacing: 0 } /* ... */ }),
    coord: Coord.clock(),
  },
  deepBalancedTree
);
```

<!-- id: rv-radar-two -->

```ts
layer({ w: 320, h: 320 }, [
  // Inside the polar space: the spokes, the grid points, the data points.
  layer({ coord: Coord.clock() }, [
    chart(spokes)
      .flow(scatter({ by: "metric", x: "metric" }))
      .mark(rect({ w: 0, h: "max", stroke: GRID, strokeWidth: 1 })),
    chart(levels)
      .flow(
        group({ by: "level" }),
        scatter({ by: "metric", x: "metric", y: "level" })
      )
      .mark(circle({ r: 0 }).name("grid")),
    chart(both, { color: Color.palette([INK, RED]) })
      .flow(
        group({ by: "series" }),
        scatter({ by: "metric", x: "metric", y: "value" })
      )
      .mark(circle({ r: 4, fill: "series" }).name("pts")),
  ]),
  // Outside it: straight, closed outlines through the points.
  chart(selectAll("grid"))
    .flow(group({ by: "level" }))
    .mark(polygon({ fill: "none", stroke: GRID, strokeWidth: 1 })),
  chart(selectAll("pts"))
    .flow(group({ by: "series" }))
    .mark(polygon({ fill: "series", opacity: 0.2 })),
  chart(selectAll("pts"))
    .flow(group({ by: "series" }))
    .mark(polygon({ fill: "none", stroke: "series", strokeWidth: 2 })),
]);
```

<!-- id: rv-radar-inside -->

```ts
// The line inside the polar space: each segment is warped into an arc,
// and the loop is open.
chart(rows, { coord: Coord.clock(), w: 320, h: 320 })
  .flow(scatter({ by: "metric", x: "metric", y: "value" }))
  .mark(circle({ r: 4, fill: INK }))
  .layer(line({ stroke: INK, strokeWidth: 2 }));
```

<!-- id: rv-radar-outside-open -->

```ts
// A line outside the space, over selectAll: straight, and open, since a
// line has no segment from its last point back to its first.
layer({ w: 320, h: 320 }, [
  layer({ coord: Coord.clock() }, [
    chart(rows)
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: INK }).name("pts")),
  ]),
  chart(selectAll("pts")).mark(
    line({ stroke: RED, strokeWidth: 2, curve: Curve.linear() })
  ),
]);
```

<!-- id: rv-hull-error -->

```text
Shape.hull({ convexity: 0.9 })

[gofish] Shape.hull({ convexity }): Shape.hull is Shape.blob with
convexity 1 and neck 1, and takes only the options it does not fix. For
another convexity, write the kind: Shape.blob({ convexity: 0.9, neck: 1 }).
```

<!-- r2 blocks -->

<!-- id: r2-sized-today -->

```ts
// Blue rows (the library): a spread 400 px wide, three 30 px boxes, gaps
// of at least 10, under each slack rule, with ends 0 and then 0.5.
const sizedToday = (slack: Slack.Slack, ends: number, y: number) =>
  spread(
    {
      dir: "x",
      w: 400,
      x: 150,
      y,
      spacing: Spacing.atLeast(10, { slack, ends }),
    },
    [0, 1, 2].map(() => rect({ w: 30, h: 24, fill: "#457b9d" }))
  );
```

<!-- id: r2-sized-proto -->

```ts
// Orange rows: a PROTOTYPE computed in the story, not by the library.
// The ends keep `ends` gaps inside each side of the 400 px, and the slack
// rule's t takes that fraction of what is left.
const sizedPrototype = (t: number, ends: number, y: number) => {
  const lo = ends * 10;
  const hi = 400 - ends * 10;
  const chain = 3 * 30 + 2 * 10; // 110 px
  const first = lo + t * (hi - lo - chain);
  return layer(
    [0, 1, 2].map((i) =>
      rect({ x: 150 + first + i * 40, y, w: 30, h: 24, fill: "#f4a261" })
    )
  );
};
```

<!-- id: r2-atleast-ends -->

```ts
// Proposals / End Spacing / AtLeastEnds
layer([
  rect({ x: 0, y: 0, w: 300, h: 60, fill: "#eeeeee" }),
  spread(
    {
      dir: "x",
      spacing: Spacing.atLeast(10, { ends: 1 }),
      w: 300,
      x: 0,
      y: 10,
    },
    [40, 70, 55].map((w) => rect({ w, h: 40, fill: "#59a14f" }))
  ),
]).render(container, { w: 340, h: 100 });
```

<!-- id: r2-pie-default -->

```ts
// Proposals / End Spacing / Pie: no option. The chain fills the turn, so
// it gets half a gap (PAD = 0.04) at each end.
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(spread({ by: "name", dir: "x", spacing: PAD }))
  .mark(rect({ w: "value", fill: "name" }))
  .render(container);
```

<!-- id: r2-pie-noon -->

```ts
// Proposals / End Spacing / PieFromNoon: nothing before the first slice
// and a whole gap after the last.
chart(browsers, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(
    spread({
      by: "name",
      dir: "x",
      spacing: Spacing.box(PAD, { ends: [0, 1] }),
    })
  )
  .mark(rect({ w: "value", fill: "name" }))
  .render(container);
```

<!-- id: r2-chord -->

```ts
// Proposals / End Spacing / Chord
layer({ coord: Coord.clock(), w: 360, h: 320 }, [
  spread(
    { dir: "x", spacing: Spacing.box(0.05, { ends: [0, 1] }), y: 120 },
    trips.map((row, i) =>
      stack(
        { dir: "x", w: v(rowTotal(row)) },
        row.map((m) => rect({ w: v(m), h: 18, fill: v(districts[i]) }))
      )
    )
  ),
]).render(container, { axes: false });
```

<!-- id: r2-tornado -->

```ts
// GoTree / Gallery / TornadoTree, as on the branch. Every node is 0.13 rad
// wide, and pitches between centers place it along the angle.
const TH = 0.13;
const node = (d: any) =>
  d.height === 0
    ? rect({ w: TH, h: 59, emX: true, fill: byDepth()(d) /* ... */ })
    : rect({ w: TH, emX: true, fill: byDepth()(d) /* ... */ });

mount({
  node,
  link: "none",
  parentChild: combine({
    x: { kind: "distribute", spacing: Spacing.pitch(0.55, { at: "middle" }) },
    y: { kind: "nest", pad: 44 },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: Spacing.pitch(0.42, { at: "middle" }) },
    y: { kind: "distribute", spacing: Spacing.pitch(44, { at: "middle" }) },
  }),
  coord: Coord.clock(),
});
```

<!-- id: r2-gotree-ends-b -->

```ts
// Option (b), a sketch, not run: GoTree's lowering adds `ends: [0, 1]` to
// the sibling chain of the root only, where the chain fills the turn.
// Inner chains keep the default, 0, so nothing else moves.
Spacing.pitch(0.42, { at: "middle", ends: [0, 1] }); // root siblings only
```

<!-- id: r2-bars -->

```ts
// Proposals / End Spacing / BarsBetween, BarsAround, BarsEvenly
const barsWith = (spacing: any) =>
  chart(fruit, { w: 320, h: 160 })
    .flow(spread({ by: "name", dir: "x", spacing }))
    .mark(rect({ h: "count", fill: "#4e79a7" }));

barsWith(Spacing.box(fr(1))); // ends 0, the default on a line
barsWith(Spacing.box(fr(1), { ends: 0.5 }));
barsWith(Spacing.box(fr(1), { ends: 1 }));
```

<!-- id: r2-rose-old -->

```ts
// Forward Syntax / Pie / Rose, on main: the bar states its angular width.
chart(nightingale, { coord: Coord.clock(), axes: true, padding: 40 /* ... */ })
  .flow(
    spread({ by: "Month", dir: "x", spacing: 0, axes: { x: false, y: true } }),
    stack({ by: "Type", dir: "y" }),
    derive((d) => d.map((d) => ({ ...d, Death: Math.sqrt(d.Death) })))
  )
  .mark(rect({ w: (Math.PI * 2) / 12, h: "Death", fill: "Type" }));
```

<!-- id: r2-rose-new -->

```ts
// On the branch: the same, with no width on the bar.
chart(nightingale, { coord: Coord.clock(), axes: true, padding: 40 /* ... */ })
  .flow(
    spread({ by: "Month", dir: "x", spacing: 0, axes: { x: false, y: true } }),
    stack({ by: "Type", dir: "y" }),
    derive((d) => d.map((d) => ({ ...d, Death: Math.sqrt(d.Death) })))
  )
  .mark(rect({ h: "Death", fill: "Type" }));
```

<!-- id: r2-tornado-box -->

```ts
// Run in a throwaway copy of the branch, not proposed: no emX, and box
// gaps (pitch less the 0.13 rad node width) instead of the two pitches.
const node = (d: any) =>
  d.height === 0
    ? rect({ w: TH, h: 59, fill: byDepth()(d) /* ... */ })
    : rect({ w: TH, fill: byDepth()(d) /* ... */ });

mount({
  node,
  link: "none",
  parentChild: combine({
    x: { kind: "distribute", spacing: Spacing.box(0.42) },
    y: { kind: "nest", pad: 44 },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: Spacing.box(0.29) },
    y: { kind: "distribute", spacing: Spacing.pitch(44, { at: "middle" }) },
  }),
  coord: Coord.clock(),
});
```

<!-- id: r2-wedge -->

```ts
// GoTree / Gallery / MultilevelSilhouetteTree (OutsideInTree is alike):
// angles and radii computed in story code and written as literal x, w,
// y and h. No relation places the wedge.
const wedgeMark = (
  w: Wedge,
  rInner: number,
  rOuter: number,
  strokeWidth: number
) =>
  rect({
    x: w.theta0,
    w: w.theta1 - w.theta0,
    y: rInner,
    h: rOuter - rInner,
    emX: true,
    fill: w.fill,
    stroke: w.stroke,
    strokeWidth,
  });
```

<!-- id: r2-balloon -->

```ts
// Low Level Syntax / Balloon Chart: each string is a rect in a wavy
// space, inside a layer placed at the data's x. No relation fixes its
// height.
layer(
  { coord: Coord.wavy(), x: 0, y: 0 },
  scatterData.map((data, i) =>
    layer({ x: data.x }, [
      rect({ x: 0, y: 0, w: 1, h: data.y, emY: true, fill: color.black }),
      Balloon({ scale: 1, x: 0, y: data.y /* ... */ }),
    ])
  )
);
```

<!-- id: r2-wedge-datum -->

```ts
// Option (b) for this group, a sketch, not run: the literal angles as
// data values, so a data width embeds by the data size, with no flag.
rect({
  x: datum(w.theta0),
  w: datum(w.theta1 - w.theta0),
  y: rInner,
  h: rOuter - rInner,
  fill: w.fill,
});
```

<!-- id: r2-nodelink-sunburst -->

```ts
// GoTree / Node-Link / Sunburst, as on the branch
const sunburstNode = (d: any) =>
  rect({
    w: d.width * leafTheta,
    h: bandHeight,
    emX: true,
    fill: polarGreens[Math.min(d.depth, polarGreens.length - 1)],
    stroke: "white",
    strokeWidth: 2,
  });

tree(
  {
    node: sunburstNode,
    link: "none",
    parentChild: distribute({ dir: "y", spacing: 0, alignment: "middle" }),
    sibling: distribute({ dir: "x", spacing: 0, alignment: "middle" }),
    coord: Coord.clock(),
  },
  deepBalancedTree
);
```

<!-- id: r2-nodelink-rewrite -->

```ts
// Run in a throwaway copy of the branch: no emX on sunburstNode, and the
// parent aligned to its children's group at both edges instead of the
// middle. The normalized DOM is byte-identical to the branch's render.
const parentChild = (children: any[]) => {
  const named = children.map((c, i) => layer([c]).name(`pc-${i}`));
  const refs = (c: any) => named.map((_, i) => c[`pc-${i}`]);
  return layer(named).relate((c: any) => [
    Constraint.distribute({ dir: "y", spacing: 0 }, refs(c)),
    Constraint.align({ x: "start" }, refs(c)),
    Constraint.align({ x: "end" }, refs(c)),
  ]);
};
```

<!-- id: r2-radar -->

```ts
// Proposals / Radar Outline / RadarTwoSeries
layer({ w: 320, h: 320 }, [
  layer({ coord: Coord.clock() }, [
    chart(spokes)
      .flow(scatter({ by: "metric", x: "metric" }))
      .mark(rect({ w: 0, h: "max", stroke: GRID, strokeWidth: 1 })),
    chart(levels)
      .flow(
        group({ by: "level" }),
        scatter({ by: "metric", x: "metric", y: "level" })
      )
      .mark(circle({ r: 0 }).name("grid")),
    chart(both, { color: Color.palette([INK, RED]) })
      .flow(
        group({ by: "series" }),
        scatter({ by: "metric", x: "metric", y: "value" })
      )
      .mark(circle({ r: 4, fill: "series" }).name("pts")),
  ]),
  chart(selectAll("grid"))
    .flow(group({ by: "level" }))
    .mark(polygon({ fill: "none", stroke: GRID, strokeWidth: 1 })),
  chart(selectAll("pts"))
    .flow(group({ by: "series" }))
    .mark(polygon({ fill: "series", opacity: 0.2 })),
  chart(selectAll("pts"))
    .flow(group({ by: "series" }))
    .mark(polygon({ fill: "none", stroke: "series", strokeWidth: 2 })),
]).render(container);
```

<!-- id: r2-radar-no-spokes -->

```ts
// Proposals / Review Examples / RadarNoSpokes: the left picture is
// RadarWithSpokes, the radar above less its grid. The right one drops the
// spokes' chart from the polar layer, and nothing else.
layer({ coord: Coord.clock() }, [
  chart(both, { color: Color.palette([INK, RED]) })
    .flow(
      group({ by: "series" }),
      scatter({ by: "metric", x: "metric", y: "value" })
    )
    .mark(circle({ r: 4, fill: "series" }).name("pts")),
]);
```

<!-- id: r2-radar-one-polygon -->

```ts
// Proposals / Review Examples / RadarOnePolygon: one polygon per series
// in place of the two
chart(selectAll("pts"))
  .flow(group({ by: "series" }))
  .mark(
    polygon({ fill: "series", stroke: "series", strokeWidth: 2, opacity: 0.2 })
  );
```

<!-- id: r2-dendrogram -->

```ts
// Proposals / Minimum Gap / Dendrogram
layer([
  spread(
    { dir: "x", spacing: Spacing.pitch(DX, { at: "middle" }) },
    leaves.map((n) => dot(n.path, "#457b9d"))
  ).name("leaves"),
  ...inner.map((n) => dot(n.path, "#1d3557")),
]).relate((c) => [
  ...inner.map((n) =>
    Constraint.align({ x: "middle" }, [
      c[n.path],
      mean(n.t.children!.map((_, i) => c[`${n.path}.${i}`])),
    ])
  ),
  ...ns
    .filter((n) => n.parent)
    .map((n) =>
      Constraint.distribute(
        {
          dir: "y",
          spacing: Spacing.atLeast(DY - 2 * R, { slack: Slack.end() }),
        },
        [c[n.parent!], c[n.path]]
      )
    ),
  ...treeLinks(ns),
]);
```

<!-- id: r2-tidy -->

```ts
// Proposals / Minimum Gap / TidyTree: a subtree's node at the mean of its
// first and last child.
Constraint.align({ x: "middle" }, [
  c[path],
  mean([c[kids[0]], c[kids[kids.length - 1]]]),
]);
```

<!-- id: r2-row -->

```ts
// Proposals / Minimum Gap / RowAll: rowOfRects under start, center, end
const rowOfRects = (slack: Slack.Slack) =>
  layer([A, B, C, D, p, q, r]).relate((c) => [
    Constraint.distribute({ dir: "x", spacing: 2 }, [c.A, c.B]),
    Constraint.distribute({ dir: "x", spacing: 2 }, [c.C, c.D]),
    Constraint.distribute({ dir: "x", spacing: Spacing.atLeast(16) }, [
      c.B,
      c.C,
    ]),
    Constraint.align({ x: "start" }, [c.A, c.p]),
    Constraint.align({ x: "end" }, [c.D, c.r]),
    Constraint.distribute(
      { dir: "x", spacing: Spacing.atLeast(8, { slack }) },
      [c.p, c.q, c.r]
    ),
    Constraint.align({ y: "start" }, [c.A, c.B, c.C, c.D]),
    Constraint.align({ y: "start" }, [c.p, c.q, c.r]),
    Constraint.distribute({ dir: "y", spacing: 12 }, [c.A, c.p]),
  ]);

spread(
  { dir: "y", spacing: 24, alignment: "start" },
  [Slack.start(), Slack.center(), Slack.end()].map(rowOfRects)
);
rowOfRects(Slack.at(0.25)); // RowQuarter
```

<!-- id: r2-row-pinned -->

```ts
// Proposals / Minimum Gap / RowPinned
const pinnedRow = (slack: Slack.Slack) =>
  layer([p, q, r]).relate((c) => [
    Constraint.distribute({ dir: "x", spacing: 160 }, [c.p, c.r]),
    Constraint.distribute(
      { dir: "x", spacing: Spacing.atLeast(8, { slack }) },
      [c.p, c.q, c.r]
    ),
    Constraint.align({ y: "start" }, [c.p, c.q, c.r]),
  ]);
```

<!-- id: r2-slack-clash -->

```text
Two linked distributes that state different slack rules (from the
minimumGap test, run on the branch):

[gofish] Minimum gaps on x: distribute[0] states
Spacing.atLeast(…, { slack: Slack.at(1) }) but distribute[1] states
Spacing.atLeast(…, { slack: Slack.at(0.5) }), and their gaps are linked
(through {node-21}), so they share one room. State the slack on one of
them, or the same slack on both.
```

<!-- id: r2-ends-other -->

```ts
// Proposals / End Spacing: PieSeam, HalfTurn, HalfTurnAround
pie(Coord.clock(), Spacing.box(PAD, { ends: 0 }));
pie(Coord.clock({ centralAngle: Math.PI }), PAD);
pie(Coord.clock({ centralAngle: Math.PI }), Spacing.box(PAD, { ends: 0.5 }));
// where
const pie = (coord: any, spacing: any) =>
  chart(browsers, { coord, w: 360, h: 320 })
    .flow(spread({ by: "name", dir: "x", spacing }))
    .mark(rect({ w: "value", fill: "name" }));
```

<!-- id: r2-ends-nested -->

```ts
// Proposals / End Spacing / Nested and Rings
chart(sales, { coord: Coord.clock(), w: 360, h: 320 })
  .flow(
    spread({ by: "quarter", dir: "x", spacing: 0.12 }),
    spread({ by: "product", dir: "x", spacing: 0.03 })
  )
  .mark(rect({ w: "value", fill: "quarter" }));

chart(sales, { coord: Coord.clock({ innerRadius: 0.3 }), w: 360, h: 320 })
  .flow(
    spread({ by: "quarter", dir: "y", spacing: 4 }),
    spread({ by: "product", dir: "x", spacing: 0.08 })
  )
  .mark(rect({ w: "value", fill: "product" }));
```

<!-- id: r2-ends-fixed -->

```ts
// Proposals / End Spacing / FixedWidthLayer
layer([
  rect({ x: 0, y: 0, w: 360, h: 60, fill: "#eeeeee" }),
  spread(
    {
      dir: "x",
      spacing: Spacing.box(12, { ends: 2 }),
      w: 360,
      x: 0,
      y: 10,
    },
    [1, 2, 1].map((k) => rect({ w: fr(k), h: 40, fill: "#f28e2b" }))
  ),
]);
```

<!-- id: r2-pies -->

```ts
// Proposals / Review Examples / PiePolar, PieClock, PiePolarClockwise
const pie = (coord: any) =>
  chart(slices, { coord, w: 200, h: 200, color: palette })
    .flow(spread({ by: "name", dir: "x", spacing: 0.06 }))
    .mark(rect({ w: "value", fill: "name" }));

pie(Coord.polar()); // 0 at 3 o'clock, counter-clockwise
pie(Coord.clock()); // 0 at 12 o'clock, clockwise
pie(Coord.polar({ baselineAngle: 0, direction: -1 })); // 3 o'clock, clockwise
```

<!-- id: r2-clock-error -->

```text
Coord.clock({ baselineAngle: 0 })

[gofish] Coord.clock({ baselineAngle }): Coord.clock is Coord.polar with
baselineAngle 1.5707963267948966 and direction -1, and takes only the
options it does not fix. For another baselineAngle, write the kind:
Coord.polar({ baselineAngle: 0, direction: -1 }).

On the wire, Coord.clock() is
{"type":"polar","baselineAngle":1.5707963267948966,"direction":-1}
```

<!-- id: r2-hull-error -->

```text
Shape.hull({ convexity: 0.5 })

[gofish] Shape.hull({ convexity }): Shape.hull is Shape.blob with
convexity 1 and neck 1, and takes only the options it does not fix. For
another convexity, write the kind: Shape.blob({ convexity: 0.5, neck: 1 }).
```

<!-- id: r2-radar-outside-open -->

```ts
// Proposals / Radar Outline / OutsideOpen: a line outside the space,
// through the points where the space draws them
layer({ w: 320, h: 320 }, [
  layer({ coord: Coord.clock() }, [
    chart(rows)
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: INK }).name("pts")),
  ]),
  chart(selectAll("pts")).mark(
    line({ stroke: RED, strokeWidth: 2, curve: Curve.linear() })
  ),
]);
```

<!-- id: r2-radar-inside -->

```ts
// Proposals / Radar Outline / InsideCoord: the line inside the space
chart(rows, { coord: Coord.clock(), w: 320, h: 320 })
  .flow(scatter({ by: "metric", x: "metric", y: "value" }))
  .mark(circle({ r: 4, fill: INK }))
  .layer(line({ stroke: INK, strokeWidth: 2 }));
```

<!-- id: gt-sunburst-old -->

```ts
// GoTree / Gallery / sunburst, before. Each ring is bandHeight px thick.
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 },
    y: { kind: "distribute", spacing: bandHeight }, // a ring's thickness of gap
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
```

<!-- id: gt-sunburst-new -->

```ts
// After. Rings touch (the dsl's Margin is "0rr"), and siblings start on
// the same ring.
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 },
    y: { kind: "distribute", spacing: 0 },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "start" },
  }),
});
```

<!-- id: gt-hsc-old -->

```ts
// GoTree / Gallery / HierarchicalSectorChart, before.
const bandHeight = 90; // radial thickness of one ring
rect({ w: datum(1), h: bandHeight /* ... */ }); // leaves
rect({ h: bandHeight /* ... */ }); // internal nodes
mount({
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
tree(spec, data).render(container);
```

<!-- id: gt-hsc-new -->

```ts
// After. GoTree sizes a parent like its child group, so a node of height h
// is 2^(h-1) rings thick and a leaf one ring.
const rings = (d: any) => (d.height === 0 ? 1 : 2 ** (d.height - 1));
rect({ w: datum(1), h: datum(rings(d)) /* ... */ }); // leaves
rect({ h: datum(rings(d)) /* ... */ }); // internal nodes
mount({
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "start" },
  }),
});
tree(spec, data).render(container, { w: 540, h: 540 });
```

<!-- id: gt-tyre-old -->

```ts
// GoTree / Gallery / TyreTree, before. Bands in pixels: 224 px of radial
// room in a canvas that has 187.5 px.
const band = 56;
rect({ h: (d.height + 1) * band /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 },
    y: { kind: "align", alignment: "start" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "start" },
  }),
});
```

<!-- id: gt-tyre-new -->

```ts
// After. A band is as thick as its reverse depth (RootHeight: rdepth), and
// the child group sits centered within its parent's band ("within").
const LEVELS = 4;
const rdepth = (d: any) => LEVELS - d.depth;
rect({ h: datum(rdepth(d)) /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
```

<!-- id: gt-clock-old -->

```ts
// GoTree / Gallery / ClockTree, before.
rect({ w: datum(1), h: datum(d.height + 1) /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
```

<!-- id: gt-clock-new -->

```ts
// After. Bottom-up puts a parent after its children; RootHeight: rdepth
// sizes by depth; Y align "bottom" hangs every wedge from the rim.
const LEVELS = 4;
rect({ w: datum(1), h: datum(LEVELS - d.depth) /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: 0, order: "reverse" },
    y: { kind: "align", alignment: "end" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "end" },
  }),
});
```

<!-- id: gt-ctwl-old -->

```ts
// GoTree / Gallery / ClockTreeWithLink, before.
const bandHeight = 60;
rect({ w: datum(1), h: bandHeight /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
```

<!-- id: gt-ctwl-new -->

```ts
// After. The same rule as ClockTree. The links are unchanged.
const LEVELS = 3;
rect({ w: datum(1), h: datum(LEVELS - d.depth) /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: 0, order: "reverse" },
    y: { kind: "align", alignment: "end" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "end" },
  }),
});
```

<!-- id: gt-sector-old -->

```ts
// GoTree / Gallery / SectorTree, before: one ring per depth.
rect({ w: datum(1), h: 8 /* ... */ }); // leaves; internal nodes have no w
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 },
    y: { kind: "distribute", spacing: 35 },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
```

<!-- id: gt-sector-new -->

```ts
// After. PolarAxis: x-axis puts the dsl's X on r and its Y on θ, so the X
// relations go on `y` and the Y relations on `x`.
const LEVELS = 3;
rect({ w: datum(LEVELS - d.depth), h: datum(1) /* ... */ });
mount({
  parentChild: combine({
    x: { kind: "align", alignment: "middle" }, // Y Root: within
    y: { kind: "distribute", spacing: 0, order: "reverse" }, // X Root: juxtapose
  }),
  sibling: combine({
    x: { kind: "align", alignment: "middle" }, // Y Subtree: align
    y: { kind: "distribute", spacing: 0 }, // X Subtree: flatten
  }),
});
```

<!-- id: gt-sector2-old -->

```ts
// GoTree / Gallery / SectorTree2, before: a sunburst with gaps.
rect({ w: datum(1), h: 42 /* ... */ }); // leaves; internal nodes have no w
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 },
    y: { kind: "distribute", spacing: 42 },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
  coord: Coord.clock(),
});
```

<!-- id: gt-sector2-new -->

```ts
// After. PolarAxis: x-axis, so the X relations go on `y` (r) and the Y
// relations on `x` (θ). A node of height h takes 2^(h-1) angular slots.
const slots = (d: any) => (d.height === 0 ? 1 : 2 ** (d.height - 1));
rect({ w: datum(slots(d)), h: datum(1) /* ... */ }); // leaves
rect({ w: datum(slots(d)) /* ... */ }); // internal nodes
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: 0 }, // Y Root: juxtapose
    y: { kind: "nest", pad: 0 }, // X Root: include
  }),
  sibling: combine({
    x: { kind: "align", alignment: "start" }, // Y Subtree: align
    y: { kind: "distribute", spacing: 0 }, // X Subtree: flatten
  }),
  coord: Coord.polar({ baselineAngle: Math.PI / 2 }), // counter-clockwise from 12
});
```

<!-- id: gt-tornado-old -->

```ts
// GoTree / Gallery / TornadoTree, before. TornadoTree2 was the same with
// other numbers.
rect({ w: 0.13, h: 59, emX: true /* ... */ }); // leaves
rect({ w: 0.13, emX: true /* ... */ }); // internal nodes
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: Spacing.pitch(0.55, { at: "middle" }) },
    y: { kind: "nest", pad: 44 },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: Spacing.pitch(0.42, { at: "middle" }) },
    y: { kind: "distribute", spacing: Spacing.pitch(44, { at: "middle" }) },
  }),
});
```

<!-- id: gt-tornado-new -->

```ts
// After. PolarAxis: x-axis, so the X relations go on `y` (r) and the Y
// relations on `x` (θ). No flags and no hand numbers.
rect({ w: datum(1), h: datum(1) /* ... */ }); // leaves
rect({ h: datum(1) /* ... */ }); // internal nodes
mount({
  parentChild: combine({
    x: { kind: "nest", pad: 0 }, // Y Root: include
    // X Root: juxtapose, bottom-up. TornadoTree2 (PolarCenter: left) leaves
    // out `order: "reverse"`, so its root is at the center.
    y: { kind: "distribute", spacing: 4, order: "reverse" },
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 }, // Y Subtree: flatten
    y: { kind: "distribute", spacing: 4 }, // X Subtree: flatten
  }),
});
```

<!-- id: gt-violin-old -->

```ts
// GoTree / Gallery / ViolinTree, before.
const LEAF_THETA = (2 * Math.PI) / 9;
rect({ w: LEAF_THETA, h: d.data.value * 42, emX: true /* ... */ }); // leaves
rect({ w: LEAF_THETA, emX: true /* ... */ }); // internal nodes
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: Spacing.pitch(0, { at: "middle" }) },
    y: { kind: "nest", pad: 18 },
  }),
  sibling: combine({
    x: {
      kind: "distribute",
      spacing: Spacing.pitch(LEAF_THETA, { at: "middle" }),
    },
    y: { kind: "distribute", spacing: Spacing.pitch(0, { at: "middle" }) },
  }),
  coord: Coord.clock(),
});
```

<!-- id: gt-violin-new -->

```ts
// After. Each node takes its own angular slot, parent after children.
rect({ w: datum(1), h: datum(1) /* ... */ }); // leaves
rect({ w: datum(1) /* ... */ }); // internal nodes
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: 0, order: "reverse" }, // X Root: juxtapose
    y: { kind: "nest", pad: 0 }, // Y Root: include
  }),
  sibling: combine({
    x: { kind: "distribute", spacing: 0 }, // X Subtree: flatten
    // Y Subtree: flatten. PolarCenter: bottom puts the layout's top at the rim.
    y: { kind: "distribute", spacing: 0, order: "reverse" },
  }),
  coord: Coord.polar({ baselineAngle: Math.PI / 2 }), // counter-clockwise from 12
});
```

<!-- id: gt-ends-old -->

```ts
// GoTree / Gallery / SideTree and SpiralLayout, before: the root's chain
// around the turn took the default ends, half a gap at each end.
mount({
  parentChild: combine({
    x: { kind: "distribute", spacing: Spacing.pitch(0.5, { at: "middle" }) },
    // ...
  }),
});
```

<!-- id: gt-ends-new -->

```ts
// After. GoTree puts the first branch at the start angle, so no room
// before it and a whole gap after the last.
mount({
  parentChild: combine({
    x: {
      kind: "distribute",
      spacing: Spacing.pitch(0.5, { at: "middle", ends: [0, 1] }),
    },
    // ...
  }),
});
```

<!-- id: gt-nl-old -->

```ts
// GoTree / Node-Link / Sunburst and NestedPietree, before.
const leafTheta = (2 * Math.PI) / deepLeafCount;
rect({ w: d.width * leafTheta, h: bandHeight, emX: true /* ... */ });
// NestedPietree leaves, sized by hand to fit 2π with the pads and gaps
const NPT_LEAF_W = Math.PI / 2 - 0.27;
rect({ w: NPT_LEAF_W, h: 36 /* ... */ });
```

<!-- id: gt-nl-new -->

```ts
// After. Weights, which the coord fits to the turn and the radius.
rect({ w: datum(d.width), h: bandHeight /* ... */ });
rect({ w: datum(1), h: datum(1) /* ... */ }); // NestedPietree leaves
```

<!-- id: gt2-icicle-old -->

```ts
// GoTree / Gallery / icicleplot, before (IciclePlotPolar.stories.tsx).
// A polar picture: the same layout as the sunburst story.
const node = (d: any) =>
  d.height === 0
    ? rect({ w: datum(1), h: bandHeight, fill: byDepth(icicleBlues)(d) })
    : rect({ h: bandHeight, fill: byDepth(icicleBlues)(d) });
tree(
  {
    node,
    link: "none",
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: { kind: "distribute", spacing: 0 },
    }),
    sibling: combine({
      x: { kind: "distribute", spacing: 0 },
      y: { kind: "align", alignment: "start" },
    }),
    coord: Coord.clock(),
  },
  sampleTree
).render(container);
```

<!-- id: gt2-icicle-new -->

```ts
// After (IciclePlot.stories.tsx). A cartesian icicle, as in the picture.
// The root's 19 children, read off the reference: a number is a leaf with
// that value, a list is a child whose leaves have those values.
const branches = [
  10,
  [7, 5],
  [5, 5],
  16,
  3,
  [5, 9],
  [12, 1],
  4,
  7,
  3,
  [4, 3, 4],
  [5, 13, 2, 2],
  4,
  [8, 1, 3, 3],
  7,
  [5, 4, 6, 9],
  8,
  7,
  [2, 6, 6, 10],
];
const bandHeight = 120; // one depth band
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(d.data.value),
        h: bandHeight,
        fill: byDepth(icicleBlues)(d),
      })
    : rect({ h: bandHeight, fill: byDepth(icicleBlues)(d) });
tree(
  {
    node,
    link: "none",
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: { kind: "distribute", spacing: 0 },
    }),
    sibling: combine({
      x: { kind: "distribute", spacing: 0 },
      y: { kind: "align", alignment: "start" },
    }),
  },
  icicleData
).render(container, { w: 640 });
```

<!-- id: gt2-icicle-bug -->

```ts
// The engine bug in four nodes. With h: datum(1), the parent A is drawn
// below its own child a1, while the root stays above A and B. With h: 100,
// every parent is above its children.
const data = {
  name: "root",
  children: [{ name: "A", children: [{ name: "a1" }] }, { name: "B" }],
};
tree(
  {
    node: (d) =>
      rect({ w: d.height === 0 ? datum(1) : undefined, h: datum(1) }),
    link: "none",
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: { kind: "distribute", spacing: 0 },
    }),
    sibling: combine({
      x: { kind: "distribute", spacing: 0 },
      y: { kind: "align", alignment: "start" },
    }),
  },
  data
).render(container, { w: 200, h: 300 });
// Drawn: root y=0, A y=200, a1 y=100.
// Expected (and drawn with h: 100): root y=0, A y=100, a1 y=200.
```

<!-- id: gt2-npt-old -->

```ts
// GoTree / Gallery / NestedPieTree, before. A cartesian picture.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: 92,
        h: (d.data.value ?? d.width ?? 1) * 37,
        fill: byDepth()(d),
      })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });
const dice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: 18 },
});
const slice = combine({
  x: { kind: "distribute", spacing: 18 },
  y: { kind: "align", alignment: "middle" },
});
tree(
  {
    node,
    link: "none",
    parentChild: combine({
      x: { kind: "nest", pad: 14 },
      y: { kind: "nest", pad: 14 },
    }),
    sibling: alternate([slice, dice]),
  },
  sampleTree
).render(container);
```

<!-- id: gt2-npt-new -->

```ts
// After. A polar picture. A node is sized by its value only along the axis
// its parent splits (a slice splits the angle, a dice the radius), and it
// fills its parent on the other axis.
const wedges = [
  [3, 2, 2, 1],
  4,
  5,
  [3, 2, 1, 1],
  3,
  [3, 2, 2, 1],
  1.5,
  [4, 2, 2],
  [2, 2],
  1,
  2,
  3,
  [3, 2],
  [4, 3],
  1.5,
  5,
  [3, 2],
  [3, 2],
  4,
];
const node = (d: any) => {
  const style = {
    fill: byDepth(pieBlues)(d),
    stroke: "white",
    strokeWidth: 1.5,
  };
  if (d.depth === 0) return rect(style);
  const value = datum(total(d.data)); // a leaf's value, or its leaves' sum
  return d.depth % 2 === 1
    ? rect({ w: value, ...style })
    : rect({ h: value, ...style });
};
const slice = combine({
  x: { kind: "distribute", spacing: 0 },
  y: { kind: "align", alignment: "start" },
});
const dice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: 4 },
});
tree(
  {
    node,
    link: "none",
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: { kind: "nest", pad: 4 },
    }),
    sibling: alternate([slice, dice]),
    coord: Coord.clock(),
  },
  pieData
).render(container, { w: 520, h: 520 });
```

<!-- id: gt2-deep-old -->

```ts
// GoTree / Gallery / deep-tree, before. A polar picture.
mount(
  {
    node: (d) =>
      circle({ r: 6, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 }),
    link: { curve: Curve.linear(), stroke: "#5f6b7a", strokeWidth: 1.5 },
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: {
        kind: "distribute",
        spacing: Spacing.pitch(151, { at: "middle" }),
      },
    }),
    sibling: combine({
      x: {
        kind: "distribute",
        spacing: Spacing.pitch((2 * Math.PI) / 10, { at: "middle" }),
      },
      y: { kind: "align", alignment: "middle" },
    }),
    coord: Coord.clock(),
  },
  {},
  deepTree // a balanced binary tree, 4 levels
);
```

<!-- id: gt2-deep-new -->

```ts
// After. A cartesian picture with the reference's 19 children.
const leafCounts = [0, 2, 2, 0, 0, 2, 2, 0, 0, 0, 3, 4, 0, 4, 0, 4, 0, 0, 4];
const linkWidths = [9, 6]; // LinkWidth=depth
mount(
  {
    node: (d) =>
      circle({
        r: 8,
        fill: byDepth(deepBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      }),
    link: (source) => ({
      curve: Curve.bezier(),
      stroke: "#606060",
      strokeWidth: linkWidths[source.depth],
    }),
    parentChild: combine({
      x: { kind: "nest", pad: 0 },
      y: { kind: "distribute", spacing: 180 },
    }),
    sibling: combine({
      x: { kind: "distribute", spacing: 4 },
      y: { kind: "align", alignment: "start" },
    }),
  },
  {},
  deepTree
);
```

<!-- layout protocol prototype: begin -->

<!-- id: lp-call -->

```ts
// A summary with plain type names. The exact declarations from the
// prototype are under "The definition call" further down.
// defineLayout takes one definition and returns an operator.
declare function defineLayout<O>(
  definition: RelateDefinition<O> | ArrangeDefinition<O>
): (opts: O & BoxOptions, children: Node[]) => Node;

type RelateDefinition<O> = {
  name: string;
  options: (keyof O)[];
  check?: (opts: O, children: Node[]) => void;
  // Returns constraints among the children.
  relate: (
    children: ChildHandle[],
    opts: O,
    tools: {
      // A child's size, as lengths that may depend on the scale.
      measure(child: ChildHandle): { w: Length; h: Length };
      // "x", "y", or a name the coordinate space declares, as 0 or 1.
      axis(name: string, what: string): 0 | 1;
    }
  ) => { relations: Constraint[]; orientation?: 0 | 1 };
};

type ArrangeDefinition<O> = {
  name: string;
  options: (keyof O)[];
  check?: (opts: O, children: Node[]) => void;
  // Pixels asked for on x and y. Undefined on an axis: fill the bounds.
  request?: (
    children: Child[],
    opts: O
  ) => [number | undefined, number | undefined];
  // Each child's bounds, once the operator's own bounds are known.
  arrange: (
    bounds: { w: number; h: number; shape?: Polygon },
    children: Child[],
    opts: O
  ) => { bounds: (Box | Polygon)[] };
};

type Box = { x: number; y: number; w: number; h: number };
type Polygon = { points: [number, number][] };
```

<!-- id: lp-cell-sketch -->

```js
// A sketch that did not run: Constraint.cell does not exist, and its name
// is not chosen. The constraint takes a function of the bounds, so its kind
// is known before the bounds are, and its numbers come once they are.
const squarified = defineLayout({
  name: "squarified",
  options: ["weights"],
  relate: (children, { weights }) => ({
    relations: [
      Constraint.cell(
        (bounds) =>
          squarify(weights, [bounds.w, bounds.h]).map(([x0, y0, x1, y1]) => ({
            x: [x0, x1],
            y: [y0, y1],
          })),
        children
      ),
    ],
  }),
});
```

<!-- id: lp-choose-row -->

```js
// A sketch that did not run: `choose` is not built.
choose([
  spread({ dir: "x", spacing: 0 }, children),
  spread({ dir: "y", spacing: 0 }, children),
]);
```

<!-- id: lp-dropped -->

```ts
// A `relate` body that leaves the first child (red) out of its relations.
// It is not checked: the red bar lands at the layer's origin, under the
// first bar the relations place.
const dropsOne = defineLayout<{}>({
  name: "dropsOne",
  options: [],
  relate: (children) => ({
    relations: [
      Constraint.align({ y: "start" }, children.slice(1)),
      Constraint.distribute({ dir: "x", spacing: 8 }, children.slice(1)),
    ],
    orientation: 0,
  }),
});
export const UncheckedDroppedChild: StoryObj = {
  render: failing(() =>
    dropsOne({}, [
      rect({ w: 24, h: v(heights[0]), fill: "#d1495b" }),
      ...bars().slice(1),
    ])
  ),
};
```

<!-- id: lp-err-bounds -->

```ts
// An `arrange` body that leaves out the first child's bounds.
const squarifiedMissingOne = defineLayout<{ weights: number[] }>({
  name: "squarified",
  options: ["weights"],
  arrange: ({ w, h }, _children, { weights }) => ({
    bounds: squarify(weights, [w, h]).map(box).slice(1),
  }),
});
export const ErrorBoundsCount: StoryObj = {
  render: failing(() =>
    squarifiedMissingOne(
      { weights: countries.map((d) => d.pop) },
      countries.map(cell)
    )
  ),
};
```

<!-- id: lp-err-pixels -->

```ts
// A `relate` body that asks for the pixels of a length the scale changes.
const pitchedInPixels = defineLayout<{ gap?: number }>({
  name: "pitched",
  options: ["gap"],
  relate: (children, { gap = 8 }, { measure }) => {
    const widest = Math.max(...children.map((c) => measure(c).w.pixels));
    return {
      relations: [
        Constraint.align({ y: "start" }, children),
        Constraint.distribute(
          { dir: "x", spacing: Spacing.pitch(widest + gap, { at: "start" }) },
          children
        ),
      ],
      orientation: 0,
    };
  },
});
export const ErrorPixelsOfScaledLength: StoryObj = {
  render: failing(() =>
    pitchedInPixels(
      { gap: 6 },
      widths.map((w) => rect({ w: v(w), h: 100, fill: "#f2cf57" }))
    )
  ),
};
```

<!-- id: lp-in-spread-use -->

```ts
const panelWithArrow = (treemap: (rows: Country[]) => any) => () => {
  const container = initializeContainer();
  const cells = countries.map((d) =>
    d.country === "China" ? cell(d).name("china") : cell(d)
  );
  const tm =
    treemap === userTreemap
      ? squarified({ weights: countries.map((d) => d.pop) }, cells)
      : tile(
          {
            size: countries.map((d) => v(d.pop)),
            tiling: Tiling.squarify,
            round: false,
          },
          cells
        );
  countRuns(
    container,
    layer({ w: 400, h: 320 }, [
      spread({ dir: "y", spacing: 24, alignment: "start" }, [
        text({ text: "China", fontSize: 13 }).name("title"),
        tm,
      ]),
    ])
      .relate(() => [arrow({}, [ref("title"), ref("china")])])
      .render(container, { axes: false })
  );
  return container;
};

export const UserInSpread: StoryObj = { render: panelWithArrow(userTreemap) };
export const BuiltinInSpread: StoryObj = {
  render: panelWithArrow(builtinTreemap),
};
```

<!-- id: lp-length-fns -->

```ts
/** A measured length: `read` gives its value in σ once the claims exist. */
export const measured = (read: () => Pwl.Value): LengthValue =>
  new LengthValue(undefined, undefined, undefined, read);

/** The value in σ of a measured length or of pixels. A percent or an `fr`
 *  is a share of the bounds or the scope it is laid out in, so it does not
 *  compose with one. */
const readOf = (v: LengthValue | number): Pwl.Value => {
  if (typeof v === "number") return Pwl.constant(v);
  if (v.read === undefined)
    throw new Error(
      `${printLength(v)} does not compose with a measured length: a percent ` +
        `or an fr is a share of the bounds or the scope it is laid out in.`
    );
  return v.read();
};

/** The larger of lengths, at every scale. */
export const maxLength = (...ls: (LengthValue | number)[]): LengthValue =>
  measured(() => Pwl.envelope(ls.map(readOf)));
```

<!-- id: lp-length-ops -->

```ts
export class LengthValue {
  // ... its percent, pixel and fr fields, and its wire form

  /** This length plus another, or plus pixels. Only a measured length
   *  composes this way; a percent takes `offset`. */
  add(other: LengthValue | number): LengthValue {
    return measured(() => Pwl.add(readOf(this), readOf(other)));
  }
  /** This length less another, or less pixels. */
  sub(other: LengthValue | number): LengthValue {
    return measured(() => Pwl.add(readOf(this), Pwl.negate(readOf(other))));
  }
  /** This length times `k`. */
  times(k: number): LengthValue {
    return measured(() => Pwl.scale(k, readOf(this)));
  }
  /** Its pixels: only for a length with no scale in it, read once the
   *  claims exist. A comparison needs pixels, so a decision made on a
   *  length that the scale changes is an error. */
  get pixels(): number {
    const v = readOf(this);
    if (!Pwl.isConstant(v))
      throw new Error(
        "a measured length changes with the scale, so it has no pixels " +
          "before the scale is solved. Compose it with add, sub, times " +
          "and maxLength, and give it to a relation."
      );
    return Pwl.at(v, 0);
  }
}
```

<!-- id: lp-msg-bounds -->

```text
squarified: its arrangement gives bounds for 19 children, but it has 20. Give each child its bounds.
```

<!-- id: lp-msg-pixels -->

```text
a measured length changes with the scale, so it has no pixels before the scale is solved. Compose it with add, sub, times and maxLength, and give it to a relation.
```

<!-- id: lp-pitched-bars-exp -->

```js
// bars: eight rects 100 px tall whose widths are data, 3, 1, 4, 1, 5, 9, 2
// and 6. σ is the scale, in pixels per data unit.
Constraint.align({ y: "start" }, bars);
Constraint.distribute(
  { dir: "x", spacing: Spacing.pitch(pitch, { at: "start" }) },
  bars
);
// pitch = max(3σ, 1σ, 4σ, 1σ, 5σ, 9σ, 2σ, 6σ) + 6 = 9σ + 6
// width of the row = 7 pitches + the last bar = 7(9σ + 6) + 6σ = 69σ + 42
// The layer is 400 px wide: 69σ + 42 = 400, so σ = 358 / 69 = 5.1884.
```

<!-- id: lp-pitched-bars-use -->

```ts
const widths = [3, 1, 4, 1, 5, 9, 2, 6];

const container = initializeContainer();
countRuns(
  container,
  layer({ w: 400, h: 120 }, [
    pitched(
      { gap: 6 },
      widths.map((w) => rect({ w: v(w), h: 100, fill: "#f2cf57" }))
    ),
  ]).render(container, { axes: false })
);
```

<!-- id: lp-pitched-def -->

```ts
// Every child starts the same distance after the one before it: the widest
// child's width plus `gap`. The distance is a length read off the children,
// so the row's size request is derived by the solver, in the scale.
const pitched = defineLayout<{ gap?: number }>({
  name: "pitched",
  options: ["gap"],
  relate: (children, { gap = 8 }, { measure }) => {
    const pitch = maxLength(...children.map((c) => measure(c).w)).add(gap);
    return {
      relations: [
        Constraint.align({ y: "start" }, children),
        Constraint.distribute(
          { dir: "x", spacing: Spacing.pitch(pitch, { at: "start" }) },
          children
        ),
      ],
      orientation: 0,
    };
  },
});
```

<!-- id: lp-pitched-labels-exp -->

```js
// texts: the eight texts "a", "row", "of", "labels", "pitched", "by", "the"
// and "widest". A text's width does not change with the scale.
Constraint.align({ y: "start" }, texts);
Constraint.distribute(
  { dir: "x", spacing: Spacing.pitch(pitch, { at: "start" }) },
  texts
);
// pitch = the widest word's width + 8 = 48.6035 + 8 = 56.6035 px
// The second row's children are 6 px squares: pitch = 6 + 8 = 14 px.
```

<!-- id: lp-pitched-labels-use -->

```ts
const words = ["a", "row", "of", "labels", "pitched", "by", "the", "widest"];

const container = initializeContainer();
layer([
  spread({ dir: "y", spacing: 6, alignment: "start" }, [
    pitched(
      { gap: 8 },
      words.map((t) => text({ text: t, fontSize: 14 }))
    ),
    pitched(
      { gap: 8 },
      words.map(() => rect({ w: 6, h: 6, fill: "#4190c5" }))
    ),
  ]),
]).render(container, { axes: false });
```

<!-- id: lp-polar-use -->

```ts
const polar = (treemap: (rows: Country[]) => any) => () => {
  const container = initializeContainer();
  layer({ coord: Coord.polar(), w: 300, h: 300 }, [treemap(countries)]).render(
    container,
    { axes: false }
  );
  return container;
};
export const UserPolar: StoryObj = { render: polar(userTreemap) };
export const BuiltinPolar: StoryObj = { render: polar(builtinTreemap) };
```

<!-- id: lp-protocol-types -->

```ts
/** Options every layout operator takes, whatever its definition: its key,
 *  its own box (`w`, `h`, `x`, `y`, `dims`, ...), and its axes. */
export type BoxOptions = {
  key?: string;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
  [box: string]: unknown;
};

/** How a definition names an axis: `x`/`y`, or a name the enclosing
 *  coordinate space declares (`theta`, `r`), resolved once that space is
 *  known. `what` says where the name came from, for the error when no
 *  space declares it. */
export type Axes = {
  axis(name: AxisName | Direction, what: string): 0 | 1;
  /** A child's size request on each axis, as a length (stage 2): a value
   *  in the scale of the scope the child is in, read when the claim walk
   *  asks for it. Lengths compose with `add`, `sub`, `times` and
   *  `maxLength`, and a relation takes them as its gaps; their `pixels`
   *  exist only for a length the scale does not change. */
  measure(child: ConstraintRef): { w: LengthValue; h: LengthValue };
};

/** What a `relate` definition returns. */
export type Relations = {
  /** Relations among the children, for the layer's solve. */
  relations: ConstraintSpec[];
  /** The axis the children are laid out along, if there is one (SwiftUI's
   *  `layoutProperties.stackOrientation`): what an axis override under a
   *  coordinate space, and the check of flexible parts, read. */
  orientation?: 0 | 1;
};

/** A child as an `arrange` definition sees it. */
export type Child = {
  readonly index: number;
  /** What the child asks for on `axis` before the scale is known, in
   *  pixels: a text's width, a rect's literal size. Undefined when it asks
   *  for nothing there and fills the bounds it is given (a rect with no
   *  size, or content its own scale fits to its bounds). */
  request(axis: 0 | 1): number | undefined;
  /** Whether it fills the bounds it is given on `axis`. */
  fillsBounds(axis: 0 | 1): boolean;
  /** The field the flow split it by, for messages. */
  readonly by?: string;
};

/** A rectangle in pixels, in the operator's frame: its corner at `x`, `y`
 *  and its size `w` by `h`. */
export type Box = { x: number; y: number; w: number; h: number };

/** A convex polygon in pixels, in the operator's frame: its corners in
 *  order, with no repeated closing point, as the `polygon` mark takes its
 *  `points`. */
export type Polygon = { points: readonly (readonly [number, number])[] };

/** The bounds an `arrange` definition is given, in pixels, in its own
 *  frame: the box `[0, w] × [0, h]`, and the shape it was offered inside
 *  that box when that is not the whole box (a Voronoi cell). */
export type Bounds = { w: number; h: number; shape?: Polygon };

/** What an `arrange` definition returns: each child's bounds, by child
 *  index, a box or a convex polygon in the operator's frame. A child is
 *  laid out in the box that holds its bounds, with a polygon as its shape,
 *  centered on that box on an axis where it fills its bounds, else on the
 *  polygon's centroid. Bounds with no area hold a child of no size at
 *  their center (the operator's center, for a polygon with no points). */
export type Arrangement = { bounds: (Box | Polygon)[] };

type Common<O> = {
  /** The operator's name, for messages. */
  name: string;
  /** The keys of the options that are the definition's own. Every other
   *  option is a {@link BoxOptions} key. */
  options: readonly (keyof O & string)[];
  /** Checks on the options and children, run once when the operator is
   *  called. */
  check?: (opts: O, children: readonly GoFishAST[]) => void;
};

export type RelateDefinition<O> = Common<O> & {
  /** The relations among `children` (handles for `Constraint` calls), once
   *  the axis names have their meaning. Runs once per node. */
  relate: (children: ConstraintRef[], opts: O, axes: Axes) => Relations;
};

export type ArrangeDefinition<O> = Common<O> & {
  /** Its size request on each axis before the scale is known, in pixels,
   *  from its children's ({@link Child.request}). Undefined on an axis: it
   *  asks for nothing and fills the bounds it is given. Omitted: it fills
   *  on both. Runs once per claim walk. */
  request?: (
    children: Child[],
    opts: O
  ) => [number | undefined, number | undefined];
  /** Each child's bounds once its own bounds are known. Runs once per
   *  layout. Must not create marks: it returns bounds, not nodes. */
  arrange: (bounds: Bounds, children: Child[], opts: O) => Arrangement;
};

export type LayoutDefinition<O> = RelateDefinition<O> | ArrangeDefinition<O>;

/** The operator a definition defines: a combinator over a child list, as
 *  `spread(opts, children)` and `tile(opts, children)` are. */
export type LayoutOperator<O> = (
  opts: O & BoxOptions,
  children?: unknown
) => PromiseWithRender<GoFishNode>;

/** Define a layout operator (see the module comment). */
export function defineLayout<O>(def: LayoutDefinition<O>): LayoutOperator<O> {
  return createNodeOperator((opts: O & BoxOptions, children: GoFishAST[]) => {
    const { own, box } = split(def, opts);
    def.check?.(own, children);
    return "relate" in def
      ? relateNode(def, own, box, children)
      : arrangeNode(def, own, box, children);
  }) as unknown as LayoutOperator<O>;
}
```

<!-- id: lp-row-def -->

```ts
const row = defineLayout<{ dir?: string; spacing?: number }>({
  name: "row",
  options: ["dir", "spacing"],
  relate: (children, { dir = "x", spacing = 8 }, axes) => {
    const along = axes.axis(dir, "row({ dir })");
    const [alongName, acrossName] = along === 0 ? ["x", "y"] : ["y", "x"];
    return {
      relations: [
        Constraint.align({ [acrossName]: "start" }, children),
        Constraint.distribute({ dir: alongName, spacing }, children),
      ],
      orientation: along,
    };
  },
});
```

<!-- id: lp-row-exp -->

```js
// UserRow: dir "x" is axis 0, so the row aligns on y and distributes on x.
Constraint.align({ y: "start" }, bars);
Constraint.distribute({ dir: "x", spacing: 8 }, bars);

// UserRowPolar: under Coord.polar(), dir "theta" is axis 0 too, so the
// constraints name the same axes, and axis 0 is the angle.
Constraint.align({ y: "start" }, wedges);
Constraint.distribute({ dir: "x", spacing: 0 }, wedges);
```

<!-- id: lp-row-use -->

```ts
const heights = [3, 1, 4, 1, 5, 9, 2, 6];
const bars = () =>
  heights.map((h) => rect({ w: 24, h: v(h), fill: "#4190c5" }));
const inBox = (node: () => any, coord?: any) => () => {
  const container = initializeContainer();
  layer(coord ? { coord, w: 240, h: 240 } : { w: 300, h: 160 }, [
    node(),
  ]).render(container, { axes: false });
  return container;
};

export const UserRow: StoryObj = {
  render: inBox(() => row({ spacing: 8 }, bars())),
};
export const BuiltinRow: StoryObj = {
  render: inBox(() =>
    spread({ dir: "x", spacing: 8, alignment: "start" }, bars())
  ),
};
// Under polar, along `theta`: equal data widths, so each bar is a wedge.
const wedges = () =>
  heights.map((h) =>
    rect({ w: v(1), h: v(h), fill: "#4190c5", stroke: "white" })
  );
export const UserRowPolar: StoryObj = {
  render: inBox(
    () => row({ dir: "theta", spacing: 0 }, wedges()),
    Coord.polar()
  ),
};
export const BuiltinRowPolar: StoryObj = {
  render: inBox(
    () => spread({ dir: "theta", spacing: 0, alignment: "start" }, wedges()),
    Coord.polar()
  ),
};
```

<!-- id: lp-spread-before -->

```ts
// Its constraints refer to the children by slot (`SlotOperand`), so no
// name is looked up and none is given.

// Elaborate to a layer carrying the cross-axis align + the stack distribute.
// `fancyDims` (explicit w/h) flow to the layer, which is then a sized
// node: it maps its keyed domain into that size.
const node = (await layer(
  {
    key,
    ...fancyDims,
  } as any,
  childList
)) as GoFishNode;
// `dir` names an axis in the scope of the spread's children: `x`/`y`, or a
// name the enclosing coordinate space declares (`theta`, `lon`, ...). The
// spread is built before that space exists, so the constraints, which need
// the axis, are installed by the resolveAliases pass, after the layer's
// own `dims` hook (if the spread was given `dims`).
const layerDims = node._elaborateInAxisScope;
node._elaborateInAxisScope = async (outer, inner) => {
  await layerDims?.(outer, inner);
  const stackDir = resolveAxisName(inner, dirName, `spread({ dir })`);
  const alignAxis = axisName((1 - stackDir) as Direction);
  const stackAxis = axisName(stackDir);
  const refs = childSlots(node);
  // In the combinator form the part of an `at` is a child index.
  if (baseline?.kind === "at" && refs[baseline.part] === undefined)
    throw new Error(
      `${glue ? "stack" : "spread"}: its baseline is ` +
        `\`Baseline.at(${baseline.part}, ...)\`, a child index, but it ` +
        `has ${refs.length} ${refs.length === 1 ? "child" : "children"}.`
    );
  // The cross-axis align: it shares the frame (unions the children's
  // domain) and, for free children (bars), commits a baseline. A
  // self-positioned child (a scatter facet) is left alone by `align`
  // automatically — the placement solver reads the child's abstract
  // placement, so no guard flag.
  await node.INTERNAL_relate([
    Constraint.align({ [alignAxis]: alignment }, refs),
    Constraint.distribute(
      {
        dir: stackAxis,
        spacing,
        glue,
        order: reverse ? "reverse" : "forward",
        baseline:
          baseline?.kind === "at"
            ? { ...baseline, part: refs[baseline.part] }
            : baseline,
        hasMidpoint,
        // The grouping field for this (stack) axis → the ORDINAL
        // space's measure, so a spread-by-category axis titles itself
        // off its space.
        measure: axisMeasures?.[dirName],
        hasOrder,
      },
      refs
    ),
  ]);
  // Tag with stack direction so coord can map axis overrides to polar dims.
  node.axisDir = stackDir;
};

if (axes !== undefined) node._axisOverride = axisOverrideOf(axes);
return node;
```

<!-- id: lp-spread-full -->

```ts
/**
 * `Spread` arranges its children along `dir` with spacing and aligns them on the
 * cross axis. It **elaborates to `layer + distribute + align`**: #547 proved the
 * space fold, budget, and auto-fit are identical to the bespoke spread, and #549
 * made the scale handling match (fresh child array, no parent mutation). `stack` is
 * `spread({ glue: true })`; `spreadX`/`spreadY` fix `dir`. The IR keeps `spread`/
 * `stack` (the fluent operator wrapper's `serialize` tag), so this elaboration is below the IR.
 *
 * `size` (per-entry stack-axis extent, #700 Phase 2) wraps each child in its
 * own sized layer BEFORE the align/distribute elaboration below: `layer({ [w|h]:
 * size[i] }, [child])` on the stack axis. A prop-less child (e.g. a rect with
 * only `fill`) fills its wrapper's proposed size, so the usual mark stays
 * unchanged; only the wrapping is added. `size: field(<name>).normalize()`
 * computes each entry's share of the window (see fieldExpr.ts's
 * `applyWindowMaps`) as a data-driven size claim on the wrapper, whose
 * content layer.tsx nests in the wrapper's box as a sized node: the general
 * rule that a data-valued size nests its content.
 */
export const Spread = createNodeOperator(
  async (
    {
      key,
      dir,
      spacing,
      alignment = "baseline",
      reverse = false,
      glue = false,
      baseline,
      hasMidpoint,
      hasOrder,
      size,
      axes,
      axisMeasures,
      ...fancyDims
    }: {
      key?: string;
      /** The axis to spread along: `x`/`y`, a name the enclosing coordinate
       *  space declares (`theta`, `lon`, ...), or an axis index. */
      dir: AxisName | Direction;
      /** How far apart neighbors are: a {@link Spacing} strategy, or a bare
       *  amount, which is `Spacing.box(amount)`. */
      spacing?: Gap | Spacing;
      alignment?: Alignment;
      reverse?: boolean;
      // When true, treat as a stack: glue children together, summing their
      // sizes into a POSITION at this level. `spacing` is ignored.
      glue?: boolean;
      /** Where the spread or stack puts its own 0 (`Baseline`), the part of
       *  an `at` a child index. Omitted: a stack's is `Baseline.start()`,
       *  and a spread's 0 is its start. In a flow the split sets it from
       *  the `baseline` option, whose `at` part is a value of the `by`
       *  column, or from a `HasMidpoint` column (`stackBaseline` in
       *  schema.ts). A spread takes every baseline but `wiggle`, and only
       *  for placement: its type stays a sequence of separate spaces. */
      baseline?: StackBaseline<number>;
      /** The `by` column's order has a midpoint (`HasMidpoint`), which set
       *  `baseline`: the split sets it, and the stack checks that each part
       *  is a nonnegative amount. Ignored without `glue`. */
      hasMidpoint?: boolean;
      /** The `by` column's values have an order (`HasOrder`, from the chart's
       *  `schema`): the split sets it, and the ORDINAL space this spread
       *  folds carries it, so its axis knows its keys are ordered. */
      hasOrder?: boolean;
      /** Per-entry stack-axis extent — one value per child, in child order.
       *  Wraps each child in a sized layer on the stack axis before the
       *  align/distribute elaboration. See the doc comment above. */
      size?: MaybeValue<number>[];
      /** Override axis rendering for this node. true/false applies to both
       * dims; object form controls x/y independently. */
      axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
      /** Resolved grouping field per axis name, injected by createOperator (the
       *  `by` field keyed by `dir`, e.g. `{ x: "lake" }`). Stamped onto the
       *  ORDINAL space the stack distribute builds so a category axis names
       *  itself off its own space. */
      axisMeasures?: Record<string, string | undefined>;
    } & FancyDims<MaybeValue<number>>,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    if ((fancyDims as any).normalize !== undefined) {
      throw new Error(
        "spread/stack: `normalize: true` was removed — use " +
          "`size: field(<field-name>).normalize()` instead (#700 Phase 2)."
      );
    }

    children = unwrapLodashArray(children);
    // An axis index is the same axis as its scope-free name (0 is `x`), so
    // every use below can key by name.
    const dirName: AxisName = typeof dir === "number" ? axisName(dir) : dir;

    let childList = children as GoFishAST[];

    if (size !== undefined) {
      if (size.length !== childList.length) {
        throw new Error(
          `spread/stack: \`size\` has ${size.length} entries but there are ` +
            `${childList.length} children — one size value is required per child.`
        );
      }
      // The wrapper's size is on the `dir` axis, named the same way `dir`
      // names it, so it resolves in the same scope pass as `dir` itself.
      childList = await Promise.all(
        childList.map(async (child, i) => {
          const wrapped = (await layer(
            { dims: { [dirName]: { size: size[i] } } } as any,
            [child]
          )) as GoFishNode;
          // Copy split identity onto the wrapper so downstream ordinal-axis
          // labeling / resolve()-by-key see the same key/datum the unwrapped
          // child would have — the wrapper is purely a sizing shim.
          if (child instanceof GoFishNode) {
            wrapped.setKey(child.key ?? "");
            wrapped._syntheticKey = child._syntheticKey;
            wrapped.keyCell = child.keyCell;
            wrapped.keyBy = child.keyBy;
            (wrapped as any).__splitBy = (child as any).__splitBy;
            wrapped.datum = child.datum;
          }
          return wrapped;
        })
      );
    }

    return SpreadLayout(
      {
        key,
        dir: dirName,
        spacing,
        alignment,
        reverse,
        glue,
        baseline,
        hasMidpoint,
        hasOrder,
        axisMeasures,
        axes,
        ...fancyDims,
      } as any,
      childList
    );
  }
);

type SpreadRelateProps = {
  dir: AxisName;
  spacing?: Gap | Spacing;
  alignment: Alignment;
  reverse: boolean;
  glue: boolean;
  baseline?: StackBaseline<number>;
  hasMidpoint?: boolean;
  hasOrder?: boolean;
  axisMeasures?: Record<string, string | undefined>;
};

/**
 * The layout of `spread` and `stack` (`defineLayout` with `relate`): an
 * align across `dir` and a distribute along it, among the children, in the
 * one solve of the layer the spread is. Its arrangement does not depend on
 * its bounds, so the solver derives its size request.
 */
const SpreadLayout = defineLayout<SpreadRelateProps>({
  name: "spread",
  options: [
    "dir",
    "spacing",
    "alignment",
    "reverse",
    "glue",
    "baseline",
    "hasMidpoint",
    "hasOrder",
    "axisMeasures",
  ],
  relate: (
    refs,
    {
      dir,
      spacing,
      alignment,
      reverse,
      glue,
      baseline,
      hasMidpoint,
      hasOrder,
      axisMeasures,
    },
    axes
  ) => {
    const stackDir = axes.axis(dir, `spread({ dir })`);
    const alignAxis = axisName((1 - stackDir) as Direction);
    const stackAxis = axisName(stackDir);
    // In the combinator form the part of an `at` is a child index.
    if (baseline?.kind === "at" && refs[baseline.part] === undefined)
      throw new Error(
        `${glue ? "stack" : "spread"}: its baseline is ` +
          `\`Baseline.at(${baseline.part}, ...)\`, a child index, but it ` +
          `has ${refs.length} ${refs.length === 1 ? "child" : "children"}.`
      );
    return {
      relations: [
        // The cross-axis align: it shares the frame (unions the children's
        // domain) and, for free children (bars), commits a baseline. A
        // self-positioned child (a scatter facet) is left alone by `align`
        // automatically: the placement solver reads the child's abstract
        // placement, so no guard flag.
        Constraint.align({ [alignAxis]: alignment }, refs),
        Constraint.distribute(
          {
            dir: stackAxis,
            spacing,
            glue,
            order: reverse ? "reverse" : "forward",
            baseline:
              baseline?.kind === "at"
                ? { ...baseline, part: refs[baseline.part] }
                : baseline,
            hasMidpoint,
            // The grouping field for this (stack) axis: the ORDINAL space's
            // measure, so a spread-by-category axis titles itself off its
            // space.
            measure: axisMeasures?.[dir],
            hasOrder,
          },
          refs
        ),
      ],
      orientation: stackDir,
    };
  },
});
```

<!-- id: lp-spread-key -->

```ts
return {
  relations: [
    Constraint.align({ [alignAxis]: alignment }, refs),
    Constraint.distribute(
      {
        dir: stackAxis,
        spacing,
        glue,
        order: reverse ? "reverse" : "forward",
        baseline:
          baseline?.kind === "at"
            ? { ...baseline, part: refs[baseline.part] }
            : baseline,
        hasMidpoint,
        measure: axisMeasures?.[dir],
        hasOrder,
      },
      refs
    ),
  ],
  orientation: stackDir,
};
```

<!-- id: lp-squarify-choose -->

```js
// A sketch that did not run: `choose.seams`, `Cost.worstAspect` and
// `dir: "short"` do not exist. Each row is a stack of fr shares along the
// short side, and the rows are a stack along the long side.
const squarifiedByChoice = (items) =>
  choose.seams(items, {
    row: (run) =>
      stack(
        { dir: "short", spacing: 0 },
        run.map((d) => cell(d).w(fr(d.w)))
      ),
    rest: (row, rest) => stack({ dir: "long", spacing: 0 }, [row, rest]),
    cost: Cost.worstAspect(), // the d3 rule, read at the solved bounds
    ranking: "first fit per seam", // greedy: add while the cost does not get worse
  });
```

<!-- id: lp-squarify-def -->

```ts
const box = ([x0, y0, x1, y1]: Rect) => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});

// The whole layout definition: no size request (it fills its bounds), and
// once its bounds are known, each child's bounds.
const squarified = defineLayout<{ weights: number[] }>({
  name: "squarified",
  options: ["weights"],
  arrange: ({ w, h }, _children, { weights }) => ({
    bounds: squarify(weights, [w, h]).map(box),
  }),
});
```

<!-- id: lp-squarify-exp -->

```js
// The body runs once, with bounds { w: 360, h: 300 }, and returns one box
// per child, in child order (the 20 largest countries, largest first).
[
  { x: 0, y: 0, w: 182.9656, h: 150.9514 }, // India
  { x: 0, y: 150.9514, w: 182.9656, h: 149.0486 }, // China
  { x: 182.9656, y: 0, w: 69.6086, h: 93.0808 }, // United States
  { x: 252.5742, y: 0, w: 57.557, h: 93.0808 }, // Indonesia
  // ... 16 more
];
```

<!-- id: lp-squarify-helper -->

```ts
type Rect = [number, number, number, number]; // x0, y0, x1, y1
const PHI = (1 + Math.sqrt(5)) / 2;

// The squarify rule (Bruls et al. 2000) as d3's `squarifyRatio` runs it:
// add items to a row while its worst aspect ratio does not get worse, lay
// the row along the box's shorter side, and go on in what is left.
function squarify(weights: number[], [w, h]: [number, number]): Rect[] {
  const out: Rect[] = [];
  let [x0, y0, x1, y1] = [0, 0, w, h];
  let value = sum(weights);
  let i0 = 0;
  while (i0 < weights.length) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let i1 = i0;
    let rowSum = weights[i1++];
    let lo = rowSum;
    let hi = rowSum;
    const alpha = Math.max(dy / dx, dx / dy) / (value * PHI);
    let beta = rowSum * rowSum * alpha;
    let best = Math.max(hi / beta, beta / lo);
    for (; i1 < weights.length; i1++) {
      const wv = weights[i1];
      const s = rowSum + wv;
      beta = s * s * alpha;
      const ratio = Math.max(Math.max(hi, wv) / beta, beta / Math.min(lo, wv));
      if (ratio > best) break;
      rowSum = s;
      lo = Math.min(lo, wv);
      hi = Math.max(hi, wv);
      best = ratio;
    }
    if (dx < dy) {
      // A row along x at the top.
      const ry1 = value ? y0 + (dy * rowSum) / value : y1;
      let x = x0;
      for (let i = i0; i < i1; i++) {
        const nx = x + (weights[i] * dx) / rowSum;
        out[i] = [x, y0, nx, ry1];
        x = nx;
      }
      y0 = ry1;
    } else {
      // A column along y at the left.
      const rx1 = value ? x0 + (dx * rowSum) / value : x1;
      let y = y0;
      for (let i = i0; i < i1; i++) {
        const ny = y + (weights[i] * dy) / rowSum;
        out[i] = [x0, y, rx1, ny];
        y = ny;
      }
      x0 = rx1;
    }
    value -= rowSum;
    i0 = i1;
  }
  return out;
}
```

<!-- id: lp-squarify-use -->

```ts
const cell = (d: Country) =>
  rect({ fill: v(d.continent), stroke: "white", strokeWidth: 1 });

const userTreemap = (rows: Country[]) =>
  squarified({ weights: rows.map((d) => d.pop) }, rows.map(cell));

const builtinTreemap = (rows: Country[]) =>
  tile(
    { size: rows.map((d) => v(d.pop)), tiling: Tiling.squarify, round: false },
    rows.map(cell)
  );

// How many times the render ran the layout pipeline (a prototype counter
// in gofish.tsx), written under the picture.
const countRuns = (container: HTMLElement, rendered: Promise<unknown>) => {
  const g = globalThis as { __gofishLayoutRuns?: number };
  g.__gofishLayoutRuns = 0;
  rendered.then(() => {
    const p = document.createElement("pre");
    p.textContent = `pipeline runs: ${g.__gofishLayoutRuns}`;
    container.appendChild(p);
  });
};

const alone = (node: () => any) => () => {
  const container = initializeContainer();
  countRuns(
    container,
    layer({ w: 360, h: 300 }, [node()]).render(container, { axes: false })
  );
  return container;
};

export const UserSquarify: StoryObj = {
  render: alone(() => userTreemap(countries)),
};
export const BuiltinSquarify: StoryObj = {
  render: alone(() => builtinTreemap(countries)),
};
```

<!-- id: lp-stack -->

```ts
/** A stack adds its children's data amounts: each part starts where the one
 * before it ends, in one data space, so there is no spacing or anchor to
 * set. Every part needs a data size along `dir` (`distributeSpaceFold`);
 * parts that only touch are a `spread({ spacing: 0 })`. */
export type StackOptions<T = any> = Omit<
  SpreadOptions<T>,
  "spacing" | "glue" | "anchor"
>;

export function stack(
  opts: StackOptions,
  marks: MarkChild[]
): ReturnType<typeof spread>;
export function stack(opts: StackOptions): Operator<any[], any[]>;
export function stack(
  opts: StackOptions,
  marks?: MarkChild[]
): ReturnType<typeof spread> | Operator<any[], any[]> {
  // A stack has no spacing, so it takes no length there: checked against
  // its own descriptor, not the spread's it forwards to.
  checkLengths(
    Frontend.acceptedFields("operator", "stack"),
    "stack",
    opts as Record<string, unknown>
  );
  const stackOpts: SpreadOptions = { ...opts, glue: true };
  const result =
    marks !== undefined ? spread(stackOpts, marks) : spread(stackOpts);
  // Stack is `spread({glue: true})` under the hood, but the IR wire format
  // discriminates them by type. Re-tag the produced operator/mark so the
  // frontend-IR emitter sees `{ type: "stack", ...stripped-opts }` instead
  // of `{ type: "spread", glue: true, ... }`. Preserve `__combinator` and
  // `children` when present (combinator form) — dropping them would make
  // toJSON emit a leaf-shaped node missing its children.
  const tag = wireOf(result);
  if (tag) {
    const { glue: _glue, ...stackPayload } = tag.opts;
    withWire(result, { ...tag, type: "stack", opts: stackPayload });
  }
  return result;
}
```

<!-- id: lp-swift-row -->

```swift
struct RowOrColumn: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let rowWidth = sizes.map(\.width).reduce(0, +)
    if rowWidth <= (proposal.width ?? .infinity) {
      return CGSize(width: rowWidth, height: sizes.map(\.height).max() ?? 0)
    }
    return CGSize(width: sizes.map(\.width).max() ?? 0, height: sizes.map(\.height).reduce(0, +))
  }
  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let asRow = sizes.map(\.width).reduce(0, +) <= bounds.width
    var p = bounds.origin
    for (s, size) in zip(subviews, sizes) {
      s.place(at: p, proposal: .unspecified)
      if asRow { p.x += size.width } else { p.y += size.height }
    }
  }
}
```

<!-- id: lp-tile-full -->

```ts
/** A `tile` operator as an error message names it: by the field its children are
 *  split by, which each child records (`keyBy`). */
const where = (children: readonly Child[]): string => {
  const by = children[0]?.by;
  return by === undefined ? "tile" : `tile (by "${by}")`;
};

/**
 * `tile` is a layout that reads its bounds (`defineLayout` with `arrange`):
 * it asks for no size of its own, and once its bounds are known it cuts
 * them into one cell per child, each with its weight's share of the area,
 * and gives each child its cell as its bounds.
 */
const TileNode = defineLayout<TileProps>({
  name: "tile",
  options: ["spacing", "padding", "round", "tiling", "sort", "size"],
  check: ({ spacing = 0, padding = 0, size }) => {
    // Its spacing and padding are one number d3 applies on both axes, so a
    // percent has no one size to be a percent of.
    // TODO(#1176): a percent `tile` spacing needs the axis it is of (the
    // smaller side, or each axis on its own), a design question.
    rejectLength("tile's spacing", spacing);
    rejectLength("tile's padding", padding);
    // A tile's area is its entry's share of the total, so the operator adds
    // its entries: their unit must add up (`checkSummable`, #1197). It is
    // checked once here, so the layout below sums the weights as they are.
    checkSummable(
      size?.map(getQuantity).find((q) => q !== undefined),
      "tile({ size })"
    );
  },
  arrange: (
    { w, h, shape },
    children,
    {
      spacing = 0,
      padding = 0,
      round = true,
      tiling = squarify(),
      sort = "desc",
      size: sizeChannel,
    }
  ) => {
    Frontend.checkStrategy("Tiling", tiling, "tile({ tiling })");
    // The weights, one per child.
    const leafData: LeafDatum[] = children.map((_child, i) => ({
      i,
      weight: resolveWeight(sizeChannel, i),
    }));
    // Ensure total > 0 so the tiling doesn't produce NaNs.
    const total = leafData.reduce((acc, d) => acc + d.weight, 0);
    if (total <= 0) for (const d of leafData) d.weight = 1;
    // The order the tiling lays the children out in. The sort is stable,
    // so equal weights keep their child order.
    if (sort !== "none")
      leafData.sort((a, b) =>
        sort === "asc" ? a.weight - b.weight : b.weight - a.weight
      );
    // One cell per child, in the operator's frame, in weight order.
    const cells = cellsOf(tiling)(
      shape?.points,
      leafData.map((d) => d.weight),
      { spacing, padding, round, size: [w, h], where: where(children) }
    );
    return {
      bounds: byChild(
        leafData.map((d) => d.i),
        cells.map((points) => ({ points }))
      ),
    };
  },
});
```

<!-- id: lp-tile-key -->

```ts
arrange: (
  { w, h, shape },
  children,
  {
    spacing = 0,
    padding = 0,
    round = true,
    tiling = squarify(),
    sort = "desc",
    size: sizeChannel,
  }
) => {
  Frontend.checkStrategy("Tiling", tiling, "tile({ tiling })");
  const leafData: LeafDatum[] = children.map((_child, i) => ({
    i,
    weight: resolveWeight(sizeChannel, i),
  }));
  const total = leafData.reduce((acc, d) => acc + d.weight, 0);
  if (total <= 0) for (const d of leafData) d.weight = 1;
  if (sort !== "none")
    leafData.sort((a, b) =>
      sort === "asc" ? a.weight - b.weight : b.weight - a.weight
    );
  const cells = cellsOf(tiling)(
    shape?.points,
    leafData.map((d) => d.weight),
    { spacing, padding, round, size: [w, h], where: where(children) }
  );
  return {
    bounds: byChild(
      leafData.map((d) => d.i),
      cells.map((points) => ({ points }))
    ),
  };
},
```

<!-- layout protocol prototype: end -->
