/**
 * M3 — brush with selectors + live readout (notes/design/interaction.md).
 *
 * Absorbed surface: the brush IS a rect mark lifted to instrument-owned
 * geometry by `.drawWith(drag().span())` (its selector fields come from the
 * chart's own x/y encodings — no config); the readout IS a text mark whose
 * content is a `live(...)` value (Tier-0 content patch — the box keeps its
 * resolve-time measure). No `.interact()` clause anywhere: interaction
 * enters in mark position and value position only.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray } from "../../src/data/catch";
import { chart, scatter, circle, rect, text } from "../../src/lib";
import { drag, inside, live, when } from "../../src/interaction";
import type { BrushInstrument } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Brush Scatter",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** Mean of the committed selection — reaches the named brush through `refs`
 *  (undefined at resolve time, so the fallback string is what gets measured). */
const meanReadout = live((refs) => {
  const b = refs?.instrument("b") as BrushInstrument | undefined;
  if (!b?.committed()) return "brush to select points";
  const selected = catchLocationsArray.filter((d) => b.insideCommitted(d));
  if (selected.length === 0) return "brush to select points";
  const mean = selected.reduce((sum, d) => sum + d.y, 0) / selected.length;
  return `mean y of selection: ${mean.toFixed(1)}`;
});

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    // Transform modifiers (.cut, .drawWith) are untyped on marks for now —
    // typing lands with the createTechnique() factory work.
    const brushMark = (
      rect({ fill: "rgba(105, 140, 190, 0.15)", stroke: "#5b7ba6" }) as any
    )
      .drawWith(drag().span())
      .name("b");

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(circle({ r: 6, fill: when(inside("b"), "#d62728").else("#9db7d8") }))
      .layer(chart(null).mark(brushMark))
      .layer(
        chart(null).mark(
          text({ x: 20, y: 390, text: meanReadout, fill: "#333" })
        )
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
