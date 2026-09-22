import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Constraint, layer, rect, spread, text } from "../../src/lib";

// The finished example of the Basics tutorial
// (apps/docs/docs/js/tutorials/basics.md). It is deliberately built from bare
// marks and operators: no `chart()`, no scales, no axes. The Charts tutorial
// turns this same shape into a bar chart by wrapping it in `chart(data)`, and
// the Diagrams tutorial turns it into a memory diagram by wrapping it in
// `createMark` and adding refs and arrows.
//
// Not gallery-tagged on purpose: it is a teaching figure, not a gallery piece.
// It doubles as the Tutorials index thumbnail, so it has to read at ~300x200.
const meta: Meta = {
  title: "Tutorials/Basics",
};
export default meta;

const data = [
  { label: "x", value: 5 },
  { label: "y", value: 8 },
  { label: "z", value: 3 },
];

export const Basics: StoryObj = {
  render: () => {
    const container = initializeContainer();

    spread(
      { dir: "y", spacing: 8, alignment: "middle" },
      data.map((d) =>
        layer([
          rect({ w: 150, h: 44, fill: "#e2ebf6" }).name("box"),
          text({
            text: `${d.label} = ${d.value}`,
            fontSize: 20,
            fontFamily: "Andale Mono, monospace",
          }).name("label"),
        ]).constrain(({ box, label }) => [
          Constraint.align({ x: "middle", y: "middle" }, [box, label]),
        ])
      )
    ).render(container, { w: 150, h: 160 });

    return container;
  },
};
