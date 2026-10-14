import { DATASETS, type Dataset } from "./datasets";
import { computeDataset, type Params, type SetResult } from "./compute";
import type { Pt } from "./blob";

// ── state ────────────────────────────────────────────────────────────────────
type State = Params & {
  dataset: string;
  skeleton: boolean;
  edgesAsMembers: boolean;
};
const DEFAULTS = { convexity: 0.5, neck: 1 }; // roundness defaults to padding; clearance to 4
const KEY = "blob-playground-v2";

const ds0 = DATASETS[1];
let state: State = {
  dataset: ds0.id,
  ...DEFAULTS,
  roundness: ds0.padding,
  padding: ds0.padding,
  clearance: ds0.clearance,
  skeleton: false,
  edgesAsMembers: false,
};
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved && DATASETS.some((d) => d.id === saved.dataset))
    state = { ...state, ...saved };
} catch {
  /* storage unavailable: start from the defaults */
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};
const dataset = (): Dataset => {
  const d = DATASETS.find((x) => x.id === state.dataset)!;
  return d.variant && state.edgesAsMembers ? { ...d, ...d.variant } : d;
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const num = (v: number) => String(+v.toFixed(2));

// ── sliders ──────────────────────────────────────────────────────────────────
type Key = "convexity" | "neck" | "roundness" | "padding" | "clearance";
const SLIDERS: Key[] = [
  "convexity",
  "neck",
  "roundness",
  "padding",
  "clearance",
];
const unit = (k: Key) => (k === "convexity" || k === "neck" ? "" : " px");

const syncControls = () => {
  const s = $<HTMLInputElement>("roundness");
  s.max = String(3 * state.padding);
  for (const k of SLIDERS) {
    $<HTMLInputElement>(k).value = String(state[k]);
    $(`${k}-out`).textContent = num(state[k]) + unit(k);
  }
  $("roundness-hint").textContent =
    applied === null
      ? ""
      : `In effect: ${num(applied)} px${applied < state.roundness - 0.01 ? " (the smallest circle in the region, or less where more would make the outline cross itself)" : ""}.`;
  $<HTMLInputElement>("skeleton").checked = state.skeleton;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-ds]")) {
    const on = b.dataset.ds === state.dataset;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $("ds-note").textContent = dataset().note;
  const v = DATASETS.find((x) => x.id === state.dataset)!.variant;
  $("variant-wrap").hidden = !v;
  if (v) $("variant-label").textContent = v.label;
  $<HTMLInputElement>("variant").checked = state.edgesAsMembers;
  const p = presetOf();
  $("preset-readout").textContent = p;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
    b.setAttribute("aria-pressed", String(b.dataset.preset === p));
  $("code").textContent = spelling();
};

// ── presets and the spelling ─────────────────────────────────────────────────
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const presetOf = () => {
  // hull and spine are named by convexity alone: roundness (and, for spine, neck) are overrides
  if (eq(state.convexity, 1) && eq(state.neck, 1)) return "hull";
  if (eq(state.convexity, 0)) return "spine";
  if (
    eq(state.convexity, 0.5) &&
    eq(state.neck, 1) &&
    eq(state.roundness, state.padding)
  )
    return "blob defaults";
  return "custom";
};
/** The call these settings stand for. Defaults are left out, and convexity 0 or 1 is spelled
 *  with its shortcut, since `Shape.spine(opts)` is exactly `Shape.blob({ convexity: 0, ...opts })`
 *  (and both shortcuts take roundness, e.g. `Shape.hull({ roundness: 15 })`). */
const spelling = () => {
  const d = dataset(),
    o: string[] = [];
  let fn = "blob";
  if (eq(state.convexity, 1) && eq(state.neck, 1)) fn = "hull";
  else if (eq(state.convexity, 0)) fn = "spine";
  else if (!eq(state.convexity, 0.5))
    o.push(`convexity: ${num(state.convexity)}`);
  if (fn !== "hull" && !eq(state.neck, 1)) o.push(`neck: ${num(state.neck)}`);
  if (!eq(state.roundness, state.padding))
    o.push(`roundness: ${num(state.roundness)}`);
  o.push(d.shapeArgs);
  if (!eq(state.clearance, 4)) o.push(`clearance: ${num(state.clearance)}`);
  const shape = `Shape.${fn}(${o.length ? `{ ${o.join(", ")} }` : ""})`;
  return `enclose({ shape: ${shape}, padding: ${num(state.padding)} }, ${d.call})`;
};
const PRESETS: Record<string, () => Partial<State>> = {
  // the shortcuts keep the current roundness, so "hull, then drag roundness" works
  hull: () => ({ convexity: 1, neck: 1 }),
  spine: () => ({ convexity: 0, neck: 1 }),
  "blob defaults": () => ({ ...DEFAULTS, roundness: state.padding }),
};

// ── drawing ──────────────────────────────────────────────────────────────────
const SVGNS = "http://www.w3.org/2000/svg";
const pathOf = (loops: Pt[][]) =>
  loops
    .map(
      (l) =>
        "M" +
        l.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L") +
        "Z"
    )
    .join("");

let shownFor = "";
const drawScene = () => {
  const d = dataset();
  if (shownFor === d.id) return;
  shownFor = d.id;
  const svg = $("stage") as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", d.view.join(" "));
  svg.setAttribute(
    "aria-label",
    `${d.label}: ${d.sets.map((s) => s.name).join(", ")}`
  );
  $("under").innerHTML = d.under ?? "";
  $("over").innerHTML = d.over;
  $("blobs").innerHTML = "";
  $("skel").innerHTML = "";
};
const drawResults = (results: SetResult[]) => {
  const d = dataset();
  let blobs = "",
    skel = "";
  results.forEach((r, i) => {
    const s = d.sets[i];
    const stroke = s.stroke ?? s.color;
    blobs += `<path d="${pathOf(r.loops)}" fill="${s.color}" fill-opacity="${s.fillOpacity}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${s.strokeWidth}" stroke-linejoin="round"/>`;
    for (const f of r.skel.faces)
      skel += `<polygon points="${f.map((p) => p.join(",")).join(" ")}" fill="${s.color}" fill-opacity="0.13" stroke="none"/>`;
    for (const e of r.skel.links)
      skel += `<polyline points="${e.route.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${s.stroke ? "#666" : s.color}" stroke-opacity="0.7" stroke-width="1" stroke-dasharray="3 2"/>`;
  });
  $("blobs").innerHTML = blobs;
  $("skel").innerHTML = skel;
  $("skel").style.display = state.skeleton ? "" : "none";
};

// ── recompute scheduling ─────────────────────────────────────────────────────
// Every set is computed in one task, at most once per animation frame (a newer slider value
// replaces a pending one). The construction remembers its stages, so a change reruns only the
// stages that read the changed knob: roundness alone reruns just the rounding.
let pending: number | null = null,
  applied: number | null = null; // the roundness the last drawing used (2 sigma), the least over sets
const recompute = () => {
  const d = dataset(),
    p: Params = { ...state };
  $("stage-wrap").setAttribute("aria-busy", "true");
  let out: SetResult[];
  const t0 = performance.now();
  try {
    out = computeDataset(d, p);
  } catch (err) {
    $("status").textContent = `error: ${(err as Error).message}`;
    $("stage-wrap").removeAttribute("aria-busy");
    return;
  }
  const ms = performance.now() - t0;
  drawResults(out);
  applied = Math.min(...out.map((r) => 2 * r.sigma));
  syncControls();
  $("status").textContent = `computed in ${ms.toFixed(1)} ms`;
  $("status").dataset.ms = String(ms);
  $("stage-wrap").removeAttribute("aria-busy");
};
const schedule = () => {
  if (pending !== null) cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    pending = null;
    recompute();
  });
};
const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  syncControls();
  save();
  schedule();
};

// ── wiring ───────────────────────────────────────────────────────────────────
const setSlider = (k: Key, v: number) => {
  const patch: Partial<State> = { [k]: v };
  if (k === "padding") {
    // roundness follows padding while it sits at its default (equal to padding)
    if (eq(state.roundness, state.padding)) patch.roundness = v;
    else patch.roundness = Math.min(state.roundness, 3 * v);
  }
  update(patch);
};
for (const k of SLIDERS) {
  const el = $<HTMLInputElement>(k);
  el.addEventListener("input", () => setSlider(k, +el.value));
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
  b.addEventListener("click", () => update(PRESETS[b.dataset.preset!]()));
$<HTMLInputElement>("skeleton").addEventListener("change", (e) => {
  state.skeleton = (e.target as HTMLInputElement).checked;
  $("skel").style.display = state.skeleton ? "" : "none";
  save();
});

$<HTMLInputElement>("variant").addEventListener("change", (e) =>
  update({ edgesAsMembers: (e.target as HTMLInputElement).checked })
);

const tabs = $("ds-tabs");
tabs.innerHTML = DATASETS.map(
  (d) =>
    `<button type="button" role="tab" id="ds-${d.id}" data-ds="${d.id}">${d.label}</button>`
).join("");
const pickDataset = (id: string) => {
  if (id === state.dataset) return;
  const d = DATASETS.find((x) => x.id === id)!;
  const ratio = state.padding > 0 ? state.roundness / state.padding : 1;
  state = {
    ...state,
    dataset: id,
    padding: d.padding,
    clearance: d.clearance,
    roundness: Math.round(2 * ratio * d.padding) / 2,
  };
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
  const code = $("code"),
    btn = $("copy");
  try {
    await navigator.clipboard.writeText(code.textContent ?? "");
    btn.textContent = "Copied";
  } catch {
    const r = document.createRange();
    r.selectNodeContents(code);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    btn.textContent = "Selected; press ⌘C";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

drawScene();
syncControls();
schedule();
