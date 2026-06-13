import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import type { AxisOptions } from "../gofish";
import { MaybeValue } from "../data";
import {
  Direction,
  elaborateDirection,
  FancyDims,
  FancyDirection,
} from "../dims";
import { Collection } from "lodash";
import { SplitBy, splitKeyFn } from "../datumProjection";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { Alignment } from "./alignment";
import { layer } from "./layer";
import { Constraint } from "../constraints";
import { childNameKey } from "../constraints/shared";
import { createOperator } from "../marks/createOperator";
import { Mark, Operator } from "../types";

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
 */
export const Spread = createNodeOperator(
  async (
    {
      name,
      key,
      dir,
      spacing = 8,
      alignment = "baseline",
      sharedScale = false,
      mode = "edge",
      reverse = false,
      glue = false,
      axes,
      ...fancyDims
    }: {
      name?: string;
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
      /** Override axis rendering for this node. true/false applies to both
       * dims; object form controls x/y independently. */
      axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
    } & FancyDims<MaybeValue<number>>,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    children = unwrapLodashArray(children);

    const stackDir = elaborateDirection(dir);
    const alignDir = (1 - stackDir) as Direction;
    const alignAxis = alignDir === 0 ? "x" : "y";
    const stackAxis = stackDir === 0 ? "x" : "y";

    // Each child needs a name so the constraints can reference it; reuse its
    // existing constraint name/key, else synthesize one. A child may be a
    // `ref` (e.g. an axis label's `ref(bar)`), which is a GoFishRef proxy, not
    // a GoFishNode — it carries `_name` too, so it must also be named or the
    // layer's `nameToPlaceable` won't have an entry for it and the constraint
    // silently drops it (the ref then never participates in align/distribute).
    const childList = children as GoFishAST[];
    // Track names already claimed so a collision is disambiguated rather than
    // collapsing two children onto one slot. The bespoke spread placed children
    // POSITIONALLY, so same-named children were harmless; the layer addresses
    // them through `nameToPlaceable`, which keys by name — duplicates there map
    // every constraint ref to a single placeable (e.g. cut returns N slices that
    // all carry the source mark's name, so the distribute would place one slice
    // and no-op the rest, collapsing them onto each other).
    const used = new Set<string>();
    const names = childList.map((c, i) => {
      const existing = childNameKey(c);
      // `||` (not `??`): an EMPTY-string name is as useless as a missing one and
      // must be synthesized. An empty `childName` is falsy, so the layer's
      // phase-1 guard `!childName` would baseline-place it even though it's a
      // constraint target — then a `middle` align centers siblings on its
      // (origin) center instead of the box center (the icicle/nested-waffle
      // regression). A real Token name (`createName`) is a non-empty string, so
      // `||` still preserves it.
      let nm =
        existing || (c instanceof GoFishNode && c.key) || `__spread_${i}`;
      if (used.has(nm)) nm = `${nm}__spread_${i}`;
      used.add(nm);
      // Write the name back ONLY when we assigned or disambiguated it, so the
      // layer's `nameToPlaceable` keys match the constraint refs. A `ref` (e.g.
      // an axis label's `ref(bar)`) is a GoFishRef proxy, not a GoFishNode, but
      // carries `_name` too — name it as well or the constraint drops it. Leave
      // an UNCHANGED existing name untouched: it may be a Token (created via
      // `createName`), and overwriting it with a plain string would break
      // token-based `ref`/`selectAll` resolution.
      if (
        nm !== existing &&
        (c instanceof GoFishNode || c instanceof GoFishRef)
      )
        c._name = nm;
      return nm;
    });

    // Elaborate to a layer carrying the cross-axis align + the stack distribute.
    // `fancyDims` (explicit w/h) flow to the layer, whose self-scaling region
    // handles an explicit size exactly as the bespoke spread did.
    const node = (await layer(
      { key, ...fancyDims } as any,
      childList
    )) as GoFishNode;
    node.constrain((ref) => {
      const refs = names.map((n) => ref[n] ?? { name: n });
      // Carry the bespoke spread's data-positioned alignment guard: on a
      // posScale cross axis whose children already hold their own data
      // positions (not SIZE-derived), a non-`middle` align is a no-op. The
      // layer fills in `fromSize` (from pre-fold child spaces) at resolve time.
      const alignC = Constraint.align({ [alignAxis]: alignment }, refs);
      alignC.guardDataPositioned = true;
      return [
        alignC,
        Constraint.distribute(
          {
            dir: stackAxis,
            spacing: glue ? 0 : spacing,
            mode,
            glue,
            order: reverse ? "reverse" : "forward",
          },
          refs
        ),
      ];
    });

    if (name !== undefined) node._name = name;
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
  debug?: boolean;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
};

export const spread = createOperator<any, SpreadOptions>(Spread, {
  // With `by`: groupBy on the field. Without `by`: identity split — one leaf
  // per row (the waffle grid relies on this to spread chunked sub-arrays).
  // Expand-kind marks (e.g. `cut`) need the whole array in one leaf instead;
  // that override lives in createOperator (it dispatches on the mark's kind),
  // not here, so this split stays kind-agnostic.
  split: ({ by }, d) =>
    by ? Map.groupBy(d, splitKeyFn(by)) : new Map(d.map((r, i) => [i, r])),
  channels: { w: "size", h: "size" },
  axisFields: ({ by, dir }) =>
    typeof by === "string" ? (dir === "x" ? { x: by } : { y: by }) : undefined,
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
