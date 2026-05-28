import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { circle } from "../../../src/lib";
import { barChart } from "../../../src/charts/bar";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/Template",
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
// Test data for template-based bar charts
const testData = [
  { category: "A", value: 30, color: "#ff6b6b" },
  { category: "B", value: 80, color: "#4ecdc4" },
  { category: "C", value: 45, color: "#45b7d1" },
  { category: "D", value: 60, color: "#f9ca24" },
  { category: "E", value: 20, color: "#6c5ce7" },
];

export const Vertical: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, { x: "category", y: "value" }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const Horizontal: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "value",
      y: "category",
      orientation: "x",
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const VerticalWithFillColor: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "category",
      y: "value",
      fill: "#4ecdc4",
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const HorizontalWithFillColor: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "value",
      y: "category",
      orientation: "x",
      fill: "#ff6b6b",
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const VerticalWithFillField: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "category",
      y: "value",
      fill: "color",
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const HorizontalWithFillField: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "value",
      y: "category",
      orientation: "x",
      fill: "color",
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const VerticalWithCustomMark: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "category",
      y: "value",
      mark: circle,
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const HorizontalWithCustomMark: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "value",
      y: "category",
      orientation: "x",
      mark: circle,
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const VerticalWithCustomMarkAndFill: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "category",
      y: "value",
      fill: "#45b7d1",
      mark: circle,
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const HorizontalWithCustomMarkAndFill: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    barChart(testData, {
      x: "value",
      y: "category",
      orientation: "x",
      fill: "#f9ca24",
      mark: circle,
    }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};
