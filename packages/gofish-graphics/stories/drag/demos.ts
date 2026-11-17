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
  selectAll,
  filter,
  project,
  layer,
  derive,
} from "../../src/lib";
import { mean, median, max } from "d3-array";
import { seafood } from "../../src/data/catch";

type Row = Record<string, any>;
import { mountDraggable, type DragHandle, type RowState } from "./engine";

export type DemoOptions = { debug?: boolean; precompute?: "lazy" | "eager" };
type Demo = (el: HTMLElement, o?: DemoOptions) => DragHandle;

// Both reorder demos edit the order of a domain, not the rows: the state's
// `order[field]` goes into the spec as that field's declared levels.
const levels = (f: string): string[] => [
  ...new Set(seafood.map((r) => (r as Row)[f] as string)),
];
type Ordered = { rows: Row[]; order: Record<string, string[]> };

// --- 1. Reorder Bars --------------------------------------------------------
const reorderBars: Demo = (el, o = {}) =>
  mountDraggable(el, {
    state: { rows: seafood, order: { lake: levels("lake") } },
    key: (r) => `${r.lake}-${r.species}`,
    spec: ({ rows, order }: Ordered) =>
      chart(rows, { schema: { lake: Unit({ domain: Domain.discrete(order.lake) }) } })
        .flow(spread({ by: "lake", dir: "x" }))
        .mark(rect({ h: "count" })),
    w: 420,
    h: 300,
    drag: { reorder: "lake", feel: "floating", precompute: o.precompute },
    debug: o.debug,
  });

// --- 2. Reorder Stack -------------------------------------------------------
// Dragging a segment up or down moves its species in the species domain, so
// every stack (and the legend) reorders together. The stack follows the
// declared levels. The palette keeps each species' color: without it the
// color scale also follows the levels, so reordering would recolor species.
const speciesColors = Color.palette({
  Bass: "#4190c5",
  Trout: "#f2cf57",
  Catfish: "#a585c9",
  Perch: "#ff9466",
  Salmon: "#40b77d",
});

const reorderStack: Demo = (el, o = {}) =>
  mountDraggable(el, {
    state: { rows: seafood, order: { species: levels("species") } },
    key: (r) => `${r.lake}-${r.species}`,
    spec: ({ rows, order }: Ordered) =>
      chart(rows, {
        schema: { species: Unit({ domain: Domain.discrete(order.species) }) },
        color: speciesColors,
      })
        .flow(
          spread({ by: "lake", dir: "x" }),
          stack({ by: "species", dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" })),
    w: 420,
    h: 300,
    drag: { reorder: "species", feel: "between", precompute: o.precompute },
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
    state: { rows: [...days, ...meetings] },
    key: (r) => r.id,
    spec: ({ rows }: RowState) =>
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
    state: { rows: leaves },
    key: (r) => r.id,
    spec: ({ rows }: RowState) =>
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
      // A treemap has no axis to blend along: the tile follows the pointer
      // and the rest snaps to the state of the nearest target.
      feel: "floating",
      precompute: o.precompute,
    },
    debug: o.debug,
  });

// --- Annotations: shared ----------------------------------------------------
// The two annotation demos edit a small spec-level state (notes, lines), not
// the data. Each piece of the spec is written twice, side by side: as the
// code it builds and as the text the spec panel prints. (The printed text is
// not evaluated: an artifact page may block `eval`.)
const totals = levels("lake").map((lake) => ({
  lake,
  count: seafood
    .filter((r) => r.lake === lake)
    .reduce((s, r) => s + r.count, 0),
}));
const lakeKey = (r: Row) => r.id ?? r.lake;
const q = (s: string) => JSON.stringify(s);

const barsSrc = `chart(totals)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }).name("bars"))`;
const bars = () =>
  chart(totals)
    .flow(spread({ by: "lake", dir: "x" }))
    .mark(rect({ h: "count" }).name("bars"));

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The spec panel: the base chart, then the annotation part (tinted). */
function specPanel(width: number, minLines: number) {
  const pre = document.createElement("pre");
  pre.style.cssText =
    `margin:8px 0 0;padding:10px 12px;width:${width}px;box-sizing:border-box;` +
    "background:#f6f8fa;color:#1f2328;border:1px solid #d0d7de;border-radius:6px;" +
    "font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
    "white-space:pre;overflow-x:auto;color-scheme:light;" +
    // Room for one annotation, so the page does not jump while dragging.
    `min-height:${Math.ceil(minLines * 11 * 1.45 + 22)}px`;
  const show = (head: string, parts: string[], preview: boolean) => {
    const note = preview ? "// what this drop writes" : "// the spec now";
    const mark = (s: string) =>
      `<span style="background:#fff4c2">${escape(s)}</span>`;
    pre.innerHTML =
      `<span style="color:#6e7781">${note}</span>\n` +
      escape(head) +
      (parts.length ? "\n" + parts.map(mark).join("\n") : "") +
      ";";
  };
  return { pre, show };
}

// --- 5. Add Note ------------------------------------------------------------
// A note is an annotation: a selection of marks (the bars, filtered to one
// lake), a subject mark (a layer over the selected bar) and a label on it.
// Dragging the Note chip onto the chart adds one; dragging a note moves it
// between the label positions of its bar, onto another bar, or out of the
// plot to remove it.
type Note = { lake: string; position: string };
const POSITIONS = ["outset-top", "inset-top", "center", "inset-bottom"];

const noteSrc = (n: Note) => `  .layer(
    chart(selectAll("bars"))
      .flow(filter((bar) => project(bar, "lake") === ${q(n.lake)}))
      .mark(([bar]) =>
        layer([bar]).label(() => String(project(bar, "count")), {
          position: ${q(n.position)},
        })
      )
  )`;
const withNote = (c: any, n: Note) =>
  c.layer(
    chart(selectAll("bars"))
      .flow(filter((bar: any) => project(bar, "lake") === n.lake))
      .mark((([bar]: any[]) =>
        layer([bar]).label(() => String(project(bar, "count")), {
          position: n.position as any,
        })) as any)
  );

const addNote: Demo = (el, o = {}) => {
  const W = 420;
  const panel = specPanel(W + 32, 13);
  type S = { notes: Note[] };
  const track = (lake: string) => `m:${lake}:label-text`;
  const free = (s: S) =>
    totals.map((t) => t.lake).filter((l) => !s.notes.some((n) => n.lake === l));
  const h = mountDraggable(el, {
    state: { notes: [] } as S,
    key: lakeKey,
    spec: (s: S) => s.notes.reduce(withNote, bars()),
    w: W,
    h: 260,
    drag: {
      feel: "closest",
      // The chip: one state per bar without a note, the note on top of it.
      chips: [
        {
          text: "Note",
          source: (s) => ({
            candidates: free(s as S).map((lake) => ({
              at: () => ({ notes: [...s.notes, { lake, position: "outset-top" }] }),
              track: track(lake),
            })),
            away: s,
            ghost: { text: "Note", inside: true },
          }),
        },
      ],
      // A note: its bar's other label positions, the free bars at the same
      // position, and away (removed).
      grab: (g, s0) => {
        const s = s0 as S;
        const lake = g.label && g.rows?.[0]?.lake;
        const note = lake && s.notes.find((n) => n.lake === lake);
        if (!note) return undefined;
        const others = s.notes.filter((n) => n !== note);
        const put = (n: Note) => ({
          at: () => ({ notes: [...others, n] }),
          track: track(n.lake),
        });
        return {
          candidates: [
            ...POSITIONS.map((position) => put({ lake: note.lake, position })),
            ...free(s).map((l) => put({ lake: l, position: note.position })),
          ],
          away: { notes: others },
          ghost: { text: "Note" },
        };
      },
      precompute: o.precompute,
    },
    debug: o.debug,
    onState: (s, preview) =>
      panel.show(barsSrc, (s as S).notes.map(noteSrc), preview),
  });
  el.appendChild(panel.pre);
  return h;
};

// --- 6. Reference Line ------------------------------------------------------
// A line is a chart of one row layered over the bars: a 2 px rule at y =
// count, with a label. A free line's row is a literal value; a line snapped
// to a statistic or a bar's top derives its row from the data, so it follows
// the data if the data change.
type Snap = { stat: "mean" | "median" | "max" } | { lake: string };
type Line = { id: string; value?: number; snap?: Snap };

const ruleSrc = `const rule = (text) =>
  rect({ y: "count", h: 2, fill: "#333" })
    .label(text, { position: "outset-top-end" });`;
const rule = (text: (d: any) => string) =>
  rect({ y: "count", h: 2, fill: "#333" }).label(text as any, {
    position: "outset-top-end",
  });

const STATS = {
  mean: (rows: Row[]) => mean(rows, (r) => r.count)!,
  median: (rows: Row[]) => median(rows, (r) => r.count)!,
  max: (rows: Row[]) => max(rows, (r) => r.count)!,
};
const lineSrc = (l: Line) => {
  if (!l.snap)
    return `  .layer(
    chart([{ id: ${q(l.id)}, count: ${l.value} }])
      .mark(rule((d) => String(d[0].count)))
  )`;
  const [expr, label] =
    "stat" in l.snap
      ? [`${l.snap.stat}(rows, (r) => r.count)`, `${l.snap.stat} `]
      : [`rows.find((r) => r.lake === ${q(l.snap.lake)}).count`, `${l.snap.lake} `];
  return `  .layer(
    chart(totals)
      .flow(derive((rows) => [{
        id: ${q(l.id)},
        count: ${expr},
      }]))
      .mark(rule((d) => \`${label}\${Math.round(d[0].count)}\`))
  )`;
};
const withLine = (c: any, l: Line) => {
  const sn = l.snap;
  if (!sn)
    return c.layer(
      chart([{ id: l.id, count: l.value }]).mark(rule((d) => String(d[0].count)))
    );
  const [value, label] =
    "stat" in sn
      ? [STATS[sn.stat], `${sn.stat} `]
      : [(rows: Row[]) => rows.find((r) => r.lake === sn.lake)!.count, `${sn.lake} `];
  return c.layer(
    chart(totals)
      .flow(derive((rows: Row[]) => [{ id: l.id, count: value(rows) }]))
      .mark(rule((d) => `${label}${Math.round(d[0].count)}`))
  );
};

/** The values a line snaps to: the statistics, then each bar's top (a bar
 *  at the max is the max). */
const snapTargets = (): Snap[] => {
  const seen = new Set<number>();
  const out: Snap[] = [];
  const add = (s: Snap, v: number) => {
    if (seen.has(Math.round(v))) return;
    seen.add(Math.round(v));
    out.push(s);
  };
  (["mean", "median", "max"] as const).forEach((stat) =>
    add({ stat }, STATS[stat](totals))
  );
  totals.forEach((t) => add({ lake: t.lake }, t.count));
  return out;
};

const referenceLine: Demo = (el, o = {}) => {
  const W = 420;
  const panel = specPanel(W + 32, 16);
  type S = { lines: Line[] };
  // The free value's two corner layouts: the line at 0 and at HI, both
  // inside the bars' domain, so the axis is the same in both and the blend
  // is exact. Past HI the pixel map extrapolates (the axis is pinned while
  // dragging); a drop above the tallest bar grows the axis, and the drop
  // tween settles it.
  const tallest = max(totals, (t) => t.count)!;
  const HI = Math.round(tallest * 0.7);
  const TOP = Math.round(tallest * 1.25);
  const nextId = (s: S) =>
    `line-${1 + Math.max(0, ...s.lines.map((l) => +l.id.split("-")[1]))}`;
  const source = (s: S, id: string, keep: Line[]) => {
    const put = (l: Line) => ({ lines: [...keep, l] });
    return {
      candidates: [
        {
          dims: 1,
          range: [[0, TOP / HI]] as [number, number][],
          at: ([t]: number[]) => put({ id, value: Math.round(t * HI) }),
        },
        ...snapTargets().map((snap) => ({ at: () => put({ id, snap }) })),
      ],
      track: `m:${id}:rect`,
      away: { lines: keep },
      ghost: { text: "Line" },
    };
  };
  const h = mountDraggable(el, {
    state: { lines: [] } as S,
    key: lakeKey,
    spec: (s: S) => s.lines.reduce(withLine, bars()),
    w: W,
    h: 260,
    drag: {
      feel: "closest",
      snap: 8,
      chips: [
        {
          text: "Line",
          source: (s) => source(s as S, nextId(s as S), (s as S).lines),
        },
      ],
      // Pull a new line out of the y axis: the strip left of the plot.
      regions: [
        {
          hit: (p, plot) =>
            p.x < plot.x && p.x > plot.x - 40 && p.y >= 0 && p.y <= plot.h,
          source: (s) => source(s as S, nextId(s as S), (s as S).lines),
        },
      ],
      // An existing line (its rule or its label): re-drag it, or remove it.
      grab: (g, s0) => {
        const s = s0 as S;
        const id = g.rows?.[0]?.id;
        const line = id && s.lines.find((l) => l.id === id);
        if (!line) return undefined;
        return source(s, id, s.lines.filter((l) => l !== line));
      },
      precompute: o.precompute,
    },
    debug: o.debug,
    onState: (s, preview) =>
      panel.show(
        (s as S).lines.length ? `${ruleSrc}\n\n${barsSrc}` : barsSrc,
        (s as S).lines.map(lineSrc),
        preview
      ),
  });
  el.appendChild(panel.pre);
  return h;
};

export const demos: Record<string, Demo> = {
  "reorder-bars": reorderBars,
  "reorder-stack": reorderStack,
  scheduler,
  "treemap-reparent": treemapReparent,
  "add-note": addNote,
  "reference-line": referenceLine,
};
