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

/** Deterministic id counter for composite defs and the filter def — same
 *  scheme as gofish-ir's string backend so the two backends agree on id
 *  shape. A module-level counter (Math.random is non-reproducible), never
 *  reset, so ids are unique across every visualization on a page. */
let compositeIdCounter = 0;

/** A render's display list painted, with the `luminanceToAlpha` filter's
 *  `<filter>` def written once ahead of it when an item uses it
 *  (`DisplayList.usesLuminanceToAlpha`), under an id of this render's own;
 *  gofish-ir's string backend writes the same def. */
export function paintDocument(
  items: readonly DisplayList.DisplayItem[],
  interactive?: boolean
): JSX.Element[] {
  const filterId = `gf-luminance-to-alpha-${compositeIdCounter++}`;
  const painted = items.map((item) => paintSVG(item, filterId, interactive));
  if (!DisplayList.usesLuminanceToAlpha(items)) return painted;
  const f = DisplayList.LUMINANCE_TO_ALPHA_FILTER;
  return [
    <defs>
      <filter
        id={filterId}
        color-interpolation-filters={f.colorInterpolationFilters}
      >
        <feColorMatrix type={f.matrixType} />
      </filter>
    </defs>,
    ...painted,
  ];
}

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

/** `item` painted. `filterId` is the id of its render's `luminanceToAlpha`
 *  filter def ({@link paintDocument}). */
function paintSVG(
  item: DisplayList.DisplayItem,
  filterId: string,
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
      const children = item.children.map((c) =>
        paintSVG(c, filterId, interactive)
      );
      const f = item.filter;
      // `luminanceToAlpha` has no CSS function: it is an SVG `<filter>` def
      // the render writes once ({@link paintDocument}).
      const filter =
        f?.kind === "luminanceToAlpha" ? `url(#${filterId})` : f?.value;
      return (
        <g transform={transform} filter={filter}>
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
      // It writes out the item's `compositePlan` (gofish-ir composite.ts):
      // defs, masks, and layers of `<use>`s. The composite is the hit
      // target, so its group carries its id, as every item does: a pointer
      // over a `<use>` targets the `<use>`, not the def it draws, so the defs
      // are painted with no ids. The items are in absolute pixels, as
      // everywhere else: drawing an image under a fractional translate that
      // its own fractional x cancels makes the browser resample it. A shape
      // is referenced by each mask that reads it, so it rasterizes once per
      // mask: the price of SVG's mask model.
      // gofish-ir's `render.ts` draws the same SVG.
      const { x, y, w, h } = item.bbox;
      const plan = DisplayList.compositePlan(
        item,
        `gf-comp-${compositeIdCounter++}`
      );
      const drawn = plan.layers.map((l) => {
        let out: JSX.Element = <use href={`#${l.use}`} />;
        for (const m of [...l.masks].reverse())
          out = <g mask={`url(#${m})`}>{out}</g>;
        return l.blendMode !== undefined ? (
          <g style={`mix-blend-mode:${l.blendMode}`}>{out}</g>
        ) : (
          out
        );
      });
      return (
        <g
          style="isolation:isolate"
          opacity={item.style?.opacity}
          data-gf-id={gfId}
        >
          <defs>
            {plan.defs.map((d) => (
              <g id={d.id}>
                {d.items.map((c) => paintSVG(c, filterId, false))}
              </g>
            ))}
            {plan.masks.map((m) => {
              const uses = m.uses.map((u) => (
                <use
                  href={`#${u}`}
                  filter={m.invert ? "brightness(0)" : undefined}
                />
              ));
              return m.invert ? (
                <mask
                  id={m.id}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect x={x} y={y} width={w} height={h} fill="#fff" />
                  {uses}
                </mask>
              ) : (
                <mask
                  id={m.id}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                  style="mask-type:alpha"
                >
                  {uses}
                </mask>
              );
            })}
          </defs>
          {drawn}
        </g>
      );
    }
  }
}
