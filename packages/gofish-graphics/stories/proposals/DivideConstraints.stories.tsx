import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  atop,
  chart,
  field,
  filter,
  group,
  image,
  project,
  rect,
  ribbon,
  scatter,
  selectAll,
  spread,
  stack,
} from "../../src/lib";
import { streamgraphData } from "../../src/data/streamgraphData";
import { seafood } from "../../src/data/catch";

/**
 * THROWAWAY prototype stories for the croissant-sampling proposal (#1332),
 * "Constraints" section (round 8): can a piece made by stack be used as a
 * region, so an image or texture fills it? And the ribbon chart, which
 * re-sorts the pieces at each position and connects them.
 *
 * `image`'s `href` is not a channel (a function or field is rejected:
 * "href.startsWith is not a function"), so a texture per piece is emulated
 * with one layer per value, each filtered to that value. With an `href`
 * channel each of these would be one mark, as PiCCL's
 * `Picture().mapValue("url", "url")`.
 *
 * Tried and failed (not kept): naming the fused stacked ribbon "bands" and
 * reading `bands[i]` in `.relate`. The ref is the whole collection, so
 * `atop([bands[i], image])` gets one operand ("atop: expected two or more
 * operands, got 1").
 */
const meta: Meta = { title: "Proposals/Divide Constraints" };
export default meta;

const W = 480;
const H = 260;

// A tiling texture as an SVG data URL: stripes, dots, or cross-hatch.
const texture = (kind: number, color: string, w = W, h = H) => {
  const tile =
    kind % 3 === 0
      ? `<path d='M0 8 L8 0' stroke='${color}' stroke-width='2'/>`
      : kind % 3 === 1
        ? `<circle cx='4' cy='4' r='2.2' fill='${color}'/>`
        : `<path d='M0 0 L8 8 M8 0 L0 8' stroke='${color}' stroke-width='1.2'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><pattern id='p' width='8' height='8' patternUnits='userSpaceOnUse'><rect width='8' height='8' fill='white'/>${tile}</pattern></defs><rect width='${w}' height='${h}' fill='url(#p)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
const COLORS = [
  "#4269d0",
  "#efb118",
  "#ff725c",
  "#6cc5b0",
  "#3ca951",
  "#ff8ab7",
  "#a463f2",
  "#97bbf5",
  "#9c6b4e",
  "#9498a0",
];

// Each band of a stacked area holds its own texture. The stack makes the
// pieces (invisible anchors), a selection groups them by series, and each
// group draws `atop([ribbon(), image])`: the band is the region.
// Proposed (with an href channel), one layer:
//   chart(selectAll("pts")).flow(group({ by: "c" }))
//     .mark(atop([ribbon(), image({ href: "texture" })]))
export const BandsTextured: StoryObj = {
  render: () => {
    const container = initializeContainer();
    let c = chart(streamgraphData, { w: W, h: H })
      .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
      .mark(rect({ w: 0.1, h: "y" }).name("pts"));
    for (let i = 0; i < 10; i++) {
      c = c.layer(
        chart(selectAll("pts"))
          .flow(
            filter((p: any) => Number(project(p, "c")) === i),
            group({ by: "c" })
          )
          .mark(
            atop([
              ribbon({ fill: "black" }),
              image({ href: texture(i, COLORS[i]), x: 0, y: 0, w: W, h: H }),
            ])
          )
      );
    }
    c.render(container);
    return container;
  },
};

// Ribbon chart (Power BI): at each lake a stacked bar re-sorted by count, and
// a ribbon per species joining its pieces. Pieces first, then connect.
export const RibbonChart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: W, h: H })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 48 }),
        stack({ by: field("species").sort("count"), dir: "y" })
      )
      .mark(rect({ w: 24, h: "count", fill: "species" }).name("bars"))
      .layer(
        chart(selectAll("bars"))
          .flow(group({ by: "species" }))
          .mark(ribbon({ fill: "species", opacity: 0.5 }))
      )
      .render(container);
    return container;
  },
};
