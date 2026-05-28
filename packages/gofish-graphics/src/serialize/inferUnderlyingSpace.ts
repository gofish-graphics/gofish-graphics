// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Cheap, pre-resolution underlying-space *kind* inference over the in-memory
 * chart-builder AST — the early typecheck of issue #452.
 *
 * It walks the same `__serialize`-tagged mark tree the frontend-IR emitter
 * reads (`toJSON.ts`) and classifies each *leaf* mark's per-axis kind via the
 * shared, data-independent rules in `ast/underlyingSpaceRules.ts`. No data,
 * no layout, no node construction — so it is far cheaper than resolving, and
 * runnable on the small surface AST before chart builders are resolved.
 *
 * Scope (foundation): leaf-mark classification. Two things are deliberately
 * *not* done here and are read off the resolved scenegraph instead:
 *
 *  - **Domains** — they need the data pipeline (today coupled to node
 *    construction; see #457). `toJSON` fills the annotation's domain fields
 *    from the resolved tree via `underlyingSpaceToAnnotation`.
 *  - **Operator composition** — `spread`/`stack` turning child SIZE into a
 *    stacked POSITION, etc. That logic lives in the operators'
 *    `resolveUnderlyingSpace` and is faithfully reproducible at the surface
 *    level only once elaboration is split out (#457).
 *
 * The cross-stage parity test treats this as the "Core Lint" check: every
 * resolved leaf node's kind must agree with what this pass classifies.
 */

import {
  classifyLeafMark,
  type AxisSpaceKind,
} from "../ast/underlyingSpaceRules";
import { UnderlyingSpaceInferenceError } from "../ast/underlyingSpace";

/** A leaf mark's inferred per-axis kinds, tagged with the mark type. */
export interface LeafKind {
  type: string;
  x: AxisSpaceKind;
  y: AxisSpaceKind;
}

interface SerializeTag {
  type: string;
  opts: Record<string, unknown>;
  channels?: Record<string, string | { type?: string }>;
  __combinator?: true;
  children?: unknown;
}

function readTag(value: unknown): SerializeTag | undefined {
  const tag = (value as any)?.__serialize;
  if (!tag || typeof tag.type !== "string") return undefined;
  return tag as SerializeTag;
}

/**
 * Classify a single leaf mark's per-axis kinds. Throws
 * {@link UnderlyingSpaceInferenceError} for marks that carry no channel
 * annotations (e.g. `circle`/`line`/`area`, which aren't `createMark`-based) —
 * those can't be classified structurally and must be resolved.
 */
export function inferLeafMarkKinds(mark: unknown): LeafKind {
  const tag = readTag(mark);
  if (!tag) {
    throw new UnderlyingSpaceInferenceError(
      "cannot infer underlying space: mark has no __serialize tag"
    );
  }
  if (tag.__combinator) {
    throw new UnderlyingSpaceInferenceError(
      `cannot classify combinator mark "${tag.type}" at the leaf level; resolve to compose children`
    );
  }
  if (!tag.channels) {
    throw new UnderlyingSpaceInferenceError(
      `cannot infer underlying space for mark "${tag.type}": no channel annotations (resolve instead)`
    );
  }
  const { x, y } = classifyLeafMark(tag.channels, tag.opts);
  return { type: tag.type, x, y };
}

/**
 * Collect the inferred kinds of every leaf mark reachable from `mark`, walking
 * combinator-form marks (`layer`, `spread([…])`, …) into their children.
 * Leaf marks the cheap pass can't classify are skipped (they're validated by
 * resolution instead), so this never throws.
 */
export function collectLeafMarkKinds(mark: unknown): LeafKind[] {
  const tag = readTag(mark);
  if (!tag) return [];
  if (tag.__combinator) {
    const children = Array.isArray(tag.children) ? tag.children : [];
    return children.flatMap((c) => collectLeafMarkKinds(c));
  }
  if (!tag.channels) return [];
  const { x, y } = classifyLeafMark(tag.channels, tag.opts);
  return [{ type: tag.type, x, y }];
}
