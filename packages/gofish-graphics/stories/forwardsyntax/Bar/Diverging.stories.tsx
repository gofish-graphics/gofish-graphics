import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  rect,
  field,
  palette,
  Schema,
} from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Bar/Diverging",
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

// A 200-person developer survey. Every count is a number of respondents, so
// no value is negative: the schema's `.diverging()` puts each stack's 0 at the
// center of the response order.
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];
const likertColors = palette({
  "Strongly disagree": "#ca0020",
  Disagree: "#f4a582",
  Neutral: "#d9d9d9",
  Agree: "#92c5de",
  "Strongly agree": "#0571b0",
});

const survey = [
  ["The docs are clear", [12, 22, 38, 86, 42]],
  ["The API is easy to learn", [26, 48, 50, 54, 22]],
  ["Error messages are helpful", [58, 64, 36, 30, 12]],
  ["Charts render fast enough", [8, 18, 44, 80, 50]],
  // Nobody strongly disagreed, so this question has no row for that level.
  // The center is set by the order, so it does not move.
  ["I would recommend it", [0, 9, 27, 78, 86]],
].flatMap(([question, counts]) =>
  (counts as number[]).flatMap((count, i) =>
    count === 0 ? [] : [{ question, response: LEVELS[i], count }]
  )
);

export const Likert: StoryObj<Args> = {
  args: { w: 640, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Diverging Likert Chart",
      description:
        "Survey answers stacked in the order of the response scale, with every row centered on the middle of its Neutral bar.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(survey, {
      schema: { response: Schema.ordered(LEVELS).diverging() },
      color: likertColors,
      axes: { x: { title: "Respondents" }, y: true },
    })
      .flow(
        spread({ by: "question", dir: "y" }),
        stack({ by: "response", dir: "x" })
      )
      .mark(rect({ w: "count", fill: "response" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// An even number of levels has no middle level, so the center is the boundary
// between the two middle ones.
const LEVELS4 = ["Strongly disagree", "Disagree", "Agree", "Strongly agree"];

const forcedChoice = [
  ["The docs are clear", [16, 34, 90, 60]],
  ["The API is easy to learn", [40, 60, 70, 30]],
  ["Error messages are helpful", [70, 70, 44, 16]],
  ["I would recommend it", [8, 22, 80, 90]],
].flatMap(([question, counts]) =>
  (counts as number[]).map((count, i) => ({
    question,
    response: LEVELS4[i],
    count,
  }))
);

export const LikertEven: StoryObj<Args> = {
  args: { w: 640, h: 260 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(forcedChoice, {
      schema: { response: Schema.ordered(LEVELS4).diverging() },
      color: likertColors,
      axes: { x: { title: "Respondents" }, y: true },
    })
      .flow(
        spread({ by: "question", dir: "y" }),
        stack({ by: "response", dir: "x" })
      )
      .mark(rect({ w: "count", fill: "response" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// U.S.-like resident population by age band, in millions (rounded). Both
// columns are positive counts; the two-level diverging order puts Women left
// of the center and Men right of it.
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
  { age, sex: "Women", people: women },
  { age, sex: "Men", people: men },
]);

export const PopulationPyramid: StoryObj<Args> = {
  args: { w: 480, h: 440 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Population Pyramid",
      description:
        "Women and men in each age band drawn outward from a shared center, so the two sides of the population compare at a glance.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(population, {
      schema: { sex: Schema.ordered(["Women", "Men"]).diverging() },
      color: palette({ Women: "#c05780", Men: "#3b75af" }),
      axes: { x: { title: "People (millions)" }, y: true },
    })
      .flow(
        spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
        stack({ by: "sex", dir: "x" })
      )
      .mark(rect({ w: "people", fill: "sex" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
