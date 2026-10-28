import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "./helper";
import {
  circle,
  enclose,
  layer,
  line,
  polygon,
  position,
  rect,
  ribbon,
  Curve,
  Shape,
} from "../src/lib";

// How `enclose` reads each kind of member (`enclose/members.ts`): one blob
// per kind. A circle is an exact disc, a line its pieces as wide as its
// stroke, a polygon or a ribbon its closed outline with the inside filled.
// Test stories, not gallery-tagged.
const meta: Meta = { title: "Enclose/Members" };
export default meta;

type P = [number, number];

const blob = (members: any[]) =>
  enclose(
    {
      shape: Shape.blob(),
      padding: 10,
      fill: "#4c78a8",
      stroke: "#1f3b63",
      strokeWidth: 1.5,
      fillOpacity: 0.2,
    },
    members
  );

const at = ([x, y]: P, node: any) => position({ x, y }, [node]);

const show = (node: any) => {
  const container = initializeContainer();
  node.render(container, { w: 280, h: 220 });
  return container;
};

/** Three circles of different sizes: each is a disc. */
export const Circles: StoryObj = {
  render: () =>
    show(
      layer([
        at([20, 40], circle({ r: 18, fill: "#e45756" }).name("c1")),
        at([110, 10], circle({ r: 10, fill: "#e45756" }).name("c2")),
        at([150, 70], circle({ r: 26, fill: "#e45756" }).name("c3")),
      ]).relate((n: any) => [blob([n.c1, n.c2, n.c3])])
    ),
};

/** Two thick curved lines through small anchors: each is its pieces, as
 *  wide as its stroke. */
const A: P[] = [
  [20, 30],
  [80, 120],
  [150, 20],
  [210, 110],
];
const B: P[] = [
  [30, 150],
  [100, 170],
  [170, 140],
  [215, 160],
];
const dot = (p: P, name: string) =>
  at([p[0] - 2, p[1] - 2], circle({ r: 2, fill: "#333" }).name(name));
const thick = { stroke: "#54a24b", strokeWidth: 10, curve: Curve.catmullRom() };

export const ThickCurves: StoryObj = {
  render: () =>
    show(
      layer([
        layer([
          ...A.map((p, i) => dot(p, `a${i}`)),
          ...B.map((p, i) => dot(p, `b${i}`)),
        ]).relate((n: any) => [
          line(thick, A.map((_, i) => n[`a${i}`])).name("la"),
          line(thick, B.map((_, i) => n[`b${i}`])).name("lb"),
        ]),
      ]).relate((n: any) => [blob([n.la, n.lb])])
    ),
};

/** Two non-convex polygons, an L and a C: each is its outline, filled. */
const L: P[] = [
  [0, 0],
  [22, 0],
  [22, 80],
  [70, 80],
  [70, 100],
  [0, 100],
];
const C: P[] = [
  [0, 0],
  [80, 0],
  [80, 22],
  [22, 22],
  [22, 78],
  [80, 78],
  [80, 100],
  [0, 100],
];

export const Polygons: StoryObj = {
  render: () =>
    show(
      layer([
        at([10, 10], polygon({ points: L, fill: "#f58518" }).name("pl")),
        at([120, 30], polygon({ points: C, fill: "#f58518" }).name("pc")),
      ]).relate((n: any) => [blob([n.pl, n.pc])])
    ),
};

/** A ribbon band through four bars: the band is its outline, filled. */
const BARS: [number, number, number][] = [
  [10, 60, 40],
  [80, 20, 90],
  [150, 90, 30],
  [220, 40, 70],
];

export const RibbonBand: StoryObj = {
  render: () =>
    show(
      layer([
        layer(
          BARS.map(([x, y, h], i) =>
            at([x, y], rect({ w: 14, h, fill: "#b279a2" }).name(`r${i}`))
          )
        ).relate((n: any) => [
          ribbon(
            { fill: "#b279a2", opacity: 0.6 },
            BARS.map((_, i) => n[`r${i}`])
          ).name("band"),
        ]),
      ]).relate((n: any) => [blob([n.band])])
    ),
};
