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

import type { DisplayItem, DisplayListDocument, Style } from "./schema.js";

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
  if (style.opacity !== undefined) parts.push(`opacity="${style.opacity}"`);
  if (style.fillOpacity !== undefined)
    parts.push(`fill-opacity="${style.fillOpacity}"`);
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
        item.fontSize !== undefined ? ` font-size="${item.fontSize}"` : "";
      const ta =
        item.textAnchor !== undefined
          ? ` text-anchor="${item.textAnchor}"`
          : "";
      return `<text x="${item.x}" y="${item.y}"${fs}${ta}${s}>${esc(item.text)}</text>`;
    }
    case "image":
      return `<image x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" href="${esc(item.href)}"${s}/>`;
  }
};

/** Render a display list to a standalone SVG document string. */
export function displayListToSVG(doc: DisplayListDocument): string {
  const { w, h } = doc.viewport;
  const body = doc.items.map(itemToSVG).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
