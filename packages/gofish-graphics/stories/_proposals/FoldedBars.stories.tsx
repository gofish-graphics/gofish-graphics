// Prototype stories for the folded-bars proposal. Throwaway. Three
// families: C (today's public API), A (the fold is a coordinate transform),
// B (the fold is a layout wrap that breaks the bar into fragments).
// Everything that emulates a missing feature is in ./foldedBars.ts.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  stack,
  group,
  scatter,
  rect,
  blank,
  line,
  Curve,
  Color,
} from "../../src/lib";
import {
  occupations,
  courses,
  airConditioners,
  furniture,
  stacked,
  twoLong,
  fold,
  along,
  frameSpiral,
  leadInSpiral,
  foldRows,
  pathRows,
  frameCorners,
  wrapRows,
  CRIMSON,
  PARCHMENT,
  AC_BLUE,
} from "./foldedBars";

const meta: Meta = {
  title: "Proposals/FoldedBars",
};
export default meta;

const plate = (container: HTMLElement, bg = PARCHMENT) => {
  container.style.background = bg;
  container.style.display = "inline-block";
  container.style.padding = "12px";
  return container;
};

const PARTS = Color.palette({ one: "#dc143c", two: "#e3a21a", three: "#4682b4" });

/** "Agricultural laborers  98,400" */
const nameValue = (rows: { name: string; value: number }[]) =>
  `${rows[0].name}   ${rows[0].value.toLocaleString("en-US")}`;

/**
 * The category labels as a chart of their own, one blank row per category
 * with the same rows as the bars. WALL: a `.label()` inside a fitted coord
 * is culled (its box lies outside the frame, coord.tsx:733-758), and a
 * label inside any coord is lowered unwarped (labelNode.tsx:172-181), so the
 * whole-chart coord stories draw their labels beside the coord instead.
 */
const labelColumn = (data: any[], rows: any, h: number, text: any = "name") =>
  chart(data, { axes: false })
    .flow(rows)
    .mark(blank({ h }).label(text, { position: "outset-left", fontSize: 10 }));

// ─── Family C: today's public API ──────────────────────────────────────────

/** A folded bar's vertices as rows of their own, one table per chart: row
 *  i sits at y = -i, a lane is half a row below the last. */
const foldTable = (data: { name: string; value: number }[], at: number) =>
  data.flatMap((r, i) =>
    foldRows(r.value, { at, pitch: 0.5, y: -i }).map(([x, y], j) => ({
      name: r.name,
      j,
      x,
      y,
      label: j === 0 ? nameValue([r]) : "",
    }))
  );

export const TodayOccupations: StoryObj = {
  render: () => {
    const container = plate(initializeContainer());
    chart(foldTable(occupations, 63012), { w: 480, h: 600, axes: false })
      .flow(group({ by: "name" }))
      .mark(
        chart()
          .flow(scatter({ by: "j", x: "x", y: "y" }))
          .mark(blank().label("label", { position: "outset-left", fontSize: 10 }))
          .layer(line({ stroke: CRIMSON, strokeWidth: 10, curve: Curve.linear() }))
      )
      .render(container);
    return container;
  },
};

export const TodayCourses: StoryObj = {
  render: () => {
    const container = plate(initializeContainer());
    chart(foldTable(courses, 900), { w: 480, h: 360, axes: false })
      .flow(group({ by: "name" }))
      .mark(
        chart()
          .flow(scatter({ by: "j", x: "x", y: "y" }))
          .mark(blank().label("label", { position: "outset-left", fontSize: 10 }))
          .layer(line({ stroke: "#8b7d6b", strokeWidth: 8, curve: Curve.linear() }))
      )
      .render(container);
    return container;
  },
};

/** China's bar runs right past the plot and clockwise round it. The
 *  corners are in data units: x in millions, y in rows. */
const acTable = () => {
  const n = airConditioners.length;
  const corners = frameCorners({
    yStart: 0,
    x0: -14,
    x1: 27,
    y0: -n + 0.2,
    y1: 1.2,
    gx: 2.2,
    gy: 0.8,
    laps: 3,
  });
  // EMULATION: 480 px over ~45 units of x, 520 px over ~13 rows of y.
  const xPerY = (520 / 13) / (480 / 45);
  return airConditioners.flatMap((r, i) =>
    (i === 0 ? pathRows(r.value, corners, xPerY) : [[0, -i], [r.value, -i]]).map(
      ([x, y], j) => ({
        name: r.name,
        j,
        x,
        y,
        label: j === 0 ? r.name : "",
      })
    )
  );
};

export const TodayAirConditioners: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    chart(acTable(), { w: 480, h: 520, axes: false })
      .flow(group({ by: "name" }))
      .mark(
        chart()
          .flow(scatter({ by: "j", x: "x", y: "y" }))
          .mark(blank().label("label", { position: "outset-left", fontSize: 11 }))
          .layer(line({ stroke: AC_BLUE, strokeWidth: 16, curve: Curve.linear() }))
      )
      .render(container);
    return container;
  },
};

// ─── Family A: the fold is a coordinate transform ──────────────────────────

// One coord on the whole chart.
export const CoordOccupations: StoryObj = {
  render: () => {
    const container = plate(initializeContainer());
    const rows = spread({ by: "name", dir: "y", spacing: 18 });
    spread({ dir: "x", spacing: 4, alignment: "start" }, [
      labelColumn(occupations, rows, 10, nameValue),
      chart(occupations, { w: 440, coord: fold({ at: 63012, pitch: 14, turnCounts: false }), padding: 0 })
        .flow(rows)
        .mark(rect({ w: "value", h: 10, fill: CRIMSON })),
    ]).render(container, { w: 640, h: 620 });
    return container;
  },
};

// The lanes are 900, 900 and 452 when a turn does not count toward the
// length, and 900, 900 and about 196 when it does.
const coursesFolded = (turnCounts: boolean) => {
  const container = plate(initializeContainer());
  const rows = spread({ by: "name", dir: "y", spacing: 40 });
  spread({ dir: "x", spacing: 4, alignment: "start" }, [
    labelColumn(courses, rows, 8, nameValue),
    chart(courses, {
      w: 480,
      coord: fold({ at: 900, pitch: 40, longest: 2252, turnCounts }),
      padding: 0,
    })
      .flow(rows)
      .mark(rect({ w: "value", h: 8, fill: "#8b7d6b" })),
  ]).render(container, { w: 640, h: 380 });
  return container;
};

export const CoordCourses: StoryObj = { render: () => coursesFolded(false) };

export const CoordCoursesTurnsCount: StoryObj = { render: () => coursesFolded(true) };

// The bars start 130 px in, 62 px down; Thailand's 22 is 400 px.
export const CoordAirConditioners: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    const rows = spread({ by: "name", dir: "y", spacing: 18 });
    spread({ dir: "x", spacing: -120, alignment: "start" }, [
      spread({ dir: "y", spacing: 0 }, [blank({ h: 62 }), labelColumn(airConditioners, rows, 16)]),
      chart(airConditioners, {
        w: 640,
        h: 560,
        padding: 0,
        coord: along({
          path: frameSpiral({
            x0: 130,
            y0: 62,
            run: 400,
            inset: { right: 65, bottom: 110, left: 30, top: 34 },
            gap: 28,
            laps: 2,
          }),
          at: 22,
        }),
      })
        .flow(rows)
        .mark(rect({ w: "value", h: 16, fill: AC_BLUE })),
    ]).render(container, { w: 640, h: 560 });
    return container;
  },
};

// Each year is a lane of one spiral, 12 px apart, starting at 12 o'clock;
// the spiral moves in 72 px (six lanes) per turn; one outer turn is
// $1,800,000. The labels are pulled over the coord's box (negative
// spacing) so they end where the lanes start.
const YEARS = Color.palette({
  1875: "#e8a0a8",
  1880: "#9fa8cf",
  1885: "#b8a58f",
  1890: "#e8b830",
  1895: "#cfc8b8",
  1899: "#dc143c",
});
const yearValue = (rows: { year: string; value: number }[]) =>
  `${rows[0].year} — $${rows[0].value.toLocaleString("en-US")}`;

export const CoordFurnitureSpiral: StoryObj = {
  render: () => {
    const container = plate(initializeContainer());
    const rows = spread({ by: "year", dir: "y", spacing: 4 });
    spread({ dir: "x", spacing: -236, alignment: "start" }, [
      spread({ dir: "y", spacing: 0 }, [blank({ h: 20 }), labelColumn(furniture, rows, 8, yearValue)]),
      chart(furniture, {
        w: 500,
        h: 500,
        padding: 0,
        color: YEARS,
        legend: false,
        coord: along({
          path: leadInSpiral({ margin: 20, pitch: 72, turns: 3, leadIn: 0 }),
          at: 1800000,
        }),
      })
        .flow(rows)
        .mark(rect({ w: "value", h: 8, fill: "year" })),
    ]).render(container, { w: 560, h: 520, legend: false });
    return container;
  },
};

// Row C (250) is 2.5 lanes of 100: its first segment ends at 96, just
// before the first turn, and its second (96-206) spans the turn and runs
// into the second.
export const CoordStacked: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    const rows = spread({ by: "row", dir: "y", spacing: 36 });
    spread({ dir: "x", spacing: 4, alignment: "start" }, [
      labelColumn(stacked, rows, 10, "row"),
      chart(stacked, {
        w: 480,
        coord: fold({ at: 100, pitch: 14, longest: 250 }),
        padding: 0,
        color: PARTS,
      })
        .flow(rows, stack({ by: "part", dir: "x" }))
        .mark(rect({ w: "value", h: 10, fill: "part" })),
    ]).render(container, { w: 560, h: 240 });
    return container;
  },
};

// The same, one coord per row: each row is its own chart in the coord.
export const CoordStackedPerRow: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    chart(stacked, { w: 560, color: PARTS })
      .flow(spread({ by: "row", dir: "y", spacing: 12 }))
      .mark((rows: any[]) =>
        chart(rows, {
          coord: fold({
            at: 100,
            pitch: 14,
            band: 10,
            longest: rows.reduce((s, r) => s + r.value, 0),
            turnCounts: false,
          }),
          padding: 0,
        })
          .flow(stack({ by: "part", dir: "x" }))
          .mark(rect({ w: "value", h: 10, fill: "part" }))
      )
      .render(container);
    return container;
  },
};

// Beta (230) and Gamma (170) are adjacent and both fold at 100. One coord
// on the whole chart: the rows do not make room.
export const CoordTwoLong: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    const rows = spread({ by: "name", dir: "y", spacing: 18 });
    spread({ dir: "x", spacing: 4, alignment: "start" }, [
      labelColumn(twoLong, rows, 10),
      chart(twoLong, { w: 480, coord: fold({ at: 100, pitch: 14 }), padding: 0 })
        .flow(rows)
        .mark(rect({ w: "value", h: 10, fill: CRIMSON })),
    ]).render(container, { w: 560, h: 200 });
    return container;
  },
};

// One coord per row: each row reports its folded height and the spread
// makes room.
export const CoordTwoLongPerRow: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    chart(twoLong, { w: 560 })
      .flow(spread({ by: "name", dir: "y", spacing: 12 }))
      .mark((rows: any[]) =>
        chart(rows, {
          coord: fold({ at: 100, pitch: 14, band: 10, longest: rows[0].value, turnCounts: false }),
          padding: 0,
        }).mark(rect({ w: "value", h: 10, fill: CRIMSON }))
      )
      .render(container);
    return container;
  },
};

// Karduni et al., CHI 2020, figure 3, drawn horizontally: one fold per row,
// lanes of 1000, turns free. A (8500) has nine lanes.
const karduni = [
  { name: "A", value: 8500 },
  { name: "B", value: 700 },
  { name: "C", value: 800 },
  { name: "D", value: 100 },
  { name: "E", value: 500 },
  { name: "F", value: 3250 },
  { name: "G", value: 270 },
  { name: "H", value: 50 },
  { name: "I", value: 75 },
  { name: "J", value: 1000 },
  { name: "K", value: 3700 },
];

export const WrapKarduni: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    chart(karduni, { w: 480 })
      .flow(spread({ by: "name", dir: "y", spacing: 10 }))
      .mark((rows: any[]) =>
        chart(rows, {
          coord: fold({ at: 1000, pitch: 11, band: 8, longest: rows[0].value, turnCounts: false }),
          padding: 0,
        }).mark(rect({ w: "value", h: 8, fill: "#4c4c4c" }))
      )
      .render(container);
    return container;
  },
};

// ─── Family B: a wrap that breaks the bar into fragments (emulated) ────────

export const WrapOccupations: StoryObj = {
  render: () => {
    const container = plate(initializeContainer());
    chart(wrapRows(occupations, { at: 63012 }), { w: 440, h: 560 })
      .flow(
        spread({ by: "name", dir: "y", spacing: 12 }),
        spread({ by: "lane", dir: "y", spacing: 4, axes: false })
      )
      .mark(rect({ x: "x", w: "len", h: 10, fill: CRIMSON }))
      .render(container);
    return container;
  },
};

export const WrapCourses: StoryObj = {
  render: () => {
    const container = plate(initializeContainer());
    chart(wrapRows(courses, { at: 900 }), { w: 480, h: 240 })
      .flow(
        spread({ by: "name", dir: "y", spacing: 24 }),
        spread({ by: "lane", dir: "y", spacing: 8, axes: false })
      )
      .mark(rect({ x: "x", w: "len", h: 8, fill: "#8b7d6b" }))
      .render(container);
    return container;
  },
};

export const WrapStacked: StoryObj = {
  render: () => {
    const container = plate(initializeContainer(), "white");
    chart(wrapRows(stacked, { at: 100, key: "row" }), { w: 480, h: 140, color: PARTS })
      .flow(
        spread({ by: "row", dir: "y", spacing: 12 }),
        spread({ by: "lane", dir: "y", spacing: 4, axes: false }),
        group({ by: "part" })
      )
      .mark(rect({ x: "x", w: "len", h: 10, fill: "part" }))
      .render(container);
    return container;
  },
};
