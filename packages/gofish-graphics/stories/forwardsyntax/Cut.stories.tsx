import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Chart,
  layer,
  rect,
  image,
  text,
  Constraint,
  selectAll,
  spread,
  Spread,
} from "../../src/lib";
import bottlePng from "../assets/wilsonblanco.png";

// What's actually in a bottle of wine, by volume.
const bottleData = [
  { category: "Marketing", amount: 6 },
  { category: "Pretentiousness", amount: 7 },
  { category: "Sulfites", amount: 2 },
  { category: "Tannins", amount: 3 },
  { category: "Water", amount: 40 },
  { category: "Grape juice", amount: 42 },
];

const abcdData = [
  { label: "A" },
  { label: "B" },
  { label: "C" },
  { label: "D" },
];

const meta: Meta = {
  title: "Forward Syntax V3/Cut",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** Bottle sliced horizontally by `amount`, arranged vertically by spread. */
export const ImageCut: StoryObj<Args> = {
  args: { w: 400, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(bottleData)
      .flow(spread({ dir: "y", spacing: 4, reverse: true }))
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "y",
          size: "amount",
          inset: 4,
        })
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: false,
      });

    return container;
  },
};

/** Cut chart with labels added via selectAll() in a separate sub-chart. The cut
 *  chart returns just the named slices; a second sub-chart selects "part"
 *  (one ref per slice) and overlays category and amount labels at each slice's
 *  position. Each ref exposes the slice's datum via `.datum`. */
export const ImageCutWithLabels: StoryObj<Args> = {
  args: { w: 800, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    type Datum = { category: string; amount: number };

    layer<Datum>([
      Chart(bottleData)
        .flow(spread({ dir: "y", spacing: 20, reverse: true }))
        .mark(
          image({ href: bottlePng, w: 193, h: 600 })
            .cut({ dir: "y", size: "amount", inset: 4 })
            .name("part")
        ),

      Chart(selectAll<Datum>("part")).mark(((data: any[]) =>
        layer(
          data.map((d) =>
            layer([
              d.name("slice"),
              text({
                fontSize: 18,
                fontWeight: "bold",
                fill: "#1c5e20",
                text: d.datum.category,
              }).name("label"),
              text({
                fontSize: 36,
                fontFamily: "Impact",
                fill: "#1c5e20",
                text: `${d.datum.amount}`,
              }).name("amount"),
            ]).constrain(({ slice, label, amount }) => [
              Constraint.align({ y: "middle" }, [slice, label]),
              Constraint.distribute(
                { dir: "x", spacing: 12 },
                [slice, label]
              ),
              Constraint.align({ x: "middle" }, [slice, amount]),
              Constraint.align({ y: "middle" }, [slice, amount]),
            ])
          )
        )) as any
      ),
    ]).render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Solid rect cut into 4 equal slices along x with 4px gaps and centered
 *  letter labels. */
export const RectEqualSlices: StoryObj<Args> = {
  args: { w: 600, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(abcdData)
      .flow(spread({ dir: "x", spacing: 4 }))
      .mark(rect({ w: 400, h: 80, fill: "steelblue" }).cut({ dir: "x" }))
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Same shape with no spacing — adjacent slices should touch. */
export const RectNoInset: StoryObj<Args> = {
  args: { w: 600, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(abcdData)
      .flow(spread({ dir: "x", spacing: 0 }))
      .mark(rect({ w: 400, h: 80, fill: "tomato" }).cut({ dir: "x" }))
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Image cut into 3 equal slices along y. */
export const ImageEqualSlices: StoryObj<Args> = {
  args: { w: 600, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart([{ k: "top" }, { k: "mid" }, { k: "bot" }])
      .flow(spread({ dir: "y", spacing: 0, reverse: true }))
      .mark(image({ href: bottlePng, w: 193, h: 600 }).cut({ dir: "y" }))
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Low-level form: cut + Spread combinator without a Chart — sizes given
 *  explicitly. Should produce visually identical output to the chart-flow
 *  form when the same sizes are passed. */
export const LowLevelForm: StoryObj<Args> = {
  args: { w: 400, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();
    const sizes = bottleData.map((d) => d.amount);

    // Pre-resolve cut into N nodes, then hand them to Spread as children.
    // `size` accepts either a field name or an explicit pixel-extent array.
    void (async () => {
      const slices = await image({ href: bottlePng, w: 193, h: 600 }).cut({
        dir: "y",
        size: sizes,
        inset: 4,
      })(bottleData, undefined, {});
      Spread({ dir: "y", spacing: 4, reverse: true }, slices).render(
        container,
        { w: args.w, h: args.h, axes: false }
      );
    })();

    return container;
  },
};

/** dir: "x" — bottle laid horizontally, sliced vertically with size weights. */
export const ImageHorizontalCut: StoryObj<Args> = {
  args: { w: 1100, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    const data = [
      { label: "I", weight: 1 },
      { label: "II", weight: 2 },
      { label: "III", weight: 3 },
      { label: "IV", weight: 2 },
      { label: "V", weight: 1 },
    ];

    Chart(data)
      .flow(spread({ dir: "x", spacing: 6 }))
      .mark(
        image({ href: bottlePng, w: 800, h: 200 }).cut({
          dir: "x",
          size: "weight",
          inset: 4,
        })
      )
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};
