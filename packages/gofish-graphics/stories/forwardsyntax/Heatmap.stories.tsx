import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, table, rect, gradient } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Heatmap",
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

// Activity heatmap: day × hour → value
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm"];

// Fixed data so the story is reproducible
const rawValues = [
  10, 45, 72, 38, 90, 55, 20, 66, 30,
  25, 60, 85, 42, 77, 33, 58, 14, 80,
  50, 22, 95, 68, 11, 74, 39, 47, 62,
  18, 83, 41, 57, 29, 93, 64, 76, 15,
  70, 35, 52, 88, 23, 46, 81, 67, 44,
];

const heatmapData = days.flatMap((day, di) =>
  hours.map((hour, hi) => ({
    day,
    hour,
    value: rawValues[di * hours.length + hi],
  }))
);

export const Default: StoryObj<Args> = {
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(heatmapData, {
      color: gradient(["#ffffcc", "#fd8d3c", "#bd0026"]),
    })
      .flow(table({ by: { x: "hour", y: "day" },  spacing: 4 }))
      .mark(rect({ fill: "value" }))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};
