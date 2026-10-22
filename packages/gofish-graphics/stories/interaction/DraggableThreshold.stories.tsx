/**
 * Draggable threshold — BOTH tiers in one story.
 *
 * `cut` is an expression over a `drag()`: the drag's y in data (count) units,
 * clamped to the data's range and 60 before the first drag. It is read in two
 * places, and each read's tier is inferred from its channel:
 *   - the threshold rule's `y`, a position, so a drag re-runs resolve → layout
 *     → paint (the pipeline tier);
 *   - the bars' `fill`, a paint channel whose values are literal colors, so a
 *     drag patches the fill alone (the paint tier).
 *
 * The clamp keeps the rule inside the bars' range: an unclamped threshold
 * dragged past the bars would extend the y domain, so every drag frame would
 * re-derive the very conversions the drag is read through.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, rect, drag, when, field } from "../../src/lib";

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

    const dr = drag();
    const cut = dr.y.clip(0, 95).fillNull(60);

    chart(data)
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(
        rect({
          h: "count",
          // The stamped datum is the spread group (one row per cat), so sum
          // the count to get this bar's value.
          fill: when(field("count").sum().gt(cut))
            .then("#d62728")
            .otherwise("#6b9bd1"),
        })
      )
      // The threshold rule: a bare rect tier whose y is `cut`, a data-space
      // count value, so it aligns with the bars' count scale; w spans the
      // plot in pixels.
      .layer(rect({ y: cut, h: 3, w: args.w, fill: "#333" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
