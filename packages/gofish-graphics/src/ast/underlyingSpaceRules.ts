// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Data-independent underlying-space *kind* rules.
 *
 * This is the shared classifier the cheap, pre-resolution typecheck consults
 * to assign each axis of a leaf mark an underlying-space kind from its channel
 * structure alone — no data, no layout. It mirrors the per-axis branches of
 * the runtime resolver in `shapes/rect.tsx` (`resolveAxis`), lifted to the v3
 * channel level so the two stages classify the same way (see the parity test).
 *
 * Domains are *not* computed here — they require the data pipeline, which today
 * also builds the node tree (#457). The full annotation's domain fields are
 * read off the resolved scenegraph; this module produces only the kind, which
 * is the part that's checkable early on the small chart-builder AST (#452).
 *
 * Operator-level composition (spread turning child SIZE into a stacked
 * POSITION, etc.) is intentionally out of scope here — that logic lives in the
 * operators' own `resolveUnderlyingSpace` and is faithfully reproducible at the
 * chart-builder level only once elaboration is split out (#457). Callers that
 * need a composed kind should resolve.
 */

import type { Frontend } from "gofish-ir";

export type AxisSpaceKind = Frontend.AxisSpaceKind;

/** Per-axis channel-name groups, keyed by role. Mirrors `rect`'s annotations. */
const X_POS_CHANNELS = ["x", "cx", "l", "r", "xMin", "xMax", "center"] as const;
const Y_POS_CHANNELS = ["y", "cy", "t", "b", "yMin", "yMax"] as const;
const X_SIZE_CHANNEL = "w";
const Y_SIZE_CHANNEL = "h";

/** A serialize-tag channel-annotation map, e.g. `{ w: "size", x: "pos", … }`. */
export type ChannelAnnotationMap = Record<string, string | { type?: string }>;

const channelRole = (
  channels: ChannelAnnotationMap | undefined,
  name: string
): string | undefined => {
  const spec = channels?.[name];
  if (spec === undefined) return undefined;
  return typeof spec === "string" ? spec : spec.type;
};

const isBound = (opts: Record<string, unknown>, name: string): boolean =>
  opts[name] !== undefined;

/**
 * Classify one axis of a leaf mark into an underlying-space kind, given the
 * mark's channel annotations and its raw options. Mirrors `rect.resolveAxis`:
 *
 *  - a bound positional channel → POSITION (data-driven position)
 *  - else a bound size channel:
 *      - literal number size → DIFFERENCE (fixed pixel extent)
 *      - field / Value / accessor size → SIZE (data-driven magnitude)
 *  - else → UNDEFINED
 */
export function classifyLeafAxis(
  axis: 0 | 1,
  channels: ChannelAnnotationMap | undefined,
  opts: Record<string, unknown>
): AxisSpaceKind {
  const posChannels = axis === 0 ? X_POS_CHANNELS : Y_POS_CHANNELS;
  const sizeChannel = axis === 0 ? X_SIZE_CHANNEL : Y_SIZE_CHANNEL;

  const posBound = posChannels.some(
    (name) => channelRole(channels, name) === "pos" && isBound(opts, name)
  );
  if (posBound) return "POSITION";

  if (
    channelRole(channels, sizeChannel) === "size" &&
    isBound(opts, sizeChannel)
  ) {
    const sizeVal = opts[sizeChannel];
    // A literal pixel number is a fixed difference; a field name, accessor, or
    // `v(...)`-wrapped Value is a data-driven magnitude.
    if (typeof sizeVal === "number") return "DIFFERENCE";
    return "SIZE";
  }

  return "UNDEFINED";
}

// (literal-vs-Value is decided structurally above: a plain `number` is a fixed
// DIFFERENCE; a field name, accessor, or `v(...)`-wrapped Value is data-driven
// SIZE — no need to import the runtime `isValue` guard.)

/** Classify both axes of a leaf mark. */
export function classifyLeafMark(
  channels: ChannelAnnotationMap | undefined,
  opts: Record<string, unknown>
): { x: AxisSpaceKind; y: AxisSpaceKind } {
  return {
    x: classifyLeafAxis(0, channels, opts),
    y: classifyLeafAxis(1, channels, opts),
  };
}
