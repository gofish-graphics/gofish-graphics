import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";

import { chart, circle, gradient, scatter } from "../../src/lib";

/**
 * Equal-aspect coupling (#582). `aspectRatio` couples the x and y data→pixel
 * scales so one data unit measures the same on both axes — "1 unit on x = 1
 * unit on y". Without it, each axis scales to its own dimension, so a circle in
 * data space renders as an ellipse and a spiral shears. With it, the binding
 * axis fills its dimension and the other centers in the slack.
 *
 * The demo is a phyllotaxis ("sunflower") spiral: seed `i` sits at angle
 * `i · 137.5°` (the golden angle) and radius `√i`, the packing real sunflowers
 * use. Its geometry only reads correctly when x and y share a scale.
 */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°

const sunflower = Array.from({ length: 500 }, (_, i) => {
  const r = Math.sqrt(i);
  const theta = i * GOLDEN_ANGLE;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), i };
});

const meta: Meta = {
  title: "Forward Syntax V3/Equal Aspect",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 200, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Sunflower: StoryObj<Args> = {
  args: { w: 640, h: 380 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Sunflower (Equal Aspect)",
      description:
        "A phyllotaxis spiral of 500 seeds placed by the golden angle, drawn with equal-aspect coupling so one data unit spans the same pixels on both axes and the packing stays perfectly circular in a wide canvas.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(sunflower, {
      aspectRatio: "square",
      color: gradient(["#fde725", "#21918c", "#440154"]),
    })
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 4, fill: "i" }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

/** The same spiral without coupling — each axis scales independently, so the
 *  circular packing shears into an ellipse. */
export const Uncoupled: StoryObj<Args> = {
  args: { w: 640, h: 380 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(sunflower, { color: gradient(["#fde725", "#21918c", "#440154"]) })
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 4, fill: "i" }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
