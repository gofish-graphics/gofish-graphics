import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, rect, text, spread, table } from "../../src/lib";
import { shadow, blur, roughen, grain, roughShadow } from "./defs";

const meta: Meta = { title: "Proposals Theming/Effects Grid" };
export default meta;

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const values = [
  { k: "a", v: 28 },
  { k: "b", v: 55 },
  { k: "c", v: 43 },
  { k: "d", v: 91 },
  { k: "e", v: 64 },
];

const effects: [string | undefined, string][] = [
  [undefined, "no effect"],
  ["url(#fx-shadow)", "Filter.shadow()"],
  ["url(#fx-blur)", "Filter.blur(2)"],
  ["url(#fx-rough)", "Filter.roughen()"],
  ["url(#fx-grain)", "Filter.grain()"],
  ["url(#fx-roughshadow)", "[Filter.roughen(), Filter.shadow()]"],
];

// Proposed: rect({ h: "v", filter: Filter.shadow() }) etc.
export const EffectsGrid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "12px";
    const panels = effects.map(([filter, name]) =>
      spread({ dir: "y", spacing: 12, alignment: "middle" }, [
        chart(values, { w: 200, h: 120, axes: false })
          .flow(spread({ by: "k", dir: "x", spacing: 10 }))
          .mark(rect({ h: "v", ...(filter ? { filter } : {}) })),
        text({ text: name, fontSize: 12, fontFamily: MONO, fill: "black" }),
      ])
    );
    table({ numCols: 3, spacing: [40, 30] }, panels).render(container, {
      defs: [
        shadow("fx-shadow"),
        blur("fx-blur", 2),
        roughen("fx-rough"),
        grain("fx-grain"),
        roughShadow("fx-roughshadow"),
      ],
    });
    return container;
  },
};
