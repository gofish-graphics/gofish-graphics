import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, ellipse, layer, rect, scatter, text } from "../../src/lib";

// The finished example of the Glyphs tutorial
// (apps/docs/docs/js/tutorials/glyphs.md). A glyph is a plain function that
// returns a `layer` of shapes; here it is handed to `.mark()`, so the chart
// draws one composite marker per row instead of a single built-in mark.
//
// Not gallery-tagged on purpose: it is a teaching figure, not a gallery piece.
// It doubles as the Tutorials index thumbnail, so it has to read at ~200px
// wide, which is why the markers are large and the labels short.
const meta: Meta = {
  title: "Tutorials/Glyphs",
};
export default meta;

const stations = [
  { id: "AB", x: 12, y: 46, color: "#e63946" },
  { id: "CD", x: 38, y: 22, color: "#457b9d" },
  { id: "EF", x: 55, y: 61, color: "#2a9d8f" },
  { id: "GH", x: 78, y: 35, color: "#e9a13b" },
  { id: "IJ", x: 92, y: 70, color: "#8e6bbf" },
];

type Station = (typeof stations)[number];

const marker = (d: Station) =>
  layer([
    ellipse({ cx: 0, cy: 0, w: 34, h: 34, fill: d.color }),
    ellipse({ cx: 0, cy: 0, w: 18, h: 18, fill: "white" }),
    rect({ cx: 0, cy: 0, w: 8, h: 8, fill: d.color }),
    text({ cx: 32, cy: 0, text: d.id, fontSize: 14, fill: "#333" }),
  ]);

export const Glyphs: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(stations)
      .flow(scatter({ by: "id", x: "x", y: "y" }))
      .mark((d: Station[]) => marker(d[0]))
      .render(container, { w: 260, h: 170 });

    return container;
  },
};
