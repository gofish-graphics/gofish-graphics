import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { spreadX, rect, layer, enclose, ref } from "../../src/lib";
import { color6 } from "../../src/color";

const meta: Meta = {
  title: "Low Level Syntax/Enclose Refs",
};
export default meta;

// Regression probe for the enclose-around-refs collapse bug: `enclose`'s
// children were unconditionally re-placed at the local origin, which is right
// for a FRESH child but wrong for an already-placed operand — a `ref(...)`
// child reconciles its own translate against its LCA during its own
// `layout()`, and re-placing it collapsed every ref onto one point (see
// `packages/gofish-graphics/src/tests/stacking.ts:41`'s long-commented-out
// probe). NOT gallery-tagged — this is a regression repro, not a showpiece.
export const EncloseRefs: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      spreadX({ spacing: 64, alignment: "middle" }, [
        rect({ w: 32, h: 32, fill: color6[0] }).name("1"),
        rect({ w: 32, h: 64, fill: color6[1] }).name("2"),
        rect({ w: 32, h: 40, fill: color6[2] }).name("3"),
      ]),
      // A later sibling referencing the three named rects above: the hull
      // must wrap all three (spread apart by spreadX) plus padding — not
      // collapse to one rect's size at the origin.
      enclose({ padding: 6 }, [ref("1"), ref("2"), ref("3")]),
    ]).render(container, {});
    return container;
  },
};
