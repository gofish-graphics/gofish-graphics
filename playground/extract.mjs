// SCRATCH: build playground/src/datasets.json from the round-3 "Dump" story renders.
//
// Each `Scratch/Enclose Round3/<Story> Dump` story renders its story as it is today and prints
// every enclose call's geometry (members, avoided nodes, padding, shape) as JSON, in the
// enclosure's own frame. This script reads those captures, finds each call's frame-to-pixel map
// (a translation, with a y flip in charts) by matching the dumped discs to the drawn ellipses,
// removes each call's drawn outline from the SVG (what is left is the scenery), and records the
// outline's paint. Regenerate the captures with, e.g.:
//
//   pnpm capture-one "Scratch/Enclose Round3/Chart Accent Dump"
//
// then run `node playground/extract.mjs` and `node playground/build.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "../tests/tmp/iterate/scratch");

const DATASETS = [
  {
    id: "chartaccent",
    label: "ChartAccent",
    file: "chart-accent",
    call: "subSaharan",
    avoid: "svg-others",
    avoidSpelling: 'avoiding: selectAll("countries")',
    avoidLabel: "Avoid the other countries",
    avoidDefault: false,
    story: { convexity: 0.1, neck: 0.6 },
    note: "ChartAccent's bubble set around the Sub-Saharan African countries (Ren et al., PacificVis 2017), as the gallery story draws it. The story spells Shape.blob({ convexity: 0.1, neck: 0.6 }). The avoid toggle keeps the outline off every other country.",
  },
  {
    id: "u",
    label: "U cloud",
    file: "conv-u",
    call: "members",
    story: { convexity: 0.5 },
    note: "The U-shaped cloud of rounds 3 and 4: the convexity sweep's test case. Low convexity hugs the U; 1 is the padded hull; 2 is the oval.",
  },
  {
    id: "penguins",
    label: "Penguins",
    file: "penguin-blobs",
    call: "species",
    avoid: "other-sets",
    avoidSpelling: "avoiding: otherSpecies",
    avoidLabel: "Avoid the other species",
    avoidDefault: false,
    story: {},
    note: "Beak length against depth, one outline per species (three sets, 342 points). The species overlap, so avoiding them is off by default; turn it on for the heaviest case.",
  },
  {
    id: "munkres",
    label: "Munkres",
    file: "munkres-figure",
    call: "[a, c]",
    avoid: "dump",
    avoidSpelling: "avoiding: [b]",
    avoidLabel: "Avoid b",
    avoidDefault: true,
    story: { convexity: 0 },
    note: "Munkres' three points: the set {a, c} routes around b. The three ovals are Shape.oval() outlines from the story, drawn as they are; only {a, c} is recomputed.",
  },
  {
    id: "hyperedges",
    label: "Hyperedges",
    file: "hyperedges",
    call: "setNodesAndEdges",
    avoid: "dump",
    avoidSpelling: "avoiding: allNodes",
    avoidLabel: "Avoid the other nodes",
    avoidDefault: true,
    story: { convexity: 0 },
    note: "Three sets over a node-link graph. Each set's members are its nodes and the edges between them (segment members); every other node is avoided. The story spells Shape.spine().",
  },
  {
    id: "holes",
    label: "Holes",
    file: "holes-kept",
    call: "members",
    avoid: "dump",
    avoidSpelling: "avoiding: grayPoints",
    avoidLabel: "Avoid the gray points",
    avoidDefault: true,
    story: { convexity: 0.75, holes: true },
    note: "The U with two gray points in its opening, avoided. With holes off, the closed gap is filled and the gray points are cut back out; with holes on, a gap the outline closes stays open.",
  },
  {
    id: "bubble",
    label: "Bubble treemap",
    file: "bubble-treemap",
    call: "children",
    innerOnly: true,
    story: { shape: "fillet", radius: 0 },
    note: "The bubble treemap's inner level: 13 groups of countries, each enclosed (the story spells Shape.fillet({ radius: 0 }), padding 4: the padded circles, nothing filled between them). The outer, per-continent outlines are the story's own, drawn as they are; they do not follow the sliders.",
  },
];

const unesc = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const attr = (el, name) => {
  const m = el.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

const out = [];
for (const D of DATASETS) {
  const s = readFileSync(
    join(DIR, `enclose-round3--${D.file}-dump.html`),
    "utf8"
  );
  const calls = JSON.parse(
    unesc(s.match(/<pre class="enclose-dump">([\s\S]*?)<\/pre>/)[1])
  );
  let svg = s.slice(s.indexOf("<svg"), s.indexOf("</svg>") + 6);
  const width = +attr(svg.slice(0, 200), "width");
  const height = +attr(svg.slice(0, 200), "height");
  const ellipses = [...svg.matchAll(/<ellipse [^>]*>/g)].map((m) => ({
    x: +attr(m[0], "cx"),
    y: +attr(m[0], "cy"),
    r: +attr(m[0], "rx"),
  }));
  const paths = [...svg.matchAll(/<path [^>]*>(<\/path>)?/g)].map((m) => {
    const d = attr(m[0], "d");
    const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((q) => [
      +q[1],
      +q[2],
    ]);
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    return {
      el: m[0],
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    };
  });

  const used = calls.filter((c) =>
    D.innerOnly ? c.members.every((m) => m.kind === "disc") : true
  );
  const sets = [];
  const drop = new Set();
  for (const c of used) {
    // the frame-to-pixel map: x' = x + tx, y' = flip * y + ty
    const discs = c.members.filter((m) => m.kind === "disc");
    const anchor = discs[0] ?? c.avoiding.find((m) => m.kind === "disc");
    const pool = discs.length ? discs : [anchor];
    let T;
    for (const e of ellipses) {
      if (T) break;
      if (Math.abs(e.r - anchor.r) > 0.01) continue;
      for (const flip of [1, -1]) {
        const tx = e.x - anchor.cx,
          ty = e.y - flip * anchor.cy;
        if (
          pool.every((q) =>
            ellipses.some(
              (f) =>
                Math.abs(f.x - (q.cx + tx)) < 0.05 &&
                Math.abs(f.y - (flip * q.cy + ty)) < 0.05
            )
          )
        ) {
          T = [tx, ty, flip];
          break;
        }
      }
    }
    if (!T) throw new Error(`${D.id}: no frame map`);
    const px = ([x, y]) => [x + T[0], T[2] * y + T[1]];
    const centers = c.members.flatMap((m) =>
      m.kind === "disc"
        ? [px([m.cx, m.cy])]
        : m.kind === "segment"
          ? [px(m.a), px(m.b)]
          : [px([m.x + m.w / 2, m.y + m.h / 2])]
    );
    // the call's outline: the smallest path whose box holds every member
    let best = -1,
      bestA = Infinity;
    paths.forEach((p, i) => {
      if (drop.has(i)) return;
      const [x0, y0, x1, y1] = p.box;
      if (!centers.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1))
        return;
      const a = (x1 - x0) * (y1 - y0);
      if (a < bestA) [best, bestA] = [i, a];
    });
    if (best < 0) throw new Error(`${D.id}: no outline path`);
    drop.add(best);
    const el = paths[best].el;
    sets.push({
      members: c.members,
      avoiding: c.avoiding,
      T,
      paint: {
        fill: attr(el, "fill"),
        fillOpacity: +(attr(el, "fill-opacity") ?? 1),
        stroke: attr(el, "stroke"),
        strokeWidth: +(attr(el, "stroke-width") ?? 1),
      },
    });
  }
  if (D.avoid === "other-sets")
    sets.forEach((st, i) => {
      st.avoiding = sets.flatMap((o, j) => (j === i ? [] : o.members));
    });
  if (D.avoid === "svg-others")
    for (const st of sets) {
      const [tx, ty, flip] = st.T;
      const mine = (e) =>
        st.members.some(
          (m) =>
            m.kind === "disc" &&
            Math.abs(m.cx + tx - e.x) < 0.05 &&
            Math.abs(flip * m.cy + ty - e.y) < 0.05
        );
      st.avoiding = ellipses
        .filter((e) => !mine(e))
        .map((e) => ({
          kind: "disc",
          cx: e.x - tx,
          cy: (e.y - ty) / flip,
          r: e.r,
        }));
    }
  if (!D.avoid) for (const st of sets) st.avoiding = [];
  // scenery: the SVG's content without the recomputed outlines
  let k = 0;
  const scenery = svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "")
    .replace(/<path [^>]*>(<\/path>)?/g, (m) => (drop.has(k++) ? "" : m));
  const c0 = used[0];
  out.push({
    id: D.id,
    label: D.label,
    note: D.note,
    call: D.call,
    avoidable: !!D.avoid,
    avoidSpelling: D.avoidSpelling ?? "",
    avoidLabel: D.avoidLabel ?? "",
    avoidDefault: !!D.avoidDefault,
    padding: c0.padding,
    clearance: c0.shape.clearance ?? 4,
    story: D.story,
    width,
    height,
    scenery,
    sets,
  });
  console.log(
    `${D.id}: ${sets.length} set(s), ${sets.reduce((s, x) => s + x.members.length, 0)} members, ${sets.reduce((s, x) => s + x.avoiding.length, 0)} avoided, T ${sets[0].T.map((v) => +v.toFixed(2))}`
  );
}
const file = join(here, "src/datasets.json");
writeFileSync(file, JSON.stringify(out));
console.log(`${file}: ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
