import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { elmTuple } from "./elmTuple";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Elm Tuple",
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

export const ElmTuple: StoryObj<Args> = {
  args: { w: 120, h: 100 },
  render: (args: Args) => {
    const container = initializeContainer();
    elmTuple({ tupleIndex: "0", tupleData: "12" }).render(container, {
      w: args.w,
      h: args.h,
    });
    return container;
  },
};
