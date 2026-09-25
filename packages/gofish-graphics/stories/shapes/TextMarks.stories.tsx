import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { coord, ellipse, map, polar, stack, spread, text } from "../../src/lib";

const meta: Meta = {
  title: "Shapes/Text Marks",
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

const fontFamily = "Inter, sans-serif";

const labels = [
  { text: "GoFish", color: "#22577a" },
  { text: "Text", color: "#38a3a5" },
  { text: "Stacky", color: "#57cc99" },
  { text: "Mark", color: "#80ed99" },
];

export const TextStack: StoryObj<Args> = {
  args: { w: 500, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();

    container.innerHTML = "";
    spread({ dir: "y", spacing: 18, alignment: "start" },
      map(labels, (label) =>
        text({
          text: label.text,
          fill: label.color,
          fontSize: 28,
          fontFamily,
          textAnchor: "start",
          debugBoundingBox: true,
        })
      )
    ).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const TextStackMiddleAlignment: StoryObj<Args> = {
  args: { w: 500, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();

    container.innerHTML = "";
    spread({ dir: "y", spacing: 18, alignment: "middle" },
      map(labels, (label) =>
        text({
          text: label.text,
          fill: label.color,
          fontSize: 28,
          fontFamily,
          textAnchor: "start",
          debugBoundingBox: true,
        })
      )
    ).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const TextStackHorizontal: StoryObj<Args> = {
  args: { w: 500, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();

    container.innerHTML = "";
    spread({ dir: "x", spacing: 18, alignment: "start" },
      map(labels, (label) =>
        text({
          text: label.text,
          fill: label.color,
          fontSize: 28,
          fontFamily,
          textAnchor: "start",
          debugBoundingBox: true,
        })
      )
    ).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const TextStackWithEllipse: StoryObj<Args> = {
  args: { w: 500, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();

    container.innerHTML = "";
    spread({ dir: "y", spacing: 60, alignment: "middle" }, [
      ellipse({
        w: 10,
        h: 10,
        fill: "red",
      }),
      text({ text: "Mercury" }),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};

export const PolarText: StoryObj<Args> = {
  args: { w: 320, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();

    container.innerHTML = "";
    const polarTransform = polar();
    const radialPolar = {
      type: polarTransform.type,
      transform: ([r, theta]: [number, number]) => polarTransform.transform([theta, r]),
      domain: [
        { min: 0, max: 120, size: 120 },
        { min: 0, max: Math.PI * 2, size: Math.PI * 2 },
      ],
    };
    coord({ transform: radialPolar }, [
      text({
        text: "Polar Text",
        x: 80,
        y: Math.PI / 4,
        fill: "#ff7f50",
        fontSize: 20,
        fontFamily,
        textAnchor: "middle",
      }),
    ]).render(container, {
      w: args.w,
      h: args.h,
    });

    return container;
  },
};
