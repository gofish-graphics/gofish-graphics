// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * The live SVG backend: paints one display-list item to SolidJS JSX.
 *
 * The counterpart of gofish-ir's pure-string `displayListToSVG`, but emitting
 * JSX so the live `render()` keeps SolidJS reactivity and can interleave
 * user-supplied `defs: JSX.Element[]`. Both backends consume the SAME display
 * list; a cross-check test keeps them in lockstep.
 *
 * Items are already in final absolute y-down pixels (the lower pass folded the
 * flip into `toPixel`), so there is no outer `<g scale(1,-1)>` and no per-shape
 * transform — each item paints verbatim.
 */

import type { JSX } from "solid-js";
import type { DisplayList } from "gofish-ir";

type Style = DisplayList.Style | undefined;

/**
 * Optional interaction context (Tier-0 states). `patch(item)` returns a style
 * override for the item, or undefined. It is read inside the JSX below, so
 * patches that read signals re-run Solid's per-attribute effects — style-only
 * interaction (hover, brush highlighting) never re-lowers or re-lays-out.
 * When absent (the static path), output is byte-identical to before.
 */
export type PaintContext = {
  patch?: (
    item: DisplayList.DisplayItem
  ) => Partial<DisplayList.Style> | undefined;
};

/** Deterministic id counter for composite/mask defs — same scheme as gofish-ir's
 *  string backend so the two backends agree on id shape. A module-level counter
 *  (Math.random is non-reproducible); ids only need to be unique within a single
 *  painted document. */
let compositeIdCounter = 0;

/** SolidJS `style` prop for the CSS-only bits (mix-blend-mode). */
const cssStyle = (style: Style): Record<string, string> | undefined =>
  style?.mixBlendMode ? { "mix-blend-mode": style.mixBlendMode } : undefined;

/** Presentation attributes shared by every primitive. */
const styleProps = (style: Style) =>
  ({
    fill: style?.fill,
    stroke: style?.stroke,
    "stroke-width": style?.strokeWidth,
    "stroke-dasharray": style?.strokeDasharray,
    opacity: style?.opacity,
    "fill-opacity": style?.fillOpacity,
    filter: style?.filter,
    style: cssStyle(style),
  }) as const;

export function paintSVG(
  item: DisplayList.DisplayItem,
  ctx?: PaintContext
): JSX.Element {
  // Effective style: the item's baked style merged with the interaction
  // patch. Called inside JSX attribute/spread positions so Solid tracks any
  // signals the patch reads. `data-gf-id` (the hit-testing hook) is emitted
  // only when an interaction context exists, keeping static output identical.
  const style = (): Style => {
    const p = ctx?.patch?.(item);
    return p ? { ...(item.style ?? {}), ...p } : item.style;
  };
  const gfId = ctx ? item.id : undefined;
  switch (item.kind) {
    case "rect":
      return (
        <rect
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          rx={item.rx}
          ry={item.ry}
          data-gf-id={gfId}
          {...styleProps(style())}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={item.cx}
          cy={item.cy}
          rx={item.rx}
          ry={item.ry}
          data-gf-id={gfId}
          {...styleProps(style())}
        />
      );
    case "path":
      return <path d={item.d} data-gf-id={gfId} {...styleProps(style())} />;
    case "text":
      return (
        <text
          x={item.x}
          y={item.y}
          data-gf-id={gfId}
          font-size={
            item.fontSize !== undefined ? `${item.fontSize}px` : undefined
          }
          font-family={item.fontFamily}
          text-anchor={
            item.textAnchor as JSX.TextSVGAttributes<SVGTextElement>["text-anchor"]
          }
          dominant-baseline={
            item.dominantBaseline as JSX.TextSVGAttributes<SVGTextElement>["dominant-baseline"]
          }
          transform={
            item.rotate !== undefined
              ? `rotate(${item.rotate} ${item.x} ${item.y})`
              : undefined
          }
          {...styleProps(style())}
        >
          {item.text}
        </text>
      );
    case "image":
      return (
        <image
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          href={item.href}
          data-gf-id={gfId}
          preserveAspectRatio={
            item.preserveAspectRatio as JSX.ImageSVGAttributes<SVGImageElement>["preserveAspectRatio"]
          }
          {...styleProps(style())}
        />
      );
    case "group": {
      const t = item.transform;
      const parts: string[] = [];
      if (t.translate)
        parts.push(`translate(${t.translate[0]} ${t.translate[1]})`);
      if (t.scale) parts.push(`scale(${t.scale[0]} ${t.scale[1]})`);
      return (
        <g transform={parts.length ? parts.join(" ") : undefined}>
          {item.children.map((c) => paintSVG(c, ctx))}
        </g>
      );
    }
    case "composite": {
      const uid = `gf-comp-${compositeIdCounter++}`;
      const sourceId = `${uid}-source`;
      const destinationId = `${uid}-destination`;
      const filterId = `${uid}-filter`;
      const { operator } = item;
      const blendMode = (item.blendMode ?? "color") as "multiply" | "screen";
      const tail =
        operator === "in" ? (
          <>
            <feBlend
              in="compositeResult"
              in2="graySource"
              mode={blendMode}
              result="blendedIntersect"
            />
            <feComposite
              in="blendedIntersect"
              in2="compositeResult"
              operator="in"
            />
          </>
        ) : operator === "over" || operator === "atop" ? (
          <feBlend in="compositeResult" in2="graySource" mode={blendMode} />
        ) : null;
      const { x, y, w, h } = item.bbox;
      return (
        <>
          <defs>
            <g id={sourceId}>{item.source.map((c) => paintSVG(c, ctx))}</g>
            <g id={destinationId}>{item.dest.map((c) => paintSVG(c, ctx))}</g>
            <filter
              id={filterId}
              x={x}
              y={y}
              width={w}
              height={h}
              filterUnits="userSpaceOnUse"
              color-interpolation-filters="sRGB"
            >
              <feImage href={`#${sourceId}`} result="sourceImage" />
              <feColorMatrix
                in="sourceImage"
                type="saturate"
                values="0"
                result="graySource"
              />
              <feImage href={`#${destinationId}`} result="destination" />
              <feComposite
                in="destination"
                in2="graySource"
                operator={operator}
                result="compositeResult"
              />
              {tail}
            </filter>
          </defs>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="transparent"
            filter={`url(#${filterId})`}
          />
        </>
      );
    }
    case "mask": {
      const uid = `gf-comp-${compositeIdCounter++}`;
      const sourceId = `${uid}-source`;
      const destinationId = `${uid}-destination`;
      const maskId = `${uid}-mask`;
      return (
        <>
          <defs>
            <g id={sourceId}>{item.mask.map((c) => paintSVG(c, ctx))}</g>
            <g id={destinationId}>
              {item.content.map((c) => paintSVG(c, ctx))}
            </g>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
            >
              <use href={`#${sourceId}`} />
            </mask>
          </defs>
          <use href={`#${destinationId}`} mask={`url(#${maskId})`} />
        </>
      );
    }
  }
}
