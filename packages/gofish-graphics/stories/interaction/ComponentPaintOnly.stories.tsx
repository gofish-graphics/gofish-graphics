/**
 * Component paint-only — the reactive PAINT tier with ZERO runtime.
 *
 * This is a low-level v1 COMPONENT: a `layer` of a `spreadX` of raw `rect`s plus
 * a `text` label, with no `chart()` builder and no data binding. It is rendered
 * through the plain `GoFish(container, opts, NODE)` terminal — a NODE, not a
 * thunk — so NO `InteractionRuntime` is ever created and NO DOM event listeners
 * are attached (there is nothing to hit-test; you will find no `data-gf-id` in
 * the output). Yet the `live()` fills and the `live()` text still patch every
 * frame.
 *
 * That is the point: paint reactivity is runtime-INDEPENDENT. A `live()` channel
 * bakes a per-item thunk at lower time and `paintSVG` calls it in Solid JSX
 * attribute position regardless of any runtime, so Solid tracks whatever signals
 * the thunk reads and patches only that one attribute. Here the signals are a
 * RAW Solid `createSignal` (imported straight from `solid-js`, not a gofish
 * input primitive) and a gofish `timer()` read inside `live()`.
 *
 * capture-one snapshots one early frame: expect three side-by-side boxes and a
 * small text caption — the initial state.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { createSignal } from "solid-js";
import { initializeContainer } from "../helper";
import { GoFish, layer, spreadX, rect, text, live, timer } from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Component Paint Only",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 420, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();

    // A RAW Solid signal — no gofish input primitive at all. A plain interval
    // flips it; a live() thunk that reads it patches at paint with zero runtime.
    const [on, setOn] = createSignal(false);
    setInterval(() => setOn((v) => !v), 700);

    // A gofish timer(), read ONLY inside live() → drives paint pulses only.
    const t = timer({ interval: 450 });

    const node = layer([
      spreadX({ spacing: 18 }, [
        rect({
          w: 90,
          h: 130,
          fill: live(() => (on() ? "#d62728" : "#6b9bd1")),
        }),
        rect({
          w: 90,
          h: 130,
          fill: live(() => (t() % 2 === 0 ? "#2ca02c" : "#9467bd")),
        }),
        // A plain static fill for contrast — never re-evaluated.
        rect({ w: 90, h: 130, fill: "#e0a030" }),
      ]),
      text({
        x: 4,
        y: 158,
        fontSize: 16,
        fill: "#333",
        text: live(() => (on() ? "state: on" : "state: off")),
      }),
    ]);

    // Plain NODE (not a thunk): the static terminal. No runtime is created,
    // yet the live channels above still patch reactively.
    GoFish(container, { w: args.w, h: args.h }, node);

    return container;
  },
};
