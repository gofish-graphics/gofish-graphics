import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  arrow,
  background,
  circle,
  layer,
  ref,
  spread,
  text,
} from "../../src/lib";

// The finished example of the Diagrams tutorial
// (apps/docs/docs/js/tutorials/diagrams.md). It starts from the Basics
// tutorial's picture (Basics.stories.tsx) and labels Mercury: the label is
// centered on Mercury but spaced off the whole background, and an arrow runs
// from the label to the planet. The label's two constraints point at two
// different nodes (Mercury and the background), which a single `spread`
// cannot express. The styling follows the planets diagram in the maintainer's
// thesis defense deck.
//
// Not gallery-tagged on purpose: it is a teaching figure, not a gallery piece.
// It doubles as the Tutorials index thumbnail and as the preview at the top of
// the tutorial page.
const meta: Meta = {
  title: "Tutorials/Diagrams",
};
export default meta;

const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

export const Diagrams: StoryObj = {
  render: () => {
    const container = initializeContainer();

    layer([
      background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
        spread(
          { dir: "x", spacing: 50, alignment: "middle" },
          data.map((d) =>
            circle({
              r: d.r,
              fill: d.fill,
              stroke: d.stroke,
              strokeWidth: 3,
            }).name(d.name)
          )
        ),
      ]).name("planets"),
      layer([
        ref("mercury").name("mercury"),
        ref("planets").name("planets"),
        text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
      ]).constrain(({ mercury, planets, label }) => [
        Constraint.align({ x: "middle" }, [mercury, label]),
        Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
      ]),
      arrow({ stroke: "#E94560" }, [ref("label"), ref("mercury")]),
    ]).render(container);

    return container;
  },
};
