import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  scatter,
  circle,
  text,
  spread,
  layer,
  resolve,
  selectAll,
  stack,
  rect,
} from "../../src/lib";
import { seafood } from "../../src/data/catch";

const meta: Meta = {
  title: "Forward Syntax/LabeledChart",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// Labeling from a separate table. Nodes are drawn and named "nodes"; a label
// layer drives off the `labels` table, `resolve`s each label's `ref` id into
// the drawn node, and the function-mark composes that anchor with a fresh
// `text` via the `spread` combinator — one label anchored beside each node.
const nodes = [
  { id: "a", grp: 0 },
  { id: "b", grp: 1 },
  { id: "c", grp: 2 },
];

const labels = [
  { ref: "a", label: "Alpha" },
  { ref: "b", label: "Bravo" },
  { ref: "c", label: "Charlie" },
];

export const Basic: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(nodes, { axes: false, w: args.w, h: args.h })
      .flow(scatter({ by: "id", x: "grp", y: "grp" }))
      .mark(circle({ r: 16, fill: "#59a14f" }).name("nodes"))
      .layer(
        chart(labels)
          .flow(resolve(["ref"], { from: selectAll("nodes") }))
          .mark((rows: any[]) =>
            layer(
              rows.map((r) =>
                spread({ dir: "x", spacing: 6 }, [
                  r.ref,
                  text({ text: r.label }),
                ])
              )
            )
          )
      )
      .render(container);

    return container;
  },
};

// A callout on one group: the outer spread is named, so `selectAll("lakes")`
// yields one ref per lake (its `datum` is that lake's rows), and the
// annotation table joins its row to the lake it names through `resolve`.
const callouts = [{ ref: "Lake B", note: "most fish" }];

export const GroupCallout: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { w: args.w, h: args.h })
      .flow(
        spread({ by: "lake", dir: "x" }).name("lakes"),
        stack({ by: "species", dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .layer(
        chart(callouts)
          .flow(resolve(["ref"], { from: selectAll("lakes") }))
          .mark((rows: any[]) =>
            layer(
              rows.map((r) =>
                spread({ dir: "y", spacing: 4, alignment: "middle" }, [
                  text({ text: r.note }),
                  r.ref,
                ])
              )
            )
          )
      )
      .render(container);

    return container;
  },
};
