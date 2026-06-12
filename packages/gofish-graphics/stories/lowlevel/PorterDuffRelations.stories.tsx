import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import bottlePng from "../assets/wilsonblanco.png";
import { paint, image, Intersect as IntersectOp, Mask as MaskOp, subtract, rect, exclude } from "../../src/lib";
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

const buildChildren = (args: Args) => {
  const splitY = args.h - args.h * (args.splitY / 100);
  const splitH = args.h * (args.splitY / 100);
  return [
    image({ href: bottlePng, x: 0, y: 0, w: args.w, h: args.h }),
    rect({ x: 0, y: splitY, w: args.w, h: splitH, fill: args.bgColor }),
  ];
};

const renderComposite = (
  args: Args,
  relation: (options: { blendMode?: Args["blendMode"] }, children: ReturnType<typeof buildChildren>) => any
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
  MaskOp(buildChildren(args)).render(container, {
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
  render: (args: Args) => renderComposite(args, IntersectOp),
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
