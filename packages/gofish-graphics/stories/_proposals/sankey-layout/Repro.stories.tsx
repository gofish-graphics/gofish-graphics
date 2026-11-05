import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect, text, layer, group, selectAll, project } from "../../../src/lib";

const meta: Meta = { title: "Proposals/Sankey Layout/Repro" };
export default meta;

// Bug: adding a label layer that reads the bars through selectAll flips what
// `alignment: "start"` means on y. Without the label layer the short column
// sits at the top; with it, at the bottom.
const rows = [
  { col: "A", node: "a1", v: 50 },
  { col: "B", node: "b1", v: 50 },
  { col: "B", node: "b2", v: 50 },
];

const bars = () =>
  chart(rows)
    .flow(
      spread({ by: "col", dir: "x", spacing: 40, alignment: "start", axes: false }),
      spread({ by: "node", dir: "y", spacing: 10, axes: false })
    )
    .mark(rect({ w: 30, h: "v" }).name("bars"));

export const AlignStartNoLabels: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([bars()]).render(container, { w: 200, h: 200, axes: false, legend: false } as any);
    return container;
  },
};

export const AlignStartWithLabels: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      bars(),
      chart(selectAll("bars"))
        .flow(group({ by: "node" }))
        .mark((refs: any[]) =>
          spread({ dir: "x", spacing: 3, alignment: "middle" }, [
            refs[0],
            text({ text: String(project(refs[0], "node")) }),
          ])
        ),
    ]).render(container, { w: 200, h: 200, axes: false, legend: false } as any);
    return container;
  },
};
