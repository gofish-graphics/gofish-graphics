import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import {
  chart,
  spread,
  stack,
  rect,
  Unit,
  Domain,
  Baseline,
  Color,
} from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Bar/Baseline",
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

// The survey of Diverging/Likert, with the center set by the stack's
// `baseline` instead of `Trait.diverging()`: the middle of the Neutral bar.
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];
const likertColors = Color.palette({
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
  // The baseline is placed by the declared order, so it does not move.
  ["I would recommend it", [0, 9, 27, 78, 86]],
].flatMap(([question, counts]) =>
  (counts as number[]).flatMap((count, i) =>
    count === 0 ? [] : [{ question, response: LEVELS[i], count }]
  )
);

export const AtNeutral: StoryObj<Args> = {
  args: { w: 640, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(survey, {
      schema: { response: Unit({ domain: Domain.discrete(LEVELS) }) },
      color: likertColors,
      axes: { x: { title: "Respondents" }, y: true },
      w: args.w,
      h: args.h,
    })
      .flow(
        spread({ by: "question", dir: "y" }),
        stack({
          by: "response",
          dir: "x",
          baseline: Baseline.at("Neutral", 0.5),
        })
      )
      .mark(rect({ w: "count", fill: "response" }))
      .render(container);
    return container;
  },
};

export const Middle: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(seafood, { w: args.w, h: args.h })
      .flow(
        spread({ by: "lake", dir: "x" }),
        stack({ by: "species", dir: "y", baseline: Baseline.middle() })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(container);
    return container;
  },
};

export const End: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(seafood, { w: args.w, h: args.h })
      .flow(
        spread({ by: "lake", dir: "x" }),
        stack({ by: "species", dir: "y", baseline: Baseline.end() })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(container);
    return container;
  },
};
