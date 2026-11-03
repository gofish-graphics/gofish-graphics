import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  circle,
  group,
  layer,
  line,
  rect,
  scatter,
  spread,
  stack,
  treemap,
  Tile,
  Curve,
  Unit,
} from "../../../src/lib";
import {
  budgetDraws,
  corrDraws,
  forecastDraws,
  forecastPaths,
  mpgCounts,
  milestoneDraws,
  mpgCountsByDraw,
  nestedDraws,
} from "./ggdibbler-data";

// Prototypes for #980, the "ggdibbler" comparison tab. Each chart draws
// precomputed draws (see ggdibbler-data.ts); GoFish has no Dist type yet.
// The bar, scatter and map examples of that tab are in Noise.stories.tsx.
const meta: Meta = { title: "Proposals/Uncertainty/Ggdibbler" };
export default meta;

/** ggdibbler README: counts of uncertain_mpg by class and drv, stack_dodge. */
export const MpgStackDodge: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(mpgCounts, { w: 560, h: 280 })
      .flow(
        spread({ by: "class", dir: "x", spacing: 12 }),
        spread({ by: "draw", dir: "x", spacing: 0, axes: false }),
        stack({ by: "drv", dir: "y" })
      )
      .mark(rect({ h: "n", fill: "drv" }))
      .render(container, { axes: true });
    return container;
  },
};

/** ggdibbler README: the same counts, stack_identity (draws overlaid).
 *  No in-slot overlay operator exists, so this layers one chart per draw. */
export const MpgStackOverlay: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer(
      mpgCountsByDraw.map((draw) =>
        chart(draw)
          .flow(
            spread({ by: "class", dir: "x", spacing: 12 }),
            stack({ by: "drv", dir: "y" })
          )
          .mark(rect({ h: "n", fill: "drv", opacity: 0.15 }))
      )
    ).render(container, { w: 560, h: 280, axes: true });
    return container;
  },
};

/** A forecast whose steps are independent normals: one line per draw.
 *  The multiline chart idiom (LabelPlacement.stories.tsx, LineEndLabels:
 *  group by series, then scatter by x, then line) with series = draw. */
export const ForecastLines: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(forecastDraws, { w: 480, h: 260 })
      .flow(group({ by: "draw" }), scatter({ by: "h", x: "h", y: "value" }))
      .mark(line({ stroke: "#333", strokeWidth: 1.5, opacity: 0.3, curve: Curve.linear() }))
      .render(container, { axes: true });
    return container;
  },
};

/** Joint draws: thirty whole paths with the same marginals as above. */
export const ForecastPaths: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(forecastPaths, { w: 480, h: 260 })
      .flow(group({ by: "draw" }), scatter({ by: "h", x: "h", y: "value" }))
      .mark(line({ stroke: "#333", strokeWidth: 1.5, opacity: 0.3, curve: Curve.linear() }))
      .render(container, { axes: true });
    return container;
  },
};

/** Correlated x and y: forty draws of each bivariate normal point. */
export const CorrelatedScatter: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(corrDraws, { w: 420, h: 320 })
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 2.5, fill: "cor", opacity: 0.35 }))
      .render(container, { axes: true });
    return container;
  },
};

/** ggdibbler issue #49: uncertain dates, thirty draws per milestone. */
export const MilestoneDates: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(milestoneDraws, {
      schema: { date: Unit.time() },
      w: 520,
      h: 200,
    })
      .flow(
        spread({ by: "milestone", dir: "y", spacing: 24 }),
        scatter({ x: "date" })
      )
      .mark(circle({ r: 3, fill: "#4e79a7", opacity: 0.25 }))
      .render(container, { axes: true });
    return container;
  },
};

/** ggdibbler issue #55: two levels, outer draws dodged, inner draws overlaid. */
export const NestedDraws: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(nestedDraws, { w: 480, h: 260 })
      .flow(
        spread({ by: "category", dir: "x", spacing: 40 }),
        spread({ by: "outer", dir: "x", spacing: 10, axes: false }),
        scatter({ y: "value" })
      )
      .mark(circle({ r: 2.5, fill: "#4e79a7", opacity: 0.35 }))
      .render(container, { axes: true });
    return container;
  },
};

/** An uncertain treemap: one treemap per draw, side by side. */
export const UncertainTreemap: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(budgetDraws, { w: 720, h: 200 })
      .flow(
        spread({ by: "draw", dir: "x", spacing: 12 }),
        treemap({ by: "item", size: "value", tile: Tile.squarify() })
      )
      .mark(rect({ fill: "item" }))
      .render(container, { axes: false });
    return container;
  },
};
