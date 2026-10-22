/**
 * Component pointer — event inputs off the chart pipeline.
 *
 * A low-level COMPONENT (a `spreadX` of raw `rect`s, no `chart()`, no data)
 * rendered through the THUNK form: `gofish(container, opts, () => node)`. A
 * `pointer()` is read in each box's fill, `when(p.over)`, an expression on a
 * paint channel, so hovering a box recolors only that box — a paint patch with
 * zero pipeline re-runs.
 *
 * Hit-testing needs `data-gf-id` on the boxes, which is emitted only when an
 * InteractionRuntime is attached. The runtime is what the thunk form installs:
 * when the thunk is evaluated under the ambient interactive context, the
 * resolve-time evaluation of each paint-tier fill reads `pointer()`, which
 * registers the input — so `runtime.hasWork()` is true and the runtime is
 * threaded through paint (emitting the ids and wiring the delegated pointer
 * listeners). A plain-node render would install no runtime, so a component that
 * wants pointer hit-testing must use the thunk form.
 *
 * The reference-equality trick: a low-level mark carries no datum on its own (there is
 * no data binding), so we give each box one by INVOKING the mark with a
 * one-row list — `rect({…})([box])` (a mark's input is always a list). That
 * list becomes the box's datum, and it is the very list `pointer().datum()`
 * returns on hit-test — so `p.over` is true on the hovered box alone.
 *
 * capture-one snapshots the initial (un-hovered) state: expect five boxes, all
 * in the base color.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { gofish, spreadX, rect, pointer, when } from "../../src/lib";

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

    gofish(container, { w: args.w, h: args.h }, () =>
      spreadX(
        { spacing: 14, alignment: "middle" },
        boxes.map((box) =>
          // Invoke the mark with `[box]` so this rect's datum IS that list. Reading
          // pointer() in a paint-tier fill (at resolve, under the ambient context)
          // registers the input → the runtime attaches for hit-testing.
          // `p.over` compares this box's datum with the hovered box's datum,
          // the same list by reference on a hit.
          rect({
            w: 70,
            h: 60 + box.i * 18,
            fill: when(p.over).then("#d62728").otherwise("#6b9bd1"),
          })([box])
        )
      )
    );

    return container;
  },
};
