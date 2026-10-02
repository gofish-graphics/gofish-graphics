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

// The names of `order`'s nodes, per `m`, joined by commas.
const labels = (order: any[], m: Record<string, unknown>) =>
  order.map((n) => Object.keys(m).find((k) => m[k] === n) ?? "?").join(",");

// Lay a coord(polar) subtree out (same passes as coordConfluence) and return
// the ordered `.node`s that `flattenLayout` emits for the given layer.
async function paintOrder(layerNode: any): Promise<any[]> {
  const root: any = await coord({ transform: polar() }, [layerNode]);
  await root.resolveAliases();
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
    `order = [${labels(order, { A, B })}]`
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
    `order = [${labels(order, { A, B })}]`
  );
}

console.log(
  "# coord paint order: zAbove/zBelow constraints are honored inside coord"
);
{
  // A is first in the array, but zAbove(A, B) means A paints LATER (over B) →
  // flattened order must be [B, A].
  const A = rect().name("a");
  const B = rect().name("b");
  const layerNode = Layer([A, B]).relate((c: any) => [
    Constraint.zAbove(c.a, c.b),
  ]);
  const order = await paintOrder(layerNode);
  ok(
    "zAbove(A, B) puts A after B in the flattened output despite array order",
    order.length === 2 && order[0] === B && order[1] === A,
    `order = [${labels(order, { A, B })}]`
  );
}

console.log("# a constraint that names a plain layer orders that whole layer");
{
  // zAbove(A, pair) must put A after both of the pair's marks.
  const A = rect().name("a");
  const P1 = rect();
  const P2 = rect();
  const layerNode = Layer([A, Layer([P1, P2]).name("pair")]).relate(
    (c: any) => [Constraint.zAbove(c.a, c.pair)]
  );
  const order = await paintOrder(layerNode);
  ok(
    "zAbove(A, pair) paints A over both of the pair's marks",
    order.length === 3 && order[0] === P1 && order[1] === P2 && order[2] === A,
    `order = [${labels(order, { A, P1, P2 })}]`
  );
}

console.log("# a nested layer keeps its own z constraints");
{
  // The shape of a chart that `.layer()`s a relational line (G, under C) and
  // then a nested chart of dots with its own `.layer(line)` (L, under D). The
  // outer constraint orders the outer children; the nested layer's
  // zBelow(L, D) orders the nested children.
  const C = rect().name("c");
  const G = rect().name("g");
  const D = rect().name("d");
  const L = rect().name("l");
  const nested = Layer([D, L]).relate((c: any) => [
    Constraint.zBelow(c.l, c.d),
  ]);
  const layerNode = Layer([C, G, nested]).relate((c: any) => [
    Constraint.zBelow(c.g, c.c),
  ]);
  const order = await paintOrder(layerNode);
  ok(
    "outer zBelow(G, C) and nested zBelow(L, D) both hold",
    labels(order, { C, G, D, L }) === "G,C,L,D",
    `order = [${labels(order, { C, G, D, L })}]`
  );
}

console.log("# a nested layer's z constraint only names its own descendants");
{
  // Both layers have a unit named "x". The nested zAbove(x, y) must order the
  // nested x over the nested y, and leave the outer x where it was.
  const X0 = rect().name("x");
  const Y0 = rect().name("y0");
  const X1 = rect().name("x");
  const Y1 = rect().name("y");
  const nested = Layer([X1, Y1]).relate((c: any) => [
    Constraint.zAbove(c.x, c.y),
  ]);
  const layerNode = Layer([X0, Y0, nested]).relate((c: any) => [
    Constraint.zAbove(c.x, c.y0),
  ]);
  const order = await paintOrder(layerNode);
  ok(
    "nested constraint is scoped to the nested layer's children",
    labels(order, { X0, Y0, X1, Y1 }) === "Y0,X0,Y1,X1",
    `order = [${labels(order, { X0, Y0, X1, Y1 })}]`
  );
}

console.log("# a nested .zOrder(n) compares only among its siblings (#979)");
{
  // The outer constraint used to flatten the nested layer into the outer
  // sort, so C's zOrder(-1) moved it behind A and E. It stays local now: C
  // paints behind B, its only sibling, and the nested layer paints last.
  const A = rect().name("a");
  const E = rect().name("e");
  const B = rect();
  const C = rect().zOrder(-1);
  const layerNode = Layer([A, E, Layer([B, C])]).relate((c: any) => [
    Constraint.zBelow(c.e, c.a),
  ]);
  const order = await paintOrder(layerNode);
  ok(
    "zOrder(-1) inside the nested layer stays inside it",
    labels(order, { A, E, B, C }) === "E,A,C,B",
    `order = [${labels(order, { A, E, B, C })}]`
  );
}

console.log("# a constraint between descendants of two children orders them");
{
  // p1 and q1 lie in different children, so zAbove(p1, q1) orders those two
  // children as wholes: the q layer paints before the p layer.
  const P1 = rect().name("p1");
  const P2 = rect();
  const Q1 = rect().name("q1");
  const Q2 = rect();
  const layerNode = Layer([Layer([P1, P2]), Layer([Q1, Q2])]).relate(
    (c: any) => [Constraint.zAbove(c.p1, c.q1)]
  );
  const order = await paintOrder(layerNode);
  ok(
    "the constraint lifts to the children that contain its operands",
    labels(order, { P1, P2, Q1, Q2 }) === "Q1,Q2,P1,P2",
    `order = [${labels(order, { P1, P2, Q1, Q2 })}]`
  );
}

console.log("# a constraint between descendants of one child is pushed down");
{
  // p1 and p2 lie in the same child, so zAbove(p1, p2), declared at the outer
  // layer, orders them inside that child. The child keeps its place before Q.
  const P1 = rect().name("p1");
  const P2 = rect().name("p2");
  const Q = rect();
  const layerNode = Layer([Layer([P1, P2]), Q]).relate((c: any) => [
    Constraint.zAbove(c.p1, c.p2),
  ]);
  const order = await paintOrder(layerNode);
  ok(
    "the constraint orders the shared child's own children",
    labels(order, { P1, P2, Q }) === "P2,P1,Q",
    `order = [${labels(order, { P1, P2, Q })}]`
  );
}

console.log("# interleaving one child between parts of another is a cycle");
{
  // A < X < B with A and B in one child and X in another: the outer layer
  // paints each child whole, so the two constraints form a cycle.
  const A = rect().name("a");
  const B = rect().name("b");
  const X = rect().name("x");
  const layerNode = Layer([Layer([A, B]), X]).relate((c: any) => [
    Constraint.zBelow(c.a, c.x),
    Constraint.zBelow(c.x, c.b),
  ]);
  let message = "";
  try {
    await paintOrder(layerNode);
  } catch (e) {
    message = (e as Error).message;
  }
  ok(
    "throws a cycle error naming both constraints",
    message.includes("cycle") &&
      message.includes("zBelow(a, x)") &&
      message.includes("zBelow(x, b)"),
    `message = ${JSON.stringify(message)}`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
declare const process: { exit(code: number): never };
if (failed > 0) process.exit(1);
