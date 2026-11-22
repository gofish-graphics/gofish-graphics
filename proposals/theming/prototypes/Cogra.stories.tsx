import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, rect, Color } from "../../src/lib";
import {
  lines,
  dots,
  solid,
  restyleChrome,
  lAxes,
  drawn,
  thinTicks,
} from "./defs";

const meta: Meta = { title: "Proposals Theming/Cogra" };
export default meta;

const values = [
  { group: "A", value: 42 },
  { group: "B", value: 61 },
  { group: "C", value: 70 },
];

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";

// Proposed:
//   chart(values, { color: Color.palette([Pattern.none(), Pattern.lines(), Pattern.dots()]) })
//     .flow(spread({ by: "group", dir: "x" }))
//     .mark(rect({ h: "value", fill: "group", stroke: "black" }))
export const CograBars: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "8px";
    const defs = [
      solid("p-none", "white"),
      lines("p-lines", { gap: 6, width: 1.1 }),
      dots("p-dots", { gap: 5, r: 0.9 }),
    ];
    await chart(values, {
      w: 240,
      h: 220,
      color: Color.palette({
        A: "url(#p-none)",
        B: "url(#p-lines)",
        C: "url(#p-dots)",
      }),
      legend: false,
    })
      .flow(spread({ by: "group", dir: "x", spacing: 28 }))
      .mark(
        rect({ h: "value", fill: "group", stroke: "black", strokeWidth: 1 })
      )
      .render(container, { defs });
    const [svg] = await drawn(container);
    restyleChrome(svg, { ink: "black", font: SANS });
    thinTicks(svg, 10);
    lAxes(svg, "black");
    return container;
  },
};
