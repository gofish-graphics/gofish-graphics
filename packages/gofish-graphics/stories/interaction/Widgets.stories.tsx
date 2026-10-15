/**
 * Widgets — the minimal `slider` + `button` demo.
 *
 * A `signal(50)` is the only state. The slider displays it (handle plus a value
 * readout beside the track) and writes it back (`value` / `onInput`, the
 * Solid/React controlled-input shape, one way each); the button resets it to 0.
 * Nothing is bound two ways, and no DOM widget is involved: every part of this
 * picture is a GoFish node in the one `<svg>`, laid out by `spreadX`.
 *
 * The root is the THUNK form of the low-level terminal
 * (`gofish(container, opts, () => node)`): a control's geometry depends on the
 * value, so the spec must be re-evaluable — a plain node is built once and
 * cannot re-place its handle.
 *
 * A press anywhere on the track jumps the handle to the pointer (the pixel →
 * value map is absolute), and `Wrapping` shows the cyclic variant: dragging off
 * one end comes back in at the other.
 *
 * capture-one snapshots the initial state: the handle at the middle of the
 * track, the button to its left, and the readout to its right.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { gofish, button, signal, slider, spreadX } from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Widgets",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 60, max: 600, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 420, h: 120 },
  render: (args: Args) => {
    const container = initializeContainer();

    const level = signal(50);

    // Created ONCE, outside the thunk: each widget owns an input (a drag, a
    // click) and one write effect, which must survive every re-resolve. What
    // the thunk re-invokes is the mark they return.
    const levelSlider = slider({
      value: level,
      onInput: (v) => level.set(v),
      domain: [0, 100],
      step: 1,
      w: 240,
    });
    const resetButton = button({
      label: "0",
      onClick: () => level.set(0),
    });

    gofish(container, { w: args.w, h: args.h }, () =>
      spreadX({ spacing: 8 }, [resetButton, levelSlider])
    );

    return container;
  },
};

/**
 * The same slider over a CYCLIC domain — a compass bearing. `wrap: true` drops
 * the clamp: dragging left off the start continues from 355°, dragging right off
 * the end continues from 0°. The `format` gives the readout its unit.
 *
 * The cycle is `hi - lo + step` (360 here, in 72 five-degree slots), so 355 is
 * followed by 0 rather than by a second copy of it.
 */
export const Wrapping: StoryObj<Args> = {
  args: { w: 420, h: 120 },
  render: (args: Args) => {
    const container = initializeContainer();

    const bearing = signal(45);

    const bearingSlider = slider({
      value: bearing,
      onInput: (v) => bearing.set(v),
      domain: [0, 355],
      step: 5,
      w: 240,
      wrap: true,
      format: (d) => `${d}°`,
    });
    const northButton = button({
      label: "N",
      onClick: () => bearing.set(0),
    });

    gofish(container, { w: args.w, h: args.h }, () =>
      spreadX({ spacing: 8 }, [northButton, bearingSlider])
    );

    return container;
  },
};
