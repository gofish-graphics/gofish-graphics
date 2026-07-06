/**
 * M2 — draggable threshold (Tier-1 interaction; notes/design/interaction.md).
 *
 * Fluent surface: the threshold is an interactive MARK — `rule({ y: 100 })
 * .drag("y").name("cut")` declared in a layer, like any mark. `.drag("y")`
 * makes the y anchor writable (Limit to the plot's y domain is the scoped
 * default); the bars reference it by name via the deferred selector
 * `above("cut", of)`. Nothing is hoisted; no `.interact()` clause.
 */
import type { Meta, StoryObj } from "@storybook/html";
import sumBy from "lodash/sumBy";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { above, rule, when } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Draggable Threshold",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const totalCount = (d: unknown): number =>
  sumBy(d as Record<string, number>[], "count");

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({
          h: "count",
          fill: when(above("cut", totalCount), "#d62728").else("#6b9bd1"),
        })
      )
      .layer(chart(null).mark(rule({ y: 100 }).drag("y").name("cut")))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
