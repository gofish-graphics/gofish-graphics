import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, type CatchData } from "../../src/data/catch";
import { chart, circle, pack } from "../../src/lib";

// Nested circle packing: one pack per lake, and the lakes packed together.
//
// Not gallery-tagged: these are operator tests rather than finished
// visualizations. `pack` fits itself to its room only when every radius is
// data and there is no spacing (#967); with pixel radii it keeps their size.
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
      .render(container);

    return container;
  },
};

// Circle area proportional to the catch count, with the radius computed in
// pixels. `DataRadiusFits` below draws the same with a data area.
export const NestedByCount: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(seafood)
      .flow(pack({ by: "lake" }), pack())
      .mark((d: CatchData[]) =>
        circle({ r: 3 * Math.sqrt(d[0].count), fill: "species" })(d)
      )
      .render(container);

    return container;
  },
};

// One circle per catch record, its area proportional to the count, as data:
// every radius comes from data and there is no spacing, so the pack fits
// itself to its room (#967). Drawn at two sizes; at each, the circle around
// the pack spans its box (outlined in gray).
export const DataRadiusFits: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.display = "flex";
    container.style.alignItems = "flex-start";
    container.style.gap = "24px";

    for (const side of [240, 400]) {
      const box = document.createElement("div");
      box.style.width = `${side}px`;
      box.style.height = `${side}px`;
      box.style.outline = "1px solid #ccc";
      container.appendChild(box);

      chart(seafood)
        .flow(pack())
        .mark(circle({ area: "count", fill: "species" }))
        .render(box, { w: side, h: side, legend: false });
    }

    return container;
  },
};
