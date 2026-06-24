import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  testSingleBoxWhisker,
  testPairBoxWhisker,
  testBoxWhiskerPlot,
} from "../../src/tests/boxwhisker";

const meta: Meta = {
  title: "Low Level Syntax/Whisker",
};
export default meta;

type Args = { w: number; h: number };

export const SingleBoxWhisker: StoryObj<Args> = {
  render: (args: Args) => {
    const container = initializeContainer();

    testSingleBoxWhisker().render(container, {
      axes: true,
    });

    return container;
  },
};

export const PairBoxWhisker: StoryObj<Args> = {
  render: (args: Args) => {
    const container = initializeContainer();

    testPairBoxWhisker().render(container, {
      axes: true,
    });

    return container;
  },
};

export const BoxWhisker: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Grouped Box-and-Whisker Plot",
      description:
        "Paired distributions across five categories shown as grouped box-and-whisker plots, with male and female boxes side by side over a labeled value axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    testBoxWhiskerPlot().render(container, {
      axes: true,
    });

    return container;
  },
};
