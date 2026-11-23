import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  rect,
  text,
  field,
  Baseline,
  Color,
} from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Spread Baseline",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

// A keyword in context (a concordance): every line that holds the keyword,
// lined up on it. Each line is a spread of words. `at` is a word's position
// counted from the keyword, so the keyword is the part whose key is 0, and
// the line's 0 is the middle of the keyword.
const LINES = [
  "a spread places its children with a gap between them",
  "each row of the table is a spread of words",
  "the parent lines up every spread on its own zero",
  "we wanted a spread that keeps its gaps",
  "inside a spread the order of the parts is the data order",
  "unlike a stack a spread does not glue",
];
const KEYWORD = "spread";
const words = LINES.flatMap((line, l) => {
  const ws = line.split(" ");
  const k = ws.indexOf(KEYWORD);
  return ws.map((word, i) => ({
    line: l,
    at: i - k,
    word,
    role: i === k ? "keyword" : "context",
  }));
});

export const Concordance: StoryObj<Args> = {
  args: { w: 520, h: 150 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(words, {
      color: Color.palette({ keyword: "#c0392b", context: "#333333" }),
      axes: false,
      legend: false,
      w: args.w,
      h: args.h,
    })
      .flow(
        spread({ by: "line", dir: "y", spacing: 6 }),
        spread({
          by: "at",
          dir: "x",
          spacing: 4,
          baseline: Baseline.at(0, 0.5),
        })
      )
      .mark(text({ text: "word", fontSize: 13, fill: "role" }))
      .render(container);
    return container;
  },
};

// A population pyramid with the age bands in the middle. Each row is the
// women's bar, the band's label and the men's bar, and its 0 is the middle
// of the label, so the labels line up down the middle. The label sits in a
// column of one width, so the bars start at one place in every row.
const BANDS: [string, number, number][] = [
  ["0-4", 9.6, 10.0],
  ["5-9", 9.9, 10.3],
  ["10-14", 10.4, 10.8],
  ["15-19", 10.5, 10.9],
  ["20-24", 10.6, 11.0],
  ["25-29", 11.2, 11.6],
  ["30-34", 11.0, 11.2],
  ["35-39", 10.9, 10.8],
  ["40-44", 10.1, 9.9],
  ["45-49", 10.1, 9.8],
  ["50-54", 10.6, 10.3],
  ["55-59", 11.0, 10.4],
  ["60-64", 10.6, 9.8],
  ["65-69", 9.2, 8.2],
  ["70-74", 7.6, 6.6],
  ["75-79", 5.3, 4.3],
  ["80-84", 3.4, 2.5],
  ["85+", 3.9, 2.2],
];
const population = BANDS.flatMap(([age, women, men]) => [
  { age, part: "Women", people: women },
  { age, part: "Age", people: 0 },
  { age, part: "Men", people: men },
]);
type Row = (typeof population)[number];

export const PyramidWithAgeLabels: StoryObj<Args> = {
  args: { w: 480, h: 440 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(population, {
      color: Color.palette({ Women: "#c05780", Men: "#3b75af" }),
      axes: false,
      w: args.w,
      h: args.h,
    })
      .flow(
        spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
        spread({
          by: "part",
          dir: "x",
          spacing: 6,
          baseline: Baseline.at("Age", 0.5),
        })
      )
      .mark((d: Row[]) =>
        d[0].part === "Age"
          ? // A column 40 px wide, the label centered in it.
            spread({ dir: "y", spacing: 0, alignment: "middle" }, [
              rect({ w: 40, h: 0, fill: "none" }),
              text({ text: d[0].age, fontSize: 11 }),
            ])
          : rect({ w: "people", fill: "part" })(d)
      )
      .render(container);
    return container;
  },
};

// `alignment` on a parent is a shorthand for giving each child the same
// baseline. Each row is a spread of bars with gaps that sets its own 0, and
// the parent keeps its default alignment, "baseline", which lines the 0s
// up. The pictures are those of `alignment: "start"`, `"middle"` and `"end"`
// on the parent.
const bars = [
  ["a", [30, 10, 20]],
  ["b", [10, 50]],
  ["c", [25, 25, 25, 5]],
].flatMap(([row, ws]) =>
  (ws as number[]).map((w, i) => ({ row, part: `p${i}`, w }))
);

const rowsWith =
  (baseline: Baseline.Baseline) =>
  (args: Args): HTMLElement => {
    const container = initializeContainer();
    chart(bars, {
      axes: { x: false, y: true },
      legend: false,
      w: args.w,
      h: args.h,
    })
      .flow(
        spread({ by: "row", dir: "y", spacing: 6 }),
        spread({ by: "part", dir: "x", spacing: 4, baseline })
      )
      .mark(rect({ w: "w", fill: "part" }))
      .render(container);
    return container;
  };

export const RowsAtStart: StoryObj<Args> = {
  args: { w: 300, h: 110 },
  render: rowsWith(Baseline.start()),
};

export const RowsAtMiddle: StoryObj<Args> = {
  args: { w: 300, h: 110 },
  render: rowsWith(Baseline.middle()),
};

export const RowsAtEnd: StoryObj<Args> = {
  args: { w: 300, h: 110 },
  render: rowsWith(Baseline.end()),
};
