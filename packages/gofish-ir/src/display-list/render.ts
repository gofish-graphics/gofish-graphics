// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * Reference SVG backend for the display list.
 *
 * A display list is backend-agnostic: it carries resolved primitives, not
 * markup, so an SVG, Canvas, or WebGPU emitter can each consume it. This is the
 * SVG one — a pure `DisplayListDocument -> string` function with no DOM and no
 * GoFish runtime dependency, which makes it usable headlessly and a worked
 * example of how a foreign host (or a Canvas/WebGPU backend) would consume the
 * format. A Canvas backend would walk the same `items` issuing `fillRect` /
 * `arc` / `Path2D` calls instead of emitting tags.
 */

import type {
  CompositeItem,
  DisplayItem,
  DisplayListDocument,
  Style,
} from "./schema.js";
import {
  compositePlan,
  defFilters,
  filterDef,
  filterKey,
  type DefFilter,
} from "./composite.js";

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const styleAttrs = (style: Style | undefined): string => {
  if (!style) return "";
  const parts: string[] = [];
  if (style.fill !== undefined) parts.push(`fill="${esc(style.fill)}"`);
  if (style.stroke !== undefined) parts.push(`stroke="${esc(style.stroke)}"`);
  if (style.strokeWidth !== undefined)
    parts.push(`stroke-width="${style.strokeWidth}"`);
  if (style.strokeDasharray !== undefined)
    parts.push(`stroke-dasharray="${esc(style.strokeDasharray)}"`);
  if (style.opacity !== undefined) parts.push(`opacity="${style.opacity}"`);
  if (style.fillOpacity !== undefined)
    parts.push(`fill-opacity="${style.fillOpacity}"`);
  if (style.mixBlendMode !== undefined)
    parts.push(`style="mix-blend-mode:${esc(style.mixBlendMode)}"`);
  if (style.paintOrder !== undefined)
    parts.push(`paint-order="${esc(style.paintOrder)}"`);
  if (style.strokeLinejoin !== undefined)
    parts.push(`stroke-linejoin="${esc(style.strokeLinejoin)}"`);
  return parts.length ? " " + parts.join(" ") : "";
};

/** The ids of a document's filter defs, by {@link filterKey}. */
type FilterIds = ReadonlyMap<string, string>;

/** `item` as SVG. `filterIds` names the document's filter defs. */
const itemToSVG = (item: DisplayItem, filterIds: FilterIds): string => {
  const s = styleAttrs(item.style);
  switch (item.kind) {
    case "rect": {
      const r =
        (item.rx !== undefined ? ` rx="${item.rx}"` : "") +
        (item.ry !== undefined ? ` ry="${item.ry}"` : "");
      return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"${r}${s}/>`;
    }
    case "ellipse":
      return `<ellipse cx="${item.cx}" cy="${item.cy}" rx="${item.rx}" ry="${item.ry}"${s}/>`;
    case "path":
      return `<path d="${esc(item.d)}"${s}/>`;
    case "text": {
      const fs =
        item.fontSize !== undefined ? ` font-size="${item.fontSize}px"` : "";
      const ff =
        item.fontFamily !== undefined
          ? ` font-family="${esc(item.fontFamily)}"`
          : "";
      const fst =
        item.fontStyle !== undefined
          ? ` font-style="${esc(item.fontStyle)}"`
          : "";
      const fw =
        item.fontWeight !== undefined
          ? ` font-weight="${esc(String(item.fontWeight))}"`
          : "";
      const ta =
        item.textAnchor !== undefined
          ? ` text-anchor="${esc(item.textAnchor)}"`
          : "";
      const db =
        item.dominantBaseline !== undefined
          ? ` dominant-baseline="${esc(item.dominantBaseline)}"`
          : "";
      const rot =
        item.rotate !== undefined
          ? ` transform="rotate(${item.rotate} ${item.x} ${item.y})"`
          : "";
      return `<text x="${item.x}" y="${item.y}"${fs}${ff}${fst}${fw}${ta}${db}${rot}${s}>${esc(item.text)}</text>`;
    }
    case "image": {
      const par =
        item.preserveAspectRatio !== undefined
          ? ` preserveAspectRatio="${esc(item.preserveAspectRatio)}"`
          : "";
      return `<image x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" href="${esc(item.href)}"${par}${s}/>`;
    }
    case "group": {
      const t = item.transform;
      const parts: string[] = [];
      if (t.translate)
        parts.push(`translate(${t.translate[0]} ${t.translate[1]})`);
      if (t.scale) parts.push(`scale(${t.scale[0]} ${t.scale[1]})`);
      const tr = parts.length ? ` transform="${parts.join(" ")}"` : "";
      const f = item.filter;
      const fa =
        f === undefined
          ? ""
          : f.kind === "css"
            ? ` filter="${esc(f.value)}"`
            : ` filter="url(#${filterIds.get(filterKey(f))})"`;
      return `<g${tr}${fa}${s}>${item.children.map((c) => itemToSVG(c, filterIds)).join("")}</g>`;
    }
    case "composite":
      return compositeToSVG(item, filterIds);
  }
};

/** Deterministic id counter for composite defs and the filter defs (Math.random is both
 *  unavailable headlessly and non-reproducible). Reset per document by
 *  `displayListToSVG`; the JSX backend uses the same scheme so the two backends
 *  agree on id shape. */
let compositeIdCounter = 0;

/** The `<filter>` def of `filter` ({@link filterDef}), under `id`. */
const filterSVG = (filter: DefFilter, id: string): string => {
  const f = filterDef(filter);
  const values = f.values !== undefined ? ` values="${f.values}"` : "";
  return `<filter id="${id}" color-interpolation-filters="${f.colorInterpolationFilters}"><feColorMatrix type="${f.matrixType}"${values}/></filter>`;
};

/** Draw a composite item as SVG masks and `mix-blend-mode` (no
 *  `<feImage>`: see `paintSVG.tsx` in gofish-graphics for why, issue #795):
 *  its `compositePlan` (composite.ts), which that backend writes too. */
const compositeToSVG = (item: CompositeItem, filterIds: FilterIds): string => {
  const { x, y, w, h } = item.bbox;
  const plan = compositePlan(item, `gf-comp-${compositeIdCounter++}`);
  const defs =
    plan.defs
      .map(
        (d) =>
          `<g id="${d.id}">${d.items.map((c) => itemToSVG(c, filterIds)).join("")}</g>`
      )
      .join("") +
    plan.masks
      .map((m) =>
        "outside" in m
          ? `<mask id="${m.id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">` +
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>` +
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" mask="url(#${m.outside})"/></mask>`
          : `<mask id="${m.id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:alpha">` +
            `${m.alpha.map((u) => `<use href="#${u}"/>`).join("")}</mask>`
      )
      .join("");
  const drawn = plan.layers.map((l) => {
    let out = `<use href="#${l.use}"/>`;
    for (const m of [...l.masks].reverse())
      out = `<g mask="url(#${m})">${out}</g>`;
    return l.blendMode !== undefined
      ? `<g style="mix-blend-mode:${esc(l.blendMode)}">${out}</g>`
      : out;
  });
  return (
    `<g style="isolation:isolate"${item.style?.opacity !== undefined ? ` opacity="${item.style.opacity}"` : ""}>` +
    `<defs>${defs}</defs>${drawn.join("")}</g>`
  );
};

/** Render a display list to a standalone SVG document string. */
export function displayListToSVG(doc: DisplayListDocument): string {
  compositeIdCounter = 0;
  const { w, h } = doc.viewport;
  const prefix = `gf-filter-${compositeIdCounter++}`;
  const filters = defFilters(doc.items);
  const filterIds: FilterIds = new Map(
    filters.map((f, i) => [filterKey(f), `${prefix}-${i}`])
  );
  const defs = filters.length
    ? `<defs>${filters.map((f, i) => filterSVG(f, `${prefix}-${i}`)).join("")}</defs>`
    : "";
  const body = defs + doc.items.map((i) => itemToSVG(i, filterIds)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
