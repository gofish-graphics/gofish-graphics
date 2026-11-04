import DATA from "./datasets.json";
import { Pool } from "./pool";
import {
  computeSet,
  type BlobMember,
  type JoinEdge,
  type Params,
  type Pt,
  type SetResult,
  type ShapeKind,
} from "./compute";

// this page's own script, for starting it again as the compute workers (pool.ts)
const SCRIPT = (globalThis as { __SCRIPT?: string | null }).__SCRIPT ?? null;

// ── data ─────────────────────────────────────────────────────────────────────
type Paint = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
};
type DataSet = {
  members: BlobMember[];
  avoiding: BlobMember[];
  /** frame to pixel: x + tx, flip * y + ty */
  T: [number, number, number];
  paint: Paint;
};
type Dataset = {
  id: string;
  label: string;
  note: string;
  call: string;
  avoidable: boolean;
  avoidSpelling: string;
  avoidLabel: string;
  avoidDefault: boolean;
  padding: number;
  clearance: number;
  story: Partial<State>;
  width: number;
  height: number;
  scenery: string;
  sets: DataSet[];
};
const DATASETS = DATA as unknown as Dataset[];

// ── state ────────────────────────────────────────────────────────────────────
type State = Omit<Params, "avoid" | "draft"> & {
  dataset: string;
  avoidOn: Record<string, boolean>;
  showLinks: boolean;
  showMembers: boolean;
};
const BLOB = {
  shape: "blob" as ShapeKind,
  convexity: 0.5,
  connection: 1,
  neck: 1,
  holes: false,
};
const FILLET = {
  shape: "fillet" as ShapeKind,
  radius: null,
  neck: 0.5,
  holes: false,
};
const CLEARANCE = 4; // enclose's default clearance
const ds0 = DATASETS.find((d) => d.id === "chartaccent")!;
let state: State = {
  dataset: ds0.id,
  ...BLOB,
  radius: null,
  padding: ds0.padding,
  clearance: ds0.clearance,
  avoidOn: Object.fromEntries(DATASETS.map((d) => [d.id, d.avoidDefault])),
  showLinks: false,
  showMembers: false,
  pieces: "avoid",
};
const dataset = (): Dataset => DATASETS.find((x) => x.id === state.dataset)!;
const avoiding = () => dataset().avoidable && !!state.avoidOn[state.dataset];
/** the fillet's radius: the padding unless one is set */
const radiusNow = () => state.radius ?? state.padding;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const num = (v: number) => String(+v.toFixed(2));
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ── the spelling ─────────────────────────────────────────────────────────────
/** The call these settings stand for, defaults left out. The presets spine, hull and oval are
 *  named only when every other shape option is at its default. */
const spelling = () => {
  const d = dataset(),
    o: string[] = [];
  let shape: string;
  if (state.shape === "blob") {
    const plain = !state.holes && eq(state.neck, 1) && eq(state.connection, 1);
    const preset = !plain
      ? null
      : eq(state.convexity, 0)
        ? "spine"
        : eq(state.convexity, 1)
          ? "hull"
          : eq(state.convexity, 2)
            ? "oval"
            : null;
    if (preset) shape = `Shape.${preset}()`;
    else {
      if (!eq(state.convexity, BLOB.convexity))
        o.push(`convexity: ${num(state.convexity)}`);
      if (!eq(state.connection, 1))
        o.push(`connection: ${num(state.connection)}`);
      // PROTOTYPE: not an option of enclose yet, only the playground's switch
      if (state.connection < 1 && state.pieces !== "avoid")
        o.push(`pieces: "${state.pieces}" /* PROTOTYPE */`);
      if (!eq(state.neck, 1)) o.push(`neck: ${num(state.neck)}`);
      if (state.holes) o.push("holes: true");
      shape = `Shape.blob(${o.length ? `{ ${o.join(", ")} }` : ""})`;
    }
  } else {
    if (state.radius !== null) o.push(`radius: ${num(state.radius)}`);
    if (!eq(state.neck, FILLET.neck)) o.push(`neck: ${num(state.neck)}`);
    if (state.holes) o.push("holes: true");
    shape = `Shape.fillet(${o.length ? `{ ${o.join(", ")} }` : ""})`;
  }
  const e = [`shape: ${shape}`, `padding: ${num(state.padding)}`];
  if (avoiding()) {
    e.push(d.avoidSpelling);
    if (!eq(state.clearance, CLEARANCE))
      e.push(`clearance: ${num(state.clearance)}`);
  }
  return `enclose({ ${e.join(", ")} }, ${d.call})`;
};

// ── presets ──────────────────────────────────────────────────────────────────
const PRESETS: Record<string, () => Partial<State>> = {
  spine: () => ({ ...BLOB, convexity: 0 }),
  hull: () => ({ ...BLOB, convexity: 1 }),
  oval: () => ({ ...BLOB, convexity: 2 }),
  blob: () => ({ ...BLOB }),
  fillet: () => ({ ...FILLET }),
  story: () => {
    const d = dataset();
    const base = d.story.shape === "fillet" ? FILLET : BLOB;
    return {
      ...base,
      ...d.story,
      padding: d.padding,
      clearance: d.clearance,
      avoidOn: { ...state.avoidOn, [d.id]: d.avoidDefault },
    };
  },
};
const presetOf = (): string | null => {
  if (avoiding()) return null;
  for (const k of ["spine", "hull", "oval", "blob", "fillet"]) {
    const p = PRESETS[k]() as Record<string, unknown>;
    const s = state as unknown as Record<string, unknown>;
    if (
      Object.keys(p).every((key) =>
        typeof p[key] === "number" && typeof s[key] === "number"
          ? eq(p[key] as number, s[key] as number)
          : p[key] === s[key]
      )
    )
      return k;
  }
  return null;
};

// ── controls ─────────────────────────────────────────────────────────────────
type Key =
  | "convexity"
  | "connection"
  | "neck"
  | "radius"
  | "padding"
  | "clearance";
const SLIDERS: Key[] = [
  "convexity",
  "connection",
  "neck",
  "radius",
  "padding",
  "clearance",
];
const valueOf = (k: Key) => (k === "radius" ? radiusNow() : state[k]);
const fmt = (k: Key) =>
  k === "radius"
    ? `${num(radiusNow())} px${state.radius === null ? " (= padding)" : ""}`
    : k === "padding" || k === "clearance"
      ? `${num(state[k])} px`
      : num(state[k]);

const syncControls = () => {
  const d = dataset();
  const blob = state.shape === "blob";
  for (const k of SLIDERS) {
    $<HTMLInputElement>(k).value = String(valueOf(k));
    $(`${k}-out`).textContent = fmt(k);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-shape]"))
    b.setAttribute("aria-checked", String(b.dataset.shape === state.shape));
  for (const id of ["convexity-field", "connection-field"])
    $(id).hidden = !blob;
  // neck: blob's links never vanish (0.05 up); fillet's 0 draws none
  $<HTMLInputElement>("neck").min = blob ? "0.05" : "0";
  $<HTMLInputElement>("neck").value = String(state.neck);
  $("neck-hint").textContent = blob
    ? "The width of each link as a share of the padded members it joins: 1 is no neck."
    : "The width of each link between pieces closer than twice the radius, as a share of the padded members it joins. 0 draws no links: the pieces stay apart.";
  $("radius-field").hidden = blob;
  // the padding's place on the radius slider, and the reset
  $("radius-pad").style.left = `${(100 * Math.min(60, state.padding)) / 60}%`;
  $<HTMLButtonElement>("radius-reset").disabled = state.radius === null;
  $<HTMLInputElement>("holes").checked = state.holes;
  $<HTMLInputElement>("show-links").checked = state.showLinks;
  $<HTMLInputElement>("show-members").checked = state.showMembers;
  $<HTMLSelectElement>("pieces").value = state.pieces;
  $("pieces-field").hidden = !blob || state.connection >= 1;
  $("avoid-field").hidden = !d.avoidable;
  $("avoid-label").textContent = d.avoidLabel;
  $<HTMLInputElement>("avoid").checked = avoiding();
  $("clearance-field").hidden = !avoiding();
  $("barcode-wrap").hidden = !blob;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-ds]")) {
    const on = b.dataset.ds === state.dataset;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $("ds-note").textContent = d.note;
  const p = presetOf();
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
    b.setAttribute("aria-pressed", String(b.dataset.preset === p));
  $("code").textContent = spelling();
  drawRug();
};

/** PROTOTYPE: the set names the readouts use (the story's own; one set needs none) */
const SET_NAMES: Record<string, string[]> = {
  penguins: ["Adelie", "Chinstrap", "Gentoo"],
};
const colourOf = (s: DataSet) =>
  s.paint.stroke === "none" ? s.paint.fill : s.paint.stroke;
/** the sizes of the pieces of a set's members at this connection (the kept tree edges) */
const pieceSizes = (r: SetResult, n: number) => {
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  for (const e of r.tree) if (e.kept) up[find(e.i)] = find(e.j);
  const size = new Map<number, number>();
  for (let i = 0; i < n; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  return [...size.values()];
};
/** What this connection gives, per set: "N groups, M outliers" (a group is a piece of 3 or
 *  more members, an outlier a piece of 1 or 2). More than three sets: the totals. */
const drawGroups = (out: SetResult[]) => {
  const box = $("groups");
  const d = dataset();
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const tally = (sizes: number[]) => {
    const g = sizes.filter((k) => k >= 3).length,
      o = sizes.length - g;
    return `${plural(g, "group")}, ${plural(o, "outlier")}`;
  };
  const sizes = out.map((r, si) => pieceSizes(r, d.sets[si].members.length));
  if (out.length > 3) {
    box.textContent = `${tally(sizes.flat())} (over ${out.length} sets)`;
    return;
  }
  const names = SET_NAMES[d.id];
  box.innerHTML = sizes
    .map((z, si) => {
      const sw =
        out.length > 1
          ? `<span class="sw" style="background:${colourOf(d.sets[si])}"></span>`
          : "";
      const name = out.length > 1 ? `${names?.[si] ?? `set ${si + 1}`}: ` : "";
      return `<div>${sw}${name}${tally(z)}</div>`;
    })
    .join("");
};
/** A tick under the connection slider at each link's entry, one row per set in its colour:
 *  the only connections where the outline changes. */
const drawRug = () => {
  const box = $("connection-rug");
  const d = dataset();
  if (state.shape !== "blob" || !lastOut || lastOut.length !== d.sets.length) {
    box.innerHTML = "";
    return;
  }
  const rows = lastOut.length;
  const rh = Math.max(3, Math.min(6, 12 / rows));
  let g = "";
  lastOut.forEach((r, si) => {
    for (const e of r.tree) {
      if (e.floor) continue;
      const x = 100 * e.enter;
      g += `<line x1="${f2(x)}" x2="${f2(x)}" y1="${f2(si * rh)}" y2="${f2((si + 1) * rh - 0.6)}" stroke="${colourOf(d.sets[si])}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
  });
  box.innerHTML = `<svg viewBox="0 0 100 ${f2(rows * rh)}" preserveAspectRatio="none" style="height:${f2(rows * rh)}px">${g}</svg>`;
};

// ── drawing ──────────────────────────────────────────────────────────────────
const f2 = (v: number) => v.toFixed(2);
const pathOf = (rings: Pt[][]) =>
  rings
    .filter((l) => l.length > 1)
    .map((l) => "M" + l.map((p) => `${f2(p[0])},${f2(p[1])}`).join("L") + "Z")
    .join("");
const frame = (s: DataSet) => `matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})`;

/** The view: the story's own canvas, grown to hold each set's oval (convexity 2), so the
 *  outline is never cut off as convexity rises. Computed once per dataset. */
const views = new Map<string, number[]>();
const viewOf = (d: Dataset) => {
  let v = views.get(d.id);
  if (v) return v;
  let [x0, y0, x1, y1] = [0, 0, d.width, d.height];
  for (const s of d.sets) {
    const r = computeSet(s, {
      ...BLOB,
      convexity: 2,
      radius: null,
      padding: d.padding,
      avoid: false,
      clearance: d.clearance,
      pieces: "avoid",
    });
    for (const ring of r.rings)
      for (const [x, y] of ring) {
        const X = x + s.T[0],
          Y = s.T[2] * y + s.T[1];
        x0 = Math.min(x0, X);
        x1 = Math.max(x1, X);
        y0 = Math.min(y0, Y);
        y1 = Math.max(y1, Y);
      }
  }
  const m = 10;
  v = [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
  views.set(d.id, v);
  return v;
};

let shownFor = "";
const drawScene = () => {
  const d = dataset();
  if (shownFor === d.id) return;
  shownFor = d.id;
  const svg = $("stage") as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", viewOf(d).map(f2).join(" "));
  svg.setAttribute("aria-label", `${d.label}: the enclose outline`);
  $("scenery").innerHTML = d.scenery;
  for (const id of ["outlines", "debug"]) $(id).innerHTML = "";
};

const memberMarkup = (m: BlobMember, grow: number, style: string) => {
  if (m.kind === "disc")
    return `<circle cx="${f2(m.cx)}" cy="${f2(m.cy)}" r="${f2(Math.max(0, m.r + grow))}" ${style}/>`;
  if (m.kind === "segment") {
    const w = Math.max(m.w, m.w2 ?? m.w) / 2 + grow;
    if (w <= 0.01)
      return `<line x1="${f2(m.a[0])}" y1="${f2(m.a[1])}" x2="${f2(m.b[0])}" y2="${f2(m.b[1])}" ${style}/>`;
    return tube(m.a, m.b, m.w / 2 + grow, (m.w2 ?? m.w) / 2 + grow, style);
  }
  return `<rect x="${f2(m.x - grow)}" y="${f2(m.y - grow)}" width="${f2(m.w + 2 * grow)}" height="${f2(m.h + 2 * grow)}" rx="${f2(Math.max(0, grow))}" ${style}/>`;
};
/** A tapered tube from a (half-width ra) to b (half-width rb): two round ends and the tangent
 *  sides, drawn as a polygon (debug only). */
const tube = (a: Pt, b: Pt, ra: number, rb: number, style: string) => {
  ra = Math.max(0, ra);
  rb = Math.max(0, rb);
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = Math.hypot(dx, dy);
  if (L < 1e-6)
    return `<circle cx="${f2(a[0])}" cy="${f2(a[1])}" r="${f2(Math.max(ra, rb))}" ${style}/>`;
  const th = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / L)));
  const pts: Pt[] = [];
  const arc = (c: Pt, r: number, t0: number, t1: number) => {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
  };
  arc(b, rb, th - al, th + al);
  arc(a, ra, th + al, th + 2 * Math.PI - al);
  return `<polygon points="${pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join(" ")}" ${style}/>`;
};

const drawResults = (results: SetResult[]) => {
  const d = dataset();
  let outlines = "",
    debug = "";
  results.forEach((r, i) => {
    const s = d.sets[i],
      P = s.paint,
      T = frame(s);
    outlines += `<path transform="${T}" d="${pathOf(r.rings)}" fill="${P.fill}" fill-opacity="${P.fillOpacity}" stroke="${P.stroke}" stroke-width="${Math.max(1, P.strokeWidth)}" stroke-linejoin="round"/>`;
    let g = "";
    if (state.showMembers) {
      for (const m of s.members) {
        g += memberMarkup(
          m,
          0,
          'fill="none" stroke="#333" stroke-width="0.75"'
        );
        g += memberMarkup(
          m,
          state.padding,
          'fill="none" stroke="#666" stroke-width="0.6" stroke-dasharray="2 2"'
        );
      }
      if (avoiding())
        for (const m of s.avoiding)
          g += memberMarkup(
            m,
            state.clearance,
            'fill="#d62728" fill-opacity="0.08" stroke="#d62728" stroke-width="0.8" stroke-dasharray="3 2"'
          );
    }
    if (state.showLinks) {
      // the join tree's edges that are cut (gray dashed); edges between members that overlap
      // need no link and are not drawn
      for (const e of r.tree)
        if (!e.overlap && !e.kept)
          g += `<line x1="${f2(e.a[0])}" y1="${f2(e.a[1])}" x2="${f2(e.b[0])}" y2="${f2(e.b[1])}" stroke="#888" stroke-width="1" stroke-dasharray="2 3"/>`;
      for (const l of r.links) {
        if (l.kind !== "segment") continue;
        g += tube(
          l.a,
          l.b,
          l.w / 2 + state.padding,
          (l.w2 ?? l.w) / 2 + state.padding,
          'fill="#ff7f0e" fill-opacity="0.14" stroke="#ff7f0e" stroke-width="0.6"'
        );
        g += `<line x1="${f2(l.a[0])}" y1="${f2(l.a[1])}" x2="${f2(l.b[0])}" y2="${f2(l.b[1])}" stroke="#b35900" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      }
    }
    if (g) debug += `<g transform="${T}">${g}</g>`;
  });
  $("outlines").innerHTML = outlines;
  $("debug").innerHTML = debug;
};

// ── the barcode (debug) ─────────────────────────────────────────────────────
// One bar per link of the join tree that does not touch, as long as its mutual reachability,
// longest (weakest) first. Connection keeps the shortest round(connection · n): the bars above
// the cut line are cut, so each is a piece of its own.
const drawBarcode = (results: SetResult[]) => {
  const box = $("barcode");
  const d = dataset();
  if (state.shape !== "blob") {
    box.innerHTML = "";
    return;
  }
  const all = results.map((r) =>
    r.tree.filter((e) => !e.floor).sort((a, b) => b.enter - a.enter)
  );
  const maxX = Math.max(1, ...all.flatMap((b) => b.map((e) => e.w)));
  const W = 300,
    L = 4,
    R = 6,
    sx = (x: number) => L + (Math.min(x, maxX) / maxX) * (W - L - R);
  box.innerHTML = results
    .map((r, si) => {
      const bars = all[si];
      const colour = colourOf(d.sets[si]);
      const rows = Math.max(1, bars.length);
      const rh = Math.max(2, Math.min(7, 96 / rows));
      const H = 2 + rows * rh + 2;
      const cut = bars.filter((e) => !e.kept).length;
      let g = "";
      bars.forEach((e, k) => {
        const y = 2 + k * rh;
        g += `<rect x="${L}" y="${f2(y + 0.15 * rh)}" width="${f2(Math.max(0.8, sx(e.w) - L))}" height="${f2(0.7 * rh)}" fill="${colour}" fill-opacity="${e.kept ? 0.2 : 1}"/>`;
      });
      if (cut > 0 && cut < bars.length) {
        const y = 2 + cut * rh;
        g += `<line x1="0" x2="${W}" y1="${f2(y)}" y2="${f2(y)}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      }
      // the largest drop between consecutive bar lengths: a natural place to cut
      let nat = -1,
        drop = 0;
      for (let k = 0; k + 1 < bars.length; k++)
        if (bars[k].w - bars[k + 1].w > drop)
          [nat, drop] = [k, bars[k].w - bars[k + 1].w];
      const natC = nat >= 0 ? (bars[nat].enter + bars[nat + 1].enter) / 2 : NaN;
      const name =
        d.sets.length > 1
          ? `${SET_NAMES[d.id]?.[si] ?? `set ${si + 1}`} · `
          : "";
      const cap = `<div class="bc-cap"><span class="bc-sw" style="background:${colour}"></span>${name}<b>${r.pieces} piece${r.pieces === 1 ? "" : "s"}</b> · ${cut} of ${bars.length} links cut${nat >= 0 ? ` · largest gap at connection ${num(natC)} (${nat + 2} pieces)` : ""}</div>`;
      return `${cap}<svg class="bc" viewBox="0 0 ${W} ${f2(H)}" role="img" aria-label="Barcode of set ${si + 1}">${g}</svg>`;
    })
    .join("");
};

// ── recompute scheduling ─────────────────────────────────────────────────────
// The compute runs in workers (pool.ts), so the page never blocks: a change starts a compute
// of every set unless one is in flight; when one comes back it is drawn, and if the state moved
// meanwhile the latest state is computed next (the steps in between are skipped). While the
// page is idle, each worker warms its sets' per-piece cache for every connection the slider
// can reach, nearest the current one first.
const pool = new Pool(SCRIPT);
// PROTOTYPE: while a slider is dragged the outline is drawn on the coarser mesh
// (UNIFIED_PROTOTYPE.draft, within about 1 px); letting go draws the exact one
let dragging = false;
let inflight = false,
  dirty = false;
/** a counter of state changes, and the waiters of __playground.set for the change they made */
let stateGen = 0;
let waiters: { gen: number; done: (ms: number) => void; t0: number }[] = [];
let lastOut: SetResult[] | null = null;
const paramsOf = (): Params => ({
  shape: state.shape,
  convexity: state.convexity,
  connection: state.connection,
  neck: state.neck,
  radius: state.radius,
  padding: state.padding,
  holes: state.holes,
  avoid: avoiding(),
  clearance: state.clearance,
  pieces: state.pieces,
  draft: dragging,
});
const recompute = () => {
  if (inflight) {
    dirty = true;
    return;
  }
  void run();
};
const run = async () => {
  inflight = true;
  dirty = false;
  const gen = stateGen;
  const d = dataset();
  const t0 = performance.now();
  let out: SetResult[];
  try {
    out = await pool.compute(d.id, d.sets.length, paramsOf());
  } catch (err) {
    $("status").textContent = `error: ${(err as Error).message}`;
    console.error(err);
    finishRun(gen, performance.now() - t0);
    return;
  }
  const ms = performance.now() - t0;
  // the state may have moved on (another dataset): draw only what still applies
  if (d.id === state.dataset) {
    lastOut = out;
    drawResults(out);
    if (state.shape === "blob") drawGroups(out);
    $("groups").hidden = state.shape !== "blob";
    drawBarcode(out);
    drawRug();
    const sum = (f: (r: SetResult) => number) =>
      out.reduce((s, r) => s + f(r), 0);
    const pieces = sum((r) => r.pieces),
      holes = sum((r) => r.holes);
    $("status").textContent =
      `${pieces} piece${pieces === 1 ? "" : "s"}${holes ? `, ${holes} hole${holes === 1 ? "" : "s"}` : ""} · computed in ${ms < 10 ? ms.toFixed(1) : ms.toFixed(0)} ms${pool.workers ? "" : " (on the page's thread: no worker)"}`;
  }
  finishRun(gen, ms);
};
const finishRun = (gen: number, ms: number) => {
  $("status").dataset.ms = String(ms);
  inflight = false;
  const now = performance.now();
  waiters = waiters.filter((w) => {
    if (w.gen > gen) return true;
    w.done(now - w.t0);
    return false;
  });
  if (dirty) void run();
  else warm();
};
/** PROTOTYPE: fill the per-piece cache for every connection the slider can reach (its 101
 *  positions, nearest the current one first) at the other settings as they are, in the
 *  workers while the page is idle, so a later connection drag only looks the pieces up.
 *  Connection is discrete, so most positions share a state and cost nothing. */
const warm = () => {
  delete $("status").dataset.warm;
  if (state.shape !== "blob") {
    $("status").dataset.warm = "1";
    return;
  }
  const d = dataset();
  const here = Math.round(state.connection * 100);
  const ks = Array.from({ length: 101 }, (_, k) => k).sort(
    (a, b) => Math.abs(a - here) - Math.abs(b - here)
  );
  pool.warm(
    d.id,
    d.sets.length,
    { ...paramsOf(), draft: false },
    ks.map((k) => k / 100)
  );
};
pool.onWarm = () => ($("status").dataset.warm = "1");
const schedule = () => {
  stateGen++;
  recompute();
};
const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  syncControls();
  schedule();
};

// ── wiring ───────────────────────────────────────────────────────────────────
const release = () => {
  if (!dragging) return;
  dragging = false;
  schedule();
};
for (const k of SLIDERS) {
  const el = $<HTMLInputElement>(k);
  el.addEventListener("input", () => {
    state = { ...state, [k]: +el.value };
    dragging = true;
    syncControls();
    schedule();
  });
  el.addEventListener("change", release);
}
$("radius-reset").addEventListener("click", () => update({ radius: null }));
const check = (id: string, f: (on: boolean) => Partial<State>) =>
  $<HTMLInputElement>(id).addEventListener("change", (e) =>
    update(f((e.target as HTMLInputElement).checked))
  );
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-shape]"))
  b.addEventListener("click", () => {
    const shape = b.dataset.shape as ShapeKind;
    // neck's default is the shape's own (blob 1, fillet 0.5)
    if (shape !== state.shape)
      update({ shape, neck: (shape === "blob" ? BLOB : FILLET).neck });
  });
check("holes", (on) => ({ holes: on }));
$("pieces").addEventListener("change", (e) =>
  update({ pieces: (e.target as HTMLSelectElement).value as State["pieces"] })
);
check("show-links", (on) => ({ showLinks: on }));
check("show-members", (on) => ({ showMembers: on }));
check("avoid", (on) => ({
  avoidOn: { ...state.avoidOn, [state.dataset]: on },
}));
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
  b.addEventListener("click", () => update(PRESETS[b.dataset.preset!]()));

const tabs = $("ds-tabs");
tabs.innerHTML = DATASETS.map(
  (d) =>
    `<button type="button" role="tab" id="ds-${d.id}" data-ds="${d.id}">${d.label}</button>`
).join("");
const pickDataset = (id: string) => {
  if (id === state.dataset) return;
  const d = DATASETS.find((x) => x.id === id)!;
  // the shape options carry over; the distances are the story's
  state = { ...state, dataset: id, padding: d.padding, clearance: d.clearance };
  lastOut = null;
  drawScene();
  update({});
};
tabs.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-ds]");
  if (b) pickDataset(b.dataset.ds!);
});
tabs.addEventListener("keydown", (e) => {
  const i = DATASETS.findIndex((d) => d.id === state.dataset);
  const j =
    e.key === "ArrowRight"
      ? i + 1
      : e.key === "ArrowLeft"
        ? i - 1
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? DATASETS.length - 1
            : null;
  if (j === null) return;
  e.preventDefault();
  const d = DATASETS[(j + DATASETS.length) % DATASETS.length];
  pickDataset(d.id);
  $(`ds-${d.id}`).focus();
});

$("copy").addEventListener("click", async () => {
  const btn = $("copy");
  try {
    await navigator.clipboard.writeText($("code").textContent ?? "");
    btn.textContent = "Copied";
  } catch {
    const r = document.createRange();
    r.selectNodeContents($("code"));
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    btn.textContent = "Selected: press Ctrl+C";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

const THEMES = ["auto", "light", "dark"];
let theme = 0;
$("theme").addEventListener("click", () => {
  theme = (theme + 1) % THEMES.length;
  const t = THEMES[theme];
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  $("theme").textContent = `Theme: ${t}`;
});

// for the headless checks
(window as any).__playground = {
  /** set some state; resolves, once it is drawn, to the time from the call to the draw (ms) */
  set: (patch: Partial<State> & { dataset?: string; drag?: boolean }) => {
    if (patch.dataset) pickDataset(patch.dataset);
    const { dataset: _d, drag, ...rest } = patch;
    dragging = !!drag;
    state = { ...state, ...rest };
    syncControls();
    const t0 = performance.now();
    const p = new Promise<number>((done) =>
      waiters.push({ gen: stateGen + 1, done, t0 })
    );
    schedule();
    return p;
  },
  workers: () => pool.workers,
  state: () => state,
  results: () => lastOut,
};

drawScene();
syncControls();
schedule();
