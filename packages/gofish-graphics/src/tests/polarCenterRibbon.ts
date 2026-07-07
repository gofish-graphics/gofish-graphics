/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { linear } from "../ast/coordinateTransforms/linear";
import _ from "lodash";
import { layer } from "../ast/graphicalOperators/layer";
import { ref } from "../ast/shapes/ref";
import { ribbon } from "../lib";
const data = [
  { category: "A", group: "x", value: 0.1 },
  { category: "A", group: "y", value: 0.6 },
  { category: "A", group: "z", value: 0.5 },
  { category: "A", group: "w", value: 0.3 },
  { category: "A", group: "v", value: 0.2 },
  { category: "A", group: "u", value: 0.1 },
  { category: "A", group: "t", value: 0.1 },
  { category: "B", group: "x", value: 0.7 },
  { category: "B", group: "y", value: 0.2 },
  { category: "B", group: "z", value: 0.9 },
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

export const testPolarCenterRibbon = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height, transform: { x: 200, y: 100 } },
    coord({ transform: polar_DEPRECATED() }, [
      layer([
        stack(
          {
            x: 50,
            dir: 1,
            spacing: (2 * Math.PI) / 8,
            alignment: "start",
            sharedScale: true,
            mode: "center",
          },
          Object.entries(_.groupBy(data, "category")).map(([category, items]) =>
            stack({ dir: 0,
                spacing: 0,
                alignment: "middle",
              },
              items
                .sort((a, b) => a.value - b.value)
                // .toReversed()
                .map((d) =>
                  rect({
                    name: `${d.category}-${d.group}`,
                    h: 0.1,
                    emY: true,
                    // w: value(d.value, "value"),
                    w: d.value * 20,
                    emX: true,
                    fill: colorScale[d.group as keyof typeof colorScale],
                  })
                )
            )
          )
        ),
        ..._(data)
          .groupBy("group")
          .map((items, group) =>
            ribbon(
              {
                dir: "y",
                fill: colorScale[group as keyof typeof colorScale],
                curve: "bezier",
                opacity: 0.5,
                mixBlendMode: "multiply",
              },
              items.map((d) => ref(`${d.category}-${d.group}`))
            )
          )
          .value(),
      ]),
    ])
  );
