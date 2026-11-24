import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Coord,
  Constraint,
  Spacing,
  chart,
  circle,
  layer,
  line,
  rect,
  ref,
  ribbon,
  spread,
  stack,
  v,
} from "../../src/lib";

// Throwaway prototypes for the user-space layouts proposal: can d3's
// cluster, partition, pie and chord layouts be written as a plan in plain JS
// and relations GoFish's operators express? Each story is compared against
// d3's own numbers by a scratch script. Not gallery-tagged. The lowercase
// exports are the data and the plans; Storybook skips them.
const meta: Meta = {
  title: "Proposals/User Space D3 Hierarchy",
  excludeStories: /^[a-z]/,
};
export default meta;

const W = 360;
const H = 320;

// ─────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────

export type Tree = { name: string; value?: number; children?: Tree[] };

const leaf = (name: string, value: number): Tree => ({ name, value });

// A city budget in millions: 24 nodes, height 3, with leaves at depths 1, 2
// and 3.
export const budget: Tree = {
  name: "Budget",
  children: [
    {
      name: "Safety",
      children: [leaf("Police", 412), leaf("Fire", 268), leaf("Courts", 95)],
    },
    {
      name: "Transport",
      children: [
        { name: "Roads", children: [leaf("Repair", 180), leaf("New", 74)] },
        { name: "Transit", children: [leaf("Bus", 210), leaf("Rail", 132)] },
        leaf("Parking", 28),
      ],
    },
    {
      name: "Parks",
      children: [leaf("Upkeep", 88), leaf("Programs", 41)],
    },
    {
      name: "Health",
      children: [leaf("Clinics", 156), leaf("Outreach", 37), leaf("Labs", 52)],
    },
    leaf("Admin", 120),
    {
      name: "Libraries",
      children: [leaf("Branches", 64), leaf("Digital", 19)],
    },
  ],
};

// Each node's value, the sum of its leaves' (d3's `hierarchy.sum`).
export const total = (t: Tree): number =>
  t.children ? t.children.reduce((s, c) => s + total(c), 0) : t.value!;

/** Every node with its path, parents before children (preorder). */
type Node = { t: Tree; path: string; depth: number; parent?: string };
const nodes = (t: Tree, path = "n", depth = 0, parent?: string): Node[] => [
  { t, path, depth, parent },
  ...(t.children ?? []).flatMap((c, i) =>
    nodes(c, `${path}.${i}`, depth + 1, path)
  ),
];

// ─────────────────────────────────────────────────────────────────────────
// The minimum-gap solver of "Proposals/User Space Separation", copied
// ─────────────────────────────────────────────────────────────────────────

/** pos[before] - pos[after] >= gap. */
export type Sep = { after: string; before: string; gap: number };
export type Policy = "start" | "end" | "center";

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
// 1. Cluster (d3.cluster): a dendrogram
// ─────────────────────────────────────────────────────────────────────────

export const DX = 20; // leaf pitch, d3's nodeSize[0]
export const DY = 80; // level pitch, d3's nodeSize[1]
const R = 5;

// <plan: cluster>
/** Each node's level: every link's child is at least one level after its
 *  parent, and the greatest solution puts every leaf at the last level. */
export const clusterLevels = (t: Tree) => {
  const ns = nodes(t);
  return solveSeparations(
    ns.map((n) => n.path),
    ns
      .filter((n) => n.parent)
      .map((n) => ({ after: n.parent!, before: n.path, gap: 1 })),
    { policy: "end" }
  );
};

/** Each node's x in leaf pitches: a leaf its index in leaf order, a parent
 *  the mean of its children's. */
export const clusterX = (t: Tree) => {
  const x = new Map<string, number>();
  let k = 0;
  const walk = (t: Tree, path: string): number => {
    const v = t.children
      ? t.children
          .map((c, i) => walk(c, `${path}.${i}`))
          .reduce((a, b) => a + b) / t.children.length
      : k++;
    x.set(path, v);
    return v;
  };
  walk(t, "n");
  return x;
};
// </plan: cluster>

export const Cluster: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const ns = nodes(budget);
    const level = clusterLevels(budget);
    const x = clusterX(budget);
    const leaves = ns.filter((n) => !n.t.children);
    const inner = ns.filter((n) => n.t.children);
    const dot = (n: Node) =>
      circle({ r: R, fill: v(`level ${level.get(n.path)}`) }).name(n.path);
    layer({ w: W, h: H }, [
      // The leaves: one pitch apart, aligned on one line.
      spread(
        { dir: "x", spacing: Spacing.pitch(DX), alignment: "middle" },
        leaves.map(dot)
      ).name("leaves"),
      ...inner.map(dot),
    ])
      .relate((c) => [
        // The leaf row: centered on the middle leaf pitch, at the last
        // level (every leaf's level is the same).
        Constraint.position(
          {
            x: ((leaves.length - 1) / 2) * DX,
            y: level.get(leaves[0].path)! * DY,
          },
          [c.leaves]
        ),
        // A parent: x the mean of its children's, y its level.
        ...inner.map((n) =>
          Constraint.position(
            { x: x.get(n.path)! * DX, y: level.get(n.path)! * DY },
            [c[n.path]]
          )
        ),
        ...ns
          .filter((n) => n.parent)
          .map((n) =>
            line({ stroke: "#9aa7b1" }, [ref(n.parent!), ref(n.path)]).zOrder(
              -1
            )
          ),
      ])
      .render(container, { axes: false });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 2. Partition (d3.partition): icicle and sunburst
// ─────────────────────────────────────────────────────────────────────────

export const ROW = H / 4; // one row per depth: height 3, so 4 rows
export const RING = 150 / 4; // the sunburst's ring: radius 150 over 4 rings

// <plan: partition>
// No plan: the partition has no decisions.
// </plan: partition>

/** A node: its rect, then its children's subtrees end to end, the two
 *  stacked across. Every width is the node's value, so a parent spans its
 *  children exactly. `ring` is the depth pitch. WALL: in polar space a
 *  rect is drawn as a stroked center arc, so a `stroke` color replaces the
 *  fill; the sunburst passes no outline. */
const partitionNode = (t: Tree, ring: number, outline = {}): any => {
  const self = rect({ w: v(total(t)), h: ring, fill: v(t.name), ...outline });
  if (!t.children) return self;
  // The rows are pixels, so they are laid end to end by a spread with no
  // gap: a stack only adds data amounts. WALL: "start" (and the default
  // "baseline") here used to throw "Constraint placement conflict on x" for
  // this tree (smallest repro: root with children [p(a 1, b 2), c 3,
  // q(d 1, e 1)]). With the spread it no longer throws, but it draws the
  // depth-1 and deeper rows squeezed to the left and out of place. The rect
  // and the children's stack have the same width, so "middle" puts them in
  // the same place.
  return spread({ dir: "y", spacing: 0, alignment: "middle" }, [
    self,
    stack(
      { dir: "x", alignment: "start" },
      t.children.map((c) => partitionNode(c, ring, outline))
    ),
  ]);
};

export const Icicle: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const outline = { stroke: "white", strokeWidth: 1 };
    layer({ w: W, h: H }, [partitionNode(budget, ROW, outline)]).render(
      container,
      { axes: false }
    );
    return container;
  },
};

// The same tree with every stack a spread `GAP` px apart, to set beside
// d3.partition().padding(GAP).
const GAP = 2;
const spacedNode = (t: Tree, ring: number): any => {
  const self = rect({ w: v(total(t)), h: ring, fill: v(t.name) });
  if (!t.children) return self;
  return spread({ dir: "y", spacing: GAP, alignment: "middle" }, [
    self,
    spread(
      { dir: "x", spacing: GAP, alignment: "start" },
      t.children.map((c) => spacedNode(c, ring))
    ),
  ]);
};

export const IcicleSpaced: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: W, h: H }, [spacedNode(budget, ROW - GAP)]).render(container, {
      axes: false,
    });
    return container;
  },
};

// The same tree in polar space: the stacking axis is the angle, depth the
// radius. The root spans the whole 2π and draws as the disc in the middle.
// WALL: the rings are pixels: with
// `h: v(1)` the wedges draw as filled paths, but every subtree is pushed out
// so its last ring ends at the rim (Safety at ring 2 instead of 1), whatever
// the alignment.
export const Sunburst: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      partitionNode(budget, RING),
    ]).render(container, { axes: false });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 3. Pie (d3.pie)
// ─────────────────────────────────────────────────────────────────────────

export const browsers = [
  { name: "Chrome", value: 64.7 },
  { name: "Safari", value: 18.6 },
  { name: "Edge", value: 5.2 },
  { name: "Firefox", value: 2.8 },
  { name: "Samsung", value: 2.6 },
  { name: "Opera", value: 2.2 },
];

export const PAD = 0.04; // radians

// The spelling of "Forward Syntax/Pie/Basic": the slices stacked along the
// angle of a clock space, each as wide as its value.
export const Pie: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(browsers, { coord: Coord.clock(), w: W, h: H })
      .flow(stack({ by: "name", dir: "x" }))
      .mark(rect({ w: "value", fill: "name" }))
      .render(container);
    return container;
  },
};

// The slices `PAD` radians apart. The spread fills the whole turn, so its
// last slice neighbors its first and it leaves n gaps, six, as d3 does: its
// default ends are half a gap at each end. That is where d3.arc draws
// d3.pie().padAngle(PAD), each slice inset by half the pad on each side.
// d3.pie's own angles are `Spacing.box(PAD, { ends: [0, 1] })`: the first
// slice at 12 o'clock and a whole pad after the last.
export const PieSpaced: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(browsers, { coord: Coord.clock(), w: W, h: H })
      .flow(spread({ by: "name", dir: "x", spacing: PAD }))
      .mark(rect({ w: "value", fill: "name" }))
      .render(container);
    return container;
  },
};

// The same chart as PieSpaced, under the name the review tab cites for the
// closed turn: n gaps, half a gap at each end.
export const PieSpacedClosed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(browsers, { coord: Coord.clock(), w: W, h: H })
      .flow(spread({ by: "name", dir: "x", spacing: PAD }))
      .mark(rect({ w: "value", fill: "name" }))
      .render(container);
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 4. Chord (d3.chord)
// ─────────────────────────────────────────────────────────────────────────

// Commuter trips per day (thousands) between five districts: row i, column
// j is trips from i to j.
export const districts = ["North", "East", "South", "West", "Center"];
export const trips = [
  [11, 58, 23, 37, 89],
  [42, 9, 31, 18, 77],
  [19, 35, 14, 52, 61],
  [44, 12, 47, 8, 70],
  [63, 81, 39, 55, 21],
];
export const CHORD_PAD = 0.05; // radians
const ARC = 18; // ring thickness, px
const INNER = 120; // ring's inner radius, px

const sub = (i: number, j: number) => `s${i}-${j}`;
const rowTotal = (row: number[]) => row.reduce((a, b) => a + b, 0);

/** The groups a gap apart around the circle, each its sub-arcs end to end.
 *  The spread fills the whole turn, so it leaves five gaps; `ends: [0, 1]`
 *  puts the first group at 12 o'clock and the fifth gap after the last
 *  group, which are d3.chord's group angles. (The default, half a gap at
 *  each end, would turn every group by half a pad.)
 *  WALL: a stack inside a spread along the same axis is "flexible" (it has
 *  no size of its own), so each group would get an equal share; `w` gives it
 *  its row total. */
const chordArcs = () =>
  spread(
    {
      dir: "x",
      spacing: Spacing.box(CHORD_PAD, { ends: [0, 1] }),
      y: INNER,
    },
    trips.map((row, i) =>
      stack(
        { dir: "x", w: v(rowTotal(row)) },
        row.map((m, j) =>
          rect({ w: v(m), h: ARC, fill: v(districts[i]) }).name(sub(i, j))
        )
      )
    )
  );

const chordSpace = () => Coord.clock();

export const Chord: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: chordSpace(), w: W, h: H }, [chordArcs()]).render(
      container,
      { axes: false }
    );
    return container;
  },
};

// The ribbon mark between the two sub-arcs of each pair. It runs through
// the space's own coordinates, so in polar space it follows the ring from
// one sub-arc to the other instead of crossing the disc. Drawn on top, half
// transparent, to show where it goes.
export const ChordRibbons: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: chordSpace(), w: W, h: H }, [
      layer([chordArcs()]).relate(() =>
        trips.flatMap((row, i) =>
          row
            .map((_, j) => j)
            .filter((j) => j > i)
            .map((j) =>
              ribbon({ fill: v(districts[i]), opacity: 0.5 }, [
                ref(sub(i, j)),
                ref(sub(j, i)),
              ])
            )
        )
      ),
    ]).render(container, { axes: false });
    return container;
  },
};
