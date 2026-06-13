import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { For, stack, spread, ellipse, layer, text, ref, arrow } from "../../src/lib";

const meta: Meta = {
  title: "Bluefish/Planets",
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

const planets = [
  { name: "Mercury", radius: 15, color: "#EBE3CF" },
  { name: "Venus", radius: 36, color: "#DC933C" },
  { name: "Earth", radius: 38, color: "#179DD7" },
  { name: "Mars", radius: 21, color: "#F1CF8E" },
];

export const PlanetsOnly: StoryObj<Args> = {
  args: { w: 800, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Inner Planets to Scale",
      description:
        "The four inner planets rendered as colored circles sized by their relative radii and spread in a row.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    spread({ dir: "x", spacing: 50, alignment: "middle" },
      For(planets, (planet) =>
        ellipse({
          w: planet.radius * 2,
          h: planet.radius * 2,
          fill: planet.color,
          stroke: "#333",
          strokeWidth: 3,
        })
      )
    ).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const PlanetsWithLabelAbove: StoryObj<Args> = {
  args: { w: 800, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      spread({ dir: "x", spacing: 50, alignment: "middle" },
        For(planets, (planet) =>
          ellipse({
            w: planet.radius * 2,
            h: planet.radius * 2,
            fill: planet.color,
            stroke: "#333",
            strokeWidth: 3,
          }).name(planet.name)
        )
      ),
      spread({ dir: "y", spacing: 60, alignment: "middle" }, [
        ref("Mercury"),
        text({ text: "Mercury" }),
      ]),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const PlanetsWithLabelBelow: StoryObj<Args> = {
  args: { w: 800, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      spread({ dir: "x", spacing: 50, alignment: "middle" },
        For(planets, (planet) =>
          ellipse({
            w: planet.radius * 2,
            h: planet.radius * 2,
            fill: planet.color,
            stroke: "#333",
            strokeWidth: 3,
          }).name(planet.name)
        )
      ),
      spread({ dir: "y", spacing: 60, alignment: "middle" }, [
        text({ text: "Mercury" }),
        ref("Mercury"),
      ]),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const PlanetsWithLabelAboveNoSpacing: StoryObj<Args> = {
  args: { w: 800, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      spread({ dir: "x", spacing: 50, alignment: "middle" },
        For(planets, (planet) =>
          ellipse({
            w: planet.radius * 2,
            h: planet.radius * 2,
            fill: planet.color,
            stroke: "#333",
            strokeWidth: 3,
          }).name(planet.name)
        )
      ),
      spread({ dir: "y", spacing: 0, alignment: "middle" }, [
        ref("Mercury"),
        text({ text: "Mercury", debugBoundingBox: true }),
      ]),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const PlanetsWithLabelBelowNoSpacing: StoryObj<Args> = {
  args: { w: 800, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      spread({ dir: "x", spacing: 50, alignment: "middle" },
        For(planets, (planet) =>
          ellipse({
            w: planet.radius * 2,
            h: planet.radius * 2,
            fill: planet.color,
            stroke: "#333",
            strokeWidth: 3,
          }).name(planet.name)
        )
      ),
      spread({ dir: "y", spacing: 0, alignment: "middle" }, [
        text({ text: "Mercury", debugBoundingBox: true }),
        ref("Mercury"),
      ]),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const PlanetsWithArrow: StoryObj<Args> = {
  args: { w: 800, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Annotated Planets",
      description:
        "The inner planets drawn as scaled circles with a labeled callout arrow pointing to one of them.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      spread({ dir: "x", spacing: 50, alignment: "middle" },
        For(planets, (planet) =>
          ellipse({
            w: planet.radius * 2,
            h: planet.radius * 2,
            fill: planet.color,
            stroke: "#333",
            strokeWidth: 3,
          }).name(planet.name)
        )
      ),
      spread({ dir: "y", spacing: 60, alignment: "middle" }, [
        text({ text: "Mercury" }).name("label"),
        ref("Mercury"),
      ]),
      arrow({}, [ref("label"), ref("Mercury")]),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};
