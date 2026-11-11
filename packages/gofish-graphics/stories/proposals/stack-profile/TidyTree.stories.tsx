import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { blank, chart, polygon, scatter } from "../../../src/lib";

// A tidy tree laid out two ways, emulated: each subtree as one box (box
// spacing) against Reingold and Tilford's contours (contact spacing over
// depth levels). Main has no contour code, so the layout is computed here.

const meta: Meta = { title: "Proposals/Stack Profile/Tidy Tree" };
export default meta;

type T = { name: string; children?: T[] };
const leaves = (...names: string[]) => names.map((name) => ({ name }));
const TREE: T = {
  name: "gofish",
  children: [
    {
      name: "src",
      children: [
        {
          name: "ast",
          children: [
            { name: "shapes", children: leaves("rect", "text") },
            {
              name: "ops",
              children: [{ name: "stack" }, { name: "spread" }, { name: "enclose", children: leaves("prims", "blend") }],
            },
          ],
        },
        { name: "lib.ts" },
      ],
    },
    { name: "docs", children: [{ name: "api" }, { name: "guide" }, { name: "internals", children: leaves("wiki") }] },
    { name: "tests", children: leaves("capture", "diff", "parity", "stories", "unit") },
  ],
};

const W = 14; // node width
const SEP = 8; // the gap between neighbors
const LEVEL = 44;

type Laid = { x: number; depth: number; parent?: { x: number; depth: number } }[];
type Contour = Map<number, [number, number]>; // depth -> [leftmost, rightmost] node center

/** Lay out a subtree with its root at x = 0; returns its nodes and its contour. */
function layout(t: T, depth: number, mode: "box" | "contour"): { nodes: Laid; contour: Contour } {
  if (!t.children?.length) return { nodes: [{ x: 0, depth }], contour: new Map([[depth, [0, 0]]]) };
  const kids = t.children.map((c) => layout(c, depth + 1, mode));
  const acc: Contour = new Map();
  const offsets: number[] = [];
  kids.forEach((k, i) => {
    let shift = 0;
    if (i > 0) {
      const ds = [...k.contour.keys()];
      if (mode === "contour") {
        // slide in until the closest shared depth level reaches the gap
        shift = Math.max(...ds.filter((d) => acc.has(d)).map((d) => acc.get(d)![1] - k.contour.get(d)![0]));
      } else {
        // each subtree is one block: its box against everything placed so far
        const accR = Math.max(...[...acc.values()].map((v) => v[1]));
        const kL = Math.min(...[...k.contour.values()].map((v) => v[0]));
        shift = accR - kL;
      }
      shift += W + SEP;
    }
    offsets.push(shift);
    k.contour.forEach(([l, r], d) => {
      const a = acc.get(d);
      acc.set(d, a ? [Math.min(a[0], l + shift), Math.max(a[1], r + shift)] : [l + shift, r + shift]);
    });
  });
  const mid = (offsets[0] + offsets[offsets.length - 1]) / 2;
  const nodes: Laid = [{ x: 0, depth }];
  kids.forEach((k, i) =>
    k.nodes.forEach((n, j) =>
      nodes.push({
        x: n.x + offsets[i] - mid,
        depth: n.depth,
        parent: j === 0 ? { x: 0, depth } : n.parent && { x: n.parent.x + offsets[i] - mid, depth: n.parent.depth },
      })
    )
  );
  const contour: Contour = new Map([[depth, [0, 0]]]);
  acc.forEach(([l, r], d) => contour.set(d, [l - mid, r - mid]));
  return { nodes, contour };
}

const show = (build: (container: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

const tree = (mode: "box" | "contour") => {
  const { nodes } = layout(TREE, 0, mode);
  const x0 = Math.min(...nodes.map((n) => n.x)) - W;
  const width = Math.max(...nodes.map((n) => n.x)) - x0 + W;
  const depth = Math.max(...nodes.map((n) => n.depth));
  const h = depth * LEVEL + 2 * W;
  const px = (x: number) => x - x0;
  const py = (d: number) => h - W - d * LEVEL;
  const links = nodes.flatMap((n) => {
    if (!n.parent) return [];
    const [ax, ay, bx, by] = [px(n.parent.x), py(n.parent.depth), px(n.x), py(n.depth)];
    const [dx, dy] = [bx - ax, by - ay];
    const L = Math.hypot(dx, dy);
    const [nx, ny] = [(-dy / L) * 0.8, (dx / L) * 0.8];
    return [{ ring: [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]] }];
  });
  const boxes = nodes.map((n) => {
    const [cx, cy] = [px(n.x), py(n.depth)];
    return { ring: [[cx - W / 2, cy - W / 2], [cx + W / 2, cy - W / 2], [cx + W / 2, cy + W / 2], [cx - W / 2, cy + W / 2]] };
  });
  return chart(
    [
      { x: 0, y: 0, k: "lo" },
      { x: width, y: h, k: "hi" },
    ],
    { w: width, h, axes: false, legend: false }
  )
    .flow(scatter({ by: "k", x: "x", y: "y" }))
    .mark(blank())
    .layer(chart(links).mark(polygon({ points: "ring", fill: "#999" })))
    .layer(chart(boxes).mark(polygon({ points: "ring", fill: "#3d8bc9" })));
};

export const TidyBox = show((el) => tree("box").render(el));
export const TidyContour = show((el) => tree("contour").render(el));
