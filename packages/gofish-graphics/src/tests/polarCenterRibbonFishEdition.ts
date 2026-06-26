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
import { fishData } from "../data/fish";
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
  Bass: color6[0],
  Trout: color6[1],
  Catfish: color6[2],
  Perch: color6[3],
  Salmon: color6[4],
};

export const testPolarCenterRibbonFishEdition = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height, transform: { x: 200, y: 145 } },
    coord({ transform: polar_DEPRECATED() }, [
      layer([
        stack(
          {
            x: 50,
            y: (-2 * Math.PI) / 6,
            dir: 1,
            spacing: (2 * Math.PI) / 6,
            alignment: "start",
            sharedScale: true,
            mode: "center",
          },
          Object.entries(_.groupBy(fishData, "Lake")).map(([Lake, items]) =>
            stack({ dir: 0,
                spacing: 2,
                alignment: "middle",
                h: _(items).sumBy("Count") / 500,
              },
              items
                .sort((a, b) => a.Count - b.Count)
                // .toReversed()
                .map((d) =>
                  rect({
                    name: `${d.Lake}-${d["Fish Type"]}`,
                    // h: 0.1,
                    emY: true,
                    // w: value(d.value, "value"),
                    w: d.Count,
                    emX: true,
                    fill: colorScale[d["Fish Type"] as keyof typeof colorScale],
                  })
                )
            )
          )
        ),
        ..._(fishData)
          .groupBy("Fish Type")
          .map((items, FishType) =>
            ribbon(
              {
                dir: "y",
                fill: colorScale[FishType as keyof typeof colorScale],
                curve: "bezier",
                opacity: 0.8,
                mixBlendMode: "multiply",
              },
              items.map((d) => ref(`${d.Lake}-${d["Fish Type"]}`))
            )
          )
          .value(),
      ]),
    ])
  );
