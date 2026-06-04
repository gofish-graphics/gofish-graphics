import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  createName,
  layer,
  Layer,
  rect,
  ref,
  spread,
  text,
  type Token,
} from "../../src/lib";
import { nice, ticks } from "d3-array";

/**
 * attempt to hand-draw axes using the gofish spec. a test of completeness of our core constraint API. 
 */

const meta: Meta = {
  title: "Low Level Syntax/Axes",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// Shared bar definition — both stories use the same three bars, indexed a/b/c.
const HEIGHTS = [100, 280, 150];
const BAR_FILL = "#457b9d";

const bars = (names: (string | Token)[] = ["a", "b", "c"]) => [
  rect({ w: 40, h: HEIGHTS[0], fill: BAR_FILL }).name(names[0]),
  rect({ w: 40, h: HEIGHTS[1], fill: BAR_FILL }).name(names[1]),
  rect({ w: 40, h: HEIGHTS[2], fill: BAR_FILL }).name(names[2]),
];

// Cross-tier constraints via global tokens + refs
export const OrdinalXAxis: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    // create global tokens for each bar + group of bars
    const a = createName("a");
    const b = createName("b");
    const c = createName("c");
    const barsTok = createName("bars");

    layer({ x: 20, y: 20 }, [
      // barsTok = spread x of 3 bars
      spread({ dir: "x", alignment: "start" }, bars([a, b, c])).name(barsTok),

      // labels: layer of 3 spreadY(referenced bar, label) 
      layer([
        spread({ dir: "y", spacing: 8, alignment: "middle" }, [
          text({ text: "salmon", fontSize: 12, fill: "#666" }),
          ref(a)
        ]),
        spread({ dir: "y", spacing: 8, alignment: "middle" }, [
          text({ text: "bass", fontSize: 12, fill: "#666" }),
          ref(b),
        ]),
        spread({ dir: "y", spacing: 8, alignment: "middle" }, [
          text({ text: "trout", fontSize: 12, fill: "#666" }),
          ref(c),
        ]),
      ]),

      // title: spreadY(barsTok, title)
      spread({ dir: "y", spacing: 24, alignment: "middle" }, [
        text({ text: "species", fontSize: 14, fill: "#333" }),
        ref(barsTok),
      ]),
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};

// Continuous y-axis: 3 bars with a vertical scale to their left
export const ContinuousYAxis: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const TICK_COUNT = 5;

    // get nice domain from the data: [0, max(HEIGHTS)] rounded out to align with nice ticks
    const [, yMax] = nice(0, Math.max(...HEIGHTS), TICK_COUNT);
    const tickValues = ticks(0, yMax, TICK_COUNT);
    const N = tickValues.length;

    // each tick = spreadX(label, tick)
    const tick = (v: number, i: number) =>
      spread(
        { dir: "x", spacing: 3, alignment: "middle" },
        [
          text({ text: String(v), fontSize: 11, fill: "#666" }),
          rect({ w: 5, h: 1, fill: "#999" }),
        ]
      ).name(`t${i}`);

    Layer([
      // bars wrapped in a spread so the outer constraints address them as one
      spread({ dir: "x", alignment: "start" }, bars()).name("bars"),
      // axis line spanning nice domain
      rect({ w: 1, h: yMax, fill: "#999" }).name("axis"),
      ...tickValues.map(tick),
      text({ text: "count", fontSize: 13, fill: "#333" }).name("title"),
    ])
      .constrain((g) => {
        const ticks = Array.from({ length: N }, (_, i) => g[`t${i}`]);
        return [
          Constraint.align({ x: "start" }, [g.title]),
          Constraint.distribute({ dir: "x", spacing: 8 }, [g.title, ticks[N - 1]]),
          // right-align the tick column so every mark's right edge sits at
          // the same x (each tick's right edge is its mark's right edge)
          Constraint.align({ x: "end" }, ticks),
          // axis flush against the right edge of the tick column
          Constraint.distribute({ dir: "x", spacing: 0 }, [ticks[0], g.axis]),
          Constraint.distribute({ dir: "x", spacing: 6 }, [g.axis, g.bars]),

          // ── Y: bars + axis top-aligned, ticks distributed along axis ─
          Constraint.align({ y: "start" }, [g.bars, g.axis]),
          // top tick's middle pinned to the axis line's start (= axis top)
          Constraint.align({ y: ["middle", "start"] }, [ticks[0], g.axis]),
          // ticks distributed center-to-center; step = yMax/(N-1) lands the
          // last tick's center on the axis line's bottom edge
          Constraint.distribute(
            { dir: "y", spacing: yMax / (N - 1), mode: "center" },
            ticks
          ),
          // title vertically centered on the axis line
          Constraint.align({ y: "middle" }, [g.axis, g.title]),
        ];
      })
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
