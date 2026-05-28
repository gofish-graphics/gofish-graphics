import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, spread, rect, image, text, Constraint, layer, atop, v } from "../../src/lib";
import bottlePng from "../assets/wilsonblanco.png";

const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];


const meta: Meta = {
  title: "Piccl/Bottle",
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

export const Default: StoryObj<Args> = {
  args: { w: 1000, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(data)
      .flow(spread({ by: "category", dir: "x", spacing: 20 }))
      .mark(layer(
        [
          atop({blendMode: "color"}, [
          image({ href: bottlePng, h: v(100) }),
          rect({h: "amount", fill: "#00ff00"}),
        ]).name("bottle"),
        rect({h: 1, fill: "#666", w: 175, y: "amount"}).name("line"),
        text({fontSize: 35, fill: "#666", text: (d) => `${d.amount}%`}).name("label"),
      ]).constrain(({line, label, bottle}) => [
        Constraint.align({ x: "start" }, [bottle, line]),
        Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
        Constraint.align({ x: "end" }, [label, line]),
      ]))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: false, y: true},
      });

    return container;
  },
};
