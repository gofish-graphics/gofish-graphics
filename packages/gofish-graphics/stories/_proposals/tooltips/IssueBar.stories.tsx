/**
 * PROTOTYPE(#1395): the issue's screenshot, "Top 15 path types", with the
 * default tooltip (every field of the row) on the top bar.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  rect,
  selectAll,
  filter,
  group,
  live,
  pointer,
} from "../../../src/lib";
import { pathTypes } from "./data";
import {
  rowTooltip,
  beside,
  percent1,
  thousands,
  focusFrom,
  hitRow,
  noPointer,
} from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Issue Bar Chart" };
export default meta;

const format = { n: thousands, n_articles: thousands, share: percent1 };

/** The chart, with a tooltip on the bar whose `path` is `focus()`. `fill`
 *  is the bars' fill, a `live()` highlight in the interactive story. */
export function issueBar(
  focus: () => string | undefined,
  fill: any = "#4c78a8"
) {
  return chart(pathTypes, {
    w: 520,
    h: 400,
    axes: { x: { title: "share of paths" }, y: { title: false } },
  })
    .flow(spread({ by: "path", dir: "y", spacing: 4 }))
    .mark(rect({ w: "share", fill }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(
          filter((bar: any) => bar.datum[0].path === focus()),
          group({ by: "path" })
        )
        .mark(((bar: any[]) =>
          beside(
            bar[0],
            rowTooltip(bar[0].datum[0], { format }),
            // The longest bars have no room on their right inside the plot,
            // so their box hangs under the bar's end instead (chosen from
            // the datum, see NOTES.md "keep inside").
            bar[0].datum[0].share > 0.09
              ? { side: "bottom", align: "end", gap: 4 }
              : { side: "right" }
          )) as any)
    );
}

/** Static capture: the tooltip open on the top bar. */
export const Pinned: StoryObj = {
  render: () => {
    const container = initializeContainer();
    issueBar(() => "VO→VO").render(container);
    return container;
  },
};

/** No bar focused: the baseline for "does the tooltip move the chart?". */
export const Closed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    issueBar(() => undefined).render(container);
    return container;
  },
};

/** Live: hover a bar. The pointer is read in the bars' `live()` fill (paint
 *  only, which also registers it), and mapped to a focus key outside the
 *  spec; the spec reads only the key. */
export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    noPointer(container);
    const p = pointer();
    const focus = focusFrom(() => hitRow<any>(p)?.path);
    issueBar(
      focus,
      live((d: any) => (d?.path === hitRow<any>(p)?.path ? "#2f5d8a" : "#4c78a8"))
    ).render(container);
    return container;
  },
};
