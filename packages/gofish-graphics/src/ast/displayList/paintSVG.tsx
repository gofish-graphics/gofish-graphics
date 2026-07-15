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
import { DisplayList } from "gofish-ir";
import { getLiveSlots } from "../../interaction/liveSlots";

type Style = DisplayList.Style | undefined;

/** Live-channel slot table for one item — a per-attribute reactive thunk. */
type LiveSlots = NonNullable<ReturnType<typeof getLiveSlots>>;

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
    if (channel === "text") continue;
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
    filter: style?.filter,
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
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          rx={item.rx}
          ry={item.ry}
          data-gf-id={gfId}
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
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
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        />
      );
    case "path":
      return (
        <path
          d={item.d}
          data-gf-id={gfId}
          {...styleProps(live ? mergedStyle(item, live) : item.style)}
        />
      );
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
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
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
      return (
        <g transform={parts.length ? parts.join(" ") : undefined}>
          {item.children.map((c) => paintSVG(c, interactive))}
        </g>
      );
    }
    case "composite": {
      // Porter-Duff composite, lowered to plain SVG masks + `mix-blend-mode`
      // (no `<feImage>`). `<feImage>` referencing live SVG content has three
      // independent browser pathologies: Chrome's GPU raster path quantizes
      // the reference at fractional page zoom and clips the right/bottom of
      // the composited image (issue #795); WebKit aligns the referenced
      // element's content bbox to the filter region's origin rather than the
      // element's own origin (diverging from Chromium's behavior); and WebKit
      // can rasterize the filter before a data-URI `<image>` inside it has
      // decoded, then never invalidate to repaint once it has. Masks and
      // `mix-blend-mode` are the ordinary, well-tested rendering path — no
      // `<feImage>` anywhere in the graph below.
      //
      // Grayscale-then-composite becomes: paint the source once, grayscale it
      // with a local `saturate(0)` filter, and paint the destination once;
      // which of the two gets alpha-masked by the other (and whether the
      // destination gets a `mix-blend-mode`) depends on the operator:
      //
      //   over:  gray(src) unmasked           + dest blended, unmasked
      //   atop:  gray(src) unmasked           + dest blended, masked by alpha(src)
      //   in:    gray(src) masked by alpha(dest) + dest blended, masked by alpha(src)
      //   out:   (no source layer)            + dest NOT blended, masked by inverse-alpha(src)
      //   xor:   gray(src) masked by inverse-alpha(dest) + dest NOT blended, masked by inverse-alpha(src)
      //
      // Both layers live in a group translated to the bbox origin (matching
      // the lowered items' bbox-relative coordinates) and `isolate`d so
      // `mix-blend-mode` only blends the two layers against each other, not
      // against whatever is behind the composite on the page.
      //
      // Cost: for `atop`/`in`/`xor`, the masked layer's sublist is referenced
      // twice (once as mask content via `<use>`, once as the visible layer),
      // so those sublists rasterize twice per composite. That's inherent to
      // SVG's mask model, not a bug — the accepted price of leaving
      // `<feImage>` behind.
      //
      // Per-operator layer/mask wiring lives in gofish-ir's
      // `compositeLayerConfig` (the single source of truth both SVG backends
      // consume); see that table for the over/atop/in/out/xor breakdown.
      const uid = `gf-comp-${compositeIdCounter++}`;
      const sourceId = `${uid}-source`;
      const destinationId = `${uid}-destination`;
      const grayId = `${uid}-gray`;
      const maskAlphaSrcId = `${uid}-mask-alpha-src`;
      const maskAlphaDestId = `${uid}-mask-alpha-dest`;
      const maskInvAlphaSrcId = `${uid}-mask-invalpha-src`;
      const maskInvAlphaDestId = `${uid}-mask-invalpha-dest`;
      const { operator } = item;
      const blendMode = item.blendMode ?? "color";
      const { x, y, w, h } = item.bbox;

      const cfg = DisplayList.compositeLayerConfig[operator];
      const { hasSourceLayer, hasBlend } = cfg;

      const sourceMaskId =
        cfg.sourceMask === "alphaDest"
          ? maskAlphaDestId
          : cfg.sourceMask === "invAlphaDest"
            ? maskInvAlphaDestId
            : undefined;
      const destMaskId =
        cfg.destMask === "alphaSrc"
          ? maskAlphaSrcId
          : cfg.destMask === "invAlphaSrc"
            ? maskInvAlphaSrcId
            : undefined;

      /** `mask-type:alpha` mask that clips by the referenced layer's alpha. */
      const alphaMask = (id: string, refId: string): JSX.Element => (
        <mask
          id={id}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          style="mask-type:alpha"
        >
          <use href={`#${refId}`} />
        </mask>
      );
      /** Inverse-alpha mask: white rect (fully opaque) minus the referenced
       *  layer's shape (blacked out via `brightness(0)`), so the mask clips
       *  to everywhere the referenced layer is NOT. */
      const invAlphaMask = (id: string, refId: string): JSX.Element => (
        <mask
          id={id}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
        >
          <rect x={0} y={0} width={w} height={h} fill="#fff" />
          <use href={`#${refId}`} filter="brightness(0)" />
        </mask>
      );

      return (
        <g transform={`translate(${x} ${y})`} style="isolation:isolate">
          <defs>
            <g id={sourceId}>
              {item.source.map((c) => paintSVG(c, interactive))}
            </g>
            <g id={destinationId}>
              {item.dest.map((c) => paintSVG(c, interactive))}
            </g>
            {hasSourceLayer && (
              <filter id={grayId} color-interpolation-filters="sRGB">
                <feColorMatrix type="saturate" values="0" />
              </filter>
            )}
            {cfg.destMask === "alphaSrc" && alphaMask(maskAlphaSrcId, sourceId)}
            {cfg.sourceMask === "alphaDest" &&
              alphaMask(maskAlphaDestId, destinationId)}
            {cfg.destMask === "invAlphaSrc" &&
              invAlphaMask(maskInvAlphaSrcId, sourceId)}
            {cfg.sourceMask === "invAlphaDest" &&
              invAlphaMask(maskInvAlphaDestId, destinationId)}
          </defs>
          {hasSourceLayer && (
            <use
              href={`#${sourceId}`}
              filter={`url(#${grayId})`}
              mask={sourceMaskId ? `url(#${sourceMaskId})` : undefined}
            />
          )}
          <use
            href={`#${destinationId}`}
            style={hasBlend ? `mix-blend-mode:${blendMode}` : undefined}
            mask={destMaskId ? `url(#${destMaskId})` : undefined}
          />
        </g>
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
            <g id={sourceId}>
              {item.mask.map((c) => paintSVG(c, interactive))}
            </g>
            <g id={destinationId}>
              {item.content.map((c) => paintSVG(c, interactive))}
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
