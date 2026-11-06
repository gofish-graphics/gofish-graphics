// Throwaway prototypes for the #1331 proposal (proposals/petal-user-space).
// Not a gallery story. Delete once the design is decided.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import { color } from "../../src/color";
import {
  chart,
  scatter,
  layer,
  rect,
  Constraint,
  stack,
  petal,
  polygon,
  derive,
  createMark,
  Coord,
} from "../../src/lib";
import { getValue, isValue, MaybeValue } from "../../src/ast/data";
import { GoFishNode } from "../../src/ast/_node";
import {
  displayDims as displayDimsOf,
  elaborateDims,
  deferAxisDims,
  FancyDims,
} from "../../src/ast/dims";
import { pointOrMagnitude } from "../../src/ast/underlyingSpace";
import { lowerStyle, roleFor } from "../../src/ast/displayList/lowerHelpers";
import { resolveColorChannel } from "../../src/color";
import { MARK_CHANNELS } from "../../src/ast/markChannels.generated";

const meta: Meta = { title: "Proposals/Petal User Space" };
export default meta;

const R = 90;
const lakeA = seafood.filter((d) => d.lake === "Lake A");
const total = lakeA.reduce((s, d) => s + d.count, 0);

const head = (mark: any, coord: any = Coord.polar()) => {
  const container = initializeContainer();
  chart(lakeA, { coord, axes: false, w: 220, h: 220 })
    .flow(stack({ by: "species", dir: "x", h: R }))
    .mark(mark)
    .render(container);
  return container;
};

// Today: the bespoke mark.
export const Today: StoryObj = {
  render: () => head(petal({ w: "count", fill: "species" })),
};

// The petal outline in the unit box [0,1]²: u across the slot, v from the
// center outward. Five points; under polar the two slanted edges become
// spiral arcs.
const PETAL: [number, number][] = [
  [0, 0],
  [0, 0.5],
  [0.5, 1],
  [1, 0.5],
  [1, 0],
];

// Approach A, writable today: compute each ring in data space (angle in
// count units, radius 0..1) and let polygon's data-bound points go through
// the polar warp. The user does the stacking by hand.
export const DataRing: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(lakeA, { coord: Coord.polar(), axes: false, w: 220, h: 220 })
      .flow(
        derive((rows) => {
          let at = 0;
          return rows.map((d) => {
            const a = at;
            at += d.count;
            return {
              ...d,
              ring: PETAL.map(([u, v]) => [a + u * d.count, v]),
            };
          });
        })
      )
      .mark(polygon({ points: "ring", fill: "species" }))
      .render(container);
    return container;
  },
};

// Approach B, prototyped: a box-relative outline. The real API would be
// `polygon({ w: "count", h: R, points: PETAL })`, the library scaling the
// unit points into the box `stack` gives the mark. The prototype does that
// scaling by hand: inside polar the slot is count·(2π/total) wide (radians)
// and R tall (pixels).
const boxPolygonOf = (
  span: number,
  h: number,
  ring: [number, number][] = PETAL
) =>
  createMark(
    ({ count, of, fill }: { count: any; of?: any; fill: string }) => {
      const w = (getValue(count) * span) / (of ? getValue(of) : total);
      return polygon({
        points: ring.map(([u, v]) => [u * w, v * h]) as any,
        fill,
      }) as any;
    },
    { count: "raw", of: "raw", fill: "color" } as any
  );
const boxPolygon = boxPolygonOf(2 * Math.PI, R);
export const BoxRing: StoryObj = {
  render: () => head((boxPolygon as any)({ count: "count", fill: "species" })),
};

// A harder coord: clock (12 o'clock, clockwise) with a donut hole.
const donutClock = () => Coord.clock({ innerRadius: 0.4 });
export const DonutClockToday: StoryObj = {
  render: () => head(petal({ w: "count", fill: "species" }), donutClock()),
};
export const DonutClockBoxRing: StoryObj = {
  render: () =>
    head(
      (boxPolygon as any)({ count: "count", fill: "species" }),
      donutClock()
    ),
};

// Approach C, prototyped: a local-frame glyph. The real API would be
// `path({ w: "count", h: R, d: PETAL_D })`: an SVG path in the unit box,
// drawn in the box's tangent frame, i.e. mapped by the coord's linear
// approximation at the box center. Curves stay exact beziers; the coord only
// places, sizes and turns the glyph. This copies today's petal node and
// swaps its hard-coded path for that mapping.
const PETAL_D = "M.5 0 L0 .5 Q0 .75 .5 1 Q1 .75 1 .5 Z";

const parseUnitPath = (d: string) =>
  (d.match(/[MLQZ][^MLQZ]*/gi) ?? []).map((seg) => ({
    cmd: seg[0].toUpperCase(),
    nums: (seg.slice(1).match(/-?\d*\.?\d+/g) ?? []).map(Number),
  }));

const Glyph = ({
  d,
  fill = "black",
  warpPoints = false,
  ...fancyDims
}: {
  d: string;
  fill?: any;
  warpPoints?: boolean;
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims);
  const node = new GoFishNode(
    {
      type: "glyph-proto",
      args: { dims },
      color: fill,
      resolveUnderlyingSpace: () => [
        pointOrMagnitude(dims[0].min, dims[0].size),
        pointOrMagnitude(dims[1].min, dims[1].size),
      ],
      layout: (size: any, scales: any) => {
        const w = isValue(dims[0].size)
          ? getValue(dims[0].size!) * scales[0]?.sigma!
          : (dims[0].size ?? size[0]);
        const h = isValue(dims[1].size)
          ? getValue(dims[1].size!) * scales[1]?.sigma!
          : (dims[1].size ?? size[1]);
        return {
          intrinsicDims: [
            { min: 0, size: w },
            { min: 0, size: h },
          ],
          transform: {
            translate: [getValue(dims[0].min!), getValue(dims[1].min!)],
          },
        };
      },
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel }: any,
        _children: any,
        node: any
      ) => {
        const box = displayDimsOf(intrinsicDims, transform);
        const t0 = box[0].min ?? 0;
        const tw = box[0].size ?? 0;
        // The interior is y-down: interior y is the negated radius, so the
        // box's radii run from -(min + size) to -min.
        const rh = box[1].size ?? 0;
        const r0 = -((box[1].min ?? 0) + rh);
        // The coord at a point (θ, radius r).
        const f = (t: number, r: number): [number, number] =>
          coordinateTransform
            ? coordinateTransform.transform([t, -r])
            : [t, -r];
        const tc = t0 + tw / 2;
        const rc = r0 + rh / 2;
        const C = f(tc, rc);
        const e = 1e-4;
        const a = f(tc + e, rc);
        const b = f(tc, rc + e);
        const J = [
          [(a[0] - C[0]) / e, (b[0] - C[0]) / e],
          [(a[1] - C[1]) / e, (b[1] - C[1]) / e],
        ];
        const map = (u: number, v: number) => {
          // Warp each point (vertex or control point) through the full
          // coord; the curves between them are then drawn on screen.
          if (warpPoints) return toPixel(f(t0 + u * tw, r0 + v * rh)).join(",");
          const du = (u - 0.5) * tw;
          const dv = (v - 0.5) * rh;
          return toPixel([
            C[0] + J[0][0] * du + J[0][1] * dv,
            C[1] + J[1][0] * du + J[1][1] * dv,
          ]).join(",");
        };
        const out = parseUnitPath(d)
          .map(({ cmd, nums }) => {
            const pts: string[] = [];
            for (let i = 0; i + 1 < nums.length; i += 2)
              pts.push(map(nums[i], nums[i + 1]));
            return cmd + pts.join(" ");
          })
          .join(" ");
        const unitScale = node.getRenderSession().scaleContext?.unit;
        return [
          {
            kind: "path",
            d: out,
            role: roleFor(node.datum),
            datum: node.datum,
            style: lowerStyle({ fill: resolveColorChannel(fill, unitScale) }),
          },
        ];
      },
    } as any,
    []
  );
  (node as any)._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
  return node;
};
const glyph = createMark(Glyph as any, { ...MARK_CHANNELS.petal } as any);

export const TangentGlyph: StoryObj = {
  render: () =>
    head((glyph as any)({ w: "count", d: PETAL_D, fill: "species" })),
};

// The same two marks with no coord: a stacked bar of glyphs.
const bars = (mark: any) => {
  const container = initializeContainer();
  chart(lakeA, { axes: false, w: 300, h: 120 })
    .flow(stack({ by: "species", dir: "x", h: 100 }))
    .mark(mark)
    .render(container);
  return container;
};
export const BoxRingCartesian: StoryObj = {
  render: () =>
    bars((boxPolygonOf(300, 100) as any)({ count: "count", fill: "species" })),
};
export const TangentGlyphCartesian: StoryObj = {
  render: () =>
    bars((glyph as any)({ w: "count", h: 100, d: PETAL_D, fill: "species" })),
};

// The front-page flower chart with approach B's prototype in place of petal.
const stemData = seafood.map((d) => ({
  ...d,
  x: catchLocations[d.lake as keyof typeof catchLocations].x,
  lakeTotal: seafood
    .filter((e) => e.lake === d.lake)
    .reduce((s, e) => s + e.count, 0),
}));
const flowerChart = (petalMark: any) => {
  const container = initializeContainer();
  const flower = chart({ coord: Coord.polar(), axes: false })
    .flow(stack({ by: "species", dir: "x", h: 40 }))
    .mark(petalMark);
  chart(stemData, { axes: false, w: 400, h: 400 })
    .flow(scatter({ by: "lake", x: "x" }))
    .mark(
      layer([
        rect({ w: 4, h: "count", fill: color.green[5] }).name("stem"),
        flower.name("flower"),
      ]).relate(({ stem, flower }) => [
        Constraint.align({ x: "middle", y: ["end", "middle"] }, [stem, flower]),
      ])
    )
    .render(container);
  return container;
};
export const FlowerBoxRing: StoryObj = {
  render: () =>
    flowerChart(
      (boxPolygonOf(2 * Math.PI, 40) as any)({
        count: "count",
        of: "lakeTotal",
        fill: "species",
      })
    ),
};
export const FlowerToday: StoryObj = {
  render: () => flowerChart(petal({ w: "count", fill: "species" })),
};

// Round 2: wide slots. Nine points fitted (fixed, for every slot angle) by
// minimizing the largest outline gap to today's petal over the flower
// chart's slot angles (tests/tmp/petal-snips/search2.py).
const NINE: [number, number][] = [
  [0, 0],
  [0, 0.5],
  [0.15, 0.55],
  [0.32, 0.74],
  [0.5, 1],
  [0.68, 0.74],
  [0.85, 0.55],
  [1, 0.5],
  [1, 0],
];
// Quadratic Béziers whose control points are warped like vertices; the
// curves are drawn on screen. The control (1/6, 3/4) is today's control
// point in the narrow-slot limit.
const QUAD_D = "M.5 0 L0 .5 Q.16667 .75 .5 1 Q.83333 .75 1 .5 Z";

const lakeF = stemData.filter((d) => d.lake === "Lake F");
const wideHead = (mark: any) => {
  const container = initializeContainer();
  chart(lakeF, { coord: Coord.polar(), axes: false, w: 220, h: 220 })
    .flow(stack({ by: "species", dir: "x", h: R }))
    .mark(mark)
    .render(container);
  return container;
};
const ringMark = (h: number, ring: [number, number][]) =>
  (boxPolygonOf(2 * Math.PI, h, ring) as any)({
    count: "count",
    of: "lakeTotal",
    fill: "species",
  });
const quadMark = () =>
  (glyph as any)({ w: "count", d: QUAD_D, warpPoints: true, fill: "species" });

export const WideToday: StoryObj = {
  render: () => wideHead(petal({ w: "count", fill: "species" })),
};
export const WidePentagon: StoryObj = {
  render: () => wideHead(ringMark(R, PETAL)),
};
export const WideNine: StoryObj = {
  render: () => wideHead(ringMark(R, NINE)),
};
export const WideQuad: StoryObj = {
  render: () => wideHead(quadMark()),
};
export const FlowerNine: StoryObj = {
  render: () => flowerChart(ringMark(40, NINE)),
};
export const FlowerQuad: StoryObj = {
  render: () => flowerChart(quadMark()),
};
