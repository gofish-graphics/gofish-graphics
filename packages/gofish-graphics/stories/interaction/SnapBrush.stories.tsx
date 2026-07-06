/**
 * M4 — snap-to-band brush (the Match relation; notes/design/interaction.md).
 *
 * Absorbed surface: the brush is a rect mark lifted by `.drawWith(...)`;
 * the ONLY `.interact()` content left is the cross-cutting snap relation —
 * a pure Bind declaration, exactly the residue the clause exists for
 * (mirroring `.constrain()`). Everything else lives in mark and value
 * position.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { Bind, drag, intersectsX, when } from "../../src/interaction";
import type { BrushInstrument } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Snap Brush",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const brushMark = (
      rect({ fill: "rgba(105, 140, 190, 0.15)", stroke: "#5b7ba6" }) as any
    )
      .drawWith(drag().span())
      .name("b");

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({
          h: "count",
          fill: when(intersectsX("b"), "#d62728").else("#6b9bd1"),
        }).name("bars")
      )
      .layer(chart(null).mark(brushMark))
      .interact((refs) => [
        Bind.snap(
          refs.bands("bars").x,
          (refs.instrument("b") as BrushInstrument).anchors.x
        ),
      ])
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
