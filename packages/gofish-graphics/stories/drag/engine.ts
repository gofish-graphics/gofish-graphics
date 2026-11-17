/**
 * A small GoFish-native drag engine built on Dragology's ideas
 * ("Declarative Dragging", UIST 2026), PROTOTYPE quality, story-level code.
 *
 *   1. Speculative layout: the state is any plain object the spec is a
 *      function of (`spec(state)`). The states a drag can reach come from
 *      the spec's rows (`edit`, `reorder`, `states`) or from a source the
 *      demo writes (`grab`, `regions`, `chips`: candidates, plus an `away`
 *      state outside the plot). Each is laid out with GoFish's own
 *      `toDisplayList`, cached by state.
 *   2. Key join: display items are matched across states by a stable key
 *      (the user's `key(row)` on an item's datum; chrome by role + content).
 *   3. Drop targets from layout: the dragged mark's box in each candidate
 *      layout is its target.
 *   4. Behaviors: `closest` (snap to the nearest target, optionally with the
 *      dragged mark floating under the pointer) and `between` (blend the
 *      candidate layouts: piecewise linear along a line, barycentric over a
 *      Delaunay triangulation in 2-D).
 *   5. Continuous fields: two layouts per discrete state (field at its min
 *      and max) give the field's pixel map; the pointer is inverted through it
 *      and the two layouts are blended (exact while the axis domain is fixed).
 *   6. Paint: the blended display list goes through GoFish's own painter.
 */
import { render } from "solid-js/web";
import { Delaunay } from "d3-delaunay";
import { parse, converter, formatRgb } from "culori";
import type { DisplayList } from "gofish-ir";
import { paintDocument } from "../../src/ast/displayList/paintSVG";

type Row = Record<string, any>;
type Item = DisplayList.DisplayItem;
type Affine = { tx: number; ty: number; sx: number; sy: number };
type Entry = {
  key: string;
  item: Item;
  at: Affine;
  rows?: Row[];
  /** A label tied to its mark by `attachedTo`: it carries the mark's rows. */
  label?: boolean;
};
type Layout = { entries: Entry[]; byKey: Map<string, Entry> };
type Vec = { x: number; y: number };

/** A field a drag edits. A numeric field is continuous; its range defaults
 *  to the data's extent of that field. */
export type EditField =
  | string
  | {
      field: string;
      min?: number | ((row: Row) => number);
      max?: number | ((row: Row) => number);
    };

/** What a drag edits: any plain (JSON) object the spec is a function of. */
export type State = Record<string, any>;
/** The state the row options (`edit`, `reorder`, `states`) edit: the rows,
 *  and the level order of declared domains. */
export type RowState = { rows: Row[]; order?: Record<string, unknown[]> };

/** One reachable state. With `dims` continuous parameters it is a family of
 *  states: `at(t)` for t in `range` (default [0, 1] per dimension). The
 *  layouts at the corners (each t at 0 or 1) give the pixel map; t past the
 *  corners extrapolates it. */
export type Candidate = {
  at: (t: number[]) => State;
  dims?: number;
  range?: [number, number][];
  /** Key of the dragged thing in this state's layout (default: the
   *  source's `track`). */
  track?: string;
};

export type Feel = "between" | "closest" | "floating";

/** What one drag can do. */
export type Source = {
  candidates: Candidate[];
  /** Key of the dragged thing in the candidate layouts (default: the
   *  grabbed item's key). */
  track?: string;
  /** Rows whose marks travel with the drag: they paint on top. */
  moving?: Row[];
  /** The state while the pointer is outside the plot (a removal, or no
   *  change for a drag from the palette). Without it the plot has no edge. */
  away?: State;
  feel?: Feel;
  /** A chip under the pointer: always (`inside`), or only outside the plot. */
  ghost?: { text: string; inside?: boolean };
};

/** A grabbed display item. */
export type Grabbed = {
  key: string;
  kind: string;
  rows?: Row[];
  /** A label tied to its mark; `rows` are the mark's rows. */
  label?: boolean;
};

/** The plot: the box of the data marks, from the canvas top down. */
export type Plot = { x: number; y: number; w: number; h: number };

export type DragOptions = {
  /** Which rows' marks can be dragged (all rows of a mark must pass). */
  marks?: (row: Row) => boolean;
  /** Fields the drag edits on the dragged rows. */
  edit?: EditField[];
  /** Reorder the levels of this field's domain (`order[field]`): the drag
   *  edits the domain order, never the rows. */
  reorder?: string;
  /** Escape hatch: the reachable row lists, given the dragged rows. */
  states?: (dragged: Row[], rows: Row[]) => Row[][];
  /** In place of the row options: what grabbing a display item does. */
  grab?: (g: Grabbed, state: State) => Source | undefined;
  /** Drags that start on a region of the canvas (an axis). */
  regions?: { hit: (p: Vec, plot: Plot) => boolean; source: (s: State) => Source }[];
  /** Chips in a palette above the chart; a drag starts on a chip. */
  chips?: { text: string; source: (s: State) => Source }[];
  /** A discrete state whose target box is within this many px of the
   *  pointer wins over the others. */
  snap?: number;
  /** `between` blends layouts; `closest` snaps; `floating` snaps the rest
   *  while the dragged mark follows the pointer. */
  feel?: Feel;
  /** `lazy`: lay candidates out at pointer-down. `eager`: after mount and
   *  each drop, for every draggable mark. */
  precompute?: "lazy" | "eager";
};

export type MountOptions = {
  state: State;
  key: (row: Row) => string;
  spec: (state: any) => {
    toDisplayList(o: any): Promise<DisplayList.DisplayListDocument>;
  };
  w: number;
  h: number;
  drag: DragOptions;
  debug?: boolean;
  /** Panel background painted behind the chart. */
  background?: string;
  /** Called with the state a drop would write (`preview`) and the state
   *  after each drop. */
  onState?: (state: State, preview: boolean) => void;
};

export type DragStats = {
  layouts: number;
  layoutMs: number[];
  candidatesPerDrag: number[];
  pointerDownMs: number[];
  frameMs: number[];
  eagerMs: number[];
  /** Continuous drops: max px gap between the blended preview and a real
   *  layout of the dropped rows, over every box. */
  blendErrPx: number[];
};

export type DragHandle = {
  stats: DragStats;
  state: () => State;
  /** Resolves once the initial render (and eager precompute) is done. */
  ready: Promise<void>;
  /** Resolves when the in-flight drop tween ends. */
  settled: () => Promise<void>;
  setDebug: (on: boolean) => void;
  svg: SVGSVGElement;
  /** The chip elements of the palette, by text. */
  chips: Record<string, HTMLElement>;
};

const ID: Affine = { tx: 0, ty: 0, sx: 1, sy: 1 };
const NS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------------------
// Display list -> keyed entries
// ---------------------------------------------------------------------------

function flatten(items: Item[], at: Affine, out: Entry[]) {
  for (const item of items) {
    if (item.kind === "group" && !item.filter) {
      const [tx, ty] = item.transform.translate ?? [0, 0];
      const [sx, sy] = item.transform.scale ?? [1, 1];
      flatten(
        item.children,
        {
          tx: at.tx + at.sx * tx,
          ty: at.ty + at.sy * ty,
          sx: at.sx * sx,
          sy: at.sy * sy,
        },
        out
      );
    } else out.push({ key: "", item, at });
  }
}

function keyEntries(items: Item[], key: (r: Row) => string): Layout {
  const entries: Entry[] = [];
  flatten(items, ID, entries);
  const counts = new Map<string, number>();
  // A mark's rows by its item id, so a label (`attachedTo` that id) joins
  // its mark's key group: it moves, floats and is raised with the mark.
  const rowsById = new Map<string, Row[]>();
  for (const e of entries) {
    const d = e.item.datum;
    if (d && e.item.id) rowsById.set(e.item.id, Array.isArray(d) ? d : [d]);
  }
  const ownerRows = (e: Entry) =>
    e.item.attachedTo ? rowsById.get(e.item.attachedTo) : undefined;
  const texts = entries.filter(
    (e) => !e.item.datum && e.item.kind === "text" && !ownerRows(e)
  );
  const anchor = (e: Entry): Vec => {
    const it = e.item as DisplayList.TextItem;
    return { x: e.at.tx + e.at.sx * it.x, y: e.at.ty + e.at.sy * it.y };
  };
  for (const e of entries) {
    const d = e.item.datum;
    const owner = ownerRows(e);
    let base: string;
    if (d) {
      e.rows = Array.isArray(d) ? d : [d];
      base = `m:${rowsKey(e.rows, key)}:${e.item.kind}`;
      if (e.item.kind === "text") base += `:${e.item.text}`;
    } else if (owner) {
      e.rows = owner;
      e.label = true;
      base = `m:${rowsKey(owner, key)}:label-${e.item.kind}`;
    } else if (e.item.kind === "text") {
      base = `t:${e.item.text}`;
    } else {
      // Chrome with no content of its own (a tick, a legend swatch, an axis
      // line): keyed by the nearest label. A heuristic; GoFish has no stable
      // id for chrome (see the findings file).
      const c = centerOf(e);
      let near: Entry | undefined;
      if (c)
        for (const t of texts)
          if (!near || dist2(anchor(t), c) < dist2(anchor(near), c)) near = t;
      base = `c:${e.item.kind}@${near ? (near.item as DisplayList.TextItem).text : ""}`;
    }
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    e.key = n ? `${base}#${n}` : base;
  }
  return { entries, byKey: new Map(entries.map((e) => [e.key, e])) };
}

const rowsKey = (rows: Row[], key: (r: Row) => string) =>
  [...new Set(rows.map(key))].sort().join("|");

function boxOf(e: Entry) {
  const it = e.item;
  const { tx, ty, sx, sy } = e.at;
  let b: { x: number; y: number; w: number; h: number } | undefined;
  if (it.kind === "rect" || it.kind === "image")
    b = { x: it.x, y: it.y, w: it.w, h: it.h };
  else if (it.kind === "ellipse")
    b = { x: it.cx - it.rx, y: it.cy - it.ry, w: 2 * it.rx, h: 2 * it.ry };
  else if (it.kind === "composite") b = it.bbox;
  else if (it.kind === "text" && !it.rotate) {
    // An estimate from the font size: the display list has no text metrics.
    const fs = it.fontSize ?? 12;
    const w = String(it.text).length * fs * 0.6;
    const x0 =
      it.textAnchor === "middle" ? it.x - w / 2 : it.textAnchor === "end" ? it.x - w : it.x;
    b = { x: x0, y: it.y - fs * 0.8, w, h: fs };
  }
  if (!b) return undefined;
  return { x: tx + sx * b.x, y: ty + sy * b.y, w: sx * b.w, h: sy * b.h };
}

const centerOf = (e: Entry): Vec | undefined => {
  const b = boxOf(e);
  return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

// ---------------------------------------------------------------------------
// Blending
// ---------------------------------------------------------------------------

const toRgb = converter("rgb");
const colorCache = new Map<string, any>();
const asColor = (s: string) => {
  if (!colorCache.has(s)) {
    const c = s === "none" ? undefined : parse(s);
    colorCache.set(s, c ? toRgb(c) : undefined);
  }
  return colorCache.get(s);
};
const NUM = /(-?\d*\.?\d+(?:e[-+]?\d+)?)/i;

function blendValue(vals: any[], ws: number[], h: number): any {
  const v0 = vals[h];
  if (vals.length === 1) return v0;
  if (typeof v0 === "number") {
    if (!vals.every((v) => typeof v === "number")) return v0;
    let s = 0;
    for (let i = 0; i < vals.length; i++) s += ws[i] * vals[i];
    return s;
  }
  if (typeof v0 === "string") {
    if (vals.every((v) => v === v0)) return v0;
    if (!vals.every((v) => typeof v === "string")) return v0;
    const cs = vals.map(asColor);
    if (cs.every(Boolean)) {
      const out = { mode: "rgb", r: 0, g: 0, b: 0, alpha: 0 };
      cs.forEach((c, i) => {
        out.r += ws[i] * c.r;
        out.g += ws[i] * c.g;
        out.b += ws[i] * c.b;
        out.alpha += ws[i] * (c.alpha ?? 1);
      });
      return formatRgb(out as any);
    }
    // Path data with the same command skeleton blends number by number.
    const parts = vals.map((v: string) => v.split(NUM));
    const p0 = parts[h];
    const same = parts.every(
      (p) => p.length === p0.length && p.every((s, k) => k % 2 || s === p0[k])
    );
    if (!same) return v0;
    return p0
      .map((s, k) =>
        k % 2
          ? String(
              blendValue(
                parts.map((p) => +p[k]),
                ws,
                h
              )
            )
          : s
      )
      .join("");
  }
  if (Array.isArray(v0)) {
    if (!vals.every((v) => Array.isArray(v) && v.length === v0.length))
      return v0;
    return v0.map((_, k) =>
      blendValue(
        vals.map((v) => v[k]),
        ws,
        h
      )
    );
  }
  if (v0 && typeof v0 === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v0)) {
      if (k === "datum" || k === "id" || k === "kind" || k === "text") {
        out[k] = v0[k];
        continue;
      }
      const sub = vals.map((v) => v?.[k]);
      out[k] = sub.every((s) => s !== undefined)
        ? blendValue(sub, ws, h)
        : v0[k];
    }
    return out;
  }
  return v0;
}

/** Weighted blend of keyed layouts. Items in only some states fade by the
 *  weight of the states that have them. Text never blends between strings:
 *  its content is part of its key. A negative weight extrapolates (a
 *  continuous field past its corners). */
function blendLayouts(layouts: Layout[], weights: number[]): Entry[] {
  const live = layouts
    .map((l, i) => ({ l, w: weights[i] }))
    .filter((x) => Math.abs(x.w) > 1e-6);
  live.sort((a, b) => b.w - a.w);
  // Merge key orders: the heaviest layout's order, others spliced in.
  const order: string[] = live[0].l.entries.map((e) => e.key);
  const seen = new Set(order);
  for (const { l } of live.slice(1)) {
    let prev = -1;
    for (const e of l.entries) {
      if (seen.has(e.key)) prev = order.indexOf(e.key);
      else {
        order.splice(prev + 1, 0, e.key);
        seen.add(e.key);
        prev++;
      }
    }
  }
  const out: Entry[] = [];
  for (const key of order) {
    const here = live.filter((x) => x.l.byKey.has(key));
    const kind = here[0].l.byKey.get(key)!.item.kind;
    const same = here.filter((x) => x.l.byKey.get(key)!.item.kind === kind);
    const W = same.reduce((s, x) => s + x.w, 0);
    const ws = same.map((x) => x.w / W);
    const es = same.map((x) => x.l.byKey.get(key)!);
    let item = blendValue(
      es.map((e) => e.item),
      ws,
      0
    ) as Item;
    const at = blendValue(
      es.map((e) => e.at),
      ws,
      0
    ) as Affine;
    if (W < 0.999) {
      // A copy: with one layout, `blendValue` returns the cached item.
      const op = (item.style?.opacity ?? 1) * W;
      item = { ...item, style: { ...(item.style ?? {}), opacity: op } } as Item;
    }
    out.push({ key, item, at, rows: es[0].rows, label: es[0].label });
  }
  return out;
}

const asLayout = (entries: Entry[]): Layout => ({
  entries,
  byKey: new Map(entries.map((e) => [e.key, e])),
});

function toItems(entries: Entry[]): Item[] {
  return entries.map((e) => {
    const { tx, ty, sx, sy } = e.at;
    if (tx === 0 && ty === 0 && sx === 1 && sy === 1) return e.item;
    return {
      kind: "group",
      transform: { translate: [tx, ty], scale: [sx, sy] },
      children: [e.item],
    } as Item;
  });
}

// ---------------------------------------------------------------------------
// Pointer -> weights over targets
// ---------------------------------------------------------------------------

const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function closestWeights(pts: Vec[], p: Vec): number[] {
  let best = 0;
  pts.forEach((q, i) => {
    if (dist2(q, p) < dist2(pts[best], p)) best = i;
  });
  return pts.map((_, i) => (i === best ? 1 : 0));
}

function segmentWeights(a: Vec, b: Vec, p: Vec): [number, number, number] {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L))
    : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return [1 - t, t, dist2(q, p)];
}

/** `between` weights: piecewise linear when the targets are collinear,
 *  barycentric in the Delaunay triangle holding the pointer otherwise, and
 *  the nearest hull edge outside the hull (as Dragology's default). Targets
 *  at the same spot are merged into the first (Dragology throws instead). */
function betweenWeights(pts: Vec[], p: Vec): number[] {
  const n = pts.length;
  const w = new Array(n).fill(0);
  const uniq: number[] = [];
  pts.forEach((q, i) => {
    if (!uniq.some((u) => dist2(pts[u], q) < 0.25)) uniq.push(i);
  });
  const U = uniq.map((i) => pts[i]);
  if (U.length === 1) {
    w[uniq[0]] = 1;
    return w;
  }
  // Collinear targets (all within half a pixel of one line) are a line, not a
  // triangulation: d3-delaunay jitters collinear input into sliver triangles,
  // whose barycentric weights land on the far ends of the line.
  let far = 1;
  U.forEach((q, i) => {
    if (dist2(q, U[0]) > dist2(U[far], U[0])) far = i;
  });
  const dl = Math.sqrt(dist2(U[far], U[0]));
  const collinear = U.every(
    (q) =>
      Math.abs(
        (U[far].x - U[0].x) * (q.y - U[0].y) -
          (U[far].y - U[0].y) * (q.x - U[0].x)
      ) /
        dl <
      0.5
  );
  const del = collinear ? undefined : Delaunay.from(U.map((q) => [q.x, q.y]));
  const tris = del?.triangles ?? new Uint32Array();
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [U[tris[t]], U[tris[t + 1]], U[tris[t + 2]]];
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det;
    const l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) {
      w[uniq[tris[t]]] += l1;
      w[uniq[tris[t + 1]]] += l2;
      w[uniq[tris[t + 2]]] += l3;
      return w;
    }
  }
  // Outside the hull, or collinear: nearest edge. For collinear targets the
  // "edges" are the consecutive pairs along the line.
  let edges: [number, number][] = [];
  if (!del || tris.length === 0) {
    const a = U[0];
    const d = { x: U[far].x - a.x, y: U[far].y - a.y };
    const idx = U.map((_, i) => i).sort(
      (i, j) =>
        (U[i].x - a.x) * d.x +
        (U[i].y - a.y) * d.y -
        ((U[j].x - a.x) * d.x + (U[j].y - a.y) * d.y)
    );
    for (let k = 0; k + 1 < idx.length; k++) edges.push([idx[k], idx[k + 1]]);
  } else {
    const hull = del!.hull;
    for (let k = 0; k < hull.length; k++)
      edges.push([hull[k], hull[(k + 1) % hull.length]]);
  }
  let best: [number, number, number, number, number] | undefined;
  for (const [i, j] of edges) {
    const [wi, wj, d] = segmentWeights(U[i], U[j], p);
    if (!best || d < best[4]) best = [i, j, wi, wj, d];
  }
  w[uniq[best![0]]] += best![2];
  w[uniq[best![1]]] += best![3];
  return w;
}

// ---------------------------------------------------------------------------
// Candidate states, derived from the data
// ---------------------------------------------------------------------------

/** The row options as a source: the dragged rows' fields (`edit`), the
 *  order of a domain (`reorder`), or the `states` callback. */
function rowSource(dragged: Row[], state: RowState, opts: MountOptions): Source {
  const { rows } = state;
  const order = state.order ?? {};
  const { drag, key } = opts;
  const ids = new Set(dragged.map(key));
  const isDragged = (r: Row) => ids.has(key(r));
  const fields = (drag.edit ?? []).map((f) =>
    typeof f === "string" ? { field: f } : f
  );
  const ord = fields.filter((f) => typeof dragged[0][f.field] !== "number");
  const conts = fields
    .filter((f) => typeof dragged[0][f.field] === "number")
    .map((f) => {
      const vs = rows
        .map((r) => r[f.field])
        .filter((v) => typeof v === "number");
      const ev = (x: any, dflt: number) =>
        typeof x === "function" ? x(dragged[0]) : (x ?? dflt);
      return {
        field: f.field,
        lo: ev(f.min, Math.min(...vs)),
        hi: ev(f.max, Math.max(...vs)),
      };
    });

  let states: RowState[];
  if (drag.states)
    states = drag.states(dragged, rows).map((rs) => ({ ...state, rows: rs }));
  else if (drag.reorder) {
    // Reorder edits the order of the split's domain: the dragged mark's
    // level moved to each index. The rows never change.
    const F = drag.reorder;
    const levels = order[F];
    if (!levels)
      throw new Error(`reorder: "${F}" needs its level order in \`order\`.`);
    const v = dragged[0][F];
    states = levels.map((_, j) => {
      const o = levels.filter((x) => x !== v);
      o.splice(j, 0, v);
      return { ...state, order: { ...order, [F]: o } };
    });
  } else {
    let lists = [rows];
    for (const f of ord) {
      const domain = [...new Set(rows.map((r) => r[f.field]))];
      lists = lists.flatMap((l) =>
        domain.map((v) =>
          l.map((r) => (isDragged(r) ? { ...r, [f.field]: v } : r))
        )
      );
    }
    states = lists.map((rs) => ({ ...state, rows: rs }));
  }
  const candidates: Candidate[] = states.map((s) => ({
    dims: conts.length,
    at: (t) =>
      conts.length === 0
        ? s
        : {
            ...s,
            rows: s.rows.map((r) => {
              if (!isDragged(r)) return r;
              const o = { ...r };
              conts.forEach((f, j) => (o[f.field] = f.lo + t[j] * (f.hi - f.lo)));
              return o;
            }),
          },
  }));
  const F = drag.reorder;
  const moving = F ? rows.filter((r) => r[F] === dragged[0][F]) : dragged;
  return { candidates, moving };
}

/** The plot: the box of the data marks (items with rows, labels aside),
 *  from the canvas top down to their lowest edge. GoFish's display list
 *  does not name the plot area, so this is read off the marks. */
function plotOf(l: Layout): Plot {
  let x0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const e of l.entries) {
    if (!e.rows || e.label) continue;
    const b = boxOf(e);
    if (!b) continue;
    x0 = Math.min(x0, b.x);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: 0, w: x1 - x0, h: y1 };
}

type Box = { x: number; y: number; w: number; h: number };
const inBox = (b: Box, p: Vec, pad = 0) =>
  p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
const boxDist = (b: Box, p: Vec) =>
  Math.hypot(
    Math.max(b.x - p.x, 0, p.x - b.x - b.w),
    Math.max(b.y - p.y, 0, p.y - b.y - b.h)
  );

const CHIP =
  "font:12px/1.2 system-ui,sans-serif;padding:5px 12px;border-radius:14px;" +
  "background:#fff4c2;border:1px solid #c9a227;color:#3d3200;" +
  "user-select:none;touch-action:none;white-space:nowrap;";

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountDraggable(
  container: HTMLElement,
  opts: MountOptions
): DragHandle {
  const { w, h, key } = opts;
  const stats: DragStats = {
    layouts: 0,
    layoutMs: [],
    candidatesPerDrag: [],
    pointerDownMs: [],
    frameMs: [],
    eagerMs: [],
    blendErrPx: [],
  };
  let debug = !!opts.debug;
  let state: State = opts.state;

  // The palette: chips a drag can start on.
  const chips: Record<string, HTMLElement> = {};
  if (opts.drag.chips?.length) {
    const pal = document.createElement("div");
    pal.style.cssText = "display:flex;gap:8px;margin:0 0 8px;";
    for (const c of opts.drag.chips) {
      const el = document.createElement("div");
      el.textContent = c.text;
      el.style.cssText = CHIP + "cursor:grab;";
      el.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        begin(c.source(state), undefined, pt(ev));
      });
      pal.append(el);
      chips[c.text] = el;
    }
    container.appendChild(pal);
  }

  const panel = document.createElement("div");
  // A light panel with padding: GoFish draws a little past {w, h} (legend
  // labels), and the page around it may be dark.
  const PAD = 16;
  panel.style.cssText = `position:relative;box-sizing:content-box;padding:${PAD}px;width:${w}px;height:${h}px;background:${
    opts.background ?? "#ffffff"
  };border-radius:6px;touch-action:none;user-select:none;color-scheme:light`;
  const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
  const over = document.createElementNS(NS, "svg") as SVGSVGElement;
  for (const s of [svg, over]) {
    s.setAttribute("width", String(w));
    s.setAttribute("height", String(h));
    s.style.cssText = `position:absolute;left:${PAD}px;top:${PAD}px;overflow:visible`;
  }
  over.style.pointerEvents = "none";
  const ghost = document.createElement("div");
  ghost.style.cssText =
    CHIP + "position:absolute;pointer-events:none;display:none;opacity:0.9;";
  panel.append(svg, over, ghost);
  container.appendChild(panel);

  // Layout cache. Layouts run one at a time: the layout pass uses
  // module-level contexts, so interleaving two async layouts is unsafe.
  const cache = new Map<string, Promise<Layout>>();
  let queue: Promise<unknown> = Promise.resolve();
  const layout = (s: State, keep = true): Promise<Layout> => {
    const k = JSON.stringify(s);
    let p = cache.get(k);
    if (!p) {
      p = queue.then(async () => {
        const t0 = performance.now();
        const dl = await opts.spec(s).toDisplayList({ w, h });
        stats.layoutMs.push(performance.now() - t0);
        stats.layouts++;
        return keyEntries(dl.items, key);
      });
      queue = p.catch(() => undefined);
      if (keep) cache.set(k, p);
    }
    return p;
  };

  let dispose: (() => void) | undefined;
  let shown: Entry[] = [];
  const paint = (entries: Entry[]) => {
    shown = entries;
    dispose?.();
    const items = toItems(entries);
    dispose = render(() => paintDocument(items), svg);
  };

  let current: Layout;
  /** What grabbing an entry does: the `grab` option, or the row options on
   *  a mark (not a label or a text) whose rows pass `marks`. */
  const sourceOf = (e: Entry): Source | undefined => {
    const g: Grabbed = { key: e.key, kind: e.item.kind, rows: e.rows, label: e.label };
    if (opts.drag.grab) return opts.drag.grab(g, state);
    if (
      !e.rows ||
      e.label ||
      e.item.kind === "text" ||
      !e.rows.every((r) => opts.drag.marks?.(r) ?? true)
    )
      return undefined;
    return rowSource(e.rows, state as RowState, opts);
  };

  const eager = async () => {
    const t0 = performance.now();
    const sources = [
      ...current.entries.map(sourceOf),
      ...(opts.drag.chips ?? []).map((c) => c.source(state)),
      ...(opts.drag.regions ?? []).map((r) => r.source(state)),
    ];
    for (const s of sources)
      s?.candidates.forEach((c) => cornersOf(c).forEach((x) => layout(x)));
    await queue;
    stats.eagerMs.push(performance.now() - t0);
    console.log(
      `[drag] eager precompute: ${stats.layouts} layouts cached, ${(
        performance.now() - t0
      ).toFixed(0)} ms`
    );
  };

  const ready = (async () => {
    current = await layout(state);
    paint(current.entries);
    opts.onState?.(state, false);
    if (opts.drag.precompute === "eager") await eager();
  })();

  // --- Drag state -----------------------------------------------------------
  type Cand = {
    c: Candidate;
    k: number;
    track: string;
    layouts: Layout[]; // per corner
    pos: Vec[]; // tracked item center per corner
    box: Box; // tracked item box at corner 0
  };
  type Drag = {
    feel: Feel;
    src: Source;
    markKey?: string;
    rowKeys: string;
    /** Keys of the rows whose marks travel with the drag. */
    moving: Set<string>;
    grab: Vec;
    cands: Cand[];
    away?: { state: State; layout: Layout };
    plot: Plot;
    pointer: Vec;
    mode?: string;
    choice?: number;
    shownW?: number[];
    switchFrom?: number[];
    switchT0?: number;
    drop?: State;
    dropKey?: string;
    dropLayout?: Layout;
    best?: number;
    bestCornerW?: number[];
    /** A real layout of the drop state, for the text of labels during a
     *  continuous drag (text does not blend). */
    textLayout?: Layout;
    textKey?: string;
    textBusy?: boolean;
  };
  let drag: Drag | undefined;
  // Paint order during a drag and its drop tween: the marks that travel with
  // the drag go last, so nothing covers them, and the grabbed mark (and
  // anything drawing its rows) goes last of all. Chrome has no rows and keeps
  // its place; the debug overlay is a separate SVG above the chart.
  const raise = (entries: Entry[], D: Drag): Entry[] => {
    const rank = (e: Entry) =>
      D.rowKeys && e.key.startsWith(`m:${D.rowKeys}:`)
        ? 2
        : e.rows?.length && e.rows.every((r) => D.moving.has(key(r)))
          ? 1
          : 0;
    const rs = entries.map(rank);
    return [0, 1, 2].flatMap((k) => entries.filter((_, i) => rs[i] === k));
  };
  let loading = false;
  let pendingPointer: Vec | undefined;
  let tweening: Promise<void> = Promise.resolve();

  const pt = (e: PointerEvent): Vec => {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The topmost grabbable entry under the pointer, with its source. Thin
   *  marks (a 2 px rule) get a few px of slack. */
  const hit = (p: Vec): [Entry, Source] | undefined => {
    const es = current.entries;
    for (let i = es.length - 1; i >= 0; i--) {
      const b = boxOf(es[i]);
      if (!b) continue;
      const pad = Math.max(0, 5 - Math.min(b.w, b.h) / 2);
      if (!inBox(b, p, pad)) continue;
      const s = sourceOf(es[i]);
      if (s) return [es[i], s];
    }
    return undefined;
  };
  const regionAt = (p: Vec) =>
    opts.drag.regions?.find((r) => r.hit(p, plotOf(current)));

  const cornersOf = (c: Candidate): State[] => {
    const k = c.dims ?? 0;
    return Array.from({ length: 1 << k }, (_, b) =>
      c.at(Array.from({ length: k }, (_, j) => (b >> j) & 1))
    );
  };

  const begin = async (src: Source, e: Entry | undefined, p: Vec) => {
    if (drag || loading) return;
    loading = true;
    pendingPointer = p;
    const t0 = performance.now();
    const track0 = src.track ?? e?.key;
    const raw = src.candidates.map((c) => ({
      c,
      k: c.dims ?? 0,
      track: c.track ?? track0 ?? "",
      corners: cornersOf(c),
    }));
    const layouts = await Promise.all(
      raw.map((c) => Promise.all(c.corners.map((s) => layout(s))))
    );
    const awayLayout = src.away ? await layout(src.away) : undefined;
    // A candidate whose layout lost the dragged thing has no target: drop it.
    const cands: Cand[] = [];
    raw.forEach((r, i) => {
      const ls = layouts[i];
      if (!ls.every((l) => l.byKey.has(r.track))) return;
      const es = ls.map((l) => l.byKey.get(r.track)!);
      cands.push({
        c: r.c,
        k: r.k,
        track: r.track,
        layouts: ls,
        pos: es.map((x) => centerOf(x)!),
        box: boxOf(es[0])!,
      });
    });
    if (!loading) return; // released while laying out
    const c0 = (e && centerOf(e)) ?? p;
    const moving = src.moving ?? e?.rows ?? [];
    drag = {
      feel: src.feel ?? opts.drag.feel ?? "between",
      src,
      markKey: e?.key,
      rowKeys: e?.rows ? rowsKey(e.rows, key) : "",
      moving: new Set(moving.map(key)),
      grab: { x: p.x - c0.x, y: p.y - c0.y },
      cands,
      away: src.away && awayLayout && { state: src.away, layout: awayLayout },
      plot: plotOf(current),
      pointer: pendingPointer!,
    };
    loading = false;
    stats.pointerDownMs.push(performance.now() - t0);
    stats.candidatesPerDrag.push(raw.reduce((s, c) => s + c.corners.length, 0));
    frame();
  };

  svg.addEventListener("pointerdown", (ev) => {
    if (drag || loading) return;
    const p = pt(ev);
    const hs = hit(p);
    if (hs) {
      ev.preventDefault();
      begin(hs[1], hs[0], p);
      return;
    }
    const r = regionAt(p);
    if (r) {
      ev.preventDefault();
      begin(r.source(state), undefined, p);
    }
  });

  svg.addEventListener("pointermove", (ev) => {
    if (drag || loading) return;
    const p = pt(ev);
    svg.style.cursor = hit(p) || regionAt(p) ? "grab" : "default";
  });
  window.addEventListener("pointermove", (ev) => {
    if (!drag && !loading) return;
    const p = pt(ev);
    if (loading) pendingPointer = p;
    if (!drag) return;
    drag.pointer = p;
    frame();
  });

  const frame = () => {
    if (!drag) return;
    const t0 = performance.now();
    const D = drag;
    const want = { x: D.pointer.x - D.grab.x, y: D.pointer.y - D.grab.y };
    // Continuous parameters: invert each one's pixel map (its two corner
    // layouts) by projecting the pointer onto the line between them.
    const ts = D.cands.map((C) =>
      Array.from({ length: C.k }, (_, j) => {
        const a = C.pos[0],
          b = C.pos[1 << j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const L = dx * dx + dy * dy;
        if (L < 1e-9) return 0;
        const t = ((want.x - a.x) * dx + (want.y - a.y) * dy) / L;
        const [lo, hi] = C.c.range?.[j] ?? [0, 1];
        return Math.max(lo, Math.min(hi, t));
      })
    );
    const cws = ts.map((t, i) =>
      Array.from({ length: 1 << D.cands[i].k }, (_, c) =>
        t.reduce((s, tj, j) => s * (c & (1 << j) ? tj : 1 - tj), 1)
      )
    );
    const targets = D.cands.map((C, i) =>
      C.pos.reduce(
        (s, q, c) => ({ x: s.x + cws[i][c] * q.x, y: s.y + cws[i][c] * q.y }),
        { x: 0, y: 0 }
      )
    );
    // Which state: away (outside the plot), a snapped discrete state, or
    // the feel's weights over the targets.
    let comboW = D.cands.map(() => 0);
    let mode = "free";
    const outside = !!D.away && !inBox(D.plot, D.pointer);
    if (outside || D.cands.length === 0) mode = "away";
    else {
      let snapped = -1;
      let bd = opts.drag.snap ?? -1;
      D.cands.forEach((C, i) => {
        if (C.k) return;
        const d = boxDist(C.box, want);
        if (d <= bd) {
          bd = d;
          snapped = i;
        }
      });
      if (snapped >= 0) {
        comboW[snapped] = 1;
        mode = `snap:${snapped}`;
      } else
        comboW =
          D.feel === "between"
            ? betweenWeights(targets, want)
            : closestWeights(targets, want);
    }
    const awayW = mode === "away" ? 1 : 0;
    const flatL: Layout[] = [];
    const flatW: number[] = [];
    D.cands.forEach((C, i) =>
      C.layouts.forEach((l, c) => {
        flatL.push(l);
        flatW.push(comboW[i] * cws[i][c]);
      })
    );
    if (D.away) {
      flatL.push(D.away.layout);
      flatW.push(awayW);
    }
    let best = -1;
    if (!awayW)
      comboW.forEach((x, i) => (best < 0 || x > comboW[best] ? (best = i) : 0));
    // Branch transition (Dragology's `.withBranchTransition`): when the
    // drag switches to another state (or snaps, or leaves the plot), ease
    // from the weights on screen to the new ones over 150 ms instead of
    // jumping, so axes and stacks move.
    const now = performance.now();
    const switched =
      (D.mode !== undefined && D.mode !== mode) ||
      (D.feel !== "between" && D.choice !== undefined && D.choice !== best);
    if (switched) {
      D.switchFrom = D.shownW ?? flatW;
      D.switchT0 = now;
    }
    D.choice = best;
    D.mode = mode;
    if (D.switchFrom && D.switchT0 !== undefined) {
      const u = Math.min(1, (now - D.switchT0) / 150);
      const e = 1 - (1 - u) ** 3;
      const from = D.switchFrom;
      for (let i = 0; i < flatW.length; i++)
        flatW[i] = (1 - e) * from[i] + e * flatW[i];
      if (u < 1) requestAnimationFrame(frame);
      else D.switchFrom = undefined;
    }
    D.shownW = flatW;
    let entries = blendLayouts(flatL, flatW);
    const C = best >= 0 ? D.cands[best] : undefined;
    // Text does not blend: during a continuous drag, labels take their text
    // from a real layout of the drop state, made in the background.
    if (C?.k && D.textLayout)
      entries = entries.map((e) => {
        const r = e.label && D.textLayout!.byKey.get(e.key);
        return r && r.item.kind === "text" && e.item.kind === "text"
          ? { ...e, item: { ...e.item, text: r.item.text } }
          : e;
      });
    // When floating, the dragged mark (and anything drawing the same rows)
    // moves to sit under the pointer.
    if (D.feel === "floating" && D.markKey && D.rowKeys) {
      const mine = (e: Entry) => e.key.startsWith(`m:${D.rowKeys}:`);
      const m = entries.find((e) => e.key === D.markKey);
      const c = m && centerOf(m);
      if (c) {
        const off = { x: want.x - c.x, y: want.y - c.y };
        entries = entries.map((e) =>
          mine(e)
            ? { ...e, at: { ...e.at, tx: e.at.tx + off.x, ty: e.at.ty + off.y } }
            : e
        );
      }
    }
    paint(raise(entries, D));
    // The ghost chip: under the pointer, inside the plot only if asked.
    const gh = D.src.ghost;
    if (gh && (awayW || gh.inside)) {
      ghost.textContent = gh.text;
      ghost.style.display = "block";
      // Below and right of the pointer, clear of the preview it points at.
      ghost.style.left = `${PAD + D.pointer.x + 10}px`;
      ghost.style.top = `${PAD + D.pointer.y + 10}px`;
    } else ghost.style.display = "none";
    // Drop state: away, or the chosen candidate at the inverted parameters.
    D.drop = awayW ? D.away!.state : C!.c.at(ts[best]);
    D.dropLayout = awayW ? D.away!.layout : C!.k === 0 ? C!.layouts[0] : undefined;
    D.best = best;
    D.bestCornerW = best >= 0 ? cws[best] : undefined;
    const dk = JSON.stringify(D.drop);
    if (dk !== D.dropKey) {
      D.dropKey = dk;
      opts.onState?.(D.drop, true);
    }
    if (C?.k && !D.textBusy && dk !== D.textKey) {
      D.textBusy = true;
      const want = D.drop;
      layout(want, false).then((l) => {
        D.textBusy = false;
        D.textLayout = l;
        D.textKey = JSON.stringify(want);
        if (drag === D) frame();
      });
    }
    stats.frameMs.push(performance.now() - t0);
    drawDebug(D, targets, comboW, want);
  };

  const drawDebug = (D: Drag, targets: Vec[], ws: number[], want: Vec) => {
    over.replaceChildren();
    if (!debug) return;
    const el = (tag: string, a: Record<string, any>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v));
      over.appendChild(n);
    };
    if (D.away)
      el("rect", {
        x: D.plot.x,
        y: D.plot.y,
        width: D.plot.w,
        height: D.plot.h,
        fill: "none",
        stroke: "#94a3b8",
        "stroke-dasharray": "4 4",
      });
    // Continuous parameters: the segment each family of states slides along.
    D.cands.forEach((C) => {
      if (C.pos.length > 1)
        el("line", {
          x1: C.pos[0].x,
          y1: C.pos[0].y,
          x2: C.pos[1].x,
          y2: C.pos[1].y,
          stroke: "#94a3b8",
          "stroke-dasharray": "3 3",
        });
    });
    targets.forEach((q, i) => {
      if (ws[i] > 1e-6)
        el("line", {
          x1: want.x,
          y1: want.y,
          x2: q.x,
          y2: q.y,
          stroke: "#e11d48",
          "stroke-width": 1 + 4 * ws[i],
          "stroke-opacity": 0.8,
        });
    });
    targets.forEach((q, i) =>
      el("circle", {
        cx: q.x,
        cy: q.y,
        r: 5,
        fill: ws[i] > 1e-6 ? "#e11d48" : "white",
        stroke: "#e11d48",
        "stroke-width": 1.5,
      })
    );
    el("circle", { cx: want.x, cy: want.y, r: 3, fill: "#111" });
  };

  const end = async () => {
    if (loading) {
      // Released before the candidates were laid out: no drag happened.
      loading = false;
      return;
    }
    if (!drag) return;
    const D = drag;
    drag = undefined;
    over.replaceChildren();
    ghost.style.display = "none";
    const next = D.drop ?? state;
    const target = D.dropLayout ?? (await layout(next));
    if (!D.dropLayout && D.best !== undefined && D.best >= 0 && D.bestCornerW) {
      // Check the affine claim: the blend of the cached corner layouts at
      // the inverted value against a real layout of the dropped state.
      const pred = asLayout(blendLayouts(D.cands[D.best].layouts, D.bestCornerW));
      let err = 0;
      for (const e of target.entries) {
        const p = pred.byKey.get(e.key);
        const a = boxOf(e),
          b = p && boxOf(p);
        if (a && b && e.item.kind !== "text")
          err = Math.max(
            err,
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.w - b.w),
            Math.abs(a.h - b.h)
          );
      }
      stats.blendErrPx.push(err);
    }
    // Tween from the preview to the dropped state: the drag ends as a
    // transition on the clock.
    const from = asLayout(shown);
    tweening = new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / 200);
        const e = 1 - (1 - u) ** 3;
        if (u < 1) {
          paint(raise(blendLayouts([from, target], [1 - e, e]), D));
          requestAnimationFrame(step);
        } else {
          paint(target.entries);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
    await tweening;
    state = next;
    current = target;
    opts.onState?.(state, false);
    if (opts.drag.precompute === "eager") await eager();
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  return {
    stats,
    state: () => state,
    ready,
    settled: () => tweening,
    setDebug: (on) => (debug = on),
    svg,
    chips,
  };
}
