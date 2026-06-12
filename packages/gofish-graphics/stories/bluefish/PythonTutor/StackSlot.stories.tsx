import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { stackSlot } from "./stackSlot";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Stack Slot",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const StackSlot: StoryObj<Args> = {
  args: { w: 200, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    stackSlot({ variable: "x", value: "5" }).render(container, {
      w: args.w,
      h: args.h,
    });
    return container;
  },
};
