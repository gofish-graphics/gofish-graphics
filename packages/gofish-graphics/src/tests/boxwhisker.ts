import _ from "lodash";
import {
  connectY,
  For,
  frame,
  groupBy,
  rect,
  ref,
  spreadX,
  v,
} from "../lib";
import { genderPayGap, payGrade } from "../data/genderPayGap";
import { Value } from "../ast/data";

const boxAndWhisker = ({
  median,
  min,
  max,
  q1,
  q3,
  fill,
}: {
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  fill: Value<string>;
}) => {
  const minName = `min-${Math.random().toString(36).substring(2, 9)}`;
  const maxName = `max-${Math.random().toString(36).substring(2, 9)}`;
  return frame({}, [
    rect({ w: 8, h: 1, y: v(min), fill: "gray" }).name(minName),
    rect({ w: 8, h: 1, y: v(max), fill: "gray" }).name(maxName),
    connectY({ mode: "center", strokeWidth: 1 }, [
      ref(minName),
      ref(maxName),
    ]),
    rect({ w: 8, y: v(q1), h: v(q3 - q1), fill }),
    rect({ w: 8, h: 1, y: v(median), fill: "white" }),
  ]);
};

export const testSingleBoxWhisker = () => {
  const data = genderPayGap[0];
  return boxAndWhisker({
    median: data.Median,
    min: data.Min,
    max: data.Max,
    q1: data["25-Percentile"],
    q3: data["75-Percentile"],
    fill: v(data.Gender as string),
  });
};

export const testPairBoxWhisker = () => {
  const payGradeFive = genderPayGap.filter((d) => d["Pay Grade"] === "Five");
  const male = payGradeFive.find((d) => d.Gender === "Male")!;
  const female = payGradeFive.find((d) => d.Gender === "Female")!;

  return spreadX(
    {
      spacing: 8,
      sharedScale: true,
    },
    [
      boxAndWhisker({
        median: male.Median,
        min: male.Min,
        max: male.Max,
        q1: male["25-Percentile"],
        q3: male["75-Percentile"],
        fill: v(male.Gender as string),
      }),
      boxAndWhisker({
        median: female.Median,
        min: female.Min,
        max: female.Max,
        q1: female["25-Percentile"],
        q3: female["75-Percentile"],
        fill: v(female.Gender as string),
      }),
    ]
  );
};

export const testBoxWhiskerPlot = () =>
  spreadX(
    {
      spacing: 8,
      sharedScale: true,
    },
    For(
      groupBy(
        _.orderBy(genderPayGap, (d) => payGrade.indexOf(d["Pay Grade"])),
        "Pay Grade"
      ),
      (d, key) =>
        spreadX(
          {
            key,
            spacing: 8,
          },
          For(groupBy(d, "Gender"), (d, key) =>
            boxAndWhisker({
              median: d[0].Median,
              min: d[0].Min,
              max: d[0].Max,
              q1: d[0]["25-Percentile"],
              q3: d[0]["75-Percentile"],
              fill: v(key),
            })
          )
        )
    )
  );
