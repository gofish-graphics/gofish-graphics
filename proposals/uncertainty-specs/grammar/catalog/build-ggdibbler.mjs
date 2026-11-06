// Merges ggdibbler-r.json (from render-ggdibbler.R) with ggdibbler-specs.mjs
// into ggdibbler.json, formatting each GoFish spec with prettier.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { specs } from "./ggdibbler-specs.mjs";

const require = createRequire(import.meta.url);
const prettier = require("../../../../node_modules/prettier");
const here = new URL(".", import.meta.url);
const r = JSON.parse(readFileSync(new URL("ggdibbler-r.json", here), "utf8"));
// v1-fits.json freezes the fit and verdict each entry had under version 1 of
// the grammar, so the catalog can show what version 2 moved.
const v1 = JSON.parse(readFileSync(new URL("v1-fits.json", here), "utf8"));

const out = [];
for (const e of r) {
  const s = specs[e.slug];
  if (!s) throw new Error("no spec for " + e.slug);
  let gofish;
  try {
    gofish = (await prettier.format(s.gofish, { parser: "babel", printWidth: 60 })).trimEnd();
  } catch (err) {
    throw new Error(`prettier failed on ${e.slug}: ${err.message}`);
  }
  const merged = [].concat(e.merged ?? []).filter(Boolean);
  const note = merged.length ? `${s.note} Merged: ${merged.join("; ")}.` : s.note;
  out.push({
    id: e.id,
    source: e.source,
    title: e.title,
    r_code: e.r_code,
    img: e.render === "rendered" ? e.img : null,
    gofish,
    uses_up: s.uses_up,
    fit: s.fit,
    verdict: s.verdict,
    v1_fit: v1[e.id].fit,
    v1_verdict: v1[e.id].verdict,
    note,
  });
}
writeFileSync(new URL("ggdibbler.json", here), JSON.stringify(out, null, 2) + "\n");
const count = (k) =>
  out.reduce((m, e) => ((m[e[k]] = (m[e[k]] ?? 0) + 1), m), {});
console.log(out.length, count("fit"));
console.log(out.filter((e) => e.verdict !== "ok").map((e) => `${e.id} ${e.verdict}`));
console.log(out.filter((e) => e.fit === "does-not-fit").map((e) => e.id + " " + e.title));
