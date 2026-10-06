import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, layer, position, rect, spread } from "../../src/lib";

// Regression repros for issue #755: an explicit offset (`position()`, an
// operator's `x:`/`y:`, or `.translate()`) is applied exactly once. NOT
// gallery-tagged — these are test-like checks (CLAUDE.md: regression repros
// get no tag). Before the fix, `position()` added its offset to its local box
// AND to its translate, so the box it reported was displaced twice and the
// root reserved the extra offset as a phantom overhang.
//
// Expected to change: the y axis in `SpreadOptionY` and `OperatorTranslateY`
// stays put while the bars lift, which is wrong (#1053), and both
// `OperatorTranslate*` stories record `.translate()`'s current absolute
// placement, whose meaning is undecided (#1054). When either is resolved,
// these baselines move on purpose; what must still hold is that each offset
// is counted once.
const meta: Meta = {
  title: "Low Level Syntax/Offset Regressions",
};
export default meta;

// A 50x50 square at (150, 150) in a 200x200 canvas fills the bottom-right
// corner and spills nothing, so the SVG is 280x280 (the canvas plus the 40px
// padding on each side). Before the fix it was 398x398.
export const PositionInLayer: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      position({ x: 150, y: 150 }, [
        rect({ w: 50, h: 50, fill: "steelblue" }),
      ]),
    ]).render(container, { w: 200, h: 200 });
    return container;
  },
};

const data = [
  { c: "a", v: 10 },
  { c: "b", v: 20 },
  { c: "c", v: 30 },
];

// The reference: a spread's own `y:` lifts the bars 50px; the tallest bar
// then spills 50px above the canvas, and only that spill is reserved.
export const SpreadOptionY: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(data)
      .flow(spread({ by: "c", dir: "x", y: 50 }))
      .mark(rect({ h: "v" }))
      .render(container, { w: 300, h: 200, axes: true });
    return container;
  },
};

// `.translate({ y: 50 })` on the operator must render exactly like
// `SpreadOptionY`. Before the fix the bars sat 50px lower than they do there
// and the SVG was 50px taller.
export const OperatorTranslateY: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(data)
      .flow(spread({ by: "c", dir: "x" }).translate({ y: 50 }))
      .mark(rect({ h: "v" }))
      .render(container, { w: 300, h: 200, axes: true });
    return container;
  },
};

// The same on x: the bars and their y axis shift right together by 50px, and
// the SVG widens only by the 50px the bars spill past the canvas. Before the
// fix the axis sat 50px to the right of the bars and the SVG was 50px wider.
export const OperatorTranslateX: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(data)
      .flow(spread({ by: "c", dir: "x" }).translate({ x: 50 }))
      .mark(rect({ h: "v" }))
      .render(container, { w: 300, h: 200, axes: true });
    return container;
  },
};
