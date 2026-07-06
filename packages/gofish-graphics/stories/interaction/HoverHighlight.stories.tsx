/**
 * M1 — hover highlight (Tier-0 interaction; notes/design/interaction.md).
 *
 * Fluent surface: `hovered()` creates the hover instrument and returns its
 * tagged selector in one expression; unwrapping the `when(...)` channel
 * during resolve auto-registers the instrument. No hoisted variables, no
 * `.interact()` clause — interaction enters in channel position, the same
 * place any value goes.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { hovered, when } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Hover Highlight",
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

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({ h: "count", fill: when(hovered(), "#d62728").else("#6b9bd1") })
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
