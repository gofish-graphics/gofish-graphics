// Precomputes the "Set it yourself" widgets on the optical spacing page:
// `node_modules/.bin/tsx stories/proposals/stack-profile/widgetRun.ts`
// writes proposals/optical-spacing/widgets.json. Each widget has one moving
// position v and two compared gaps; for each model and each v it records the
// model's measure of both gaps (widgetModels.ts), and the page finds where
// they are equal. It also writes each widget's drawing as SVG paths.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { B0, DEFS, DROPPED, square, type Def, type Item, type Pair } from "./widgetDefs";
import type { Shape } from "./spacingModels";
import { extX, extY, MODELS, S } from "./widgetModels";
// ---------------------------------------------------------------------------
const r2 = (x: number) => +x.toFixed(2);
const ids = new WeakMap<Shape, number>();
let nextId = 0;
const id = (s: Shape) => {
  if (!ids.has(s)) ids.set(s, ++nextId);
  return ids.get(s)!;
};
const seen = new Map<string, number>();
const measure = (key: string, m: (typeof MODELS)[number]["m"], [A, a, B, b, tv]: Pair) => {
  const k = `${key}|${id(A)}:${a}|${id(B)}:${b}|${tv[0]}:${tv.length}`;
  if (!seen.has(k)) seen.set(k, r2(m(A, a, B, b, tv)));
  return seen.get(k)!;
};

function draw(def: Def) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const g = def.grid;
  for (const it of def.items)
    for (const v of [g[0], g[g.length - 1]]) {
      const [dx, dy] = def.axis === "x" ? [(it.k ?? 0) * v, 0] : [0, (it.k ?? 0) * v];
      const [[x0, x1], [y0, y1]] = [extX(it.sh), extY(it.sh)];
      box[0] = Math.min(box[0], it.x + dx + x0);
      box[1] = Math.min(box[1], it.y + dy + y0);
      box[2] = Math.max(box[2], it.x + dx + x1);
      box[3] = Math.max(box[3], it.y + dy + y1);
    }
  const top = box[3] + 4;
  const d = (it: Item) =>
    it.sh.contours
      .map((c) => "M" + c.map(([x, y]) => `${r2(x + it.x)} ${r2(top - y - it.y)}`).join("L") + "Z")
      .join("");
  return {
    view: [r2(box[0] - 4), 0, r2(box[2] - box[0] + 8), r2(top - box[1] + 4)],
    fixed: def.items.filter((it) => !it.k).map((it) => ({ d: d(it), cls: it.cls })),
    moving: def.items.filter((it) => it.k).map((it) => ({ d: d(it), k: it.k })),
    edge: def.axis === "x" ? def.edge : [r2(top - def.edge[0]), -def.edge[1]],
  };
}

const widgets = DEFS.flatMap((def, n) => {
  if (DROPPED.has(n + 1)) return [];
  const t0 = Date.now();
  const w = {
    n: n + 1,
    title: def.title,
    aria: def.aria,
    slider: def.slider,
    axis: def.axis,
    fmt: def.fmt,
    gap0: r2(def.gap0 ?? 0),
    georgia: !!def.georgia,
    p: def.grid,
    start: def.start,
    ...draw(def),
    a: {} as Record<string, number[]>,
    b: {} as Record<string, number[]>,
    scale: {} as Record<string, number>,
  };
  for (const { key, m } of MODELS) {
    const t1 = Date.now();
    const pairs = def.grid.map((v) => def.pairs(v));
    w.a[key] = pairs.map(([a]) => measure(key, m, a));
    w.b[key] = pairs.map(([, b]) => measure(key, m, b));
    w.scale[key] = measure(key, m, [square, 0, square, S + def.g0, B0]);
    console.log(`w${n + 1} ${key} ${Date.now() - t1} ms`);
  }
  console.log(`w${n + 1} done ${Date.now() - t0} ms`);
  return w;
});
writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../../../proposals/optical-spacing/widgets.json"),
  JSON.stringify({ S, models: MODELS.map(({ key, label }) => ({ key, label })), widgets })
);
