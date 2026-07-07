/**
 * Component pointer — event inputs off the chart pipeline.
 *
 * A low-level v1 COMPONENT (a `spreadX` of raw `rect`s, no `chart()`, no data)
 * rendered through the THUNK form: `GoFish(container, opts, () => node)`. A
 * `pointer()` is read INSIDE a `live()` fill, so hovering a box recolors only
 * that box — a paint patch with zero pipeline re-runs.
 *
 * Hit-testing needs `data-gf-id` on the boxes, which is emitted only when an
 * InteractionRuntime is attached. The runtime is what the thunk form installs:
 * when the thunk is evaluated under the ambient interactive context, the
 * resolve-time evaluation of each `live()` fill reads `pointer()`, which
 * registers the input — so `runtime.hasWork()` is true and the runtime is
 * threaded through paint (emitting the ids and wiring the delegated pointer
 * listeners). A plain-node render would install no runtime, so a component that
 * wants pointer hit-testing must use the thunk form.
 *
 * The reference-equality trick: a v1 mark carries no datum on its own (there is
 * no data binding), so we give each box one by INVOKING the mark with a small
 * object — `rect({…})(box)`. That object becomes the box's datum, and it is the
 * very object `pointer().datum()` returns on hit-test — so `d === p.datum()`
 * identifies the hovered box.
 *
 * capture-one snapshots the initial (un-hovered) state: expect five boxes, all
 * in the base color.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { GoFish, spreadX, rect, live, pointer } from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Component Pointer",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 460, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    const p = pointer();

    // One small object per box — its identity is the box's datum (below).
    const boxes = Array.from({ length: 5 }, (_unused, i) => ({ i }));

    GoFish(container, { w: args.w, h: args.h }, () =>
      spreadX(
        { spacing: 14, alignment: "middle" },
        boxes.map((box) =>
          // Invoke the mark with `box` so this rect's datum IS `box`. Reading
          // pointer() in live() (at resolve, under the ambient context)
          // registers the input → the runtime attaches for hit-testing. `d` is
          // this box's datum; `p.datum()` is the hovered box's datum — the same
          // object by reference on a hit.
          rect({
            w: 70,
            h: 60 + box.i * 18,
            fill: live((d) => (d === p.datum() ? "#d62728" : "#6b9bd1")),
          })(box)
        )
      )
    );

    return container;
  },
};
