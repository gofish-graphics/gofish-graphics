import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { globalFrame } from "./globalFrame";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Global Frame",
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

export const GlobalFrame: StoryObj<Args> = {
  args: { w: 320, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    globalFrame({
      stack: [
        { variable: "c", value: "0" },
        { variable: "d", value: "0" },
        { variable: "x", value: "5" },
      ],
    }).render(container, { w: args.w, h: args.h });
    return container;
  },
};
