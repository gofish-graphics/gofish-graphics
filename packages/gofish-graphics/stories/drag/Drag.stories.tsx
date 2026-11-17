/**
 * Drag prototypes on a GoFish-native drag engine (./engine.ts) that
 * reproduces the core ideas of Dragology ("Declarative Dragging"): the
 * states a drag can reach are derived from the spec's data and laid out by
 * GoFish, and a drag blends between those layouts. Prototype quality.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { demos } from "./demos";

const meta: Meta = {
  title: "Drag",
  argTypes: { debug: { control: "boolean" } },
};
export default meta;

type Args = { debug: boolean };

const story = (name: string): StoryObj<Args> => ({
  args: { debug: false },
  render: (args: Args) => {
    const container = initializeContainer();
    demos[name](container, { debug: args.debug });
    return container;
  },
});

export const ReorderBars = { ...story("reorder-bars"), name: "Reorder Bars" };
export const MoveSegment = { ...story("move-segment"), name: "Move Segment" };
export const Scheduler = { ...story("scheduler"), name: "Scheduler" };
export const TreemapReparent = {
  ...story("treemap-reparent"),
  name: "Treemap Reparent",
};
