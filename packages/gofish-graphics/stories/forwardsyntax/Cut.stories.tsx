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
  stack,
  Spread,
  Stack,
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

/** Two bottles, each grouped by `vintage` and cut by its own rows. The expand
 *  `cut` mark turns each group's rows into an ARRAY of slice nodes; the inner
 *  `stack` collapses that array into a single bottle node, so the outer
 *  `spread({by})` has exactly one node per group to arrange. This is the
 *  canonical way to combine `by`-grouping with an expand mark: interpose a
 *  layout operator between the grouping and the cut. */
export const GroupedCut: StoryObj<Args> = {
  args: { w: 600, h: 700 },
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

    Chart(data)
      .flow(
        spread({ by: "vintage", dir: "x", spacing: 40 }),
        stack({ dir: "y", reverse: true })
      )
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "y",
          size: "amount",
          inset: 4,
        })
      )
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Solid rect cut into 4 equal slices along x with 4px gaps (one slice per
 *  abcd row, sizes defaulted to equal). */
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

/** Recomposition sanity check: the same rect cut into 4 equal slices with
 *  spacing 0, so adjacent slice windows touch and tile the source back into a
 *  single shape. The source rect carries a visible stroke — a CORRECT
 *  recomposition shows ONE continuous border around the whole rect, whereas
 *  misaligned slice windows would reveal repeated/broken stroke lines in the
 *  interior where the slices meet. The border is the falsifiable witness. */
export const RectNoInset: StoryObj<Args> = {
  args: { w: 600, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(abcdData)
      .flow(spread({ dir: "x", spacing: 0 }))
      .mark(
        rect({
          w: 400,
          h: 80,
          fill: "tomato",
          stroke: "#333",
          strokeWidth: 3,
        }).cut({ dir: "x" })
      )
      .render(container, { w: args.w, h: args.h, axes: false });

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

    Chart([{ k: "top" }, { k: "mid" }, { k: "bot" }])
      .flow(spread({ dir: "y", spacing: 14, reverse: true }))
      .mark(image({ href: bottlePng, w: 193, h: 600 }).cut({ dir: "y" }))
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};

/** Low-level form: the pure `cut(source, opts)` primitive returns an array of
 *  slice nodes that drops straight into a Spread combinator — no Chart, no
 *  async plumbing. With `datum()` weights (relative, normalized to the source
 *  height) this is visually IDENTICAL to ImageCut, which derives the same
 *  weights from the `amount` field. */
export const LowLevelForm: StoryObj<Args> = {
  args: { w: 400, h: 700 },
  render: (args: Args) => {
    const container = initializeContainer();

    Spread(
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

    Spread(
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

    Spread(
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

/** Croissant chart: cut a source with a visible `inset`, then recompose the
 *  slices in the source's CONTINUOUS space while keeping the inset gaps. cut's
 *  inset shrinks each slice's reported bbox to its visible window, so a plain
 *  `Stack({ spacing: 0 })` would pull the windows flush and drop the gaps. The
 *  fix is user-space: pad each slice back to its full logical extent by adding
 *  `inset/2` of transparent space on each side along `dir` (an inner Stack with
 *  zero-extent spacer rects), THEN stack the padded slices with spacing 0. The
 *  result spans the source's exact width (400px) with even 20px gaps at every
 *  cut point — a row of bordered "croissant" segments. */
export const CroissantStack: StoryObj<Args> = {
  args: { w: 500, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    const inset = 20;
    const slices = cut(
      rect({
        w: 400,
        h: 80,
        fill: "wheat",
        stroke: "#8a5a16",
        strokeWidth: 2,
      }),
      { dir: "x", size: Array(4).fill(datum(1)), inset }
    );

    // Pad each slice back to its full logical extent: inset/2 of transparent
    // space on each side along `dir`, via zero-cross-extent spacer rects.
    const spacer = () =>
      rect({ w: inset / 2, h: 0, fill: "none", stroke: "none" });
    const padded = slices.map((slice) =>
      Stack({ dir: "x", spacing: 0 }, [spacer(), slice, spacer()])
    );

    Stack({ dir: "x", spacing: 0 }, padded).render(container, {
      w: args.w,
      h: args.h,
      axes: false,
    });

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

    Chart(data)
      .flow(spread({ dir: "x", spacing: 12 }))
      .mark(
        image({ href: bottlePng, w: 193, h: 600 }).cut({
          dir: "x",
          size: "weight",
          inset: 4,
        })
      )
      .render(container, { w: args.w, h: args.h, axes: false });

    return container;
  },
};
