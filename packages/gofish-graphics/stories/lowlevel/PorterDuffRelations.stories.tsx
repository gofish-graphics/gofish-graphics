import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import bottlePng from "../assets/wilsonblanco.png";
import {
  Bin,
  chart,
  circle,
  field,
  paint,
  image,
  intersect,
  mask as maskOp,
  partition,
  subtract,
  rect,
  exclude,
  type MarkChild,
} from "../../src/lib";
// `over` is internal (conceptually `layer`, #196) — imported from source for
// the low-level Union demo only; it is not part of the public lib surface.
import { over } from "../../src/ast/marks/chart";

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

const buildChildren = (args: Args): [MarkChild, MarkChild] => {
  const splitY = args.h - args.h * (args.splitY / 100);
  const splitH = args.h * (args.splitY / 100);
  return [
    image({ href: bottlePng, x: 0, y: 0, w: args.w, h: args.h }),
    rect({ x: 0, y: splitY, w: args.w, h: splitH, fill: args.bgColor }),
  ];
};

const renderComposite = (
  args: Args,
  relation: typeof intersect
) => {
  const container = initializeContainer();
  container.innerHTML = "";
  relation({ blendMode: args.blendMode }, buildChildren(args)).render(container, {
    w: args.w,
    h: args.h,
  });
  return container;
};

const renderMask = (args: Args) => {
  const container = initializeContainer();
  container.innerHTML = "";
  maskOp(buildChildren(args)).render(container, {
    w: args.w,
    h: args.h,
  });
  return container;
};

export const Union: StoryObj<Args> = {
  name: "Union (Over)",
  args: DEFAULT_ARGS,
  render: (args: Args) => renderComposite(args, over),
};

export const Intersect: StoryObj<Args> = {
  name: "Intersect (in)",
  args: DEFAULT_ARGS,
  render: (args: Args) => renderComposite(args, intersect),
};

export const Exclude: StoryObj<Args> = {
  name: "Exclude (Xor)",
  args: DEFAULT_ARGS,
  render: (args: Args) => renderComposite(args, exclude),
};

export const Subtract: StoryObj<Args> = {
  name: "Subtract (out)",
  args: DEFAULT_ARGS,
  render: (args: Args) => renderComposite(args, subtract),
};

export const Paint: StoryObj<Args> = {
  name: "Paint (Atop)",
  args: DEFAULT_ARGS,
  render: (args: Args) => renderComposite(args, paint),
};

export const mask: StoryObj<Args> = {
  name: "Mask (none)",
  args: DEFAULT_ARGS,
  render: (args: Args) => renderMask(args),
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

// An image has no outline, so a painted `intersect` fills its overlap with a
// mask: the bottle's ink, cut by the rect, in one color. A stroke here would
// be an error.
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
