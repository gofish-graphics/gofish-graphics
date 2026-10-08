import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, type CatchData } from "../../src/data/catch";
import { chart, circle, pack } from "../../src/lib";

// Nested circle packing: one pack per lake, and the lakes packed together.
//
// Not gallery-tagged: `pack` keeps its children at their pixel size and does
// not yet fit itself to the canvas (#967), so these are operator tests rather
// than finished visualizations.
const meta: Meta = {
  title: "Forward Syntax/Pack",
};
export default meta;

// One circle per catch record, all the same size, colored by species.
export const Nested: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(seafood)
      .flow(pack({ by: "lake" }), pack())
      .mark(circle({ r: 12, fill: "species" }))
      .render(container, { w: 420, h: 420 });

    return container;
  },
};

// Circle area proportional to the catch count. The radius is computed in
// pixels, because `pack` cannot yet scale a data-driven size (#967).
export const NestedByCount: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(seafood)
      .flow(pack({ by: "lake" }), pack())
      .mark((d: CatchData) =>
        circle({ r: 3 * Math.sqrt(d.count), fill: "species" })(d)
      )
      .render(container, { w: 420, h: 420 });

    return container;
  },
};
