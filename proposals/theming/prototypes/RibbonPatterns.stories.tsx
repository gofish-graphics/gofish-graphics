import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  chart,
  spread,
  scatter,
  stack,
  rect,
  layer,
  selectAll,
  field,
  group,
  ribbon,
  Color,
  Coord,
} from "../../src/lib";
import { lines, cross, dots, tile, drawn, growSwatches } from "./defs";

const meta: Meta = { title: "Proposals Theming/Ribbon Patterns" };
export default meta;

// default palette (src/color.ts color6), darkened a little for the ink, and a
// pale tint of each as the pattern's ground
const SPECIES: Record<string, { ink: string; ground: string }> = {
  Bass: { ink: "#2f78ad", ground: "#e3eff8" },
  Trout: { ink: "#c9a21f", ground: "#fcf5dc" },
  Catfish: { ink: "#8463ad", ground: "#efe8f7" },
  Perch: { ink: "#e86f3c", ground: "#ffeee5" },
  Salmon: { ink: "#2e9a67", ground: "#e2f4ea" },
};

const defs = [
  tile(
    "rp-Bass",
    7,
    10,
    [<path d="M3.5 1 L6.3 5 L3.5 9 L0.7 5 Z" fill={SPECIES.Bass.ink} />],
    SPECIES.Bass.ground
  ),
  lines("rp-Trout", {
    angle: 45,
    gap: 6,
    width: 1.8,
    color: SPECIES.Trout.ink,
    bg: SPECIES.Trout.ground,
  }),
  dots("rp-Catfish", {
    gap: 5,
    r: 1.2,
    color: SPECIES.Catfish.ink,
    bg: SPECIES.Catfish.ground,
  }),
  cross("rp-Perch", {
    gap: 7,
    width: 1.3,
    color: SPECIES.Perch.ink,
    bg: SPECIES.Perch.ground,
  }),
  lines("rp-Salmon", {
    angle: -45,
    gap: 6,
    width: 1.8,
    color: SPECIES.Salmon.ink,
    bg: SPECIES.Salmon.ground,
  }),
];

const palette = Color.palette(
  Object.fromEntries(Object.keys(SPECIES).map((s) => [s, `url(#rp-${s})`]))
);

// Proposed:
//   chart(seafood, { color: Color.palette({ Bass: Pattern.tile(diamond), Trout: Pattern.lines(), ... }) })
//     .flow(spread({ by: "lake", dir: "x", spacing: 64 }), stack({ by: field("species").sort("count"), dir: "y" }))
//     .mark(rect({ h: "count", fill: "species" }))
//     .layer(ribbon({ opacity: 0.8 }))
//   where each pattern's color comes from the species' palette color
export const RibbonPatterns: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "8px";
    chart(seafood, { h: 360, color: palette })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64 }),
        stack({ by: field("species").sort("count"), dir: "y" })
      )
      .mark(
        rect({ h: "count", fill: "species", stroke: "#333", strokeWidth: 1 })
      )
      .layer(ribbon({ opacity: 0.85, stroke: "#333", strokeWidth: 1 }))
      .render(container, { defs });
    growSwatches((await drawn(container))[0], 14);
    return container;
  },
};

export const RibbonPatternsPolar: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "8px";
    layer({ coord: Coord.clock(), w: 460, h: 460 }, [
      chart(seafood, { color: palette })
        .flow(
          scatter({
            by: "lake",
            x: "lake",
            w: 2 * Math.PI,
            axes: { x: false, y: true },
          }).translate({ y: 50 }),
          stack({ by: field("species").sort("count"), dir: "y", label: false })
        )
        .mark(
          rect({
            w: 0.1,
            h: "count",
            fill: "species",
            stroke: "#333",
            strokeWidth: 1,
          }).name("bars")
        ),
      chart(selectAll("bars"))
        .flow(group({ by: "species" }))
        .mark(ribbon({ opacity: 0.85, stroke: "#333", strokeWidth: 1 })),
    ]).render(container, { axes: true, defs });
    growSwatches((await drawn(container))[0], 14);
    return container;
  },
};
