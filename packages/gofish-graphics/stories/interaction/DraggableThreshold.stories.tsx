/**
 * Draggable threshold — BOTH regimes in one story.
 *
 * `cut` is a gofish `signal()` (data-space count value). It is read in TWO
 * places:
 *   - the threshold rule's `y` position, an ordinary (non-live) accessor
 *     evaluated during resolve → `cut` becomes a pipeline dependency, so every
 *     drag frame re-runs resolve → layout → paint (regime 2);
 *   - the bars' `fill`, inside `live()` → a paint-time patch (regime 0).
 *
 * A `drag()` input drives `cut`: the drag→data conversion (`currentData()`)
 * uses the chart's recorded frame scales, so dragging maps pixels back to
 * count units. The wiring runs in ordinary Solid code (a `createEffect` in a
 * root), which is fine — signals live outside the layout pipeline.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { createRoot, createEffect } from "solid-js";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  rect,
  live,
  signal,
  drag,
  sumBy,
} from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Draggable Threshold",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const data = [
  { cat: "a", count: 30 },
  { cat: "b", count: 95 },
  { cat: "c", count: 55 },
  { cat: "d", count: 72 },
  { cat: "e", count: 40 },
  { cat: "f", count: 88 },
];

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 360 },
  render: (args: Args) => {
    const container = initializeContainer();

    // Initial threshold in data (count) units.
    const cut = signal(60);
    const dr = drag();

    // Convert drag position → count units and write `cut`. Runs in ordinary
    // Solid code (outside the layout pipeline). `dr` attaches to the runtime
    // via the live read in the bar fill below, so `currentData()` can use the
    // recorded frame scales.
    createRoot(() => {
      createEffect(() => {
        const c = dr.currentData();
        if (c?.y != null) cut.set(c.y);
      });
    });

    chart(data, { axes: true })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(
        rect({
          h: "count",
          // regime 0: fill patches at paint time. Reading dr here also attaches
          // the drag input to this chart's runtime (so currentData() works).
          // The stamped datum is the spread group (one row per cat), so sum the
          // count to get this bar's value.
          fill: live((d) => {
            dr.active();
            const total = sumBy(d as { count: number }[], "count");
            return total > cut() ? "#d62728" : "#6b9bd1";
          }),
        })
      )
      // The threshold rule: an ordinary rect whose y reads cut() during resolve
      // (regime 2 → full re-run per drag frame). y is a data-space count value,
      // so it aligns with the bars' count scale; w spans the plot in pixels.
      .layer(
        chart([{}] as never).mark(
          rect({
            y: () => cut(),
            h: 3,
            w: args.w,
            fill: "#333",
          })
        )
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
