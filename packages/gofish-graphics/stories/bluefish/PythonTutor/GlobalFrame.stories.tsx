import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { globalFrame } from "./globalFrame";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Global Frame",
};
export default meta;

export const GlobalFrame: StoryObj = {
  render: (_args = {}) => {
    const container = initializeContainer();
    globalFrame({
      stack: [
        { variable: "c", value: "0" },
        { variable: "d", value: "0" },
        { variable: "x", value: "5" },
      ],
    }).render(container, {});
    return container;
  },
};
