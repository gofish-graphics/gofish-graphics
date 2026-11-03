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
 * Items are already in final absolute y-down pixels, so there is no per-shape
 * transform — each item paints verbatim.
 */

import type { JSX } from "solid-js";
import { DisplayList } from "gofish-ir";
import { GEOMETRY_CHANNELS, getLiveSlots } from "../../interaction/liveSlots";

type Style = DisplayList.Style | undefined;

/** Live-channel slot table for one item — a per-attribute reactive thunk. */
type LiveSlots = NonNullable<ReturnType<typeof getLiveSlots>>;

/**
 * One field of a display item, with its live slot's value in place of the
 * static one when the item has that slot. MUST be called from inside a JSX
 * attribute position so Solid tracks the signal reads and patches only that
 * attribute; reading it eagerly outside would freeze reactivity.
 */
const patched = <T,>(
  live: LiveSlots | undefined,
  channel: string,
  value: T
): T => (live?.[channel] === undefined ? value : (live[channel]() as T));

/**
 * Merge an item's static style with its live channels, evaluating each live
 * thunk. MUST be called from inside a JSX attribute position (via a spread) so
 * Solid tracks the signal reads and patches only that attribute — evaluating it
 * eagerly outside the attribute would freeze reactivity. Allocates only when the
 * item has live channels; the static path branches straight to `item.style`.
 */
const mergedStyle = (item: DisplayList.DisplayItem, live: LiveSlots): Style => {
  let merged: Record<string, unknown> | undefined;
  for (const channel in live) {
    if (channel === "text" || GEOMETRY_CHANNELS.has(channel)) continue;
    (merged ??= { ...(item.style ?? {}) })[channel] = live[channel]();
  }
  return (merged as Style) ?? item.style;
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
    "paint-order": style?.paintOrder,
    "stroke-linejoin": style?.strokeLinejoin as
      | JSX.PathSVGAttributes<SVGPathElement>["stroke-linejoin"]
      | undefined,
    style: cssStyle(style),
  }) as const;

export function paintSVG(
  item: DisplayList.DisplayItem,
  interactive?: boolean
): JSX.Element {
  // Live channels (a `live()` value baked at lower time): per-attribute
  // reactive thunks, looked up from the module-level side table. Merged inside
  // JSX attribute positions (via `mergedStyle`) so Solid tracks any signals the
  // thunk reads and patches only that attribute — style-only interaction never
  // re-lowers or re-lays-out. When absent (the static path), `styleProps` sees
  // `item.style` directly and output is byte-identical.
  const live = getLiveSlots(item);
  // `data-gf-id` is the hit-testing hook, emitted only when a runtime is active.
  const gfId = interactive ? item.id : undefined;
  switch (item.kind) {
    case "rect":
      return (
        <rect
          x={patched(live, "x", item.x)}
          y={patched(live, "y", item.y)}
          width={patched(live, "w", item.w)}
          height={patched(live, "h", item.h)}
          rx={patched(live, "rx", item.rx)}
          ry={patched(live, "ry", item.ry)}
          data-gf-id={gfId}
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={patched(live, "cx", item.cx)}
          cy={patched(live, "cy", item.cy)}
          rx={patched(live, "rx", item.rx)}
          ry={patched(live, "ry", item.ry)}
          data-gf-id={gfId}
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        />
      );
    case "path":
      return (
        <path
          d={patched(live, "d", item.d)}
          data-gf-id={gfId}
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        />
      );
    case "text":
      return (
        <text
          x={patched(live, "x", item.x)}
          y={patched(live, "y", item.y)}
          data-gf-id={gfId}
          font-size={
            item.fontSize !== undefined ? `${item.fontSize}px` : undefined
          }
          font-family={item.fontFamily}
          font-style={
            item.fontStyle as JSX.TextSVGAttributes<SVGTextElement>["font-style"]
          }
          font-weight={item.fontWeight}
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
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        >
          {
            // Live text: the "text" slot overrides CONTENT reactively (the box
            // keeps its resolve-time measure).
            live?.text ? String(live.text()) : item.text
          }
        </text>
      );
    case "image":
      return (
        <image
          x={patched(live, "x", item.x)}
          y={patched(live, "y", item.y)}
          width={patched(live, "w", item.w)}
          height={patched(live, "h", item.h)}
          href={item.href}
          data-gf-id={gfId}
          preserveAspectRatio={
            item.preserveAspectRatio as JSX.ImageSVGAttributes<SVGImageElement>["preserveAspectRatio"]
          }
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        />
      );
    case "group": {
      const t = item.transform;
      const parts: string[] = [];
      if (t.translate)
        parts.push(`translate(${t.translate[0]} ${t.translate[1]})`);
      if (t.scale) parts.push(`scale(${t.scale[0]} ${t.scale[1]})`);
      const transform = parts.length ? parts.join(" ") : undefined;
      const children = item.children.map((c) => paintSVG(c, interactive));
      const f = item.filter;
      if (f?.kind === "luminanceToAlpha") {
        // No CSS function for it: an SVG `<filter>` def, as gofish-ir's
        // string backend draws it (`luminanceToAlphaFilterSVG`).
        const id = `gf-filter-${compositeIdCounter++}`;
        return (
          <>
            <defs>
              <filter id={id} color-interpolation-filters="sRGB">
                <feColorMatrix type="luminanceToAlpha" />
              </filter>
            </defs>
            <g transform={transform} filter={`url(#${id})`}>
              {children}
            </g>
          </>
        );
      }
      return (
        <g transform={transform} filter={f?.value}>
          {children}
        </g>
      );
    }
    case "composite": {
      // A region composite (#1267), drawn with plain SVG masks and
      // `mix-blend-mode`, no `<feImage>`. `<feImage>` referencing live SVG
      // content has three independent browser pathologies: Chrome's GPU
      // raster path quantizes the reference at fractional page zoom and
      // clips the right/bottom of the composited image (issue #795); WebKit
      // aligns the referenced element's content bbox to the filter region's
      // origin rather than the element's own origin; and WebKit can
      // rasterize the filter before a data-URI `<image>` inside it has
      // decoded, then never invalidate to repaint once it has.
      //
      // Each operand's paint and shape (and the result's fill) are written
      // once as defs; each layer `compositeLayers` lists is a `<use>` of
      // one of them, clipped by nested masks: an alpha mask of the listed
      // operands' shapes, or an inverse one (a white rect with the shapes in
      // black over it). Layers that blend carry `mix-blend-mode`. The layers
      // sit in a group `isolate`d so a blend mixes the layers only, not what
      // is behind the composite. A painted result is one mark, so the group
      // carries its id for hit-testing: a pointer over a `<use>` targets the
      // `<use>`, not the def it draws. The items are in absolute pixels, as
      // everywhere else: drawing an image under a fractional translate that
      // its own fractional x cancels makes the browser resample it. A shape
      // is referenced by each mask that reads it, so it rasterizes once per
      // mask: the price of SVG's mask model.
      // gofish-ir's `render.ts` draws the same SVG.
      const uid = `gf-comp-${compositeIdCounter++}`;
      const { x, y, w, h } = item.bbox;
      const blendMode = item.blendMode ?? "normal";
      const paintId = (i: number) => `${uid}-p${i}`;
      const shapeId = (i: number) =>
        item.operands[i].shape ? `${uid}-s${i}` : paintId(i);
      const fillId = `${uid}-fill`;
      const layers = DisplayList.compositeLayers(
        item.operator,
        item.operands.length,
        item.fill !== undefined
      );
      const masks = new Map<string, JSX.Element>();
      const maskId = (m: DisplayList.CompositeMask): string => {
        const key = DisplayList.compositeMaskKey(m);
        const id = `${uid}-m-${key}`;
        if (!masks.has(key)) {
          const uses = m.operands.map((i) => (
            <use
              href={`#${shapeId(i)}`}
              filter={m.invert ? "brightness(0)" : undefined}
            />
          ));
          masks.set(
            key,
            m.invert ? (
              <mask
                id={id}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
              >
                <rect x={x} y={y} width={w} height={h} fill="#fff" />
                {uses}
              </mask>
            ) : (
              <mask
                id={id}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
                style="mask-type:alpha"
              >
                {uses}
              </mask>
            )
          );
        }
        return id;
      };
      const drawn = layers.map((l) => {
        let out: JSX.Element = (
          <use href={`#${l.draw === "fill" ? fillId : paintId(l.draw)}`} />
        );
        for (const m of [...l.masks].reverse())
          out = <g mask={`url(#${maskId(m)})`}>{out}</g>;
        return l.blend && blendMode !== "normal" ? (
          <g style={`mix-blend-mode:${blendMode}`}>{out}</g>
        ) : (
          out
        );
      });
      return (
        <g
          style="isolation:isolate"
          opacity={item.style?.opacity}
          data-gf-id={item.fill ? gfId : undefined}
        >
          <defs>
            {item.operands.map((o, i) => (
              <>
                <g id={paintId(i)}>
                  {o.paint.map((c) => paintSVG(c, interactive))}
                </g>
                {o.shape && (
                  <g id={`${uid}-s${i}`}>
                    {o.shape.map((c) => paintSVG(c, interactive))}
                  </g>
                )}
              </>
            ))}
            {item.fill && (
              <g id={fillId}>
                {item.fill.map((c) => paintSVG(c, interactive))}
              </g>
            )}
            {[...masks.values()]}
          </defs>
          {drawn}
        </g>
      );
    }
  }
}
