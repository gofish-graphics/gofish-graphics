import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";

import { chart, circle, scatter, Color, Schema } from "../../src/lib";

/**
 * Shared-measure scale equality (#582). When the x and y channels carry the
 * **same unit of measure**, "1 unit on x" and "1 unit on y" are the same
 * quantity, so GoFish gives them one data→pixel scale — a circle in data space
 * stays a circle, never an ellipse. There is no `aspectRatio` knob: it follows
 * from the units matching (`Schema.unit("plane")` on both columns), the same way
 * `circle({ r })` lowers to a `w`/`h` that share a unit and so can't distort.
 * The binding axis fills its dimension; the other centers in the leftover space.
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
  title: "Forward Syntax/Equal Scale",
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
      title: "Sunflower (Equal Scale)",
      description:
        "A phyllotaxis spiral of 500 seeds placed by the golden angle; declaring x and y in the same unit gives them one shared data→pixel scale, so the packing stays perfectly circular in a wide canvas.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(sunflower, {
      color: Color.gradient(["#fde725", "#21918c", "#440154"]),
      // Same unit on both axes ⇒ one shared scale ⇒ a true circle.
      schema: { x: Schema.unit("plane"), y: Schema.unit("plane") },
    })
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 4, fill: "i" }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

/** The same spiral with the units left off — each axis scales independently,
 *  so the circular packing shears into an ellipse. */
export const Uncoupled: StoryObj<Args> = {
  args: { w: 640, h: 380 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(sunflower, { color: Color.gradient(["#fde725", "#21918c", "#440154"]) })
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 4, fill: "i" }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
