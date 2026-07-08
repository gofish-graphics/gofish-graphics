import { GoFishNode } from "../_node";
import type { AxisOptions } from "../gofish";
import { MaybeValue } from "../data";
import {
  Direction,
  elaborateDirection,
  FancyDims,
  FancyDirection,
} from "../dims";
import { Collection } from "lodash";
import { SplitBy, splitEntries } from "../datumProjection";
import { isField } from "../data";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { Alignment } from "./alignment";
import { layer } from "./layer";
import { Constraint } from "../constraints";
import { ensureChildNames } from "../constraints/shared";
import { createOperator } from "../marks/createOperator";
import { Mark, Operator } from "../types";
import type { FieldExpr } from "../fieldExpr";

// Utility function to unwrap lodash wrapped arrays
const unwrapLodashArray = function <T>(value: T[] | Collection<T>): T[] {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as Collection<T>).value() as T[];
  }
  return value as T[];
};

/**
 * `Spread` arranges its children along `dir` with spacing and aligns them on the
 * cross axis. It **elaborates to `layer + distribute + align`**: #547 proved the
 * space fold, budget, and auto-fit are identical to the bespoke spread, #549 made
 * the scale handling match (fresh child array, no parent mutation), and the
 * layer honors `sharedScale` as a scale scope (layer.tsx). `stack` is
 * `spread({ glue: true })`; `spreadX`/`spreadY` fix `dir`. The IR keeps `spread`/
 * `stack` (the v3 wrapper's `serialize` tag), so this elaboration is below the IR.
 *
 * `size` (per-entry stack-axis extent, #700 Phase 2) wraps each child in its
 * own sized layer BEFORE the align/distribute elaboration below: `layer({ [w|h]:
 * size[i] }, [child])` on the stack axis. A prop-less child (e.g. a rect with
 * only `fill`) fills its wrapper's proposed size, so the usual mark stays
 * unchanged — only the wrapping is new. This replaces the old `normalize`
 * layout flag: `size: field(<name>).normalize()` computes each entry's SHARE
 * of the window (see fieldExpr.ts's `applyEntryNormalize`) as a data-driven
 * SIZE claim on the wrapper, which layer.tsx's data-valued-size branch turns
 * into a local self-scaling region for that child's subtree — the same
 * space-filling-spine effect `normalize: true` used to special-case, but now
 * just the general "data-valued size ⇒ self-scaling region" rule.
 */
export const Spread = createNodeOperator(
  async (
    {
      key,
      dir,
      spacing = 8,
      alignment = "baseline",
      sharedScale = false,
      mode = "edge",
      reverse = false,
      glue = false,
      size,
      axes,
      axisMeasures,
      ...fancyDims
    }: {
      key?: string;
      dir: FancyDirection;
      spacing?: number;
      alignment?: Alignment;
      sharedScale?: boolean;
      mode?: "edge" | "center";
      reverse?: boolean;
      // When true, treat as a stack: glue children together, summing their
      // sizes into a POSITION at this level. `spacing` is ignored.
      glue?: boolean;
      /** Per-entry stack-axis extent — one value per child, in child order.
       *  Wraps each child in a sized layer on the stack axis before the
       *  align/distribute elaboration. See the doc comment above. */
      size?: MaybeValue<number>[];
      /** Override axis rendering for this node. true/false applies to both
       * dims; object form controls x/y independently. */
      axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
      /** Resolved grouping field per axis, injected by createOperator (the `by`
       *  field, e.g. `{ x: "lake" }`). Stamped onto the ORDINAL space the stack
       *  distribute builds so a category axis names itself off its own space. */
      axisMeasures?: { x?: string; y?: string };
    } & FancyDims<MaybeValue<number>>,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    if ((fancyDims as any).normalize !== undefined) {
      throw new Error(
        "spread/stack: `normalize: true` was removed — use " +
          "`size: field(<field-name>).normalize()` instead (#700 Phase 2)."
      );
    }

    children = unwrapLodashArray(children);

    const stackDir = elaborateDirection(dir);
    const alignDir = (1 - stackDir) as Direction;
    const alignAxis = alignDir === 0 ? "x" : "y";
    const stackAxis = stackDir === 0 ? "x" : "y";

    // Give each child a unique constraint name so the align/distribute can
    // reference it (shared with scatter — see `ensureChildNames`).
    let childList = children as GoFishAST[];

    if (size !== undefined) {
      if (size.length !== childList.length) {
        throw new Error(
          `spread/stack: \`size\` has ${size.length} entries but there are ` +
            `${childList.length} children — one size value is required per child.`
        );
      }
      const sizeKey = stackAxis === "x" ? "w" : "h";
      childList = await Promise.all(
        childList.map(async (child, i) => {
          const wrapped = (await layer({ [sizeKey]: size[i] } as any, [
            child,
          ])) as GoFishNode;
          // Copy split identity onto the wrapper so downstream ordinal-axis
          // labeling / resolve()-by-key see the same key/datum the unwrapped
          // child would have — the wrapper is purely a sizing shim.
          if (child instanceof GoFishNode) {
            wrapped.setKey(child.key ?? "");
            wrapped._syntheticKey = child._syntheticKey;
            (wrapped as any).__splitBy = (child as any).__splitBy;
            wrapped.datum = child.datum;
          }
          return wrapped;
        })
      );
    }

    const names = ensureChildNames(childList, "spread");

    // Elaborate to a layer carrying the cross-axis align + the stack distribute.
    // `fancyDims` (explicit w/h) flow to the layer, whose self-scaling region
    // handles an explicit size exactly as the bespoke spread did.
    const node = (await layer(
      {
        key,
        ...fancyDims,
      } as any,
      childList
    )) as GoFishNode;
    node.constrain((ref) => {
      const refs = names.map((n) => ref[n] ?? { name: n });
      // The cross-axis align: it shares the frame (unions the children's domain)
      // and, for free children (bars), commits a baseline. A self-positioned
      // child (a scatter facet) is left alone by `align` automatically — the
      // placement solver reads the child's abstract placement, so no guard flag.
      return [
        Constraint.align({ [alignAxis]: alignment }, refs),
        Constraint.distribute(
          {
            dir: stackAxis,
            spacing: glue ? 0 : spacing,
            mode,
            glue,
            order: reverse ? "reverse" : "forward",
            // The grouping field for this (stack) axis → the ORDINAL space's
            // measure, so a spread-by-category axis titles itself off its space.
            measure: axisMeasures?.[stackAxis],
          },
          refs
        ),
      ];
    });

    // `sharedScale` is a scale-scope annotation (claim hoisting, #549): the node
    // solves σ locally and shares it with descendants. The layer honors this in
    // `layout` (it self-solves per axis when `shared`, into a fresh array).
    node.shared = [sharedScale, sharedScale];
    // Tag with stack direction so coord can map axis overrides to polar dims.
    node.axisDir = stackDir;
    if (axes !== undefined) {
      const toShow = (opt: AxisOptions | undefined): boolean | undefined =>
        opt === undefined ? undefined : opt === false ? false : true;
      node._axisOverride =
        typeof axes === "boolean"
          ? { x: axes, y: axes }
          : { x: toShow(axes.x), y: toShow(axes.y) };
    }
    return node;
  }
);

export type SpreadOptions<T = any> = {
  by?: SplitBy;
  dir: "x" | "y";
  spacing?: number;
  alignment?: "start" | "middle" | "end" | "baseline";
  sharedScale?: boolean;
  mode?: "edge" | "center";
  reverse?: boolean;
  glue?: boolean;
  w?: number | (keyof T & string);
  h?: number | (keyof T & string);
  /** The size of each CHILD along `dir` (a distributive singular, like a
   *  mark's `fill` or `cut`'s `size` — one extent per split entry, NOT this
   *  operator's own box, which is `w`/`h`): a field name, a field expression,
   *  or an explicit per-entry array. The summed measure lives on the operator
   *  so the mark carries only non-positional channels. The space-filling spine
   *  (the mosaic/marimekko conditional axis) is `size: field(<name>).normalize()`
   *  — each entry's SHARE of the window (Σ over this operator's own split
   *  entries) becomes a data-driven size claim, which makes that entry's
   *  subtree a local self-scaling region so its segments fill the extent in
   *  proportion to their share (see the `Spread` doc comment above). */
  size?: (keyof T & string) | FieldExpr | MaybeValue<number>[];
  debug?: boolean;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
};

export const spread = createOperator<any, SpreadOptions>(Spread as any, {
  // With `by`: groupBy on the field. Without `by`: identity split — one leaf
  // per row (the waffle grid relies on this to spread chunked sub-arrays).
  // Expand-kind marks (e.g. `cut`) need the whole array in one leaf instead;
  // that override lives in createOperator (it dispatches on the mark's kind),
  // not here, so this split stays kind-agnostic.
  split: ({ by }, d) =>
    by ? splitEntries(by, d) : new Map(d.map((r, i) => [i, r])),
  channels: { w: "size", h: "size", size: { type: "size", entry: true } },
  axisFields: ({ by, dir }) => {
    const name =
      typeof by === "string" ? by : isField(by) ? by.name : undefined;
    return name === undefined
      ? undefined
      : dir === "x"
        ? { x: name }
        : { y: name };
  },
  serialize: { type: "spread" },
});

/** Stack glues children together, summing sizes into a POSITION at the spread
 * level. Neither `spacing` nor `glue` is configurable — stacked children always
 * touch (use `spread({ spacing: N })` instead if you want gaps). */
export type StackOptions<T = any> = Omit<SpreadOptions<T>, "spacing" | "glue">;

export function stack(
  opts: StackOptions,
  marks: Mark<any>[]
): ReturnType<typeof spread>;
export function stack(opts: StackOptions): Operator<any[], any[]>;
export function stack(
  opts: StackOptions,
  marks?: Mark<any>[]
): ReturnType<typeof spread> | Operator<any[], any[]> {
  const stackOpts: SpreadOptions = { ...opts, glue: true };
  const result =
    marks !== undefined ? spread(stackOpts, marks) : spread(stackOpts);
  // Stack is `spread({glue: true})` under the hood, but the IR wire format
  // discriminates them by type. Re-tag the produced operator/mark so the
  // frontend-IR emitter sees `{ type: "stack", ...stripped-opts }` instead
  // of `{ type: "spread", glue: true, ... }`. Preserve `__combinator` and
  // `children` when present (combinator form) — dropping them would make
  // toJSON emit a leaf-shaped node missing its children.
  const tag = (result as any).__serialize;
  if (tag) {
    const { glue: _glue, ...stackPayload } = tag.opts;
    (result as any).__serialize = {
      ...tag,
      type: "stack",
      opts: stackPayload,
    };
  }
  return result;
}
