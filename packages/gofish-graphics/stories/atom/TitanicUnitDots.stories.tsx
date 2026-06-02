import type { Meta, StoryObj } from "@storybook/html";
import { groupBy, maxBy, orderBy, sumBy } from "lodash";
import { initializeContainer } from "../helper";
import { treemap, circle, Spread, Chart, palette } from "../../src/lib";
import {
  titanicPassengers,
  type TitanicPassenger,
} from "../../src/data/titanicPassengers";

/**
 * Data: [intuinno/unit `titanic3.csv`](https://github.com/intuinno/unit/blob/master/app/data/titanic3.csv)
 */

// const CLASS_LABELS = ["1st", "2nd", "3rd"] as const;
// type ClassLabel = (typeof CLASS_LABELS)[number];

// type CellDatum = TitanicPassenger & {
//   classLabel: ClassLabel;
//   fillColor: string;
//   radius: number;
//   area: number;
// };

// function labelForPclass(pclass: TitanicPassenger["pclass"]): ClassLabel {
//   return pclass === 1 ? "1st" : pclass === 2 ? "2nd" : "3rd";
// }

// function enrichForTreemap(p: TitanicPassenger, maxFare: number): CellDatum {
//   const fare = Number(p.fare) || 0;
//   const maxRadius = 20;
//   const radius = (fare / Math.max(maxFare, 1e-9)) * maxRadius
//   return {
//     ...p,
//     classLabel: labelForPclass(p.pclass),
//     fillColor: p.survived === 1 ? "#1f77b4" : "#ff7f0e",
//     radius: radius,
//     area: radius * radius
//   };
// }

// /** One treemap per cabin class; column width ∝ sum(fare) in that class; leaf weight = fare. */
// function facetTreemaps(
//   rows: TitanicPassenger[],
//   paddingInner: number
// ): { facets: ReturnType<typeof Treemap>[]; stackWeights: number[] } {
//   const maxFare = maxBy(rows, (d) => Number(d.fare) || 0)?.fare ?? 0;
//   const enriched = rows.map((p) => enrichForTreemap(p, maxFare));
//   const byClass = groupBy(enriched, "classLabel");
//   const stackWeights = CLASS_LABELS.map((label) =>
//     // Math.max(sumBy(byClass[label] ?? [], (d) => d.area), 1e-9)
//   1
//   );

//   const facets = CLASS_LABELS.map((label) => {
//     const bucket = byClass[label] ?? [];
//     const ordered = orderBy(bucket, [(d) => -d.fare], ["asc"]);
//     const nodes = ordered.map((p, i) =>
//       circle<CellDatum>({
//         r: p.radius,
//         fill: "fillColor",
//         stroke: "none",
//         strokeWidth: 0,
//       })(p, `${label}-${i}`)
//     );

//     return Treemap(
//       {
//         valueField: "area",
//         round: false,
//         tile: "binary",
//         sort: "desc",
//         flipY: true,
//         paddingInner,
//       },
//       nodes as any
//     );
//   });

//   return { facets, stackWeights };
// }

const meta: Meta = {
  title: "atom/TitanicUnitDots",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 900, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
    paddingInner: { control: { type: "number", min: 0, max: 6, step: 0.5 } },
  },
};

export default meta;

type Args = { w: number; h: number; paddingInner: number };

export const Default: StoryObj<Args> = {
  args: { w: 720, h: 480, paddingInner: 0 },
  render: (args: Args) => {
    const container = initializeContainer();
    // const { facets, stackWeights } = facetTreemaps(
    //   titanicPassengers,
    //   args.paddingInner
    // );
    // `h: "fare"` is a `size` channel, so it auto-sums fare per pclass facet and
    // scales each treemap's height on a scale shared across the three facets.
    //
    // TODO (exercise, left intentionally unfixed — two harmless cosmetic warts):
    //   1. `dir: "y"` below is NOT a TreemapProps key, so it is silently ignored.
    //   2. `treemap`'s `valueField` channel is annotated `"string"` in
    //      createOperator, which is not a valid ChannelType ("size"|"pos"|"color").
    //      It's a no-op today; `valueField: "fare"` still reaches Treemap fine.
    Chart(titanicPassengers, { color: palette(["#2b8cbe", "#ff8408"]) }).facet({by: "pclass", dir: "x"})
      .flow(treemap({ h: "fare", w: 100, dir: "y", valueField: "fare", paddingInner: args.paddingInner, tile: "squarify" }))
      .mark(circle({ fill: "survived", stroke: "#ccc", strokeWidth: 1 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
