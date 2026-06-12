import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { heapObject } from "./heapObject";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Heap Object",
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

export const HeapObject: StoryObj<Args> = {
  args: { w: 400, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    heapObject({
      objectType: "tuple",
      objectValues: [
        { type: "string", value: "12" },
        { type: "string", value: "1" },
        { type: "string", value: "0" },
      ],
    }).render(container, { w: args.w, h: args.h });
    return container;
  },
};
