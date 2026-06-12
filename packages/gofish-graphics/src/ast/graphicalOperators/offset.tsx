import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { createNodeOperator } from "../withGoFish";

/**
 * offset: shift a single child by `(x, y)` pixels **at render time only**.
 *
 * The child's reported layout bounds are passed through unchanged — `offset`
 * does NOT move the bbox it advertises to its parent, it only nudges the
 * pixels in the rendered SVG. This makes it the right tool when something
 * else (e.g. a `mask` region rect) defines the visible bounds and you just
 * need to slide the underlying content beneath it.
 *
 * Layout `transform.translate` stays `[undefined, undefined]` — the "parent
 * can place me" signal — and the `(x, y)` shift is added on top of whatever
 * translate the parent assigns, inside `render`. Never collapse the
 * `undefined`s to `0`; doing so would steal placement from the parent.
 *
 * Subtlety for image/rect children: those shapes render with an internal
 * `scale(1, -1)` y-flip, so a positive `y` offset moves content the opposite
 * way you might expect on the y axis. Callers compensate at the callsite (see
 * `cut`), not here.
 *
 * Exactly one child is required.
 */
export const offset = createNodeOperator<{ x?: number; y?: number }, GoFishAST>(
  (opts, children) => {
    if (children.length !== 1) {
      throw new Error("offset expects exactly one child");
    }
    const dx = opts.x ?? 0;
    const dy = opts.y ?? 0;
    return new GoFishNode(
      {
        type: "offset",
        shared: [false, false],
        resolveUnderlyingSpace: (childSpaces) => childSpaces[0] ?? [],
        layout: (_shared, size, scaleFactors, layoutChildren, posScales) => {
          const child = layoutChildren[0].layout(size, scaleFactors, posScales);
          child.place("x", 0, "baseline");
          child.place("y", 0, "baseline");
          return {
            intrinsicDims: [
              {
                min: child.dims[0].min ?? 0,
                size: child.dims[0].size ?? 0,
                center: child.dims[0].center ?? 0,
                max: child.dims[0].max ?? 0,
              },
              {
                min: child.dims[1].min ?? 0,
                size: child.dims[1].size ?? 0,
                center: child.dims[1].center ?? 0,
                max: child.dims[1].max ?? 0,
              },
            ],
            transform: { translate: [undefined, undefined] },
          };
        },
        render: ({ transform }, renderedChildren) => {
          const tx = (transform?.translate?.[0] ?? 0) + dx;
          const ty = (transform?.translate?.[1] ?? 0) + dy;
          return (
            <g transform={`translate(${tx}, ${ty})`}>{renderedChildren[0]}</g>
          );
        },
      },
      children
    );
  }
);
