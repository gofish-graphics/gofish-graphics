import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { quantileSorted } from "d3-array";
import {
  chart,
  field,
  layer,
  rect,
  spread,
  Domain,
  Trait,
  Unit,
} from "../../src/lib";
import { genderPayGap, payGrade } from "../../src/data/genderPayGap";
import { penguins } from "../../src/data/penguins";

/**
 * A box plot from the chart builder. Each row already holds its summary
 * (`Min`, `25-Percentile`, `Median`, `75-Percentile`, `Max`), so the marks
 * read five different columns on one y axis. The schema declares all five
 * amounts of one quantity, Pay, in USD, so they share the axis and it is
 * titled "Pay (USD)". (The dataset's source and currency are not recorded;
 * USD is illustrative.)
 */
const meta: Meta = {
  title: "Forward Syntax/Box Plot",
  argTypes: {
    h: { control: { type: "number", min: 200, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { h: number };

export const GenderPayGap: StoryObj<Args> = {
  args: { h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();

    const pay = { name: "Pay", unit: Unit("USD") };
    chart(genderPayGap, {
      schema: {
        "Pay Grade": Unit({ domain: Domain.discrete(payGrade), traits: [Trait.ordered()] }),
        Min: pay,
        "25-Percentile": pay,
        Median: pay,
        "75-Percentile": pay,
        Max: pay,
      },
      h: args.h,
    })
      .flow(
        spread({ by: "Pay Grade", dir: "x", spacing: 24 }),
        spread({ dir: "x", spacing: 6 })
      )
      .mark(
        layer([
          rect({ x: 7.5, w: 1, y: "Min", y2: "Max", fill: "gray" }),
          rect({
            w: 16,
            y: "25-Percentile",
            y2: "75-Percentile",
            fill: "Gender",
          }),
          rect({ w: 16, h: 1.5, y: "Median", fill: "white" }),
        ])
      )
      .render(container);

    return container;
  },
};

/** The five-number summary of a group's values, missing values aside. */
const fiveNumbers = (xs: (number | null)[]) => {
  const s = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  return {
    lo: s[0],
    q1: quantileSorted(s, 0.25)!,
    median: quantileSorted(s, 0.5)!,
    q3: quantileSorted(s, 0.75)!,
    hi: s[s.length - 1],
  };
};

/**
 * A box plot from the raw rows: a reduce computes each species' summary
 * once, and returns a record; each mark reads one of its members.
 */
export const PenguinBodyMass: StoryObj<Args> = {
  args: { h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();

    const box = field("Body Mass (g)").reduce(fiveNumbers, { unit: "g" });
    chart(penguins, { h: args.h })
      .flow(spread({ by: "Species", dir: "x", spacing: 40 }))
      .mark(
        layer([
          rect({ x: 11.5, w: 1, y: box.lo(), y2: box.hi(), fill: "gray" }),
          rect({ w: 24, y: box.q1(), y2: box.q3(), fill: "Species" }),
          rect({ w: 24, h: 1.5, y: box.median(), fill: "white" }),
        ])
      )
      .render(container);

    return container;
  },
};
