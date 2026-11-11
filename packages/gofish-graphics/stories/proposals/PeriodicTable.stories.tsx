// Prototype stories for the periodic-table layouts proposal (#1347): one
// period-by-column grid under different coordinate spaces. Throwaway.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  table,
  scatter,
  layer,
  rect,
  circle,
  polygon,
  stack,
  group,
  Constraint,
  Color,
  Coord,
  field,
  Bin,
  v,
} from "../../src/lib";
import { GoFishNode } from "../../src/ast/_node";
import type { CoordinateTransform } from "../../src/ast/coordinateTransforms/coord";
import {
  standardTable,
  leftStepTable,
  sequence,
  leftStepSequence,
  seasons,
  elements,
  benfeyTable,
  withAbundance,
  BLOCK_COLORS,
} from "./periodicTable";
import {
  spiral,
  spiralRows,
  spiralPeriod,
  along,
  archimedean,
  stadium,
  miterBand,
} from "./prototypeCoords";
import { benfeyGuide } from "./benfeyGuide";
import { scarcityGrid, tableCartogram } from "./scarcity";

const meta: Meta = {
  title: "Proposals/Periodic Table",
};
export default meta;

const color = Color.palette(BLOCK_COLORS);

// ─── EMULATION: labels that follow the coord ───────────────────────────────
//
// WALL: a label (labels/labelNode.tsx:172-181) and a text
// (shapes/text.tsx:336-342) lower their position through `toPixel` only,
// never through the coordinate transform they are lowered under, so inside
// any non-identity coord a symbol is drawn at its UNWARPED layout position
// (the budget's radians and pixels read as pixels). This patch moves the
// center of each label lowered inside a coord marked by `warpLabels` through
// that coord's transform; the glyphs stay upright. It touches only coords
// marked by these stories.
//
// (A text mark beside the rect in a `layer` was tried first and is worse: its
// pixel width is claimed along θ in radians, so every cell of the table
// widens to the whole ring.)
const WARP = "__warpLabels";
const proto = GoFishNode.prototype as any;
if (!proto[WARP]) {
  proto[WARP] = true;
  const lower = proto.INTERNAL_lower;
  proto.INTERNAL_lower = function (
    space: CoordinateTransform | undefined,
    override?: any
  ) {
    if (this.type === "label" && space && (space as any)[WARP]) {
      const t = override ?? this._displayTransform;
      const [tx, ty] = [t?.translate?.[0] ?? 0, t?.translate?.[1] ?? 0];
      const [dx, dy] = this.intrinsicDims;
      const cx = tx + dx.min + dx.size / 2;
      const cy = ty + dy.min + dy.size / 2;
      const [wx, wy] = space.transform([cx, cy]);
      override = { ...t, translate: [tx + wx - cx, ty + wy - cy] };
    }
    return lower.call(this, space, override);
  };
}
/** Mark a coord so the labels inside it follow it (see above). */
const warpLabels = (space: CoordinateTransform): CoordinateTransform =>
  ({ ...space, [WARP]: true }) as CoordinateTransform;

// ─── shared spec pieces ────────────────────────────────────────────────────

/** One cell per element: a rect filled by block, labeled by symbol.
 *  `field("block")`, not `"block"`: over an empty cell of a table a string
 *  fill is read as a literal color, and the hole is painted black. Sizes
 *  inside a coord are given as data (`v(0.95)`): a rect of literal size is
 *  drawn as an unwarped pixel box at its warped center (rect.tsx:338-355). */
const cell = (size: { w?: any; h?: any } = {}, fontSize = 11) =>
  rect({ ...size, fill: field("block") }).label("symbol", {
    position: "center",
    fontSize,
  });

/** The grid layout every table story shares: col by row, numeric order,
 *  empty cells kept as holes. Binning by a step of 1 is what puts the keys
 *  in numeric order and keeps the empty row 8 of the standard table: a plain
 *  `by: "col"` orders keys by first appearance and drops absent ones. */
const grid = (spacing: number | [number, number] = 2) =>
  table({
    by: {
      x: field("col").bin(Bin.step(1)),
      y: field("row").bin(Bin.step(1)),
    },
    spacing,
  });

// ─── stories ───────────────────────────────────────────────────────────────

export const Standard: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(standardTable(), { w: 720, h: 420, color, axes: false })
      .flow(grid())
      .mark(cell())
      .render(container);
    return container;
  },
};

export const LeftStep: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(leftStepTable(), { w: 720, h: 240, color, axes: false })
      .flow(grid(1))
      .mark(cell())
      .render(container);
    return container;
  },
};

// 720 / 2 less the default padding of 30.
const OUTER = 330;

export const SpiralGrid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(leftStepTable(), {
      w: 720,
      h: 720,
      color,
      axes: false,
      coord: warpLabels(
        spiral({ pitch: 1 / 8, innerRadius: 0.2, outerRadius: OUTER })
      ),
    })
      // Spacing along θ is in radians (a literal size is in the coord's
      // budget units), so it is 0 there.
      .flow(grid([0, 1]))
      .mark(cell())
      .render(container);
    return container;
  },
};

export const PolarGrid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(leftStepTable(), {
      w: 720,
      h: 720,
      color,
      axes: false,
      coord: warpLabels(Coord.clock({ innerRadius: 0.2 })),
    })
      .flow(grid([0, 1]))
      .mark(cell())
      .render(container);
    return container;
  },
};

export const SpiralSequence: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(sequence(), {
      w: 720,
      h: 720,
      color,
      axes: false,
      coord: warpLabels(
        along(archimedean({ turns: 4, innerRadius: 2.25 }), {
          width: 0.92,
          x: [-0.5, 117.5],
          y: [0, 1],
        })
      ),
    })
      .flow(scatter({ x: "seq" }))
      // A literal size is in the coord's budget units, which for a fitted
      // space are its data units: w: 1 is one element along the path.
      .mark(cell({ w: v(0.95), h: v(0.95) }))
      .render(container);
    return container;
  },
};

export const RaceTrack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(leftStepTable(), {
      w: 720,
      h: 480,
      color,
      axes: false,
      coord: warpLabels(
        along(stadium({ w: 6, h: 2 }), {
          closed: true,
          width: 2.4,
          x: [0.5, 32.5],
          y: [0.5, 8.5],
        })
      ),
    })
      .flow(scatter({ x: "col", y: "row" }))
      .mark(cell({ w: v(0.95), h: v(0.92) }, 10))
      .render(container);
    return container;
  },
};

// ─── Benfey ────────────────────────────────────────────────────────────────

const benfey = benfeyGuide();

/** Benfey's spiral: one band of cells in z order along a guide of four
 *  pieces (s arc, f lobe, d lobe, p arc), col along it and track across. */
export const Benfey: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(benfeyTable(), {
      w: 720,
      h: 720,
      color,
      axes: false,
      coord: warpLabels(
        along(benfey.pieces, { width: 7, x: [0.5, 32.5], y: [-0.5, 6.5] })
      ),
    })
      .flow(scatter({ x: "col", y: "track" }))
      .mark(cell({ w: v(0.95), h: v(0.95) }, 10))
      .render(container);
    return container;
  },
};

/** The guide itself: each piece drawn as a thin strip at track offset 0
 *  (one strip per column it hosts), over faint cells. */
export const BenfeyGuide: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // One strip per column on track offset 0..0.08.
    const guide = benfeyTable()
      .filter((e) => e.track === 0)
      .map((e) => ({ ...e, track: -0.46 }));
    const faint = Color.palette({
      s: "#fbe3cf",
      p: "#f7edc8",
      d: "#ddeef6",
      f: "#e9e4f6",
    });
    layer(
      {
        coord: warpLabels(
          along(benfey.pieces, { width: 7, x: [0.5, 32.5], y: [-0.5, 6.5] })
        ),
      },
      [
        chart(benfeyTable(), { color: faint })
          .flow(scatter({ x: "col", y: "track" }))
          .mark(cell({ w: v(0.95), h: v(0.95) }, 10)),
        chart(guide)
          .flow(scatter({ x: "col", y: "track" }))
          .mark(rect({ w: v(1), h: v(0.08), fill: "#222" })),
      ]
    ).render(container, { w: 720, h: 720, axes: false });
    return container;
  },
};

/** The same data and flow with no coord: every column pushed against one
 *  edge. */
export const BenfeyFlat: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(benfeyTable(), { w: 720, h: 200, color, axes: false })
      .flow(scatter({ x: "col", y: "track" }))
      .mark(cell({ w: v(0.95), h: v(0.95) }, 10))
      .render(container);
    return container;
  },
};

// ─── scarcity ──────────────────────────────────────────────────────────────

/** Equal cells, each holding a circle whose area is the element's crustal
 *  abundance (log scale, see `withAbundance`). */
export const ScarcityGlyphs: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(withAbundance(standardTable()), { w: 720, h: 420, color, axes: false })
      .flow(grid())
      .mark(
        layer([
          rect({ w: 37, h: 37, fill: "#f2f2f2" }).name("box"),
          circle({ area: "abundance", fill: field("block") }).name("dot"),
        ])
          .relate(({ box, dot }: any) => [
            Constraint.align({ x: "middle", y: "middle" }, [box, dot]),
          ])
          .label("symbol", { position: "center", fontSize: 9 })
      )
      .render(container, { legend: false });
    return container;
  },
};

const scarcityColor = Color.palette({ ...BLOCK_COLORS, blank: "#eeeeee" });
/** A symbol only where the cell has room for it. */
const roomy = (d: any) => {
  const row = Array.isArray(d) ? d[0] : d;
  return row?.abundance >= 3.5 ? row.symbol : "";
};

/**
 * Rows stay straight bands: a mosaic. Each row's height is its total
 * weight, and each cell's width its share of the row. The empty stretch
 * between groups 2 and 13 (and around the f-block) is blank cells of the
 * floor weight 1, so the blocks keep their places.
 */
export const ScarcityRows: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // Row 10 first: a y stack runs upward in key order, so row 1 ends on
    // top.
    const data = scarcityGrid().sort((a, b) => b.row - a.row || a.col - b.col);
    chart(data, { w: 720, h: 420, color: scarcityColor, axes: false })
      .flow(
        stack({ by: "row", dir: "y", size: "abundance" }),
        stack({ by: "col", dir: "x", size: field("abundance").normalize() })
      )
      .mark(
        rect({ fill: field("block"), stroke: "white", strokeWidth: 1 }).label(
          roomy,
          { position: "center", fontSize: 9 }
        )
      )
      .render(container, { legend: false });
    return container;
  },
};

/**
 * EMULATION of a table cartogram (Evans et al. 2013): every cell a convex
 * quadrilateral that keeps its four grid neighbors, area proportional to
 * its weight, inside a fixed frame. The corner positions are solved in
 * `tableCartogram` (scarcity.ts) by gradient descent; GoFish only draws the
 * polygons.
 */
export const ScarcityTable: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const cells = tableCartogram(scarcityGrid()).map((c, i) => ({
      ...c,
      id: i,
    }));
    chart(cells, { w: 720, h: 400, color: scarcityColor, axes: false })
      .flow(group({ by: "id" }))
      .mark(
        polygon({
          points: "ring",
          fill: field("block"),
          stroke: "white",
          strokeWidth: 1,
        }).label(roomy, { position: "center", fontSize: 9 })
      )
      .render(container, { legend: false });
    return container;
  },
};

// ─── along, as a layout operator (the alternative) ─────────────────────────

/**
 * EMULATION of the layout-operator reading of "along a path" (CSS
 * `offset-path` with `offset-rotate: auto`, an Illustrator scatter brush):
 * the 118 elements in z order as rigid, equal squares, each centered at an
 * equal arc-length station of SpiralSequence's spiral (on the band's center
 * line) and turned to the path's tangent. Nothing bends: the squares are
 * computed here as polygons and only drawn by GoFish.
 */
export const AlongRigid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const width = 0.92; // SpiralSequence's band
    const band = miterBand(archimedean({ turns: 4, innerRadius: 2.25 }), false);
    const step = band.L / elements.length;
    const half = (0.95 * Math.min(step, width)) / 2;
    const rows = sequence().map((e) => {
      const s = (e.seq + 0.5) * step;
      const [cx, cy] = band.at(s, width / 2);
      const [ax, ay] = band.at(s - 0.01, width / 2);
      const [bx, by] = band.at(s + 0.01, width / 2);
      const t = Math.atan2(by - ay, bx - ax);
      const [c, sn] = [Math.cos(t), Math.sin(t)];
      const ring = [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ].map(([u, w]) => [cx + u * c - w * sn, cy + u * sn + w * c]);
      return { ...e, ring };
    });
    // Keep the squares square: the chart's aspect ratio is the data's.
    const xs = rows.flatMap((r) => r.ring.map((p) => p[0]));
    const ys = rows.flatMap((r) => r.ring.map((p) => p[1]));
    const aspect =
      (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs));
    chart(rows, { w: 660, h: 660 * aspect, color, axes: false })
      .flow(group({ by: "z" }))
      .mark(
        polygon({ points: "ring", fill: field("block") }).label("symbol", {
          position: "center",
          fontSize: 10,
        })
      )
      .render(container, { legend: false });
    return container;
  },
};

// ─── spiral pitch: two candidate fixes ─────────────────────────────────────

/** Fix 1 on the table: `Coord.spiral({ pitch: 1 })`, one row per turn. */
export const PitchTable: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(leftStepTable(), {
      w: 720,
      h: 720,
      color,
      axes: false,
      coord: warpLabels(
        spiralRows({
          pitch: 1,
          rows: 8,
          spacing: 1,
          innerRadius: 0.2,
          outerRadius: OUTER,
        })
      ),
    })
      .flow(grid([0, 1]))
      .mark(cell())
      .render(container, { legend: false });
    return container;
  },
};

/** Fix 2 on the table: `Coord.spiral({ period: 32 })` over one sequence
 *  axis. */
export const PeriodTable: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(leftStepSequence(), {
      w: 720,
      h: 720,
      color,
      axes: false,
      coord: warpLabels(
        spiralPeriod({
          period: 32,
          gap: 0.03,
          innerRadius: 2,
          x: [0.5, 8 * 32 + 0.5],
          y: [0, 1],
        })
      ),
    })
      .flow(scatter({ x: "seq" }))
      .mark(cell({ w: v(1), h: v(1) }))
      .render(container, { legend: false });
    return container;
  },
};

const seasonColor = Color.palette({
  1: "#c6dbef",
  2: "#9ecae1",
  3: "#6baed6",
  4: "#4292c6",
  5: "#2171b5",
  6: "#08519c",
});

/** Fix 1 on seasons: month round, year out, and the bar inside its year's
 *  band. */
export const PitchSeasons: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seasons(), {
      w: 600,
      h: 600,
      color: seasonColor,
      axes: false,
      coord: spiralRows({
        pitch: 1,
        rows: 6,
        spacing: 6,
        innerRadius: 0.25,
        outerRadius: 270,
      }),
    })
      .flow(
        table({
          by: {
            x: field("month").bin(Bin.step(1)),
            y: field("year").bin(Bin.step(1)),
          },
          spacing: [0, 6],
        })
      )
      .mark(rect({ h: "value", fill: field("year") }))
      .render(container, { legend: false });
    return container;
  },
};

/** Fix 2 on seasons: one time axis round, 12 months per turn, and the value
 *  as the band. */
export const PeriodSeasons: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const data = seasons();
    const top = Math.max(...data.map((d) => d.value));
    chart(data, {
      w: 600,
      h: 600,
      color: seasonColor,
      axes: false,
      coord: spiralPeriod({
        period: 12,
        gap: 0.15,
        innerRadius: 1.2,
        x: [-0.5, 71.5],
        y: [0, top],
      }),
    })
      .flow(scatter({ x: "t" }))
      .mark(rect({ w: v(0.9), h: "value", fill: field("year") }))
      .render(container, { legend: false });
    return container;
  },
};
