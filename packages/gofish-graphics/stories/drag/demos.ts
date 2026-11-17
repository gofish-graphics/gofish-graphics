/**
 * The drag prototypes, shared by the Storybook stories (Drag.stories.tsx)
 * and the standalone bundle (proposals/dragology/demo/).
 */
import {
  chart,
  spread,
  stack,
  rect,
  group,
  treemap,
  Tile,
  Unit,
  Domain,
  Color,
} from "../../src/lib";
import { seafood } from "../../src/data/catch";
import { mountDraggable, type DragHandle } from "./engine";

export type DemoOptions = { debug?: boolean; precompute?: "lazy" | "eager" };
type Demo = (el: HTMLElement, o?: DemoOptions) => DragHandle;

// --- 1. Reorder Bars --------------------------------------------------------
const reorderBars: Demo = (el, o = {}) =>
  mountDraggable(el, {
    data: seafood,
    key: (r) => `${r.lake}-${r.species}`,
    spec: (rows) =>
      chart(rows)
        .flow(spread({ by: "lake", dir: "x" }))
        .mark(rect({ h: "count" })),
    w: 420,
    h: 300,
    drag: { reorder: "lake", feel: "floating", precompute: o.precompute },
    debug: o.debug,
  });

// --- 2. Move Segment --------------------------------------------------------
// Each catch is its own segment (stacked by id), so a segment moved into a
// lake that already has its species stays one segment instead of merging.
// The lake order and the species colors are pinned in the spec. Unpinned,
// GoFish orders categories by first appearance in the data, so moving the
// first row (Lake A's Bass) would reorder the lakes and recolor the species
// in every candidate state. The species colors need a palette as well as the
// species levels: with a lake Unit declared, the color scale ignores the
// species Unit's levels (a GoFish bug, see the findings file).
const catchSchema = {
  lake: Unit({
    domain: Domain.discrete([...new Set(seafood.map((r) => r.lake))]),
  }),
  species: Unit({
    domain: Domain.discrete([...new Set(seafood.map((r) => r.species))]),
  }),
};
const speciesColors = Color.palette({
  Bass: "#4190c5",
  Trout: "#f2cf57",
  Catfish: "#a585c9",
  Perch: "#ff9466",
  Salmon: "#40b77d",
});
const catchRows = seafood.map((r, i) => ({ id: `c${i}`, ...r }));

const moveSegment: Demo = (el, o = {}) =>
  mountDraggable(el, {
    data: catchRows,
    key: (r) => r.id,
    spec: (rows) =>
      chart(rows, { schema: catchSchema, color: speciesColors })
        .flow(spread({ by: "lake", dir: "x" }), stack({ by: "id", dir: "y" }))
        .mark(rect({ h: "count", fill: "species" })),
    w: 420,
    h: 300,
    drag: { edit: ["lake"], feel: "floating", precompute: o.precompute },
    debug: o.debug,
  });

// --- 3. Scheduler -----------------------------------------------------------
const ROOMS = ["Room 1", "Room 2", "Room 3", "Room 4"];
const DAY = { start: 9, end: 17 };
const COLORS = [
  "#3b82f6",
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];
const meetings = [
  { id: "standup", room: "Room 1", start: 9.5, length: 1 },
  { id: "design", room: "Room 1", start: 13, length: 2 },
  { id: "review", room: "Room 2", start: 10, length: 1.5 },
  { id: "lunch", room: "Room 2", start: 12, length: 1 },
  { id: "hiring", room: "Room 3", start: 11, length: 2.5 },
  { id: "planning", room: "Room 4", start: 14, length: 2 },
  { id: "retro", room: "Room 3", start: 15, length: 1.5 },
].map((m, i) => ({ ...m, kind: "meeting", color: COLORS[i] }));
// Each room's day is a row too: it draws the track and holds the time axis
// at the whole day, so moving a meeting never rescales the axis.
const days = ROOMS.map((room) => ({
  id: `day-${room.replace(" ", "")}`,
  room,
  start: DAY.start,
  length: DAY.end - DAY.start,
  kind: "day",
  color: "#eef0f3",
}));

const scheduler: Demo = (el, o = {}) =>
  mountDraggable(el, {
    data: [...days, ...meetings],
    key: (r) => r.id,
    spec: (rows) =>
      chart(rows)
        .flow(spread({ by: "room", dir: "y", spacing: 8 }), group({ by: "id" }))
        .mark(
          rect({
            x: "start",
            w: "length",
            h: 30,
            rx: 4,
            fill: (d: any) => (Array.isArray(d) ? d[0] : d).color,
          })
        ),
    w: 480,
    h: 200,
    drag: {
      marks: (r) => r.kind === "meeting",
      edit: [
        "room",
        { field: "start", min: DAY.start, max: (r) => DAY.end - r.length },
      ],
      feel: "between",
      precompute: o.precompute,
    },
    debug: o.debug,
  });

// --- 4. Treemap Reparent ----------------------------------------------------
const leaves = [
  { id: "apple", group: "Fruit", size: 6 },
  { id: "pear", group: "Fruit", size: 3 },
  { id: "plum", group: "Fruit", size: 2 },
  { id: "kale", group: "Greens", size: 5 },
  { id: "chard", group: "Greens", size: 2 },
  { id: "leek", group: "Greens", size: 3 },
  { id: "oat", group: "Grains", size: 4 },
  { id: "rye", group: "Grains", size: 2 },
  { id: "rice", group: "Grains", size: 5 },
  { id: "bean", group: "Pulses", size: 3 },
  { id: "pea", group: "Pulses", size: 2 },
  { id: "lentil", group: "Pulses", size: 4 },
];
const GROUPS = ["Fruit", "Greens", "Grains", "Pulses"];

const treemapReparent: Demo = (el, o = {}) =>
  mountDraggable(el, {
    data: leaves,
    key: (r) => r.id,
    spec: (rows) =>
      chart(rows, {
        axes: false,
        schema: { group: Unit({ domain: Domain.discrete(GROUPS) }) },
      })
        .flow(
          treemap({
            by: "group",
            size: "size",
            tile: Tile.squarify(),
            padding: 6,
            sort: "none",
          }),
          treemap({
            by: "id",
            size: "size",
            tile: Tile.squarify(),
            sort: "none",
          })
        )
        .mark(
          rect({ fill: "group", stroke: "white", strokeWidth: 2 }).label("id", {
            position: "center",
            color: "white",
            fontSize: 11,
          })
        ),
    w: 420,
    h: 300,
    drag: {
      // Reparent: the leaf into each other group, unless that would empty
      // the group it leaves (a group with no leaves disappears).
      states: ([leaf], rows) =>
        rows.filter((r) => r.group === leaf.group).length < 2
          ? [rows]
          : GROUPS.map((g) =>
              rows.map((r) => (r.id === leaf.id ? { ...r, group: g } : r))
            ),
      feel: "between",
      precompute: o.precompute,
    },
    debug: o.debug,
  });

export const demos: Record<string, Demo> = {
  "reorder-bars": reorderBars,
  "move-segment": moveSegment,
  scheduler,
  "treemap-reparent": treemapReparent,
};
