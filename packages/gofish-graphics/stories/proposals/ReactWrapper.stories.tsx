// PROTOTYPE (#1266): React wrapper proposal. Each story mounts the JSX
// spelling (A, nesting) through packages/gofish-react: a React client root,
// JSX -> GoFish builder -> display list -> React <svg>. Beside it, the same
// chart written as the fluent chain, drawn by the existing Solid renderer.
//
// This file has no JSX of its own: the harness and Storybook compile .tsx
// with Solid's JSX, so the React JSX lives in gofish-react/examples (compiled
// by gofish-react/vite-react-jsx.ts).
import type { Meta, StoryObj } from "@storybook/html";
import { EXAMPLES, type Example } from "../../../gofish-react/examples/examples";
import { mountJSX } from "../../../gofish-react/src/mount";
import { chart, spread, stack, rect } from "../../src/lib";
import { seafood } from "../../src/data/catch";

const meta: Meta = { title: "Proposals/React wrapper" };
export default meta;

function panel(caption: string): { box: HTMLElement; slot: HTMLElement } {
  const box = document.createElement("div");
  box.style.display = "inline-block";
  box.style.verticalAlign = "top";
  box.style.marginRight = "32px";
  const cap = document.createElement("div");
  cap.textContent = caption;
  cap.style.font = "12px system-ui, sans-serif";
  cap.style.color = "#555";
  cap.style.marginBottom = "6px";
  const slot = document.createElement("div");
  box.append(cap, slot);
  return { box, slot };
}

function story(ex: Example): StoryObj {
  return {
    render: async () => {
      const container = document.createElement("div");
      container.style.margin = "20px";
      const a = panel("JSX (nesting) → React <svg>");
      const b = panel("fluent chain → Solid render");
      container.append(a.box, b.box);
      document.body.appendChild(container);
      await mountJSX(a.slot, ex.jsx());
      await ex.fluent().render(b.slot, {});
      return container;
    },
  };
}

export const StackedBar = story(EXAMPLES.stackedBar);
export const RibbonChart = story(EXAMPLES.ribbonChart);
export const BarsAndLine = story(EXAMPLES.barsAndLine);
export const LabeledStack = story(EXAMPLES.labeledStack);
export const Pie = story(EXAMPLES.pie);
export const PlanetsArrow = story(EXAMPLES.planetsArrow);
export const NodeLink = story(EXAMPLES.nodeLink);

// The ambiguity wall: one nested JSX tree,
//   <Spread by="lake" dir="x"><Stack dir="y"><Rect h="count" fill="species"/></Stack></Spread>
// has two fluent readings. Left: <Stack> is a flow step (each row its own
// group, #998). Right: <Stack> is a combinator over its one explicit child.
export const Ambiguity: StoryObj = {
  render: async () => {
    const container = document.createElement("div");
    container.style.margin = "20px";
    const a = panel("read as a flow step: .flow(spread, stack).mark(rect)");
    const b = panel("read as a combinator: .flow(spread).mark(stack([rect]))");
    container.append(a.box, b.box);
    document.body.appendChild(container);
    await chart(seafood, { w: 360, h: 300 })
      .flow(spread({ by: "lake", dir: "x" }), stack({ dir: "y" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(a.slot, {});
    await chart(seafood, { w: 360, h: 300 })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(stack({ dir: "y" }, [rect({ h: "count", fill: "species" })]))
      .render(b.slot, {});
    return container;
  },
};
