import type { GoFishAST } from "./_ast";
import type { Transform } from "./dims";

/**
 * A y-orientation scope (issue #629): the placed y-band a draw entry's pixels
 * are mirrored within. `baseY` is the band's top edge and `height` its extent,
 * both in the ROOT y-down frame (absolute, pre-flip). A draw entry carrying a
 * `flip` renders y-UP — its content is mirrored about `[baseY, baseY+height]`
 * (`gy → 2·baseY + height − gy`) — reproducing, per-scope, the old global flip
 * about the canvas height. Absent = the ambient y-DOWN frame (top-left origin).
 */
export type FlipScope = { baseY: number; height: number };

/** Mirror a GoFish-space y about a flip scope's band: `gy ↦ 2·baseY + height − gy`
 *  (issue #629). The single source of the per-scope mirror formula — used by the
 *  `toPixelFor` maps (render / `toDisplayList` via `makeToPixelFor`) and by the
 *  bake chrome box-mirror, so the SVG paint path and the display-list export path
 *  can never diverge. */
export const mirrorY = (flip: FlipScope, gy: number): number =>
  2 * flip.baseY + flip.height - gy;

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
 * This is the real form of the long-stubbed `DisplayObject`: the representation
 * render reads *after* all layout/placement is resolved.
 *
 * For now an entry still references its source {@link GoFishAST} as the renderer
 * — each mark's draw logic (rect/ellipse/text/path/…) still lives in its
 * `_render`, invoked via `INTERNAL_render(coordinateTransform, transform)` with
 * this baked `transform` as an override. The end-state (stage 3-D D3) is fully
 * self-contained primitives with no `node` back-reference.
 */
export type DisplayObject = {
  node: GoFishAST;
  transform: Transform;
  /** The y-orientation scope this entry draws in (issue #629). Set by the bake
   *  walk at the topmost continuous-y node / each `coord`; `undefined` = ambient
   *  y-down. The lower driver builds this entry's `toPixel` from it. */
  flip?: FlipScope;
};
