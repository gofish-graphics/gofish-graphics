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
  live,
} from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import { box, beside, rowOf, BARS } from "./helpers";
import { snap } from "./focusRuntime";
import { sideOf } from "./StackedBar.stories";

// The lowercase exports are builders and mounts, not stories.
const meta: Meta = { title: "Proposals/Tooltips/Chart In Tooltip", excludeStories: /^[a-z]/ };
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
            ),
            // The box is wide, so the last three lakes open it to the left.
            { side: sideOf(rows[0].lake, 3) }
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

/** Live: hover a lake's stack. Shared by the Interactive story and the
 *  proposal page's demo bundle (proposals/tooltips/demo). */
export function mountInteractive(container: HTMLElement) {
  const { focus: lake, ping } = snap(container, {
    selector: BARS,
    count: seafood.length,
    // A stack's position is its `spread` slot in x; in y it only has a height.
    position: ["x"],
    key: (r) => r?.lake,
  });
  return chartInTooltip(
    lake,
    live((d: any) => {
      ping();
      const l = lake();
      return l === undefined || rowOf<any>(d)?.lake === l ? 1 : 0.55;
    })
  ).render(container);
}

export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractive(container);
    return container;
  },
};
