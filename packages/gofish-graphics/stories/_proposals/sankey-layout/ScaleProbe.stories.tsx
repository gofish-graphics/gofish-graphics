import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect, fr } from "../../../src/lib";

const meta: Meta = { title: "Proposals/Sankey Layout/Scale Probe" };
export default meta;

// Does the shared y scale of sibling columns do d3-sankey's ky? Column A: 2
// nodes of 50. Column B: 10 nodes of 10. Both total 100. With 20 px gaps in a
// 300 px tall chart, d3 picks ky = min((300 - 1*20)/100, (300 - 9*20)/100) =
// 1.2: column B is 300 px tall (120 px of value + 180 px of gaps) and column A
// is 140 px tall (120 + 20).
const rows = [
  ...["a1", "a2"].map((node) => ({ col: "A", node, v: 50 })),
  ...Array.from({ length: 10 }, (_, i) => ({ col: "B", node: `b${i}`, v: 10 })),
];

const probe = (spacing: any) => () => {
  const container = initializeContainer();
  chart(rows)
    .flow(
      spread({ by: "col", dir: "x", spacing: 40, alignment: "start" }),
      spread({ by: "node", dir: "y", spacing })
    )
    .mark(rect({ w: 30, h: "v", fill: "col" }))
    .render(container, { w: 200, h: 300, axes: false } as any);
  return container;
};

export const FixedGaps: StoryObj = { render: probe(20) };

// d3 then spreads each column's slack evenly into its gaps (and margins).
// `fr` gaps are the flexible part: does each column fill 300 px at ky = 1.2?
export const FlexibleGaps: StoryObj = { render: probe(fr(1)) };
