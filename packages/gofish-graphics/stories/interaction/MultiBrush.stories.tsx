/**
 * M5 — multi-brush (notes/design/interaction.md).
 *
 * Absorbed surface: the multiplied brush is a rect mark —
 * `.drawWith(drag().span()).multi()` — and the readout is a text mark with
 * live content. No `.interact()` clause; each new drag is an
 * instance-creation event, the selector is the compound OR, Escape clears.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray } from "../../src/data/catch";
import { chart, scatter, circle, rect, text } from "../../src/lib";
import { drag, inside, live, when } from "../../src/interaction";
import type { BrushInstrument } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Multi Brush",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const countReadout = live((refs) => {
  const b = refs?.instrument("b") as BrushInstrument | undefined;
  const n = b?.instances().length ?? 0;
  const k = b
    ? catchLocationsArray.filter((d) => b.inside(d)).length
    : 0;
  return `${n} selection${n === 1 ? "" : "s"} · ${k} point${
    k === 1 ? "" : "s"
  } (Esc clears)`;
});

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const brushMark = (
      rect({ fill: "rgba(105, 140, 190, 0.15)", stroke: "#5b7ba6" }) as any
    )
      .drawWith(drag().span())
      .multi()
      .name("b");

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(circle({ r: 6, fill: when(inside("b"), "#d62728").else("#9db7d8") }))
      .layer(chart(null).mark(brushMark))
      .layer(
        chart(null).mark(
          text({ x: 20, y: 390, text: countReadout, fill: "#333" })
        )
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
