import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  layer,
  rect,
  image,
  text,
  Constraint,
  spread,
  stack,
  cut,
  datum,
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
  title: "Forward Syntax/Cut",
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

    chart(bottleData, { w: args.w, h: args.h })
      .flow(spread({ dir: "y", spacing: 4, reverse: true }))
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "y",
          size: "amount",
          inset: 4,
        })
      )
      .render(container, { axes: false });

    return container;
  },
};

/** Cut chart with labels added via a chained `.layer()` sub-chart. The cut
 *  chart returns just the named slices; the empty-scope `.layer(chart()...)`
 *  tier inherits those slices (one ref per slice) and overlays category and
 *  amount labels at each slice's position. Each ref exposes the slice's datum
 *  via `.datum`. */
export const ImageCutWithLabels: StoryObj<Args> = {
  args: { w: 800, h: 700 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "What's in a Bottle of Wine",
      description:
        "A wine bottle sliced into proportional bands by ingredient and exploded into a vertical stack, with each slice labeled by category and its share of the bottle.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // The cut ties each slice's image band to data order (slice i = band i,
    // top→bottom). To land Grape juice (the bulk) at the BOTTOM showing the
    // bottle BODY, it must be the LAST data row (bottom band) AND positioned
    // last — so reverse the data and keep `reverse: true` on the spread.
    chart([...bottleData].reverse())
      .flow(spread({ dir: "y", spacing: 20, reverse: true }))
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "y",
          size: "amount",
          inset: 4,
        })
      )
      .layer(
        chart().mark(((data: any[]) =>
          layer(
            data.map((d) =>
              layer([
                d.name("slice"),
                text({
                  fontSize: 18,
                  fontWeight: "bold",
                  fill: "#1c5e20",
                  text: d.datum[0].category,
                }).name("label"),
                text({
                  fontSize: 36,
                  fontFamily: "Impact",
                  fill: "#1c5e20",
                  text: `${d.datum[0].amount}`,
                }).name("amount"),
              ]).relate(({ slice, label, amount }) => [
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
        )
      )
      .render(container, { axes: false });

    return container;
  },
};

/** Two vintages side by side, each bottle exploded into its own rows'
 *  proportions. The outer `spread({ by: "vintage" })` arranges one bottle per
 *  vintage along x; the inner `spread({ dir: "y", spacing: 14, reverse: true })`
 *  collapses each group's array of cut slices into a single node — but with
 *  visible 14px spacing, so each bottle reads as an EXPLODED stack of its three
 *  slices rather than a packed-back-together whole. (We interpose `spread`, not
 *  `stack`, precisely because `stack` recomposes the slices flush — it has no
 *  spacing option — whereas `spread` separates them.) Compare the slice heights
 *  between the two bottles: 2019 splits 40/42/18 (a tall middle band), 2021
 *  splits 55/30/15 (a dominant bottom band) — the differing proportions are the
 *  point. This is the canonical way to combine `by`-grouping with an expand
 *  mark: interpose a layout operator between the grouping and the cut. */
export const GroupedCut: StoryObj<Args> = {
  args: { w: 600, h: 760 },
  render: (args: Args) => {
    const container = initializeContainer();

    const data = [
      { vintage: "2019", category: "Water", amount: 40 },
      { vintage: "2019", category: "Grape juice", amount: 42 },
      { vintage: "2019", category: "Other", amount: 18 },
      { vintage: "2021", category: "Water", amount: 55 },
      { vintage: "2021", category: "Grape juice", amount: 30 },
      { vintage: "2021", category: "Other", amount: 15 },
    ];

    chart(data, { w: args.w, h: args.h })
      .flow(
        spread({ by: "vintage", dir: "x", spacing: 40 }),
        spread({ dir: "y", spacing: 14, reverse: true })
      )
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "y",
          size: "amount",
          inset: 4,
        })
      )
      .render(container, { axes: false });

    return container;
  },
};

/** Solid rect cut into 4 equal slices along x with 4px gaps (one slice per
 *  abcd row, sizes defaulted to equal). */
export const RectEqualSlices: StoryObj<Args> = {
  args: { w: 600, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(abcdData, { w: args.w, h: args.h })
      .flow(spread({ dir: "x", spacing: 4 }))
      .mark(rect({ w: 400, h: 80, fill: "steelblue" }).cut({ dir: "x" }))
      .render(container, { axes: false });

    return container;
  },
};

/** Regression coverage for `stack`'s flush recomposition of a cut. The same
 *  rect is cut into 4 equal slices and collapsed back with the `stack`
 *  operator, which recomposes its children flush by design — `StackOptions =
 *  Omit<SpreadOptions, "spacing" | "glue">`, so there is NO spacing option and
 *  adjacent slice windows necessarily tile the source back into a single shape.
 *  The source rect carries a visible stroke — a CORRECT recomposition shows ONE
 *  continuous border around the whole rect, whereas misaligned slice windows
 *  would reveal repeated/broken stroke lines in the interior where the slices
 *  meet. The continuous border is the falsifiable witness. This story exists
 *  purely to pin that flush-recompose behavior; do not use flush `stack` as the
 *  collapse operator in stories that demonstrate other features. */
export const RectFlushStack: StoryObj<Args> = {
  args: { w: 600, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(abcdData, { w: args.w, h: args.h })
      .flow(stack({ dir: "x" }))
      .mark(
        rect({
          w: 400,
          h: 80,
          fill: "tomato",
          stroke: "#333",
          strokeWidth: 3,
        }).cut({ dir: "x" })
      )
      .render(container, { axes: false });

    return container;
  },
};

/** Image cut into 3 equal slices along y, then exploded vertically with a 14px
 *  gap between bands — so the bottle reads as three separated horizontal slabs
 *  (top / middle / bottom) rather than one intact image. */
export const ImageEqualSlices: StoryObj<Args> = {
  args: { w: 600, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart([{ k: "top" }, { k: "mid" }, { k: "bot" }], { w: args.w, h: args.h })
      .flow(spread({ dir: "y", spacing: 14, reverse: true }))
      .mark(image({ href: bottlePng, w: 193, h: 600 }).cut({ dir: "y" }))
      .render(container, { axes: false });

    return container;
  },
};

/** Low-level form: the pure `cut(source, opts)` primitive returns an array of
 *  slice nodes that drops straight into a Spread combinator — no chart, no
 *  async plumbing. With `datum()` weights (relative, normalized to the source
 *  height) this is visually IDENTICAL to ImageCut, which derives the same
 *  weights from the `amount` field. */
export const LowLevelForm: StoryObj<Args> = {
  args: { w: 400, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    spread(
      { dir: "y", spacing: 4, reverse: true },
      cut(image({ href: bottlePng, w: 193, h: 600 }), {
        dir: "y",
        size: bottleData.map((d) => datum(d.amount)),
        inset: 4,
      })
    ).render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Absolute-pixel sizes: a 600px-wide rect cut into windows of [100, 100, 200]
 *  along x. Raw numbers are ABSOLUTE source pixels — the windows consume the
 *  source from the left (0–100, 100–200, 200–400) and the leftover 200px of
 *  source (400–600) is simply omitted, never appearing in any slice. Contrast
 *  with datum() weights, which always fill the source exactly. */
export const RectAbsoluteSizes: StoryObj<Args> = {
  args: { w: 600, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    spread(
      { dir: "x", spacing: 8 },
      cut(rect({ w: 600, h: 80, fill: "seagreen" }), {
        dir: "x",
        size: [100, 100, 200],
      })
    ).render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Flexbox-style mixed sizes: a 600px-wide stroked rect cut into four windows
 *  `[100, datum(1), datum(2), 50]` along x. The raw numbers (100, 50) are FIXED
 *  end caps that claim their pixels first; the two `datum()` weights split the
 *  remaining 450px in a 1:2 ratio (150px, 300px). Spread with an 8px gap so the
 *  fixed caps and the weighted middle slices are individually visible: widths
 *  read left-to-right as 100, 150, 300, 50. */
export const MixedSizes: StoryObj<Args> = {
  args: { w: 700, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    spread(
      { dir: "x", spacing: 8 },
      cut(
        rect({
          w: 600,
          h: 80,
          fill: "mediumpurple",
          stroke: "#2e1065",
          strokeWidth: 3,
        }),
        { dir: "x", size: [100, datum(1), datum(2), 50] }
      )
    ).render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** dir: "x" — the upright bottle sliced into vertical strips of varying width
 *  by `weight`, then exploded apart along x. The bottle keeps its natural
 *  193×600 aspect so every strip masks real image content.
 *
 *  Pitfall this replaces: an earlier version rendered the portrait bottle at a
 *  non-intrinsic w:800,h:200. With the image mark's default
 *  preserveAspectRatio "xMidYMid meet", the bottle letterboxes into a small
 *  centered upright figure, so most dir-x slice windows masked empty
 *  whitespace and the story looked like one tiny intact bottle. Keep the
 *  intrinsic aspect (as here), or pass preserveAspectRatio "none" to stretch. */
export const ImageHorizontalCut: StoryObj<Args> = {
  args: { w: 700, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    const data = [
      { label: "I", weight: 1 },
      { label: "II", weight: 2 },
      { label: "III", weight: 3 },
      { label: "IV", weight: 2 },
      { label: "V", weight: 1 },
    ];

    chart(data, { w: args.w, h: args.h })
      .flow(spread({ dir: "x", spacing: 12 }))
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "x",
          size: "weight",
          inset: 4,
        })
      )
      .render(container, { axes: false });

    return container;
  },
};
