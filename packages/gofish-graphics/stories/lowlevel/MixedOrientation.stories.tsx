import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { spreadX, spreadY, rect, ellipse, text, layer, For, v } from "../../src/lib";
import { color6, gray } from "../../src/color";

const meta: Meta = {
  title: "Low Level Syntax/Mixed Orientation",
};
export default meta;

// A vertical bar chart: y is a CONTINUOUS value axis, so this subtree declares
// y-up and grows its bars UPWARD from a shared baseline.
const barData = [
  { cat: "A", value: 30 },
  { cat: "B", value: 80 },
  { cat: "C", value: 55 },
  { cat: "D", value: 95 },
  { cat: "E", value: 62 },
];

const barChart = () =>
  spreadX(
    { spacing: 10, alignment: "start", h: 200 },
    For(barData, (d) =>
      rect({ key: d.cat, w: 22, h: v(d.value), fill: color6[0] })
    )
  );

// A heatmap: keyed rows make the y axis ORDINAL (category bands), so this
// subtree stays SVG-native y-DOWN and reads top -> bottom.
const heatRows = ["Mon", "Tue", "Wed", "Thu"];
const heatCols = 5;
const heatVal = (r: number, c: number) => (r * 7 + c * 13) % 10;

const heatmap = () =>
  spreadY(
    { spacing: 3, alignment: "start" },
    For(heatRows, (row, ri) =>
      spreadX(
        { key: row, spacing: 3, alignment: "middle" },
        For([...Array(heatCols).keys()], (c) =>
          rect({
            w: 22,
            h: 22,
            fill: `rgba(189,0,38,${0.15 + 0.085 * heatVal(ri as number, c)})`,
          })
        )
      )
    )
  );

// A tidy tree drawn level by level: keyed depth LEVELS make the y axis ORDINAL,
// so it, too, stays y-DOWN and reads root -> leaves, top to bottom.
const treeChart = () => {
  const node = (label: string) =>
    layer([
      ellipse({ w: 20, h: 20, fill: color6[2] }),
      text({ text: label, fontSize: 9, fill: "white" }),
    ]);
  const levels = [["r"], ["a", "b"], ["1", "2", "3"]];
  return spreadY(
    { spacing: 30, alignment: "middle" },
    For(levels, (row, li) =>
      spreadX(
        { key: `L${li}`, spacing: 16, alignment: "middle" },
        For(row, node)
      )
    )
  );
};

// Regression repro (#629): not gallery-tagged — a test-like orientation check.
export const Default: StoryObj = {
  render: () => {
    const container = initializeContainer();
    spreadX(
      { spacing: 64, alignment: "start" },
      For([barChart, heatmap, treeChart], (fn) => fn())
    ).render(container, { axes: true });
    return container;
  },
};
