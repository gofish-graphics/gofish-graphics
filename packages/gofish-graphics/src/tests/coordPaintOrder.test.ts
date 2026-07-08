/**
 * zOrder inside a coord boundary (#676).
 *
 * `coord` is a bake boundary: it flattens its subtree into screen-space draw
 * entries via `flattenLayout` (the coord-local bake) and warps them. That
 * flatten used to walk `children` in raw ARRAY order, so `.zOrder(-1)` and
 * `zAbove`/`zBelow` constraints were silently dropped inside a coordinate
 * transform — e.g. gotree links (`.zOrder(-1)`, links-under-nodes) painted on
 * top under `coord: polar()`.
 *
 * These tests assert the DISPLAY-LIST ORDER out of `flattenLayout` now honors
 * z-order exactly as the root bake does: a later-in-array `.zOrder(-1)` /
 * `zAbove` child is emitted BEFORE its siblings (painted behind), while a plain
 * layer preserves array order.
 *
 * Run via `tsx`.
 */
import { coord } from "../ast/coordinateTransforms/coord";
import { polar } from "../ast/coordinateTransforms/polar";
import { flattenLayout } from "../ast/coordinateTransforms/bake";
import { Rect } from "../ast/shapes/rect";
import { layer as Layer } from "../ast/graphicalOperators/layer";
import { Constraint } from "../ast/constraints";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Lay a coord(polar) subtree out (same passes as coordConfluence) and return
// the ordered `.node`s that `flattenLayout` emits for the given layer.
async function paintOrder(layerNode: any): Promise<any[]> {
  const root: any = await coord({ transform: polar() }, [layerNode]);
  root.resolveAliases();
  root.resolveUnderlyingSpace();
  root.resolveEmbedding();
  root.layout([400, 400], [undefined, undefined]);
  // `layer([...])` is a spec that coord materializes into a real node; flatten
  // the materialized child (leaf marks keep their identity), mirroring how
  // coord itself calls `flattenLayout` on each of its children.
  return flattenLayout(root.children[0]).map((d: any) => d.node);
}

const rect = () => Rect({ w: 40, h: 40, emX: true, emY: true });

console.log("# coord paint order: .zOrder(-1) is honored inside coord (#676)");
{
  // A comes first in the array; B is later but `.zOrder(-1)` → must paint FIRST
  // (behind A) in the flattened output.
  const A = rect();
  const B = rect().zOrder(-1);
  const order = await paintOrder(Layer([A, B]));
  ok(
    "later child with .zOrder(-1) is emitted before its earlier sibling",
    order.length === 2 && order[0] === B && order[1] === A,
    `order = [${order.map((n) => (n === A ? "A" : n === B ? "B" : "?")).join(", ")}]`
  );
}

console.log("# coord paint order: plain layer preserves array order (mirror)");
{
  const A = rect();
  const B = rect();
  const order = await paintOrder(Layer([A, B]));
  ok(
    "without zOrder, array order is preserved",
    order.length === 2 && order[0] === A && order[1] === B,
    `order = [${order.map((n) => (n === A ? "A" : n === B ? "B" : "?")).join(", ")}]`
  );
}

console.log("# coord paint order: zAbove/zBelow constraints are honored inside coord");
{
  // A is first in the array, but zAbove(A, B) means A paints LATER (over B) →
  // flattened order must be [B, A].
  const A = rect().name("a");
  const B = rect().name("b");
  const layerNode = Layer([A, B]).constrain((c: any) => [
    Constraint.zAbove(c.a, c.b),
  ]);
  const order = await paintOrder(layerNode);
  ok(
    "zAbove(A, B) puts A after B in the flattened output despite array order",
    order.length === 2 && order[0] === B && order[1] === A,
    `order = [${order.map((n) => (n === A ? "A" : n === B ? "B" : "?")).join(", ")}]`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
declare const process: { exit(code: number): never };
if (failed > 0) process.exit(1);
