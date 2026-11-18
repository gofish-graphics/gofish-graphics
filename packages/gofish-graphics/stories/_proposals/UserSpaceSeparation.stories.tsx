import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import {
  Constraint,
  Overlap,
  Spacing,
  blank,
  chart,
  circle,
  createMark,
  layer,
  line,
  offset,
  rect,
  ref,
  scatter,
  spread,
  text,
} from "../../src/lib";

// Throwaway prototypes for the user-space layouts proposal: does one
// inequality constraint, "b is at least `gap` after a" (a separation), cover
// a tidy tree, a graph's layering, its straightening and a one-sided
// beeswarm? Each layout is a plan that makes separations, and one solver.
// Not gallery-tagged. The lowercase exports are the solver and the plans, for
// the scratch checks; Storybook skips them.
const meta: Meta = {
  title: "Proposals/User Space Separation",
  excludeStories: /^[a-z]/,
};
export default meta;

// ─────────────────────────────────────────────────────────────────────────
// The solver
// ─────────────────────────────────────────────────────────────────────────

/** pos[before] - pos[after] >= gap. A lower bound `x >= p` is a separation
 *  of gap p from a fixed zero item: an item no separation leads into, which
 *  the least solution puts at 0. */
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

/**
 * Each item's position. "start": the least solution, where an item no
 * separation leads into sits at 0. "end": the greatest solution, where an
 * item no separation leads out of sits at `upper` (default: the least
 * solution's largest position). "center": the mean of the two.
 */
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

// ─────────────────────────────────────────────────────────────────────────
// 1. Tidy tree
// ─────────────────────────────────────────────────────────────────────────

export type Tree = { name: string; w?: number; children?: Tree[] };

const leaves = (...names: string[]): Tree[] => names.map((name) => ({ name }));

// The 30-node file tree of "Proposals/User Space Trees" (TreeContours).
export const files: Tree = {
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

// The wedge of TreeSymmetryLeft/Mean/Spread: a wide first child and a deep
// last child enclose three single leaves.
export const wedge: Tree = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "a1", children: leaves("1", "2", "3", "4", "5") },
        { name: "a2", children: leaves("6", "7", "8", "9", "10") },
      ],
    },
    ...leaves("m1", "m2", "m3"),
    {
      name: "B",
      children: [
        {
          name: "b1",
          children: [{ name: "b11", children: leaves("x", "y", "z") }],
        },
        { name: "b2", children: leaves("u", "v", "w") },
      ],
    },
  ],
};

const R = 7; // node radius
const GAP = 10; // gap between sibling subtrees
const LEVEL = 40; // gap between a parent and its children
const wOf = (t: Tree) => t.w ?? 2 * R;

// <plan: tree>
/** Per depth, the [left, right] edges of a subtree, its root centered at 0. */
type Contour = [number, number][];
export type Laid = { offsets: number[]; contour: Contour; kids: Laid[] };

/** How far right b's root must sit from a's so no shared depth overlaps. */
const fitPair = (a: Contour, b: Contour) =>
  Math.max(...b.slice(0, a.length).map(([l], d) => a[d][1] - l + GAP));

/** Each child's offset from its parent, and the subtree's contour. */
export const sepTree = (t: Tree, policy: Policy): Laid => {
  const kids = (t.children ?? []).map((c) => sepTree(c, policy));
  const ids = kids.map((_, i) => `${i}`);
  // child j clears every earlier child i, by their two contours alone
  const seps = kids.flatMap((b, j) =>
    kids.slice(0, j).map((a, i) => ({
      after: ids[i],
      before: ids[j],
      gap: fitPair(a.contour, b.contour),
    }))
  );
  const x = solveSeparations(ids, seps, { policy });
  const mid = kids.length ? (x.get(ids[0])! + x.get(ids.at(-1)!)!) / 2 : 0;
  const offsets = ids.map((id) => x.get(id)! - mid); // parent over the ends
  const contour: Contour = [[-wOf(t) / 2, wOf(t) / 2]];
  kids.forEach((k, i) =>
    k.contour.forEach(([l, r], d) => {
      const [lo, hi] = contour[d + 1] ?? [Infinity, -Infinity];
      contour[d + 1] = [
        Math.min(lo, l + offsets[i]),
        Math.max(hi, r + offsets[i]),
      ];
    })
  );
  return { offsets, contour, kids };
};
// </plan: tree>

const nodeMark = (path: string) =>
  circle({ r: R, fill: "#457b9d", stroke: "white", strokeWidth: 1.5 }).name(
    path
  );

const edges = (t: Tree, path = "n"): [string, string][] =>
  (t.children ?? []).flatMap((c, i) => [
    [path, `${path}.${i}`] as [string, string],
    ...edges(c, `${path}.${i}`),
  ]);

const links = (t: Tree) =>
  edges(t).map(([p, c]) =>
    line({ stroke: "#9aa7b1", strokeWidth: 1.25 }, [ref(p), ref(c)]).zOrder(-1)
  );

const sub = (t: Tree, path: string) =>
  t.children?.length ? `${path}/sub` : path;

const leftOf = (c: Contour) => Math.min(...c.map(([l]) => l));

// The drawing of `placedTree` in "Proposals/User Space Trees": one pitch per
// adjacent pair of subtree boxes, and the parent placed from its first child.
const drawTree = (t: Tree, d: Laid, path = "n"): any => {
  const self = nodeMark(path);
  if (!t.children?.length) return self;
  const kidPaths = t.children.map((_, i) => `${path}.${i}`);
  const kids = layer(
    t.children.map((c, i) => drawTree(c, d.kids[i], kidPaths[i]))
  )
    .relate((c) => {
      const subs = t.children!.map((k, i) => c[sub(k, kidPaths[i])]);
      const lefts = d.kids.map((k, i) => d.offsets[i] + leftOf(k.contour));
      return [
        Constraint.align({ y: "start" }, subs),
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
  return layer([self, kids])
    .relate((c) => [
      Constraint.distribute({ dir: "y", spacing: LEVEL }, [
        c[path],
        c[`${path}/kids`],
      ]),
      Constraint.distribute(
        { dir: "x", spacing: Spacing.pitch(-d.offsets[0], { at: "middle" }) },
        [c[kidPaths[0]], c[path]]
      ),
    ])
    .name(`${path}/sub`);
};

const treeStory = (t: Tree, policy: Policy): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    layer([drawTree(t, sepTree(t, policy))])
      .relate(() => links(t))
      .render(container, { w: 560, h: 360 });
    return container;
  },
});

export const SepTreeStart = treeStory(wedge, "start");
export const SepTreeCenter = treeStory(wedge, "center");
export const SepTreeCenterFiles = treeStory(files, "center");

// ─────────────────────────────────────────────────────────────────────────
// 2. Layering
// ─────────────────────────────────────────────────────────────────────────

export const courses = [
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

export const prereqs = [
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

export type Link = { source: string; target: string };

// <plan: layers>
/** Each node's layer: every link's target is at least 1 after its source. */
export const sepLayers = (nodes: string[], links: Link[], policy: Policy) =>
  solveSeparations(
    nodes,
    links.map((l) => ({ after: l.source, before: l.target, gap: 1 })),
    { policy }
  );
// </plan: layers>

/** `splitLongEdges` of "User Space Trees", given the layer of each node: a
 *  dummy per whole layer a link skips. Rows are the distinct layers. */
const splitLongEdges = (
  nodes: string[],
  links: Link[],
  rank: Map<string, number>
) => {
  rank = new Map(rank);
  const segments: Link[] = [];
  for (const { source, target } of links) {
    let prev = source;
    for (let k = rank.get(source)! + 1; k < rank.get(target)! - 1e-9; k++) {
      const dummy = `${source}>${target}@${k}`;
      rank.set(dummy, k);
      segments.push({ source: prev, target: dummy });
      prev = dummy;
    }
    segments.push({ source: prev, target });
  }
  const ks = [...new Set(rank.values())].sort((a, b) => a - b);
  const rows: string[][] = ks.map(() => []);
  for (const id of new Set([...nodes, ...rank.keys()]))
    rows[ks.indexOf(rank.get(id)!)].push(id);
  return { rows, links: segments, rank };
};

const crossings = (rows: string[][], links: Link[]): number => {
  const at = new Map(rows.flatMap((row) => row.map((id, i) => [id, i])));
  const layerOf = new Map(rows.flatMap((row, k) => row.map((id) => [id, k])));
  let n = 0;
  links.forEach((a, i) =>
    links.slice(i + 1).forEach((b) => {
      const sameGap = layerOf.get(a.source) === layerOf.get(b.source);
      const ds = at.get(a.source)! - at.get(b.source)!;
      const dt = at.get(a.target)! - at.get(b.target)!;
      if (sameGap && ds * dt < 0) n++;
    })
  );
  return n;
};

/** `order` of "User Space Trees": barycenter sweeps, down then up. */
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

const isDummy = (id: string) => id.includes(">");

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

const graphNode = (id: string) =>
  (isDummy(id) ? blank({ w: 2, h: 8 }) : Course({ id })).name(id);

const graphLinks = (links: Link[]) =>
  links.map(({ source, target }) =>
    line({ stroke: "#9aa7b1" }, [ref(source), ref(target)]).zOrder(-1)
  );

const PITCH_X = 112; // the 70 px box plus the 42 px spacing of GraphBarycenter
const GAP_Y = 30;
const heightOf = (id: string) => (isDummy(id) ? 8 : 22);

/** A row's y centers as GraphBarycenter's `spread({ dir: "y", spacing: 30,
 *  alignment: "middle" })` places them: stacked, the row's box centered
 *  on 0. */
const stackedY = (row: string[]) => {
  const ys: number[] = [];
  row.forEach((id, i) =>
    ys.push(
      i ? ys[i - 1] + (heightOf(row[i - 1]) + heightOf(id)) / 2 + GAP_Y : 0
    )
  );
  const last = row.length - 1;
  const mid = (ys[last] + heightOf(row[last]) / 2 - heightOf(row[0]) / 2) / 2;
  return ys.map((y) => y - mid);
};

export const layered = (policy: Policy) => {
  const g = splitLongEdges(
    courses,
    prereqs,
    sepLayers(courses, prereqs, policy)
  );
  return { ...g, rows: order(g.rows, g.links) };
};

/** Every node placed at x = layer · pitch and y from its row order. */
const layersStory = (policy: Policy): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    const g = layered(policy);
    const y = new Map(
      g.rows.flatMap((row) => {
        const ys = stackedY(row);
        return row.map((id, i) => [id, ys[i]] as [string, number]);
      })
    );
    const ids = g.rows.flat();
    layer([
      layer(ids.map(graphNode)).relate((c) =>
        ids.map((id) =>
          Constraint.position({ x: g.rank.get(id)! * PITCH_X, y: y.get(id)! }, [
            c[id],
          ])
        )
      ),
    ])
      .relate(() => graphLinks(g.links))
      .render(container, { w: 760, h: 340 });
    return container;
  },
});

export const SepGraphLayers = layersStory("start");
// "end": every sink in the last layer.
export const SepGraphLayersEnd = layersStory("end");
// "center": the mean of the two gives half layers (Lin Alg at 1.5), so boxes
// half a pitch apart overlap. Kept to show it; not legible.
export const SepGraphLayersCenter = layersStory("center");

// ─────────────────────────────────────────────────────────────────────────
// 3. Straightening
// ─────────────────────────────────────────────────────────────────────────

// <plan: straighten>
/** Each node's y center. Layer 0 is evenly spread; a later node wants the
 *  mean y of its predecessors. In a layer, consecutive nodes are separated by
 *  half their heights plus the gap, and each node is at least its wanted y
 *  (for the least solution) and at most it (for the greatest). */
export const sepStraighten = (rows: string[][], links: Link[]) => {
  const y = new Map<string, number>();
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b) / xs.length;
  rows.forEach((row, k) => {
    const want = (id: string) =>
      mean(links.filter((l) => l.target === id).map((l) => y.get(l.source)!));
    const seps: Sep[] = row.slice(1).map((id, i) => ({
      after: row[i],
      before: id,
      gap: (heightOf(row[i]) + heightOf(id)) / 2 + GAP_Y,
    }));
    // Layer 0 has no wanted y: the gaps alone place it, from 0. "zero" sits
    // at 0 in the least solution and "end" at `upper` = 0 in the greatest.
    if (k)
      for (const id of row)
        seps.push(
          { after: "zero", before: id, gap: want(id) }, // y >= want
          { after: id, before: "end", gap: -want(id) } // y <= want
        );
    const pos = solveSeparations(["zero", ...row, "end"], seps, {
      policy: k ? "center" : "start",
      upper: 0,
    });
    row.forEach((id) => y.set(id, pos.get(id)!));
  });
  return y;
};
// </plan: straighten>

export const straightRows = layered("start").rows;
export const straightLinks = layered("start").links;

export const SepGraphStraightened: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const y = sepStraighten(straightRows, straightLinks);
    layer([
      spread(
        { dir: "x", spacing: 42, alignment: "baseline" },
        straightRows.map((row) =>
          layer(row.map(graphNode)).relate((c) =>
            row.map((id) => Constraint.position({ y: y.get(id)! }, [c[id]]))
          )
        )
      ),
    ])
      .relate(() => graphLinks(straightLinks))
      .render(container, { w: 520, h: 320 });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 4. One-sided beeswarm
// ─────────────────────────────────────────────────────────────────────────

export const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);

// The x scale of GreedySwarm in "User Space Greedy": domain [2500, 6500] over
// 420 px.
export const xPx = (mass: number) => ((mass - 2500) / (6500 - 2500)) * 420;
const DOT = 3;
const PAD = 1;

// <plan: swarm>
/** Each dot's center height: at least its radius (one-sided), and above
 *  every earlier dot it would touch, by enough to clear it. */
export const sepSwarm = (xs: number[], r: number, pad: number) => {
  const ids = xs.map((_, j) => `${j}`);
  const seps = xs.flatMap((x, j) => [
    { after: "zero", before: ids[j], gap: r },
    ...xs.slice(0, j).flatMap((xi, i) => {
      const dr = 2 * r + pad;
      const dx = x - xi;
      return Math.abs(dx) < dr
        ? [{ after: ids[i], before: ids[j], gap: Math.sqrt(dr * dr - dx * dx) }]
        : [];
    }),
  ]);
  const y = solveSeparations(["zero", ...ids], seps, { policy: "start" });
  return ids.map((id) => y.get(id)!);
};
// </plan: swarm>

export const swarmY = sepSwarm(
  weighed.map((p) => xPx(p["Body Mass (g)"]!)),
  DOT,
  PAD
);

export const SepSwarm: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = weighed.map((p, i) => ({ ...p, dy: swarmY[i] }));
    chart(rows, { w: 420, h: 260 })
      .flow(scatter({ x: "Body Mass (g)", alignment: "start" }))
      .mark((d: typeof rows) =>
        // `start` rests each dot on the line (its center r from it), as the
        // built-in one-sided swarm does; `offset` (which, as in GreedySwarm,
        // moves only the drawing) lifts it the rest of the way to dy.
        offset({ y: d[0].dy - DOT }, [circle({ r: DOT, fill: "Species" })(d)])
      )
      .render(container);
    return container;
  },
};

export const BuiltinSwarmOneSided: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(weighed, { w: 420, h: 260 })
      .flow(
        scatter({
          x: "Body Mass (g)",
          alignment: "start",
          overlap: Overlap.separate({ padding: PAD }),
        })
      )
      .mark(circle({ r: DOT, fill: "Species" }))
      .render(container);
    return container;
  },
};
