import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  createName,
  layer,
  Layer,
  datum,
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

// Continuous y-axis: 3 bars with a vertical scale to their left.
//
// Unlike a categorical axis, the ticks are placed by their *data values*: each
// tick is pinned with `Constraint.position({ y: datum(value) })`, and the layer
// derives a y-scale ([0, yMax] → the plot height) from those position
// constraints' datum coordinates. This is a genuine continuous axis — non-uniform
// tick values would land proportionally, where the old uniform `distribute` only
// happened to look right because d3's ticks are evenly spaced.
//
// `h` defaults to the data range so the y-scale is the identity (1 unit = 1px)
// and the fixed-pixel bars line up with the axis. Changing `h` scales the axis
// and ticks together.
export const ContinuousYAxis: StoryObj<Args> = {
  args: { w: 400, h: 300 },
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
      // axis line spanning the plot height (= the data range mapped to pixels)
      rect({ w: 1, h: args.h, fill: "#999" }).name("axis"),
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

          // ── Y: bars + axis top-aligned at the plot top (value 0) ──
          Constraint.align({ y: "start" }, [g.bars, g.axis]),
          // each tick's center pinned to its data value (a `datum`, so it maps
          // through the y-scale the layer infers from these constraints — a
          // literal would instead be a raw pixel coordinate, like positioning a
          // shape). Domain [0, yMax].
          ...tickValues.map((v, i) =>
            Constraint.position({ y: datum(v) }, [ticks[i]])
          ),
          // title vertically centered on the axis line
          Constraint.align({ y: "middle" }, [g.axis, g.title]),
        ];
      })
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// Non-uniform y-axis on a *linear* scale: the tick *values* are irregularly
// chosen (not a fixed step), yet each lands at its true position because it is
// pinned with `Constraint.position({ y: datum(v) })`. On the inferred [0, 100]
// scale, 50 sits exactly halfway up and 100 at the top — the labels are the real
// values, only the spacing between them is uneven. A uniform `distribute` could
// only place them at equal intervals; this is what data-driven ticks buy you.
export const NonUniformYAxis: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    // deliberately uneven tick values (bunched toward the top)
    const tickValues = [0, 50, 75, 90, 100];
    const N = tickValues.length;

    const tick = (v: number, i: number) =>
      spread(
        { dir: "x", spacing: 3, alignment: "middle" },
        [
          text({ text: String(v), fontSize: 11, fill: "#666" }),
          rect({ w: 5, h: 1, fill: "#999" }),
        ]
      ).name(`t${i}`);

    Layer([
      // axis line spanning the plot height (the [0, 100] domain in pixels)
      rect({ w: 1, h: args.h, fill: "#999" }).name("axis"),
      ...tickValues.map(tick),
      text({ text: "score", fontSize: 13, fill: "#333" }).name("title"),
    ])
      .constrain((g) => {
        const ticks = Array.from({ length: N }, (_, i) => g[`t${i}`]);
        return [
          // ── X chain: title (x=0) → ticks → axis ──
          Constraint.align({ x: "start" }, [g.title]),
          Constraint.distribute({ dir: "x", spacing: 8 }, [g.title, ticks[N - 1]]),
          Constraint.align({ x: "end" }, ticks),
          Constraint.distribute({ dir: "x", spacing: 0 }, [ticks[0], g.axis]),

          // ── Y: axis pinned to the plot top; ticks at their data positions ──
          Constraint.align({ y: "start" }, [g.axis]),
          // datum(v) → placed at its value on the inferred linear scale, so the
          // uneven values produce uneven spacing (50 halfway, 100 at the top)
          ...tickValues.map((v, i) =>
            Constraint.position({ y: datum(v) }, [ticks[i]])
          ),
          Constraint.align({ y: "middle" }, [g.axis, g.title]),
        ];
      })
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
