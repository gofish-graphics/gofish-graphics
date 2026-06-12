// Live example renderer shared by the museum gallery (GalleryPage.vue).
//
// The docs example gallery renders every registered example LIVE in the browser
// (the same sandboxed `new Function` mechanism GoFishVue uses) rather than
// shipping a multi-megabyte file of baked SVG strings. This module isolates that
// execution so the gallery component can render an example, measure its true
// rendered size, and keep the resulting <svg> node in memory.
//
// It deliberately mirrors GoFishVue.vue's sandbox surface (same injected globals,
// same default size) so any example that renders there renders here identically.
import * as gf from "gofish-graphics";
import { mix } from "spectral.js";
import _ from "lodash";
import { streamgraphData } from "./data/streamgraphData";
import { titanic } from "./data/titanic";
import { nightingale } from "./data/nightingale";
import { drivingShifts } from "./data/drivingShifts";
import { newCarColors } from "./data/newCarColors";
import { caltrain, caltrainStopOrder } from "./data/caltrain";
import { penguins } from "./data/penguins";
import { density1d } from "fast-kde";
import { genderPayGap, payGrade } from "./data/genderPayGap";
import { seafood, lakeLocations } from "./data/seafood";

// Run one example's code in the sandbox. The example appends its chart svg to the
// passed `root` (every registered example calls `.render(root, …)`). Returns the
// `root` element holding the rendered svg, or throws on a bad example.
export function renderExampleRoot(code: string): HTMLElement {
  const fn = new Function(
    "_",
    "root",
    "size",
    "gf",
    "streamgraphData",
    "titanic",
    "nightingale",
    "drivingShifts",
    "newCarColors",
    "caltrain",
    "caltrainStopOrder",
    "penguins",
    "density1d",
    "genderPayGap",
    "payGrade",
    "mix",
    "seafood",
    "lakeLocations",
    code
  );
  const root = document.createElement("div");
  const size = { width: 500, height: 300 }; // GoFishVue default
  fn(
    _,
    root,
    size,
    gf,
    streamgraphData,
    titanic,
    nightingale,
    drivingShifts,
    newCarColors,
    caltrain,
    caltrainStopOrder,
    penguins,
    density1d,
    genderPayGap,
    payGrade,
    mix,
    seafood,
    lakeLocations
  );
  return root;
}

// Namespace any internal svg ids (gradients / clipPaths) so multiple inlined
// charts on the wall never collide. Mirrors capture-renders.mjs's namespacing
// (the prototype's renders.js was pre-namespaced; live renders are not).
export function namespaceSvgIds(svg: SVGElement, exampleId: string): void {
  const prefix = exampleId.replace(/[^a-zA-Z0-9_-]/g, "_") + "__";
  const idEls = svg.querySelectorAll("[id]");
  if (!idEls.length) return;
  const ids = new Set<string>();
  idEls.forEach((el) => {
    const id = el.getAttribute("id");
    if (id) ids.add(id);
  });
  // Rewrite id attributes and every url(#id) / href="#id" reference. Operating on
  // the serialized markup is the simplest exhaustive rewrite (covers fill, stroke,
  // clip-path, mask, filter, xlink:href, …).
  let html = svg.outerHTML;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html
      .replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${prefix}${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${prefix}${id})`)
      .replace(
        new RegExp(`((?:xlink:)?href)="#${esc}"`, "g"),
        `$1="#${prefix}${id}"`
      );
  }
  const doc = new DOMParser().parseFromString(html, "image/svg+xml");
  const reparsed = doc.documentElement;
  svg.replaceChildren(...Array.from(reparsed.childNodes));
  for (const attr of Array.from(reparsed.attributes)) {
    svg.setAttribute(attr.name, attr.value);
  }
}
