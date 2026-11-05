import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import bottlePng from "../assets/wilsonblanco.png";
import {
  Bin,
  chart,
  circle,
  field,
  Filter,
  atop,
  image,
  intersect,
  partition,
  subtract,
  rect,
  exclude,
  union,
  type MarkChild,
} from "../../src/lib";

const meta: Meta = {
  title: "Low Level Syntax/Porter-Duff Relations",
  argTypes: {
    w: {
      control: { type: "number", min: 320, max: 1600, step: 10 },
    },
    h: {
      control: { type: "number", min: 180, max: 1000, step: 10 },
    },
  },
};

export default meta;

type Args = {
  w: number;
  h: number;
  splitY: number;
  bgColor: string;
  blendMode: "color" | "multiply" | "screen" | "overlay";
};

const DEFAULT_ARGS: Args = {
  w: 193,
  h: 678,
  splitY: 50,
  bgColor: "#1c7520",
  blendMode: "color",
};

// The bottle in grays, and a rect over its lower part: each operator below
// draws the two operands' own paint where it keeps them.
const buildChildren = (args: Args): [MarkChild, MarkChild] => {
  const splitY = args.h - args.h * (args.splitY / 100);
  const splitH = args.h * (args.splitY / 100);
  return [
    image({
      href: bottlePng,
      x: 0,
      y: 0,
      w: args.w,
      h: args.h,
      filter: Filter.grayscale,
    }),
    rect({ x: 0, y: splitY, w: args.w, h: splitH, fill: args.bgColor }),
  ];
};

const show = (
  args: Args,
  mark: { render(c: HTMLElement, o: { w: number; h: number }): unknown }
) => {
  const container = initializeContainer();
  container.innerHTML = "";
  mark.render(container, { w: args.w, h: args.h });
  return container;
};

export const Union: StoryObj<Args> = {
  name: "Union (Over)",
  args: DEFAULT_ARGS,
  render: (args: Args) =>
    show(args, union({ blendMode: args.blendMode }, buildChildren(args))),
};

export const Intersect: StoryObj<Args> = {
  name: "Intersect (in)",
  args: DEFAULT_ARGS,
  render: (args: Args) =>
    show(args, intersect({ blendMode: args.blendMode }, buildChildren(args))),
};

export const Exclude: StoryObj<Args> = {
  name: "Exclude (Xor)",
  args: DEFAULT_ARGS,
  render: (args: Args) => show(args, exclude(buildChildren(args))),
};

export const Subtract: StoryObj<Args> = {
  name: "Subtract (out)",
  args: DEFAULT_ARGS,
  render: (args: Args) => show(args, subtract(buildChildren(args))),
};

export const Atop: StoryObj<Args> = {
  name: "Atop",
  args: DEFAULT_ARGS,
  render: (args: Args) =>
    show(args, atop({ blendMode: args.blendMode }, buildChildren(args))),
};

// A luminance mask: the bottle, turned to alpha by its luminance and
// hidden, gives the rect its shape and no paint of its own.
export const LuminanceMask: StoryObj<Args> = {
  name: "Intersect, luminance mask",
  args: DEFAULT_ARGS,
  render: (args: Args) => {
    const cover = buildChildren(args)[1];
    return show(
      args,
      intersect([
        image({
          href: bottlePng,
          x: 0,
          y: 0,
          w: args.w,
          h: args.h,
          filter: Filter.luminanceToAlpha,
        }).hidden(),
        cover,
      ])
    );
  },
};

// `intersect` with paint draws the overlap itself, as one shape: a circle and
// a square cut to the lens they share, filled and stroked.
export const IntersectPainted: StoryObj = {
  name: "Intersect, painted",
  render: () => {
    const container = initializeContainer();
    container.innerHTML = "";
    intersect({ fill: "#D1E4F6", stroke: "#467DA8", strokeWidth: 2 }, [
      circle({ cx: 90, cy: 90, r: 70 }),
      rect({ x: 80, y: 30, w: 120, h: 120 }),
    ]).render(container, { w: 220, h: 180 });
    return container;
  },
};

// An image has no outline, so a painted `intersect` fills its overlap
// through the operands' alpha: the bottle's ink, cut by the rect, in one
// color. A stroke here would be an error.
export const IntersectImageFill: StoryObj = {
  name: "Intersect, image filled",
  render: () => {
    const container = initializeContainer();
    container.innerHTML = "";
    intersect({ fill: "#467DA8" }, [
      image({ href: bottlePng, x: 0, y: 0, w: 193, h: 678 }),
      rect({ x: 0, y: 339, w: 193, h: 339 }),
    ]).render(container, { w: 193, h: 678 });
    return container;
  },
};

// A composite under a partition, its operands at literal positions: each
// cell draws its own copy, centered in that cell, as a layer would be.
export const IntersectInCells: StoryObj = {
  name: "Intersect in partition cells",
  render: () => {
    const container = initializeContainer();
    container.innerHTML = "";
    chart([{ v: 5 }, { v: 15 }, { v: 25 }], { w: 480, h: 120 })
      .flow(partition({ by: field("v").bin(Bin.step(10)), dir: "x" }))
      .mark(
        intersect([
          rect({ x: 0, y: 0, w: 90, h: 40, fill: "#467DA8" }),
          rect({ x: 30, y: 20, w: 90, h: 40, fill: "#D1E4F6" }),
        ])
      )
      .render(container);
    return container;
  },
};

// Each operation over the same circle and square, with no fill (each operand
// draws its own paint where the result keeps it) and with a fill (the result
// is one new shape).
const disk = () => circle({ cx: 90, cy: 90, r: 70, fill: "#467DA8" });
const square = () => rect({ x: 80, y: 30, w: 120, h: 120, fill: "#E8A23B" });
const pair = (): [MarkChild, MarkChild] => [disk(), square()];
const FILL = { fill: "#D1E4F6" };

const showPair = (mark: {
  render(c: HTMLElement, o: { w: number; h: number }): unknown;
}) => {
  const container = initializeContainer();
  container.innerHTML = "";
  mark.render(container, { w: 220, h: 180 });
  return container;
};

export const UnionShapes: StoryObj = {
  name: "Union, shapes",
  render: () => showPair(union(pair())),
};

export const UnionFilled: StoryObj = {
  name: "Union, filled",
  render: () => showPair(union(FILL, pair())),
};

export const IntersectShapes: StoryObj = {
  name: "Intersect, shapes",
  render: () => showPair(intersect(pair())),
};

export const SubtractShapes: StoryObj = {
  name: "Subtract, shapes",
  render: () => showPair(subtract(pair())),
};

export const SubtractFilled: StoryObj = {
  name: "Subtract, filled",
  render: () => showPair(subtract(FILL, pair())),
};

export const ExcludeShapes: StoryObj = {
  name: "Exclude, shapes",
  render: () => showPair(exclude(pair())),
};

export const ExcludeFilled: StoryObj = {
  name: "Exclude, filled",
  render: () => showPair(exclude(FILL, pair())),
};

export const AtopShapes: StoryObj = {
  name: "Atop, shapes",
  render: () => showPair(atop(pair())),
};

// A hidden operand gives its shape and no paint: the square, clipped to the
// circle, with the circle itself not drawn.
export const HiddenMask: StoryObj = {
  name: "Intersect, hidden operand",
  render: () => showPair(intersect([disk().hidden(), square()])),
};
