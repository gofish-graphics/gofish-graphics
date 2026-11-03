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
  compositeLayers,
  compositeMaskKey,
  type CompositeMask,
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
      let def = "";
      let fa = "";
      if (f?.kind === "css") fa = ` filter="${esc(f.value)}"`;
      else if (f?.kind === "luminanceToAlpha") {
        const id = `gf-filter-${compositeIdCounter++}`;
        def = `<defs>${luminanceToAlphaFilterSVG(id)}</defs>`;
        fa = ` filter="url(#${id})"`;
      }
      return `${def}<g${tr}${fa}${s}>${item.children.map(itemToSVG).join("")}</g>`;
    }
    case "composite":
      return compositeToSVG(item);
  }
};

/** Deterministic id counter for composite/mask defs (Math.random is both
 *  unavailable headlessly and non-reproducible). Reset per document by
 *  `displayListToSVG`; the JSX backend uses the same scheme so the two backends
 *  agree on id shape. */
let compositeIdCounter = 0;

/** The SVG def of a `luminanceToAlpha` filter (`DisplayFilter`); `paintSVG.tsx`
 *  in gofish-graphics draws the same one. Each pixel becomes black
 *  with an alpha of its luminance, computed in sRGB as a CSS mask would. */
const luminanceToAlphaFilterSVG = (id: string): string =>
  `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha"/></filter>`;

/** Draw a composite item as SVG masks and `mix-blend-mode` (no
 *  `<feImage>`: see `paintSVG.tsx` in gofish-graphics for why, issue #795).
 *  The layers and their masks are `compositeLayers` (composite.ts), shared
 *  with that backend. Each operand's paint and shape, and the fill, are
 *  written once as defs and drawn by `<use>`; the layers sit in a group at
 *  the bbox origin, `isolate`d so a blend mixes the layers only. */
const compositeToSVG = (item: CompositeItem): string => {
  const uid = `gf-comp-${compositeIdCounter++}`;
  const { w, h } = item.bbox;
  const blendMode = item.blendMode ?? "normal";
  const paintId = (i: number) => `${uid}-p${i}`;
  const shapeId = (i: number) =>
    item.operands[i].shape ? `${uid}-s${i}` : paintId(i);
  const fillId = `${uid}-fill`;
  const group = (id: string, items: DisplayItem[]) =>
    `<g id="${id}">${items.map(itemToSVG).join("")}</g>`;

  const layers = compositeLayers(
    item.operator,
    item.operands.length,
    item.fill !== undefined
  );
  const masks = new Map<string, string>();
  const maskDef = (m: CompositeMask): string => {
    const key = compositeMaskKey(m);
    const id = `${uid}-m-${key}`;
    if (!masks.has(key)) {
      const uses = m.operands
        .map(
          (i) =>
            `<use href="#${shapeId(i)}"${m.invert ? ` filter="brightness(0)"` : ""}/>`
        )
        .join("");
      masks.set(
        key,
        m.invert
          ? `<mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">` +
              `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>${uses}</mask>`
          : `<mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:alpha">${uses}</mask>`
      );
    }
    return id;
  };
  const drawn = layers.map((l) => {
    let out = `<use href="#${l.draw === "fill" ? fillId : paintId(l.draw)}"/>`;
    for (const m of [...l.masks].reverse())
      out = `<g mask="url(#${maskDef(m)})">${out}</g>`;
    return l.blend && blendMode !== "normal"
      ? `<g style="mix-blend-mode:${esc(blendMode)}">${out}</g>`
      : out;
  });

  const defs =
    item.operands
      .map(
        (o, i) =>
          group(paintId(i), o.paint) +
          (o.shape ? group(`${uid}-s${i}`, o.shape) : "")
      )
      .join("") +
    (item.fill ? group(fillId, item.fill) : "") +
    [...masks.values()].join("");
  return (
    `<g transform="translate(${item.bbox.x} ${item.bbox.y})" style="isolation:isolate"${item.style?.opacity !== undefined ? ` opacity="${item.style.opacity}"` : ""}>` +
    `<defs>${defs}</defs>${drawn.join("")}</g>`
  );
};

/** Render a display list to a standalone SVG document string. */
export function displayListToSVG(doc: DisplayListDocument): string {
  compositeIdCounter = 0;
  const { w, h } = doc.viewport;
  const body = doc.items.map(itemToSVG).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
