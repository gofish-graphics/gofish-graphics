/**
 * Component layout-reactive — the reactive PIPELINE tier, off the chart pipeline.
 *
 * A low-level v1 COMPONENT rendered through the THUNK form of the terminal:
 * `GoFish(container, opts, () => node)`. Because a raw node is built once and
 * cannot re-evaluate its spec, component-level pipeline reactivity needs a thunk
 * the scheduler can re-invoke — the thunk plays exactly the role the chart
 * builder's immutable rebuild plays.
 *
 * A `wheel()` is read INSIDE the thunk (outside any `live()`), so it is a
 * PIPELINE dependency: scrolling changes the NUMBER of boxes, and each change
 * re-runs the whole component spec through the rAF-coalesced scheduler — layout
 * re-flows the spreadX. A `timer()` read inside a `live()` fill drives a paint
 * pulse on the same boxes, so both regimes coexist with no `chart()` in sight.
 *
 * capture-one snapshots the initial state: expect three boxes of increasing
 * height. (Scroll over the boxes to add/remove them in the live Storybook.)
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { GoFish, spreadX, rect, live, wheel, timer } from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Component Layout Reactive",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 460, h: 260 },
  render: (args: Args) => {
    const container = initializeContainer();

    // Read outside live() (below, inside the thunk) → a PIPELINE dependency:
    // each scroll re-runs the component spec and re-lays-out.
    const n = wheel({ range: [1, 8], initial: 3, round: true });
    // Read only inside live() → paint pulse, never a pipeline dependency.
    const t = timer({ interval: 500 });

    GoFish(container, { w: args.w, h: args.h }, () => {
      const count = n(); // spec read → re-runs on scroll
      return spreadX(
        { spacing: 16 },
        Array.from({ length: count }, (_unused, i) =>
          rect({
            w: 48,
            h: 70 + i * 18,
            fill: live(() => (t() % 2 === 0 ? "#6b9bd1" : "#3a6ea5")),
          })
        )
      );
    });

    return container;
  },
};
