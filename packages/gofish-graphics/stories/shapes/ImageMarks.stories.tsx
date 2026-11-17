import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { image, spread, text } from "../../src/lib";
import bottleJpg from "../assets/bottle.jpg";
import bottlePhotoPng from "../assets/maja7777-glass-bottle-free-2451180_1280.png";
import flowerPng from "../assets/schwarzenarzisse-isolated-2437759_1280.png";

const meta: Meta = {
  title: "Shapes/Image Marks",
  argTypes: {
    w: {
      control: { type: "number", min: 300, max: 1400, step: 10 },
    },
    h: {
      control: { type: "number", min: 120, max: 600, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

const inlineBadgeSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64"><rect width="96" height="64" rx="10" fill="#e0f2fe"/><circle cx="20" cy="32" r="10" fill="#38bdf8"/><rect x="36" y="24" width="44" height="16" rx="5" fill="#0284c7"/></svg>'
)}`;

const labeledImage = (label: string, imageNode: any) =>
  spread({ dir: "y", spacing: 8, alignment: "start" },
    [
      text({ text: label, fontSize: 14, fill: "#1f2937" }),
      imageNode,
    ]
  );

export const SizeResolution: StoryObj<Args> = {
  args: { w: 960, h: 260 },
  render: (args: Args) => {
    const container = initializeContainer();

    container.innerHTML = "";
    spread({ dir: "x", spacing: 36, alignment: "start" }, [
      labeledImage("data URI (intrinsic 96x64)", image({ href: inlineBadgeSvg })),
      labeledImage("asset 1 (w+h 110x110)", image({ href: bottleJpg, w: 110, h: 110 })),
      labeledImage("asset 2 (w+h 160x100)", image({ href: bottlePhotoPng, w: 160, h: 100 })),
      labeledImage("asset 3 (w+h 110x140)", image({ href: flowerPng, w: 110, h: 140 })),
      labeledImage("asset 1 (w only 90)", image({ href: bottleJpg, w: 90 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};
