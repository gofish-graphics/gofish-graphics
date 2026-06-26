import _ from "lodash";
import { gofish } from "../ast/gofish";
import { value } from "../ast/data";
import { spread } from "../ast/graphicalOperators/spread";
import { rect } from "../ast/shapes/rect";
import { color, color6 } from "../color";
import { layer } from "../ast/graphicalOperators/layer";
import { area } from "../lib";
import { ref } from "../ast/shapes/ref";
import { color10Order } from "./color10";
import { mix } from "spectral.js";
import { cubes } from "rybitten/cubes";
import { rybHsl2rgb } from "rybitten";

const data = [
  { category: "A", group: "x", value: 1 },
  { category: "A", group: "y", value: 1 },
  { category: "A", group: "z", value: 1 },
  // { category: "A", group: "w", value: 0.3 },
  // { category: "A", group: "v", value: 0.2 },
  // { category: "A", group: "u", value: 0.1 },
  // { category: "A", group: "t", value: 0.1 },
  { category: "B", group: "x", value: 0.7 },
  { category: "B", group: "x", value: 0.3 },
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

const colorScale = {
  x: color6[0],
  y: color6[1],
  z: color6[2],
  w: color6[3],
  v: color6[4],
  u: color6[5],
};

export const testSankey = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height },
    layer([
      spread({ dir: "y", spacing: 64, alignment: "middle", sharedScale: true },
        // TODO: I could probably make the width be uniform flexible basically
        Object.entries(_.groupBy(data, "category")).map(([category, items]) =>
          spread({ dir: "x", spacing: 8, alignment: "middle" },
            items.map((d) =>
              rect({
                name: `${d.category}-${d.group}`,
                // w: value(d.value, "value"),
                w: d.value * 50,
                // h: value(d.value, "value"),
                h: 8,
                fill: colorScale[d.group as keyof typeof colorScale],
              })
            )
          )
        )
      ),
      ...Object.entries(_.groupBy(data, "group")).map(([group, items]) =>
        area(
          {
            dir: "y",
            fill: colorScale[group as keyof typeof colorScale],
            interpolation: "bezier",
            opacity: 0.8,
            mixBlendMode: "multiply",
          },
          items.map((d) => ref(`${d.category}-${d.group}`))
        )
      ),
    ])
  );
