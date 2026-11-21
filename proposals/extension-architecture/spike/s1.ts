/**
 * S1: build the specs and get their display lists in plain Node (no jsdom, no
 * browser). Run via `node build.mjs && node out/s1.mjs [stub|opentype|shim]`.
 *
 * Also writes each spec's frontend-IR document (Serialize.toJSON) to
 * out/ir/<name>.json, which S3 feeds to the engine from Python.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  Serialize,
  toDisplayList,
} from "../../../packages/gofish-graphics/src/lib";
import { seafood } from "../../../packages/gofish-graphics/src/data/catch";
import { world110m } from "../../../packages/gofish-graphics/src/data/world110m";
import { birds } from "../../../packages/gofish-graphics/src/data/birds";
import { buildSpecs } from "./specs";
import { installMeasurer, MEASURERS } from "./measure";

const SPIKE = new URL("../", import.meta.url); // bundles live in out/
const VD = new URL(
  "../../../packages/gofish-graphics/node_modules/vega-datasets/data/",
  SPIKE
);
const csv = (name: string) => {
  const [head, ...lines] = readFileSync(new URL(name, VD), "utf8")
    .trim()
    .split("\n");
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(",");
    const row: any = {};
    cols.forEach(
      (c, i) => (row[c] = isNaN(+v[i]) || v[i] === "" ? v[i] : +v[i])
    );
    return row;
  });
};

const mode = (process.argv[2] ?? "stub") as keyof typeof MEASURERS;
installMeasurer(mode);

// Record which browser globals exist so the report can say none were present.
const globalsSeen = Object.fromEntries(
  [
    "document",
    "window",
    "CanvasRenderingContext2D",
    "OffscreenCanvas",
    "FontFace",
    "requestAnimationFrame",
    "HTMLElement",
  ].map((g) => [g, typeof (globalThis as any)[g]])
);

const data = {
  weather: csv("seattle-weather.csv"),
  stocks: csv("stocks.csv"),
  seafood,
  world110m,
  birds,
};

const only = process.argv[3]?.split(",");
const specs = buildSpecs(data as any);
const label = mode + (process.env.FONT_TAG ? `-${process.env.FONT_TAG}` : "");
const outDir = new URL(`./out/${label}/`, SPIKE);
mkdirSync(outDir, { recursive: true });
mkdirSync(new URL("./out/ir/", SPIKE), { recursive: true });

const kinds = (items: any[], acc: Record<string, number> = {}) => {
  for (const it of items) {
    acc[it.kind] = (acc[it.kind] ?? 0) + 1;
    if (it.children) kinds(it.children, acc);
  }
  return acc;
};

const summary: any = { mode, globalsSeen, specs: {} };
for (const [name, { node, opts }] of Object.entries(specs)) {
  if (only && !only.includes(name)) continue;
  const rec: any = {};
  try {
    const t0 = performance.now();
    const dl = await (node as any).toDisplayList(opts);
    rec.ms = +(performance.now() - t0).toFixed(1);
    const json = JSON.stringify(dl);
    writeFileSync(new URL(`${name}.json`, outDir), json);
    rec.bytes = json.length;
    rec.items = kinds(dl.items);
    rec.viewport = dl.viewport;
  } catch (e: any) {
    rec.error = String(e?.stack ?? e)
      .split("\n")
      .slice(0, 6)
      .join("\n");
  }
  // The frontend IR of the same spec, for S3.
  try {
    const doc = await Serialize.toJSON(node as any);
    writeFileSync(
      new URL(`./out/ir/${name}.json`, SPIKE),
      JSON.stringify({ doc, opts })
    );
    rec.irBytes = JSON.stringify(doc).length;
  } catch (e: any) {
    rec.irError = String(e?.message ?? e);
  }
  summary.specs[name] = rec;
}
console.log(JSON.stringify(summary, null, 2));
void toDisplayList;
