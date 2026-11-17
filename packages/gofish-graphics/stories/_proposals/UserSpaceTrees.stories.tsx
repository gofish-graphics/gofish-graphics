import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  Spacing,
  circle,
  layer,
  line,
  ref,
  spread,
  rect,
  blank,
  createMark,
  text,
} from "../../src/lib";

// Throwaway prototypes for the user-space layouts proposal: can a tidy tree
// and a layered graph be written in user space out of today's operators?
// Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/User Space Trees",
};
export default meta;

// ─────────────────────────────────────────────────────────────────────────
// Part 1: tidy tree
// ─────────────────────────────────────────────────────────────────────────

type Tree = { name: string; children?: Tree[] };

const leaves = (...names: string[]): Tree[] => names.map((name) => ({ name }));

// A file tree with unbalanced subtrees: `src` is narrow near the top and wide
// at depth 4, while `docs` is wide at depth 2 only, so a contour layout can
// tuck `docs` under `src`'s overhang.
const files: Tree = {
  name: "project",
  children: [
    {
      name: "src",
      children: [
        {
          name: "ast",
          children: [
            {
              name: "shapes",
              children: leaves("rect", "circle", "text", "line"),
            },
            {
              name: "ops",
              children: leaves("stack", "spread", "layer", "wrap"),
            },
          ],
        },
      ],
    },
    { name: "docs", children: leaves("intro", "api", "guide", "faq") },
    {
      name: "tests",
      children: [
        {
          name: "unit",
          children: [{ name: "layout", children: leaves("a", "b", "c") }],
        },
        { name: "e2e", children: leaves("smoke") },
      ],
    },
    { name: "scripts", children: leaves("build", "release") },
    { name: "README" },
  ],
};

const R = 7; // node radius
const GAP = 10; // gap between sibling subtrees
const LEVEL = 40; // gap between a parent and its children

const nodeMark = (path: string) =>
  circle({ r: R, fill: "#457b9d", stroke: "white", strokeWidth: 1.5 }).name(
    path
  );

// Every parent→child pair of node names, for the links.
const edges = (t: Tree, path = "n"): [string, string][] =>
  (t.children ?? []).flatMap((c, i) => [
    [path, `${path}.${i}`] as [string, string],
    ...edges(c, `${path}.${i}`),
  ]);

const links = (t: Tree) =>
  edges(t).map(([p, c]) =>
    line({ stroke: "#9aa7b1", strokeWidth: 1.25 }, [ref(p), ref(c)]).zOrder(-1)
  );

// (a) Boxes: siblings are spread on x with a fixed gap between their
// bounding boxes; the parent sits above, centered over the children group.
const boxTree = (t: Tree, path = "n"): any => {
  const node = nodeMark(path);
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

export const TreeBoxes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([boxTree(files)])
      .relate(() => links(files))
      .render(container, {
        w: 520,
        h: 320,
      });
    return container;
  },
};

// (b) Contours. GoFish cannot separate siblings by their contours, so the
// story computes each child's x offset from its parent with Kennedy's
// "Drawing Trees" fold, then hands GoFish one pitch per adjacent pair.

/** Per depth, the [left, right] node centers of a subtree, root at 0. */
type Extent = [number, number][];

const SEP = 2 * R + GAP; // closest two node centers may be

const moveExtent = (e: Extent, dx: number): Extent =>
  e.map(([l, r]) => [l + dx, r + dx]);
const mergeExtents = (p: Extent, q: Extent): Extent =>
  Array.from({ length: Math.max(p.length, q.length) }, (_, d) =>
    !p[d] ? q[d] : !q[d] ? p[d] : [p[d][0], q[d][1]]
  );
/** How far right q's root must sit from p's root so no depth overlaps. */
const fit = (p: Extent, q: Extent): number =>
  Math.max(0, ...p.slice(0, q.length).map(([, r], d) => r - q[d][0] + SEP));
/** Pack extents left to right; the first root sits at 0. */
const fitLeft = (es: Extent[]): number[] => {
  let acc: Extent = [];
  return es.map((e) => {
    const x = fit(acc, e);
    acc = mergeExtents(acc, moveExtent(e, x));
    return x;
  });
};
/** The same packing from the right, mirrored; the last root sits at 0. */
const flip = (e: Extent): Extent => e.map(([l, r]) => [-r, -l]);
const fitRight = (es: Extent[]): number[] =>
  fitLeft(es.map(flip).reverse())
    .map((x) => -x)
    .reverse();

type Design = { offsets: number[]; extent: Extent; kids: Design[] };

/** Kennedy's design: each child's offset from its parent, symmetric. */
const design = (t: Tree): Design => {
  const kids = (t.children ?? []).map(design);
  const l = fitLeft(kids.map((k) => k.extent));
  const r = fitRight(kids.map((k) => k.extent));
  const offsets = l.map((x, i) => (x + r[i]) / 2);
  const extent = kids.reduce<Extent>(
    (acc, k, i) => mergeExtents(acc, moveExtent(k.extent, offsets[i])),
    []
  );
  return { offsets, extent: [[0, 0], ...extent], kids };
};

const leftOf = (e: Extent) => Math.min(...e.map(([l]) => l));

// A subtree's name: a leaf is just its node.
const sub = (t: Tree, path: string) =>
  t.children?.length ? `${path}/sub` : path;

const contourTree = (t: Tree, d: Design, path = "n"): any => {
  const node = nodeMark(path);
  if (!t.children?.length) return node;
  const kidPaths = t.children.map((_, i) => `${path}.${i}`);
  const kids = layer(
    t.children.map((c, i) => contourTree(c, d.kids[i], kidPaths[i]))
  )
    .relate((c) => {
      const subs = t.children!.map((k, i) => c[sub(k, kidPaths[i])]);
      // Each subtree's left edge, relative to its parent's center. (A
      // distribute between the child ROOTS, which are nested operands, is
      // silently ignored, so the pitch is stated between subtree boxes.)
      const lefts = d.kids.map((k, i) => d.offsets[i] + leftOf(k.extent));
      return [
        Constraint.align({ y: "start" }, subs),
        // one pitch per adjacent pair of subtrees
        ...subs.slice(1).map((s, i) =>
          Constraint.distribute(
            {
              dir: "x",
              spacing: Spacing.pitch(lefts[i + 1] - lefts[i], { at: "start" }),
            },
            [subs[i], s]
          )
        ),
      ];
    })
    .name(`${path}/kids`);
  return layer([node, kids])
    .relate((c) => [
      Constraint.distribute({ dir: "y", spacing: LEVEL }, [
        c[path],
        c[`${path}/kids`],
      ]),
      // the parent sits -offsets[0] right of its first child's root
      Constraint.distribute(
        { dir: "x", spacing: Spacing.pitch(-d.offsets[0], { at: "middle" }) },
        [c[kidPaths[0]], c[path]]
      ),
    ])
    .name(`${path}/sub`);
};

const pair = (p: string, fill: string) =>
  layer([circle({ r: 7, fill }).name(p), circle({ r: 7, fill }).name(`${p}c`)])
    .relate((c) => [
      Constraint.distribute({ dir: "y", spacing: 20 }, [c[p], c[`${p}c`]]),
    ])
    .name(`${p}/sub`);

// Repro for the wall above: each row asks for the red and blue pairs to sit
// 100 px apart (center to center) on x. Rows 1 and 2 name the TOP circles,
// which are nested operands inside each pair; both are silently ignored (no
// warning) and the pairs overlap. Row 3 names the pairs themselves and works.
// Row 4 names one nested circle and one direct child and works.
const pitch100 = {
  dir: "x",
  spacing: Spacing.pitch(100, { at: "middle" }),
} as const;

export const ReproNestedDistribute: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      layer([pair("a", "red"), pair("b", "blue")]).relate((c) => [
        Constraint.distribute(pitch100, [c.a, c.b]),
      ]),
      layer({ y: 100 }, [pair("p", "red"), pair("q", "blue")]).relate((c) => [
        Constraint.align({ y: "start" }, [c["p/sub"], c["q/sub"]]),
        Constraint.distribute(pitch100, [c.p, c.q]),
      ]),
      layer({ y: 200 }, [pair("s", "red"), pair("t", "blue")]).relate((c) => [
        Constraint.distribute(pitch100, [c["s/sub"], c["t/sub"]]),
      ]),
      layer({ y: 300 }, [pair("m", "red"), circle({ r: 7 }).name("k")]).relate(
        (c) => [Constraint.distribute(pitch100, [c.m, c.k])]
      ),
    ]).render(container, { w: 300, h: 360 });
    return container;
  },
};

export const TreeContours: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([contourTree(files, design(files))])
      .relate(() => links(files))
      .render(container, { w: 520, h: 320 });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Part 2: layered (Sugiyama-style) graph
// ─────────────────────────────────────────────────────────────────────────

// Course prerequisites, listed alphabetically as a catalog would list them.
const courses = [
  "Algorithms",
  "Calc I",
  "Calc II",
  "Compilers",
  "Crypto",
  "Data Str",
  "Discrete",
  "Distributed",
  "Graphics",
  "Intro CS",
  "Lin Alg",
  "ML",
  "OS",
  "Prob",
  "Systems",
  "Vision",
];

const prereqs = [
  ["Calc I", "Calc II"],
  ["Calc I", "Lin Alg"],
  ["Intro CS", "Data Str"],
  ["Intro CS", "Systems"],
  ["Data Str", "Algorithms"],
  ["Discrete", "Algorithms"],
  ["Data Str", "Systems"],
  ["Calc II", "Prob"],
  ["Discrete", "Prob"],
  ["Prob", "ML"],
  ["Lin Alg", "ML"],
  ["Algorithms", "ML"],
  ["Systems", "OS"],
  ["Algorithms", "Compilers"],
  ["Systems", "Compilers"],
  ["Lin Alg", "Graphics"],
  ["Data Str", "Graphics"],
  ["ML", "Vision"],
  ["Graphics", "Vision"],
  ["OS", "Distributed"],
  ["Algorithms", "Distributed"],
  ["Prob", "Crypto"],
  ["Algorithms", "Crypto"],
].map(([source, target]) => ({ source, target }));

type Link = { source: string; target: string };

/** Phase 1: each node's layer is its longest path from a source. */
const layers = (nodes: string[], links: Link[]): Map<string, number> => {
  const rank = new Map<string, number>();
  const visit = (id: string): number => {
    if (!rank.has(id)) {
      const preds = links.filter((l) => l.target === id);
      rank.set(id, Math.max(-1, ...preds.map((l) => visit(l.source))) + 1);
    }
    return rank.get(id)!;
  };
  nodes.forEach(visit);
  return rank;
};

/** Phase 1b: an edge that skips layers becomes a chain through one dummy
 *  node per skipped layer, so every link joins adjacent layers. Dummies
 *  join each layer after its real nodes. */
const splitLongEdges = (nodes: string[], links: Link[]) => {
  const rank = layers(nodes, links);
  const segments: Link[] = [];
  for (const { source, target } of links) {
    let prev = source;
    for (let k = rank.get(source)! + 1; k < rank.get(target)!; k++) {
      const dummy = `${source}>${target}@${k}`;
      rank.set(dummy, k);
      segments.push({ source: prev, target: dummy });
      prev = dummy;
    }
    segments.push({ source: prev, target });
  }
  const rows: string[][] = [];
  // input order first, then the dummies in edge order
  for (const id of new Set([...nodes, ...rank.keys()]))
    (rows[rank.get(id)!] ??= []).push(id);
  return { rows, links: segments };
};

/** Crossings: two links between the same pair of layers cross when their
 *  ends are in opposite orders. */
const crossings = (rows: string[][], links: Link[]): number => {
  const at = new Map(rows.flatMap((row) => row.map((id, i) => [id, i])));
  const layer = new Map(rows.flatMap((row, k) => row.map((id) => [id, k])));
  let n = 0;
  links.forEach((a, i) =>
    links.slice(i + 1).forEach((b) => {
      const sameGap = layer.get(a.source) === layer.get(b.source);
      const ds = at.get(a.source)! - at.get(b.source)!;
      const dt = at.get(a.target)! - at.get(b.target)!;
      if (sameGap && ds * dt < 0) n++;
    })
  );
  return n;
};

/** Phase 2: barycenter sweeps, down then up, from the input order. Keeps
 *  the order with the fewest crossings. */
const order = (rows: string[][], links: Link[], sweeps = 4): string[][] => {
  let best = rows;
  for (let s = 0; s < sweeps; s++) {
    const down = s % 2 === 0;
    const ks = rows.map((_, k) => k);
    for (const k of down ? ks.slice(1) : ks.reverse().slice(1)) {
      const at = new Map(rows.flatMap((row) => row.map((id, i) => [id, i])));
      const bary = (id: string) => {
        const ns = links
          .filter((l) => (down ? l.target : l.source) === id)
          .map((l) => at.get(down ? l.source : l.target)!);
        return ns.length ? ns.reduce((a, b) => a + b) / ns.length : at.get(id)!;
      };
      rows = rows.map((row, i) =>
        i === k ? [...row].sort((a, b) => bary(a) - bary(b)) : row
      );
    }
    if (crossings(rows, links) < crossings(best, links)) best = rows;
  }
  return best;
};

const graph = splitLongEdges(courses, prereqs);
const ordered = order(graph.rows, graph.links);

const isDummy = (id: string) => id.includes(">");

// A course is a labeled box.
const Course = createMark(({ id }: { id: string }) =>
  layer([
    rect({
      w: 70,
      h: 22,
      rx: 4,
      fill: "#e2ebf6",
      stroke: "#457b9d",
      strokeWidth: 1,
    }).name("box"),
    text({ text: id, fontSize: 11, fill: "#1d3557" }).name("label"),
  ]).relate(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ])
);

// A dummy is a point a long edge bends through; it takes a small slot.
const graphNode = (id: string) =>
  (isDummy(id) ? blank({ w: 2, h: 8 }) : Course({ id })).name(id);

const graphLinks = (links: Link[]) =>
  links.map(({ source, target }) =>
    line({ stroke: "#9aa7b1" }, [ref(source), ref(target)]).zOrder(-1)
  );

// Layers spread along x, each layer's nodes spread along y in `rows` order.
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

export const GraphInputOrder: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layeredGraph(graph.rows).render(container, { w: 520, h: 320 });
    return container;
  },
};

export const GraphBarycenter: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layeredGraph(ordered).render(container, { w: 520, h: 320 });
    return container;
  },
};

const GAP_Y = 30;
const heightOf = (id: string) => (isDummy(id) ? 8 : 22);

/** Phase 3: each node's y center. The first layer is evenly spread; each
 *  later node wants the mean y of its predecessors. Overlaps are resolved
 *  by pushing down from the top and up from the bottom and averaging the
 *  two, which keeps the layer's order and gaps. */
const straighten = (rows: string[][], links: Link[]): Map<string, number> => {
  const y = new Map<string, number>();
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b) / xs.length;
  rows.forEach((row, k) => {
    const sep = row.map((id, i) =>
      i ? (heightOf(row[i - 1]) + heightOf(id)) / 2 + GAP_Y : 0
    );
    const want = row.map((id, i) =>
      k === 0
        ? sep.slice(0, i + 1).reduce((a, b) => a + b)
        : mean(
            links.filter((l) => l.target === id).map((l) => y.get(l.source)!)
          )
    );
    const down = [...want];
    for (let i = 1; i < row.length; i++)
      down[i] = Math.max(want[i], down[i - 1] + sep[i]);
    const up = [...want];
    for (let i = row.length - 2; i >= 0; i--)
      up[i] = Math.min(want[i], up[i + 1] - sep[i + 1]);
    row.forEach((id, i) => y.set(id, (down[i] + up[i]) / 2));
  });
  return y;
};

const straightY = straighten(ordered, graph.links);

// Layers still spread along x, but each node's y is set explicitly.
const straightenedGraph = (rows: string[][], y: Map<string, number>) =>
  layer([
    spread(
      { dir: "x", spacing: 42, alignment: "baseline" },
      rows.map((row) =>
        layer(row.map(graphNode)).relate((c) =>
          row.map((id) => Constraint.position({ y: y.get(id)! }, [c[id]]))
        )
      )
    ),
  ]).relate(() => graphLinks(graph.links));

export const GraphStraightened: StoryObj = {
  render: () => {
    const container = initializeContainer();
    straightenedGraph(ordered, straightY).render(container, { w: 520, h: 320 });
    return container;
  },
};
