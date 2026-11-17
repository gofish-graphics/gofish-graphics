import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { unemployment } from "../../src/data/unemployment";
import { chart, stack, ribbon, Baseline, Unit } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Streamgraph",
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

// The six industries with the most unemployment over the decade, one for
// each color of the default palette.
const largest = [
  "Wholesale and Retail Trade",
  "Manufacturing",
  "Leisure and hospitality",
  "Business services",
  "Construction",
  "Education and Health",
];

export const Default: StoryObj<Args> = {
  args: { w: 560, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Streamgraph",
      description:
        "Unemployment in the six largest US industries from 2000 to 2010 as a streamgraph, the bands stacked about a baseline that moves to keep them as flat as it can.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const rows = unemployment.filter((d) => largest.includes(d.series));

    chart(rows, {
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
      axes: { x: { title: false } },
      legend: { y: { title: "unemployed (thousands)" } },
    })
      .flow(stack({ by: "series", dir: "y", baseline: Baseline.wiggle() }))
      .mark(ribbon({ x: "date", h: "count", fill: "series" }))
      .render(container);

    return container;
  },
};
