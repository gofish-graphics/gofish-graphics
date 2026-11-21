/**
 * PROTOTYPE(#1395): a chart inside a tooltip (Tableau's "viz in tooltip").
 * Hovering a lake's stack opens a box holding a small bar chart of that
 * lake's species. The content is an ordinary `chart(...)`, a child of the
 * box like the text table was; nothing else changes.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  rect,
  text,
  selectAll,
  filter,
  group,
  enclose,
  pointer,
  live,
} from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import { box, beside, focusFrom, hitRow, noPointer } from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Chart In Tooltip" };
export default meta;

export function chartInTooltip(focus: () => string | undefined, opacity: any = 1) {
  return chart(seafood, { w: 420, h: 320 })
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ h: "count", fill: "species", opacity }).name("segments"))
    .layer(
      chart(selectAll("segments"))
        .flow(filter((s: any) => s.datum[0].lake === focus()), group({ by: "lake" }))
        .mark(((s: any[]) => {
          const rows = s.map((r) => r.datum[0]);
          const anchor = Promise.resolve(
            enclose({ padding: 2, fill: "none", stroke: "#111827", strokeWidth: 1.5 } as any, s)
          ).then((n: any) => n.zOrder(1));
          return beside(
            anchor,
            box(
              spread({ dir: "y", spacing: 6, alignment: "start" }, [
                text({ text: rows[0].lake, fontSize: 12, fontWeight: 700, fill: "#111827" }),
                // The chart in the tooltip: the lake's rows, one bar per
                // species, sized and colored like any chart.
                chart(
                  rows.map((r) => ({ species: r.species, n: r.count })),
                  { w: 200, h: 70, axes: { x: { title: false } } }
                )
                  .flow(spread({ by: "species", dir: "x", spacing: 6 }))
                  .mark(rect({ h: "n", fill: "species" }).label("n")),
              ])
            )
          );
        }) as any)
    );
}

export const Pinned: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chartInTooltip(() => "Lake B").render(container);
    return container;
  },
};

export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    noPointer(container);
    const p = pointer();
    const lake = focusFrom(() => hitRow<any>(p)?.lake);
    chartInTooltip(
      lake,
      live((d: any) => {
        const l = hitRow<any>(p)?.lake;
        return l === undefined || d?.lake === l ? 1 : 0.55;
      })
    ).render(container);
    return container;
  },
};
