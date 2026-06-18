import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, spread, rect, image, text, blank, Constraint, layer, paint, v } from "../../src/lib";
import bottlePng from "../assets/wilsonblanco.png";

const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];


const meta: Meta = {
  title: "Piccl/Bottle",
};
export default meta;

export const Default: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bottle Fill Chart",
      description: "A row of wine bottles filled with green liquid to heights that encode percentage values, an isotype-style bar chart with labeled fill lines.",
    },
  },
  render: () => {
    const container = initializeContainer();

    Chart(data, {axes: false})
      .flow(spread({ by: "category", dir: "x", spacing: 20, axes: {x: false} }))
      .mark(layer(
        [
          paint({blendMode: "color"}, [
          image({ href: bottlePng, h: v(100) }),
          rect({h: "amount", w: 175, fill: "#00ff00"}),
        ]).name("bottle"),
        rect({h: 1, fill: "#666", w: 175, y: "amount"}).name("line"),
        text({fontSize: 35, fill: "#666", text: (d) => `${d.amount}%`}).name("label")
      ]).constrain(({line, label, bottle}) => [
        Constraint.align({ x: "start" }, [bottle, line]),
        Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
        Constraint.align({ x: "end" }, [label, line]),
      ]))
      .render(container, {});

    return container;
  },
};
