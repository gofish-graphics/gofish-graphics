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
import bellCurveSvg from "../assets/bellcurve.svg";

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
    ]).render(container, { axes: false });

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

    Chart(data)
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

    Chart(abcdData)
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

/** Croissant chart: slice a continuous DISTRIBUTION shape (a bell curve) into
 *  gapped vertical bands that keep their original x positions — the gesture of
 *  a [croissant chart](https://vis.khoury.northeastern.edu/pubs/Fygenson2026CroissantChartsModulating/).
 *
 *  The source is a filled gaussian SVG, cut `dir: "x"` into 6 bands of UNEQUAL
 *  `datum()` weights (narrow in the tails, wide over the peak) so the slicing
 *  reads as sampling a density rather than a regular grid. A visible `inset`
 *  carves a gap out of each band.
 *
 *  cut's inset shrinks each slice's reported bbox to its visible window, so a
 *  plain flush `Stack` would pull the windows flush and drop the gaps (`Stack`
 *  recomposes its children flush by design — it has no spacing option). The fix
 *  is user-space: pad each slice back to its full logical extent by adding
 *  `inset/2` of transparent space on each side along `dir` (an inner Stack with
 *  zero-cross-extent spacer rects), THEN flush-stack the padded slices. The
 *  recomposed row spans the source's exact width (400px),
 *  so every band sits at its true continuous-x position with an even `inset`
 *  gap at each cut point.
 *
 *  A hand-composed continuous x axis (a thin baseline rect + a few numeric
 *  `text` labels at known fractions of the 400px width) is layered under the
 *  bands. The low-level Stack of masked slices carries SIZE space, not a
 *  continuous POSITION domain, so the renderer's `axes` option can't synthesize
 *  one — the axis here is drawn by hand from public primitives and aligned to
 *  the band row with `Constraint`. */
export const CroissantStack: StoryObj<Args> = {
  args: { w: 520, h: 260 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Croissant Chart",
      description:
        "A gaussian density sliced into gapped vertical bands of unequal width that hold their true x positions, sampling the distribution as a croissant chart over a hand-drawn standard-deviation axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const W = 400;
    const inset = 16;
    // Unequal weights: narrow bands in the tails, wide bands over the peak.
    const weights = [1, 1.6, 2.4, 2.4, 1.6, 1];
    const slices = cut(image({ href: bellCurveSvg, w: W, h: 120 }), {
      dir: "x",
      size: weights.map((wt) => datum(wt)),
      inset,
    });

    // Pad each slice back to its full logical extent: inset/2 of transparent
    // space on each side along `dir`, via zero-cross-extent spacer rects.
    const spacer = () =>
      rect({ w: inset / 2, h: 0, fill: "none", stroke: "none" });
    const padded = slices.map((slice) =>
      Stack({ dir: "x" }, [spacer(), slice, spacer()])
    );

    const bands = Stack({ dir: "x" }, padded).name("bands");

    // Hand-composed continuous x axis. The low-level Stack of masked slices has
    // SIZE space (no continuous POSITION domain), so the renderer's `axes`
    // option can't synthesize an axis — we draw one from public primitives. The
    // axis is its own W-wide sub-layer: a full-width baseline rect plus numeric
    // labels pinned by LITERAL pixel x (frac * W) in the sub-layer's frame. The
    // domain is [-3, 3] standard deviations (the gaussian spans mu ± ~3sigma).
    const axisTicks = [
      { frac: 0, label: "-3" },
      { frac: 0.25, label: "-1.5" },
      { frac: 0.5, label: "0" },
      { frac: 0.75, label: "1.5" },
      { frac: 1, label: "3" },
    ];
    const axis = layer([
      rect({ w: W, h: 1.5, fill: "#999" }).name("axisLine"),
      ...axisTicks.map((t, i) =>
        text({ text: t.label, fontSize: 12, fill: "#555" }).name(`lab${i}`)
      ),
    ])
      .constrain((g: any) => [
        // Pin the baseline rect at the sub-layer origin, then place each label's
        // center at its literal x = frac * W and drop it below the line.
        Constraint.align({ x: "start", y: "start" }, [g.axisLine]),
        ...axisTicks.flatMap((t, i) => [
          Constraint.position({ x: t.frac * W }, [g[`lab${i}`]]),
          Constraint.distribute({ dir: "y", spacing: 6 }, [g.axisLine, g[`lab${i}`]]),
        ]),
      ])
      .name("axis");

    layer([bands, axis])
      .constrain(({ bands, axis }: any) => [
        // Axis row centered under the bands (both are W wide).
        Constraint.align({ x: "middle" }, [bands, axis]),
        Constraint.distribute({ dir: "y", spacing: 12 }, [axis, bands]),
      ])
      .render(container, { axes: false });

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
