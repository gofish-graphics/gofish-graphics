import type { GoFishAST } from "./_ast";
import type { Transform } from "./dims";

/**
 * A node in GoFish's rendering IR.
 *
 * The bake pass ({@link flattenLayout} in `coordinateTransforms/bake.ts`)
 * collapses a resolved scenegraph into a flat list of these — each one a
 * child-less *draw entry* pairing a mark with the absolute (already-composed)
 * transform at which to draw it. The nested, parent-relative `<g transform>`
 * chain that the scenegraph expresses position with is folded into the single
 * `transform` here, so render can consume the list directly.
 *
 * This is the representation render reads *after* all layout/placement is
 * resolved.
 *
 * An entry still references its source {@link GoFishAST}: each mark's draw logic
 * (rect/ellipse/text/path/…) lives in its `lower`, invoked via
 * `INTERNAL_lower(coordinateTransform, transform)` with this baked `transform`
 * as an override. The end-state is fully self-contained primitives with no
 * `node` back-reference.
 */
export type DisplayObject = {
  node: GoFishAST;
  transform: Transform;
};
