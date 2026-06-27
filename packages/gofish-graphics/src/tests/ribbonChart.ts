import _ from "lodash";
import { gofish } from "../ast/gofish";
import { value } from "../ast/data";
import { stack } from "../ast/graphicalOperators/stack";
import { spread } from "../ast/graphicalOperators/spread";
import { rect } from "../ast/shapes/rect";
import { color } from "../color";
import { layer } from "../ast/graphicalOperators/layer";
import { ribbon } from "../lib";
import { ref } from "../ast/shapes/ref";
import { color10Order } from "./color10";
import { mix } from "spectral.js";
import { cubes } from "rybitten/cubes";
import { rybHsl2rgb } from "rybitten";

const data = [
  { category: "A", group: "x", value: 0.1 },
  { category: "A", group: "y", value: 0.6 },
  { category: "A", group: "z", value: 0.9 },
  { category: "A", group: "w", value: 0.3 },
  { category: "A", group: "v", value: 0.2 },
  { category: "A", group: "u", value: 0.1 },
  { category: "A", group: "t", value: 0.1 },
  { category: "B", group: "x", value: 0.7 },
  { category: "B", group: "y", value: 0.2 },
  { category: "B", group: "z", value: 1.1 },
  { category: "B", group: "w", value: 0.4 },
  { category: "B", group: "v", value: 0.5 },
  { category: "B", group: "u", value: 0.4 },
  { category: "B", group: "t", value: 0.4 },
  { category: "C", group: "x", value: 0.6 },
  { category: "C", group: "y", value: 0.1 },
  { category: "C", group: "z", value: 0.2 },
  { category: "C", group: "w", value: 0.5 },
  { category: "C", group: "v", value: 0.4 },
  { category: "C", group: "u", value: 0.3 },
  { category: "C", group: "t", value: 0.2 },
].filter((d) => d.group !== "t");
// .filter((d) => (d.group === "x" || d.group === "y") && d.category !== "C");

const color6_20250320 = [
  color[color10Order[0]][5],
  color[color10Order[1]][4],
  color[color10Order[4]][5],
  color.red[4],
  color[color10Order[3]][4],
  color[color10Order[2]][4],
];

/* OH NO!!!! I WANT TO START WITH A GREEN!!!!! NOT BLUE!!!! */

// color-blind friendly green
const color6_20250320v2 = [
  // color[color10Order[0]][5],
  // mix(color.blue[5], color.white, 0.1),
  color.blue[5],
  // color[color10Order[1]][4], // this yellow may be too bright
  mix(color.yellow[5], color.white, 0.45),
  // color[color10Order[4]][5], // this purple may be too dark for scatterplots...
  mix(color.purple[5], color.white, 0.5),
  color.red[4],
  color.green[3],
  // color[color10Order[2]][4],
  mix(color.fuschia[5], color.white, 0.35),
  // mix(color.teal[4], color.blue[4], 0.8),
];

const apple90s = cubes.get("apple90s")!.cube;
const appleColor = (hue: number) => {
  const rgb = rybHsl2rgb([hue, 1, 0.5], { cube: apple90s });
  const toHex = (val: number) =>
    Math.round(val * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
};

const white = "rgb(255, 244, 216)";
const black = "rgb(10, 10, 10)";

const color6 = [
  mix(appleColor((6 / 12) * 360), white, 0),
  // "  #ff77bc",
  // mix(appleColor((11 / 12) * 360), "#ffffff", 0.3),
  mix("#F49AC2", black, 0),
  mix(appleColor((4 / 12) * 360), white, 0),
  mix(appleColor((8 / 12) * 360), white, 0),
  mix(appleColor((10 / 12) * 360), white, 0),
  mix(appleColor((2 / 12) * 360), white, 0.2),
];

const colorScale = {
  x: color6[0],
  y: color6[1],
  z: color6[2],
  w: color6[3],
  v: color6[4],
  u: color6[5],
};

export const testRibbonChart = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height },
    layer([
      spread({ dir: 0, spacing: 64, alignment: "end", sharedScale: true },
        _(data)
          .groupBy("category")
          .map((items, category) =>
            stack({ dir: 1, alignment: "middle" },
              items.toReversed().map((d) =>
                rect({
                  name: `${d.category}-${d.group}`,
                  w: 32,
                  h: value(d.value, "value"),
                  fill: colorScale[d.group as keyof typeof colorScale],
                })
              )
            )
          )
          .value()
      ),
      ..._(data)
        .groupBy("group")
        .map((items, group) =>
          ribbon(
            {
              dir: "x",
              fill: colorScale[group as keyof typeof colorScale],
              curve: "bezier",
              // opacity: 0.8,
              mixBlendMode: "multiply",
            },
            items.map((d) => ref(`${d.category}-${d.group}`))
          )
        )
        .value(),
    ])
  );
