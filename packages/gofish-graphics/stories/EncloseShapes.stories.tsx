import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "./helper";
import {
  chart,
  circle,
  enclose,
  group,
  layer,
  scatter,
  selectAll,
  spread,
  Shape,
} from "../src/lib";
import { penguins } from "../src/data/penguins";

const meta: Meta = { title: "Enclose/Shapes" };
export default meta;

const beaks = (penguins as any[]).filter(
  (d) => d["Beak Length (mm)"] != null && d["Beak Depth (mm)"] != null
);

// One hull per species: the points are grouped in a second layer, and each
// group gets its own outline.
export const PenguinHulls: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(beaks)
      .flow(scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
      .mark(circle({ r: 3, fill: "Species" }).name("points"))
      .layer(
        chart(selectAll("points"))
          .flow(group({ by: "Species" }))
          .mark(
            enclose({
              shape: Shape.hull(),
              padding: 6,
              fill: "Species",
              opacity: 0.2,
            })
          )
      )
      .render(container, { w: 420, h: 320 });
    return container;
  },
};

// Munkres' three points: a set that holds a and c but not b. The spine
// routes under b, keeping 6 px from it.
export const MunkresSpine: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const point = () => circle({ r: 5, fill: "#111" });
    layer([
      spread({ dir: "x", spacing: 95, alignment: "middle" }, [
        point().name("a"),
        circle({ r: 14, fill: "none", stroke: "#111", strokeWidth: 1.5 }).name(
          "b"
        ),
        point().name("c"),
      ]),
    ])
      .relate(({ a, b, c }: any) => [
        enclose(
          {
            shape: Shape.spine({ avoiding: [b], clearance: 6 }),
            padding: 22,
            fill: "#ff2400",
            opacity: 0.3,
            stroke: "#ff2400",
          },
          [a, c]
        ),
      ])
      .render(container, { w: 380, h: 150 });
    return container;
  },
};
