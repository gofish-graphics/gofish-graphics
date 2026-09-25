import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { background, circle, spread } from "../../src/lib";

// The finished example of the Basics tutorial
// (apps/docs/docs/js/tutorials/basics.md): the four planets closest to the
// sun, spread in a row and wrapped in a dark background. It is deliberately
// built from bare marks and operators: no `chart()`, no scales, no axes. The
// Diagrams tutorial picks up from exactly this picture (see
// Diagrams.stories.tsx). The styling follows the planets diagram in the
// maintainer's thesis defense deck.
//
// Not gallery-tagged on purpose: it is a teaching figure, not a gallery piece.
// It doubles as the Tutorials index thumbnail and as the preview at the top of
// the tutorial page.
const meta: Meta = {
  title: "Tutorials/Basics",
};
export default meta;

const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

export const Basics: StoryObj = {
  render: () => {
    const container = initializeContainer();

    background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
      spread(
        { dir: "x", spacing: 50, alignment: "middle" },
        data.map((d) =>
          circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
        )
      ),
    ]).render(container, { w: 410, h: 116 });

    return container;
  },
};
