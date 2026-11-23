import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  Spacing,
  circle,
  createMark,
  layer,
  line,
  mean,
  rect,
  ref,
  spread,
  text,
} from "../../src/lib";

// The two placement primitives of the user-space layouts proposal, through
// the public API: a minimum gap (`Spacing.atLeast`, its slack placed by
// `justify`) and a mean of positions (`mean([...])`, an operand of
// `Constraint.align`). The `Spacing.atLeast` spelling is a PLACEHOLDER, not
// signed off. No story computes a
// position: every place comes from the solve. Not gallery-tagged.
// Checked on 11-23: Dendrogram draws the same links as "User Space D3
// Hierarchy/Cluster" (all 23, to the pixel), and TidyTree the same as "User
// Space Separation/SepTreeStart" (all 26), whose places are hand-computed.
const meta: Meta = {
  title: "Proposals/Minimum Gap",
  excludeStories: /^[a-z]/,
};
export default meta;

// ─────────────────────────────────────────────────────────────────────────
// 1. A row of labeled rects, under each slack rule
// ─────────────────────────────────────────────────────────────────────────

const Box = createMark(
  ({ label, w, fill }: { label: string; w: number; fill: string }) =>
    layer([
      rect({ w, h: 24, rx: 3, fill, stroke: "#1d3557", strokeWidth: 1 }).name(
        "box"
      ),
      text({ text: label, fontSize: 11, fill: "#1d3557" }).name("label"),
    ]).relate(({ box, label }) => [
      Constraint.align({ x: "middle", y: "middle" }, [box, label]),
    ])
);

type Justify = "start" | "end" | "center";

/**
 * Top row: two pairs, each glued by an exact gap of 2, and at least 16
 * apart. Bottom row: p starts where A starts and r ends where D ends
 * (exact), and q floats between them, at least 8 from each. The top row
 * sets the span, so q has room to spare, and `justify` says where it goes.
 */
const rowOfRects = (justify: Justify) =>
  layer([
    Box({ label: "A", w: 60, fill: "#a8dadc" }).name("A"),
    Box({ label: "B", w: 40, fill: "#a8dadc" }).name("B"),
    Box({ label: "C", w: 50, fill: "#f1c27d" }).name("C"),
    Box({ label: "D", w: 70, fill: "#f1c27d" }).name("D"),
    Box({ label: "p", w: 30, fill: "#e5e5e5" }).name("p"),
    Box({ label: "q", w: 40, fill: "#e63946" }).name("q"),
    Box({ label: "r", w: 30, fill: "#e5e5e5" }).name("r"),
  ]).relate((c) => [
    Constraint.distribute({ dir: "x", spacing: 2 }, [c.A, c.B]),
    Constraint.distribute({ dir: "x", spacing: 2 }, [c.C, c.D]),
    Constraint.distribute(
      { dir: "x", spacing: Spacing.atLeast(16, { justify }) },
      [c.B, c.C]
    ),
    Constraint.align({ x: "start" }, [c.A, c.p]),
    Constraint.align({ x: "end" }, [c.D, c.r]),
    Constraint.distribute(
      { dir: "x", spacing: Spacing.atLeast(8, { justify }) },
      [c.p, c.q, c.r]
    ),
    Constraint.align({ y: "start" }, [c.A, c.B, c.C, c.D]),
    Constraint.align({ y: "start" }, [c.p, c.q, c.r]),
    Constraint.distribute({ dir: "y", spacing: 12 }, [c.A, c.p]),
  ]);

const rowStory = (justify: Justify): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    rowOfRects(justify).render(container, { w: 340, h: 80 });
    return container;
  },
});

export const RowStart = rowStory("start");
export const RowEnd = rowStory("end");
export const RowCenter = rowStory("center");

/** The three rules one above another, as one picture. */
export const RowAll: StoryObj = {
  render: () => {
    const container = initializeContainer();
    spread(
      { dir: "y", spacing: 24, alignment: "start" },
      (["start", "center", "end"] as const).map(rowOfRects)
    ).render(container, { w: 340, h: 260 });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 2. A dendrogram (d3.cluster): levels by minimum gaps, x by means
// ─────────────────────────────────────────────────────────────────────────

export type Tree = { name: string; children?: Tree[] };
const leaf = (name: string): Tree => ({ name });

// The budget tree of "Proposals/User Space D3 Hierarchy" (Cluster): 24
// nodes, height 3, leaves at depths 1, 2 and 3.
export const budget: Tree = {
  name: "Budget",
  children: [
    { name: "Safety", children: [leaf("Police"), leaf("Fire"), leaf("Courts")] },
    {
      name: "Transport",
      children: [
        { name: "Roads", children: [leaf("Repair"), leaf("New")] },
        { name: "Transit", children: [leaf("Bus"), leaf("Rail")] },
        leaf("Parking"),
      ],
    },
    { name: "Parks", children: [leaf("Upkeep"), leaf("Programs")] },
    {
      name: "Health",
      children: [leaf("Clinics"), leaf("Outreach"), leaf("Labs")],
    },
    leaf("Admin"),
    { name: "Libraries", children: [leaf("Branches"), leaf("Digital")] },
  ],
};

type Node = { t: Tree; path: string; parent?: string };
const nodes = (t: Tree, path = "n", parent?: string): Node[] => [
  { t, path, parent },
  ...(t.children ?? []).flatMap((c, i) => nodes(c, `${path}.${i}`, path)),
];

const DX = 20; // leaf pitch, d3's nodeSize[0]
const DY = 80; // level pitch, d3's nodeSize[1]
const R = 5;

const dot = (path: string, fill: string) => circle({ r: R, fill }).name(path);

const treeLinks = (ns: Node[]) =>
  ns
    .filter((n) => n.parent)
    .map((n) =>
      line({ stroke: "#9aa7b1" }, [ref(n.parent!), ref(n.path)]).zOrder(-1)
    );

/**
 * The leaves one pitch apart; each parent's x the mean of its children's;
 * each child at least one level below its parent, with the slack at the
 * end, so every leaf lands on the last level (d3.cluster's levels).
 */
export const Dendrogram: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const ns = nodes(budget);
    const leaves = ns.filter((n) => !n.t.children);
    const inner = ns.filter((n) => n.t.children);
    layer([
      spread(
        { dir: "x", spacing: Spacing.pitch(DX, { at: "middle" }) },
        leaves.map((n) => dot(n.path, "#457b9d"))
      ).name("leaves"),
      ...inner.map((n) => dot(n.path, "#1d3557")),
    ])
      .relate((c) => [
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
                spacing: Spacing.atLeast(DY - 2 * R, { justify: "end" }),
              },
              [c[n.parent!], c[n.path]]
            )
          ),
        ...treeLinks(ns),
      ])
      .render(container, { w: 360, h: 320, axes: false });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 3. A tidy tree: subtrees apart by their contours, parents at the mean
// ─────────────────────────────────────────────────────────────────────────

// The wedge of "Proposals/User Space Separation" (SepTreeStart): a wide
// first child and a deep last child enclose three single leaves.
export const wedge: Tree = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "a1", children: ["1", "2", "3", "4", "5"].map(leaf) },
        { name: "a2", children: ["6", "7", "8", "9", "10"].map(leaf) },
      ],
    },
    ...["m1", "m2", "m3"].map(leaf),
    {
      name: "B",
      children: [
        { name: "b1", children: [{ name: "b11", children: ["x", "y", "z"].map(leaf) }] },
        { name: "b2", children: ["u", "v", "w"].map(leaf) },
      ],
    },
  ],
};

const NR = 7; // node radius
const GAP = 10; // the least gap between two nodes at one depth
const LEVEL = 40; // the gap between a parent and its children

/** The paths of a subtree's nodes at each depth, left to right. */
const rows = (t: Tree, path: string): string[][] => {
  const out: string[][] = [[path]];
  (t.children ?? []).forEach((c, i) =>
    rows(c, `${path}.${i}`).forEach((row, d) => {
      out[d + 1] = [...(out[d + 1] ?? []), ...row];
    })
  );
  return out;
};

const sub = (t: Tree, path: string) =>
  t.children?.length ? `${path}/sub` : path;

/**
 * A subtree: its node above its children's subtrees. The children's
 * subtrees are apart by their contours: at each depth, each node at least
 * GAP from the next, whichever subtree they are in. The node is at the mean
 * of its first and last child (the midpoint, as Reingold and Tilford's).
 */
const tidy = (t: Tree, path = "n"): any => {
  const self = circle({
    r: NR,
    fill: "#457b9d",
    stroke: "white",
    strokeWidth: 1.5,
  }).name(path);
  if (!t.children?.length) return self;
  const kids = t.children.map((_, i) => `${path}.${i}`);
  const depthRows = rows(t, path).slice(1);
  return layer([
    self,
    layer(t.children.map((c, i) => tidy(c, kids[i])))
      .relate((c) => [
        Constraint.align(
          { y: "start" },
          t.children!.map((k, i) => c[sub(k, kids[i])])
        ),
        ...depthRows.map((row) =>
          Constraint.distribute(
            { dir: "x", spacing: Spacing.atLeast(GAP) },
            row.map((p) => c[p])
          )
        ),
      ])
      .name(`${path}/kids`),
  ])
    .relate((c) => [
      Constraint.distribute({ dir: "y", spacing: LEVEL }, [
        c[path],
        c[`${path}/kids`],
      ]),
      Constraint.align({ x: "middle" }, [
        c[path],
        mean([c[kids[0]], c[kids[kids.length - 1]]]),
      ]),
    ])
    .name(`${path}/sub`);
};

export const TidyTree: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([tidy(wedge)])
      .relate(() => treeLinks(nodes(wedge)))
      .render(container, { w: 560, h: 360 });
    return container;
  },
};
