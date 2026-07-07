import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  group,
  derive,
  rect,
  ribbon,
  layer,
  selectAll,
  palette,
  orderBy,
  project,
} from "../../../src/lib";
import data from "vega-datasets";

const meta: Meta = {
  title: "Vega-Lite/Layered Bars and Area",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

const isEmphasized = (site: unknown) =>
  site === "Morris" || site === "Grand Rapids";

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  loaders: [async () => ({ barley: await data["barley.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const barley = context.loaded.barley as any[];

    layer([
      chart(barley, {
        color: palette({ Morris: "#e15759", "Grand Rapids": "#4e79a7" }),
      })
        .flow(
          spread({ by: "variety", dir: "x", spacing: 20 }),
          spread({ by: "year", dir: "x", spacing: 40 }),
          derive((d) => orderBy(d, "yield", "asc")),
          stack({ by: "site", dir: "y" })
        )
        .mark(rect({ h: "yield", fill: "site" }).name("bars")),
      chart(selectAll("bars"))
        .flow(group({ by: "variety" }), group({ by: "site" }))
        // Data-driven paint order: the emphasized sites' areas (z = 1) paint on
        // top of the gray ones (z = 0). `project` reads the site off the bag of
        // refs the area is bound to (homogeneous, since we grouped by site).
        .mark(
          ribbon({ opacity: 0.7, mixBlendMode: "multiply" }).zOrder((d) =>
            isEmphasized(project(d, "site")) ? 1 : 0
          )
        ),
    ]).render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// A variant that filters down to just the two emphasized sites, isolating the
// Morris/Grand Rapids comparison.
export const TwoSites: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  loaders: [async () => ({ barley: await data["barley.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const barley = (context.loaded.barley as any[]).filter((d) =>
      isEmphasized(d.site)
    );

    layer([
      chart(barley, {
        color: palette({ Morris: "#e15759", "Grand Rapids": "#4e79a7" }),
      })
        .flow(
          spread({ by: "variety", dir: "x", spacing: 20 }),
          spread({ by: "year", dir: "x", spacing: 40 }),
          derive((d) => orderBy(d, "yield", "asc")),
          stack({ by: "site", dir: "y" })
        )
        .mark(rect({ h: "yield", fill: "site" }).name("bars")),
      chart(selectAll("bars"))
        .flow(group({ by: "variety" }), group({ by: "site" }))
        .mark(ribbon({ opacity: 0.7, mixBlendMode: "multiply" })),
    ]).render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Same chart, restructured: the shared `variety` spread is hoisted to an outer
// chart, and each variety cell holds its own bars+area layer. The inner
// `selectAll("bars")` is scoped per cell (the layer shares one name context per
// variety), so the area only needs to group by site — not by variety.
export const HoistedVarietySpread: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  loaders: [async () => ({ barley: await data["barley.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Layered Bars and Area",
      description:
        "Barley yield across all six field sites: stacked bars per variety and year, overlaid with translucent areas connecting each site's yield across the two years. Morris and Grand Rapids are colored and raised above the gray remaining sites via a data-driven paint order.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const barley = context.loaded.barley as any[];

    chart(barley, {
      color: palette({ Morris: "#e15759", "Grand Rapids": "#4e79a7" }),
      // `axes: true` on the OUTER chart unions the inner cells' yield spaces, so
      // it renders ONE global yield (y) axis plus the variety (x) axis — not a
      // per-cell y axis. Set it here on the topmost chart, not in `.render(...)`:
      // the render-level form doesn't thread through the nested facets yet (#646).
      axes: true,
    })
      .flow(spread({ by: "variety", dir: "x", spacing: 20 }))
      .mark(
        layer([
          // Empty-scope `chart()` inherits this variety cell's partition (#243).
          chart()
            .flow(
              spread({ by: "year", dir: "x", spacing: 40 }),
              derive((rows) => orderBy(rows, "yield", "asc")),
              stack({ by: "site", dir: "y" })
            )
            .mark(rect({ h: "yield", fill: "site" }).name("bars")),
          chart(selectAll("bars"))
            .flow(group({ by: "site" }))
            .mark(
              ribbon({ opacity: 0.7, mixBlendMode: "multiply" }).zOrder((a) =>
                isEmphasized(project(a, "site")) ? 1 : 0
              )
            ),
        ])
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
