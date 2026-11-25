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

<!-- id: gt-icicle-old -->

```ts
// GoTree / Gallery / icicleplot, before.
mount({
  sibling: combine({
    x: { kind: "distribute", spacing: 0 },
    y: { kind: "align", alignment: "middle" },
  }),
});
```

<!-- id: gt-icicle-new -->

```ts
// After. GoTree's "align" lines up the sibling nodes, which are the first
// ring of each sibling subtree, so the subtrees start on the same ring.
mount({
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
