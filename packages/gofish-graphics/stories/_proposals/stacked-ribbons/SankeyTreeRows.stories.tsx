import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { titanic } from "../../../src/data/titanic";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  selectAll,
  group,
  layer,
  field,
  filter,
  Curve,
  project,
} from "../../../src/lib";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Sankey Tree Rows" };
export default meta;

// Approach B for the sankey tree. A tree's root-to-leaf paths ARE the titanic
// rows, so each row is one path and unpivots into one END per depth. Every
// end carries the node keys of its ancestors (`class`, `sub`) so the flow can
// nest the spacing like the hand-built story: classes far apart, sexes inside
// a class closer, survived inside a sex closest.
export function unpivotTreeEnds(rows: typeof titanic) {
  return rows.flatMap((r, path) => [
    { ...r, path, depth: 0, sub: "", leaf: "", value: r.count },
    { ...r, path, depth: 1, sub: r.sex, leaf: "", value: r.count },
    { ...r, path, depth: 2, sub: r.sex, leaf: r.survived, value: r.count },
  ]);
}
// Sort key for the ends inside a node: the path's remaining categories, so
// ribbons leave a node in the same order as the children they enter.
const ends = unpivotTreeEnds(titanic).map((e) => ({
  ...e,
  rank: `${e.sex}|${e.survived}`,
}));

const nodes = () =>
  chart(ends)
    .flow(
      spread({ by: "depth", dir: "x", spacing: 64, alignment: "middle" }),
      spread({ by: "class", dir: "y", spacing: 8, alignment: "middle" }),
      spread({ by: field("sub").sort(), dir: "y", spacing: 4, alignment: "middle", axes: false }),
      spread({ by: field("leaf").sort(), dir: "y", spacing: 2, alignment: "middle", axes: false }),
      spread({ by: field("rank").sort(), dir: "y", spacing: 0, axes: false })
    )
    .mark(rect({ w: 40, h: "value", fill: "class" }).name("ends"));

// One ribbon per path, threading all three depths.
export const Default: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      nodes(),
      chart(selectAll("ends"))
        .flow(group({ by: "path" }))
        .mark(
          ribbon({
            opacity: 0.6,
            fill: "class",
            curve: Curve.bezier(),
          })
        ),
    ]).render(container, { w: 360, h: 500 });
    return container;
  },
};

// Per-segment ribbons (so each tier can be styled on its own): one ribbon
// layer per pair of adjacent depths, each grouped by path.
export const PerSegment: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      nodes(),
      chart(selectAll("ends"))
        .flow(
          filter((r: any) => (project(r, "depth") as number) <= 1),
          group({ by: "path" })
        )
        .mark(ribbon({ opacity: 0.6, fill: "class", curve: Curve.bezier() })),
      chart(selectAll("ends"))
        .flow(
          filter((r: any) => (project(r, "depth") as number) >= 1),
          group({ by: "path" })
        )
        .mark(ribbon({ opacity: 0.6, fill: "survived", curve: Curve.bezier() })),
    ]).render(container, { w: 360, h: 500 });
    return container;
  },
};
