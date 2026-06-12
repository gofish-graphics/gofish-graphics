import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { heap } from "./heap";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Heap",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1200, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Heap: StoryObj<Args> = {
  args: { w: 800, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    heap({
      heap: [
        { type: "tuple", values: ["12", "1"] },
        { type: "list", values: ["x", "y", "z"] },
        { type: "tuple", values: ["hello", "world"] },
      ],
      heapArrangement: [
        [0, 1],
        [null, 2],
      ],
    }).render(container, { w: args.w, h: args.h });
    return container;
  },
};
