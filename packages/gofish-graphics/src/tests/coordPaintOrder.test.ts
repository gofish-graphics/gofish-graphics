/**
 * zOrder inside a coord boundary (#676). This file also pins #982's rules: a
 * z constraint lifts to the children that hold its operands, and is pushed
 * down when they share a child.
 *
 * `coord` is a bake boundary: it flattens its subtree into screen-space draw
 * entries via `flattenLayout` (the coord-local bake) and warps them. These
 * tests assert the DISPLAY-LIST ORDER out of `flattenLayout` honors z-order
 * exactly as the root bake does: a later-in-array `.zOrder(-1)` / `zAbove`
 * child is emitted BEFORE its siblings (painted behind), while a plain layer
 * preserves array order.
 *
 * Run via `tsx`.
 */
import { coord } from "../ast/coordinateTransforms/coord";
import { polar } from "../ast/coordinateTransforms/polar";
import { flattenLayout } from "../ast/coordinateTransforms/bake";
import { Rect } from "../ast/shapes/rect";
import { layer as Layer } from "../ast/graphicalOperators/layer";
import { Constraint } from "../ast/constraints";
import { enclose } from "../ast/graphicalOperators/enclose";
import { intersect } from "../ast/graphicalOperators/porterDuff";
import { toDisplayList } from "../ast/displayList/toDisplayList";
import { fresh } from "./testHelpers";

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
  await root.resolveAliases();
  fresh(() => {
    root.resolveUnderlyingSpace();
    root.resolveEmbedding();
  });
  root.layout([400, 400], [undefined, undefined]);
  // `layer([...])` is a spec that coord materializes into a real node; flatten
  // the materialized child (leaf marks keep their identity), mirroring how
  // coord itself calls `flattenLayout` on each of its children.
  return flattenLayout(root.children[0]).map((d: any) => d.node);
}

// Assert `node` paints the marks of `m` in the order `expected`: their keys
// (or else their `.name`), joined by commas.
async function expectOrder(
  title: string,
  node: any,
  m: Record<string, unknown>,
  expected: string
): Promise<void> {
  const got = (await paintOrder(node))
    .map((n) => Object.keys(m).find((k) => m[k] === n) ?? n._name ?? "?")
    .join(",");
  ok(title, got === expected, `order = [${got}]`);
}

// Assert painting `node` throws an error whose message has every substring.
async function expectThrows(
  title: string,
  node: any,
  ...substrings: string[]
): Promise<void> {
  let message = "";
  try {
    await paintOrder(node);
  } catch (e) {
    message = (e as Error).message;
  }
  ok(
    title,
    message !== "" && substrings.every((s) => message.includes(s)),
    `message = ${JSON.stringify(message)}`
  );
}

// Render `node` to a display list and return the marks of `m`, by key, in the
// order their items appear. This runs the full lowering, so it reaches the
// bake boundaries (coord, enclose, the compositors) that `flattenLayout` alone
// treats as a single entry.
async function lowerOrder(node: any, m: Record<string, any>): Promise<string> {
  const { items } = await toDisplayList(node, { w: 400, h: 400 });
  const byUid = new Map(Object.entries(m).map(([k, n]) => [n.uid, k]));
  const order: string[] = [];
  const visit = (item: any): void => {
    const k = byUid.get(item.id);
    if (k !== undefined && !order.includes(k)) order.push(k);
    for (const c of item.children ?? []) visit(c);
  };
  items.forEach(visit);
  return order.join(",");
}

async function expectLowerOrder(
  title: string,
  node: any,
  m: Record<string, any>,
  expected: string
): Promise<void> {
  let got: string;
  try {
    got = await lowerOrder(node, m);
  } catch (e) {
    got = `threw ${(e as Error).message}`;
  }
  ok(title, got === expected, `order = [${got}]`);
}

async function expectLowerThrows(
  title: string,
  node: any,
  ...substrings: string[]
): Promise<void> {
  let message = "";
  try {
    await toDisplayList(node, { w: 400, h: 400 });
  } catch (e) {
    message = (e as Error).message;
  }
  ok(
    title,
    message !== "" && substrings.every((s) => message.includes(s)),
    `message = ${JSON.stringify(message)}`
  );
}

const rect = () => Rect({ w: 40, h: 40, emX: true, emY: true });

console.log("# coord paint order: .zOrder(-1) is honored inside coord (#676)");
{
  // B is later in the array, but `.zOrder(-1)` paints it first (behind A).
  const A = rect();
  const B = rect().zOrder(-1);
  await expectOrder(
    "later child with .zOrder(-1) is emitted before its earlier sibling",
    Layer([A, B]),
    { A, B },
    "B,A"
  );
}

console.log("# coord paint order: plain layer preserves array order (mirror)");
{
  const A = rect();
  const B = rect();
  await expectOrder(
    "without zOrder, array order is preserved",
    Layer([A, B]),
    { A, B },
    "A,B"
  );
}

console.log(
  "# coord paint order: zAbove/zBelow constraints are honored inside coord"
);
{
  // zAbove(A, B): A paints later (over B) despite array order.
  const A = rect().name("a");
  const B = rect().name("b");
  await expectOrder(
    "zAbove(A, B) puts A after B in the flattened output despite array order",
    Layer([A, B]).relate((c: any) => [Constraint.zAbove(c.a, c.b)]),
    { A, B },
    "B,A"
  );
}

console.log("# a constraint that names a plain layer orders that whole layer");
{
  const A = rect().name("a");
  const P1 = rect();
  const P2 = rect();
  await expectOrder(
    "zAbove(A, pair) paints A over both of the pair's marks",
    Layer([A, Layer([P1, P2]).name("pair")]).relate((c: any) => [
      Constraint.zAbove(c.a, c.pair),
    ]),
    { A, P1, P2 },
    "P1,P2,A"
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
  await expectOrder(
    "outer zBelow(G, C) and nested zBelow(L, D) both hold",
    Layer([C, G, nested]).relate((c: any) => [Constraint.zBelow(c.g, c.c)]),
    { C, G, D, L },
    "G,C,L,D"
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
  await expectOrder(
    "nested constraint is scoped to the nested layer's children",
    Layer([X0, Y0, nested]).relate((c: any) => [Constraint.zAbove(c.x, c.y0)]),
    { X0, Y0, X1, Y1 },
    "Y0,X0,Y1,X1"
  );
}

console.log("# a nested .zOrder(n) compares only among its siblings (#979)");
{
  // C paints behind B, its only sibling, and the nested layer paints last.
  const A = rect().name("a");
  const E = rect().name("e");
  const B = rect();
  const C = rect().zOrder(-1);
  await expectOrder(
    "zOrder(-1) inside the nested layer stays inside it",
    Layer([A, E, Layer([B, C])]).relate((c: any) => [
      Constraint.zBelow(c.e, c.a),
    ]),
    { A, E, B, C },
    "E,A,C,B"
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
  await expectOrder(
    "the constraint lifts to the children that contain its operands",
    Layer([Layer([P1, P2]), Layer([Q1, Q2])]).relate((c: any) => [
      Constraint.zAbove(c.p1, c.q1),
    ]),
    { P1, P2, Q1, Q2 },
    "Q1,Q2,P1,P2"
  );
}

console.log("# a constraint between descendants of one child is pushed down");
{
  // p1 and p2 lie in the same child, so zAbove(p1, p2), declared at the outer
  // layer, orders them inside that child. The child keeps its place before Q.
  const P1 = rect().name("p1");
  const P2 = rect().name("p2");
  const Q = rect();
  await expectOrder(
    "the constraint orders the shared child's own children",
    Layer([Layer([P1, P2]), Q]).relate((c: any) => [
      Constraint.zAbove(c.p1, c.p2),
    ]),
    { P1, P2, Q },
    "P2,P1,Q"
  );
}

console.log("# names inside any non-component node are visible");
{
  // p1 lies inside a box layer, not a plain layer. Names are visible through
  // it, so zAbove(p1, q) paints the whole box over Q. (A box flattens as one
  // entry, so the order shows the box itself, by its name.)
  const P1 = rect().name("p1");
  const Q = rect().name("q");
  await expectOrder(
    "a z constraint reaches an operand inside a box layer",
    Layer([Layer({ box: true }, [P1, rect()]).name("box"), Q]).relate(
      (c: any) => [Constraint.zAbove(c.p1, c.q)]
    ),
    { Q },
    "Q,box"
  );
}

console.log("# interleaving one child between parts of another is a cycle");
{
  // A < X < B with A and B in one child and X in another: the outer layer
  // paints each child whole, so the two constraints form a cycle.
  const A = rect().name("a");
  const B = rect().name("b");
  const X = rect().name("x");
  await expectThrows(
    "throws a cycle error naming both constraints",
    Layer([Layer([A, B]), X]).relate((c: any) => [
      Constraint.zBelow(c.a, c.x),
      Constraint.zBelow(c.x, c.b),
    ]),
    "cycle",
    "zBelow(a, x)",
    "zBelow(x, b)"
  );
}

console.log("# a constraint pushed down into a coord orders the coord's children");
{
  // a and b both lie in the coord, so zAbove(a, b), declared at the outer
  // layer, parts at the coord. The coord paints its own children, so it must
  // paint them in that order.
  const A = rect().name("a");
  const B = rect().name("b");
  await expectLowerOrder(
    "zAbove(a, b) holds inside a coord child",
    Layer([coord({ transform: polar() }, [A, B])]).relate((c: any) => [
      Constraint.zAbove(c.a, c.b),
    ]),
    { A, B },
    "B,A"
  );
}

console.log("# a constraint pushed down into an enclose orders its children");
{
  const A = Rect({ x: 0, y: 0, w: 40, h: 40 }).name("a");
  const B = Rect({ x: 20, y: 20, w: 40, h: 40 }).name("b");
  await expectLowerOrder(
    "zAbove(a, b) holds inside an enclose child",
    Layer([enclose({}, [A, B])]).relate((c: any) => [
      Constraint.zAbove(c.a, c.b),
    ]),
    { A, B },
    "B,A"
  );
}

console.log("# a bake boundary resolves its own z constraints");
{
  // Only a layer can declare constraints (`.relate()` is a layer method), and
  // a box layer is a bake boundary: it lowers its own children, so it must
  // resolve its own zAbove(a, b) when it orders them.
  const A = Rect({ x: 0, y: 0, w: 40, h: 40 }).name("a");
  const B = Rect({ x: 20, y: 20, w: 40, h: 40 }).name("b");
  await expectLowerOrder(
    "a box layer's own zAbove(a, b) orders its children",
    Layer([
      Layer({ box: true }, [A, B]).relate((c: any) => [
        Constraint.zAbove(c.a, c.b),
      ]),
    ]),
    { A, B },
    "B,A"
  );
}

console.log("# a z constraint between a compositor's operands is an error");
{
  // intersect paints one result from its source and destination children, so
  // there is no paint order between them to change.
  const A = Rect({ x: 0, y: 0, w: 40, h: 40 }).name("a");
  const B = Rect({ x: 20, y: 20, w: 40, h: 40 }).name("b");
  await expectLowerThrows(
    "zAbove(a, b) across intersect's operands throws",
    Layer([intersect([A, B])]).relate((c: any) => [
      Constraint.zAbove(c.a, c.b),
    ]),
    "zAbove(a, b)",
    "composites"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
declare const process: { exit(code: number): never };
if (failed > 0) process.exit(1);
