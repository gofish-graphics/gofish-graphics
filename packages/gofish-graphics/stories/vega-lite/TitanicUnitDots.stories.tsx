import type { Meta, StoryObj } from "@storybook/html";
import { groupBy, orderBy, sumBy } from "lodash";
import { initializeContainer } from "../helper";
import { Treemap, circle, Spread } from "../../src/lib";
import {
  titanicPassengers,
  type TitanicPassenger,
} from "../../src/data/titanicPassengers";

/**
 * Data: [intuinno/unit `titanic3.csv`](https://github.com/intuinno/unit/blob/master/app/data/titanic3.csv)
 */

const CLASS_LABELS = ["1st", "2nd", "3rd"] as const;
type ClassLabel = (typeof CLASS_LABELS)[number];

type CellDatum = TitanicPassenger & {
  classLabel: ClassLabel;
  fillColor: string;
};

function labelForPclass(pclass: TitanicPassenger["pclass"]): ClassLabel {
  return pclass === 1 ? "1st" : pclass === 2 ? "2nd" : "3rd";
}

function enrichForTreemap(p: TitanicPassenger): CellDatum {
  return {
    ...p,
    classLabel: labelForPclass(p.pclass),
    fillColor: p.survived === 1 ? "#1f77b4" : "#ff7f0e",
  };
}

/** One treemap per cabin class; column width ∝ sum(fare) in that class; leaf weight = fare. */
function facetTreemaps(
  rows: TitanicPassenger[],
  paddingInner: number
): { facets: ReturnType<typeof Treemap>[]; stackWeights: number[] } {
  const enriched = rows.map(enrichForTreemap);
  const byClass = groupBy(enriched, "classLabel");
  const stackWeights = CLASS_LABELS.map((label) =>
    Math.max(sumBy(byClass[label] ?? [], (d) => Number(d.fare) || 0), 1e-9)
  );

  const facets = CLASS_LABELS.map((label) => {
    const bucket = byClass[label] ?? [];
    const ordered = orderBy(bucket, [(d) => -d.fare], ["asc"]);
    const nodes = ordered.map((p, i) =>
      circle<CellDatum>({
        fill: "fillColor",
        stroke: "none",
        strokeWidth: 0,
      })(p, `${label}-${i}`)
    );

    return Treemap(
      {
        valueField: "fare",
        round: false,
        tile: "binary",
        sort: "desc",
        flipY: true,
        paddingInner,
      },
      nodes as any
    );
  });

  return { facets, stackWeights };
}

const meta: Meta = {
  title: "Vega-Lite/TitanicUnitDots",
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
    const { facets, stackWeights } = facetTreemaps(
      titanicPassengers,
      args.paddingInner
    );

    Spread(
      { dir: "x", spacing: 10, alignment: "middle", stackWeights },
      facets
    ).render(
      container,
      {
        w: args.w,
        h: args.h,
        axes: true,
      }
    );

    return container;
  },
};
