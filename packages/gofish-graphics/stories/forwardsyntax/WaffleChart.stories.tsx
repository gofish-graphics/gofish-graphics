import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, chunk, compose, spread, rect, derive } from "../../src/lib";
import { repeat } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Waffle Chart",
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Waffle Chart",
      description:
        "A waffle chart of fish catch across six lakes, where each catch becomes a colored square tiled into per-lake columns so the species mix reads as a grid of unit cells.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // x-axis at the bottom (y-end) so the lake labels sit under the upward-
    // filling waffle columns rather than above them.
    chart(seafood, { axes: { x: { side: "end" } } })
      .flow(
      // Bottom-align the lake columns (y-down free space: "end" = bottom) so the
      // waffles sit on a shared baseline and fill upward rather than hang down.
      spread({ by: "lake", spacing: 8, dir: "x", axes: false, alignment: "end" }),
        derive((d) => d.flatMap((d) => repeat(d, "count"))),
        // Rows of five units. Reverse the rows so the ragged (partial) last row
        // lands at the TOP and the full rows fill the baseline upward (y-down
        // free space).
        spread({ by: chunk(5), spacing: 2, dir: "y", reverse: true }),
        spread({ spacing: 2, dir: "x" })
      )
      .mark(rect({ w: 8, h: 8, fill: "species" }))
      .render(container, {});

    return container;
  },
};

// The same waffle with its steps packaged as reusable `compose` fragments. The
// outer fragment nests two inner ones; `.flow()` flattens them, so this renders
// exactly like `Default`.
export const Composed: StoryObj<Args> = {
  render: (args: Args) => {
    const container = initializeContainer();

    const units = (count: string) =>
      derive((d: any[]) => d.flatMap((d) => repeat(d, count)));
    const grid = (rowSize: number) =>
      compose(
        spread({ by: chunk(rowSize), spacing: 2, dir: "y", reverse: true }),
        spread({ spacing: 2, dir: "x" })
      );
    const waffle = compose(units("count"), grid(5));

    chart(seafood, { axes: { x: { side: "end" } } })
      .flow(
        spread({ by: "lake", spacing: 8, dir: "x", axes: false, alignment: "end" }),
        waffle
      )
      .mark(rect({ w: 8, h: 8, fill: "species" }))
      .render(container, {});

    return container;
  },
};
