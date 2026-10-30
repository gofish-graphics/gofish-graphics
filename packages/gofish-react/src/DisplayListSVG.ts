/**
 * THROWAWAY PROTOTYPE (#1266). A React port of gofish-ir's
 * `displayListToSVG`: the display list drawn as React DOM `<svg>` elements,
 * so `react-dom/server` can render it and React event handlers could attach
 * per item (each item carries its `datum`).
 *
 * Composite and mask items are a declared shortcut: they are drawn by the
 * string backend inside a `<g dangerouslySetInnerHTML>` rather than ported
 * element by element.
 */
import { createElement, type ReactNode, type SVGProps } from "react";
import { DisplayList } from "gofish-ir";

type Item = DisplayList.DisplayItem;

const styleProps = (
  style: DisplayList.Style | undefined
): SVGProps<SVGElement> => {
  if (!style) return {};
  const p: Record<string, unknown> = {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeDasharray: style.strokeDasharray,
    opacity: style.opacity,
    fillOpacity: style.fillOpacity,
    filter: style.filter,
    paintOrder: style.paintOrder,
    strokeLinejoin: style.strokeLinejoin,
  };
  if (style.mixBlendMode !== undefined)
    p.style = { mixBlendMode: style.mixBlendMode };
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p as SVGProps<SVGElement>;
};

function item(it: Item, key: number): ReactNode {
  const s = styleProps(it.style);
  switch (it.kind) {
    case "rect":
      return createElement("rect", {
        key,
        x: it.x,
        y: it.y,
        width: it.w,
        height: it.h,
        rx: it.rx,
        ry: it.ry,
        ...s,
      } as any);
    case "ellipse":
      return createElement("ellipse", {
        key,
        cx: it.cx,
        cy: it.cy,
        rx: it.rx,
        ry: it.ry,
        ...s,
      } as any);
    case "path":
      return createElement("path", { key, d: it.d, ...s } as any);
    case "text":
      return createElement(
        "text",
        {
          key,
          x: it.x,
          y: it.y,
          fontSize: it.fontSize !== undefined ? `${it.fontSize}px` : undefined,
          fontFamily: it.fontFamily,
          fontStyle: it.fontStyle,
          fontWeight: it.fontWeight,
          textAnchor: it.textAnchor,
          dominantBaseline: it.dominantBaseline,
          transform:
            it.rotate !== undefined
              ? `rotate(${it.rotate} ${it.x} ${it.y})`
              : undefined,
          ...s,
        } as any,
        it.text
      );
    case "image":
      return createElement("image", {
        key,
        x: it.x,
        y: it.y,
        width: it.w,
        height: it.h,
        href: it.href,
        preserveAspectRatio: it.preserveAspectRatio,
        ...s,
      } as any);
    case "group": {
      const t = it.transform;
      const parts: string[] = [];
      if (t.translate)
        parts.push(`translate(${t.translate[0]} ${t.translate[1]})`);
      if (t.scale) parts.push(`scale(${t.scale[0]} ${t.scale[1]})`);
      return createElement(
        "g",
        {
          key,
          transform: parts.length ? parts.join(" ") : undefined,
          ...s,
        } as any,
        it.children.map(item)
      );
    }
    case "composite":
    case "mask": {
      // Shortcut: reuse the string backend for the Porter-Duff graph.
      const svg = DisplayList.displayListToSVG({
        irVersion: 0,
        ir: "gofish-display-list",
        viewport: { w: 0, h: 0 },
        items: [it],
      });
      const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      return createElement("g", {
        key,
        dangerouslySetInnerHTML: { __html: inner },
      });
    }
  }
}

export function DisplayListSVG({
  doc,
}: {
  doc: DisplayList.DisplayListDocument;
}) {
  const { w, h } = doc.viewport;
  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: w,
      height: h,
      viewBox: `0 0 ${w} ${h}`,
    },
    doc.items.map(item)
  );
}
