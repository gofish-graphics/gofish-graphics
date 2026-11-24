import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Coord, layer, rect, spread, stack, v } from "../../src/lib";

// Repros for marks related to each other in a polar space: rings with a
// pixel height laid end to end along the radius, wedges laid end to end or
// apart along the angle. A chain relates both edges of each part, so the
// parts' edges are positions of the space and each is drawn as a region
// whose edges bend with the space. A mark with a pixel size that no
// relation places keeps that size as ink. Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/Polar Edge To Edge",
};
export default meta;

const W = 300;
const H = 300;
const RING = 40;

type Tree = { name: string; value?: number; children?: Tree[] };
const tree: Tree = {
  name: "root",
  children: [
    {
      name: "a",
      children: [
        { name: "a1", value: 3 },
        { name: "a2", value: 1 },
      ],
    },
    { name: "b", value: 2 },
    {
      name: "c",
      children: [
        { name: "c1", value: 1 },
        {
          name: "c2",
          children: [
            { name: "c2x", value: 0.5 },
            { name: "c2y", value: 1.5 },
          ],
        },
      ],
    },
  ],
};
const total = (t: Tree): number =>
  t.children ? t.children.reduce((s, c) => s + total(c), 0) : t.value!;

/** A node's ring with its children's subtrees laid end to end outside it:
 *  pixel rings touching along the radius, data wedges touching along the
 *  angle. */
const node = (
  t: Tree,
  outline = {},
  skipSelf = false,
  ring: any = RING,
  radial: "spread" | "stack" = "spread"
): any => {
  const self = rect({ w: v(total(t)), h: ring, fill: v(t.name), ...outline });
  if (!t.children) return self;
  const kids = stack(
    { dir: "x", alignment: "start" },
    t.children.map((c) => node(c, outline, false, ring, radial))
  );
  if (skipSelf) return kids;
  return radial === "stack"
    ? stack({ dir: "y", alignment: "middle" }, [self, kids])
    : spread({ dir: "y", spacing: 0, alignment: "middle" }, [self, kids]);
};

/** The sunburst's rings without the root disc. */
export const Rings: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      spread({ dir: "y", spacing: 0, alignment: "middle" }, [
        rect({ w: v(total(tree)), h: RING, fill: "#ddd" }),
        node(tree, {}, true),
      ]),
    ]).render(container, { axes: false });
    return container;
  },
};

/** The whole sunburst: the root is a full-circle ring. */
export const Sunburst: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [node(tree)]).render(
      container,
      { axes: false }
    );
    return container;
  },
};

/** The same with a white outline on every ring. */
export const SunburstStroke: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      node(tree, { stroke: "white", strokeWidth: 1 }),
    ]).render(container, { axes: false });
    return container;
  },
};

/** One ring that spans the whole angle, alone. */
export const FullCircle: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      rect({ w: v(1), h: RING, fill: "steelblue" }),
    ]).render(container, { axes: false });
    return container;
  },
};

/** Bars spread apart along the angle: the spread relates both edges of
 *  each, so each is a wedge, and its plain-number width is an angle. */
export const PixelBarsApart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      spread(
        { dir: "x", spacing: 0.2, alignment: "start" },
        [5, 8, 3, 6].map((h) => rect({ w: 1.2, h: v(h), fill: "steelblue" }))
      ),
    ]).render(container, { axes: false });
    return container;
  },
};

/** A lone bar of pixel width: no relation places it, so it stays a band. */
export const PixelBarAlone: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      rect({ w: 16, h: v(5), fill: "steelblue" }),
    ]).render(container, { axes: false });
    return container;
  },
};

/** Wedges of a fixed angle laid end to end (the Nightingale rose's month
 *  wedges): the spread relates both edges of each, so each is a wedge. */
export const FixedAngleWedges: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      spread(
        { dir: "x", spacing: 0, alignment: "start" },
        [5, 8, 3, 6, 4, 7].map((h, i) =>
          rect({
            w: (Math.PI * 2) / 6,
            h: v(h),
            fill: ["#4c78a8", "#f58518", "#e45756", "#72b7b2", "#54a24b", "#eeca3b"][i],
          })
        )
      ),
    ]).render(container, { axes: false });
    return container;
  },
};

/** The sunburst with rings sized by data (`h: v(1)`), so the radius is a
 *  data axis fitted to the space. */
export const SunburstDataRings: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [node(tree, {}, false, v(1))]).render(
      container,
      { axes: false }
    );
    return container;
  },
};

/** The same with each ring and its children's rings glued by a `stack`
 *  along the radius, as `UserSpaceD3Hierarchy`'s sunburst writes it. */
export const SunburstDataRingsStacked: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: W, h: H }, [
      node(tree, {}, false, v(1), "stack"),
    ]).render(container, { axes: false });
    return container;
  },
};
