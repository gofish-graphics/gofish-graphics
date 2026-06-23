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
  MaskItem,
  Style,
} from "./schema.js";

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
  if (style.filter !== undefined) parts.push(`filter="${esc(style.filter)}"`);
  return parts.length ? " " + parts.join(" ") : "";
};

const itemToSVG = (item: DisplayItem): string => {
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
      const ta =
        item.textAnchor !== undefined
          ? ` text-anchor="${item.textAnchor}"`
          : "";
      const db =
        item.dominantBaseline !== undefined
          ? ` dominant-baseline="${item.dominantBaseline}"`
          : "";
      const rot =
        item.rotate !== undefined
          ? ` transform="rotate(${item.rotate} ${item.x} ${item.y})"`
          : "";
      return `<text x="${item.x}" y="${item.y}"${fs}${ff}${ta}${db}${rot}${s}>${esc(item.text)}</text>`;
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
      return `<g${tr}${s}>${item.children.map(itemToSVG).join("")}</g>`;
    }
    case "composite":
    case "mask":
      // Ported verbatim from porterDuff.tsx in the compositor migration step
      // (display-list-plan task 6). Placeholder until then.
      return compositeToSVG(item);
  }
};

/** Reconstruct the Porter-Duff filter / mask SVG from a structured
 *  composite/mask item. Filled in during the compositor migration. */
const compositeToSVG = (_item: CompositeItem | MaskItem): string => {
  throw new Error(
    "[gofish-ir] display-list composite/mask SVG backend not yet implemented"
  );
};

/** Render a display list to a standalone SVG document string. */
export function displayListToSVG(doc: DisplayListDocument): string {
  const { w, h } = doc.viewport;
  const body = doc.items.map(itemToSVG).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
