/**
 * Shape geometry (`GoFishNode.geometry()`) and the `pack` operator that reads
 * it. Checks the `enclosingCircle` box fallback, the ellipse and polygon
 * overrides, that the default circle of a node with children agrees with the
 * circle `pack` reports for itself, and that packed children neither overlap
 * nor leave the pack's circle. Run via `tsx`.
 */
import { Rect } from "../ast/shapes/rect";
import { Ellipse } from "../ast/shapes/ellipse";
import { Polygon } from "../ast/shapes/polygon";
import { Pack } from "../ast/graphicalOperators/pack";
import { defaultGeometry, GoFishNode } from "../ast/_node";
import { enclosingCircle, translateCircle, type Circle } from "../ast/geometry";

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

const EPS = 1e-6;
const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;
const sameCircle = (a: Circle, b: Circle, eps = EPS) =>
  near(a.cx, b.cx, eps) && near(a.cy, b.cy, eps) && near(a.r, b.r, eps);
const show = (c: Circle) =>
  `(${c.cx.toFixed(3)}, ${c.cy.toFixed(3)}, r=${c.r.toFixed(3)})`;

function layOut<T extends GoFishNode>(node: T): T {
  node.resolveUnderlyingSpace();
  node.layout([400, 400], [undefined, undefined]);
  return node;
}

/** A child's enclosing circle in its parent's frame. */
const circleInParent = (child: GoFishNode): Circle =>
  translateCircle(enclosingCircle(child.geometry()), [
    child.projectedTranslate(0)!,
    child.projectedTranslate(1)!,
  ]);

const circle = (r: number) => Ellipse({ w: 2 * r, h: 2 * r });

console.log("# geometry: before layout");
{
  let threw = false;
  try {
    circle(5).geometry();
  } catch {
    threw = true;
  }
  ok("geometry() before layout throws", threw);
}

console.log("# geometry: box fallback");
{
  const r = layOut(Rect({ w: 30, h: 40 }));
  const g = r.geometry();
  ok("rect answers no enclosingCircle of its own", !g.enclosingCircle);
  ok(
    "rect box is its intrinsic box",
    g.box.min[0] === 0 && g.box.min[1] === 0 && g.box.max[0] === 30 &&
      g.box.max[1] === 40
  );
  const c = enclosingCircle(g);
  ok(
    "fallback is the circle through the box corners",
    sameCircle(c, { cx: 15, cy: 20, r: 25 }),
    show(c)
  );
  ok("geometry() is memoized", r.geometry() === g);
  r.layout([400, 400], [undefined, undefined]);
  ok("layout() clears the memo", r.geometry() !== g);
}

console.log("# geometry: ellipse override");
{
  const c = enclosingCircle(layOut(Ellipse({ w: 40, h: 20 })).geometry());
  ok(
    "ellipse's circle is its larger radius, centered",
    sameCircle(c, { cx: 20, cy: 10, r: 20 }),
    show(c)
  );
  const d = enclosingCircle(layOut(circle(7)).geometry());
  ok("a circle encloses itself", sameCircle(d, { cx: 7, cy: 7, r: 7 }), show(d));
}

console.log("# geometry: polygon override");
{
  const tri = layOut(
    Polygon({
      points: [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
    })
  );
  const c = enclosingCircle(tri.geometry());
  ok(
    "right triangle's circle has the hypotenuse as diameter",
    sameCircle(c, { cx: 5, cy: 5, r: Math.SQRT2 * 5 }),
    show(c)
  );
  // An offset ring stays in the local frame the ring is written in.
  const sq = layOut(
    Polygon({
      points: [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
      ],
    })
  );
  const s = enclosingCircle(sq.geometry());
  ok(
    "offset square's circle is centered on it",
    sameCircle(s, { cx: 15, cy: 15, r: Math.SQRT2 * 5 }),
    show(s)
  );
}

const radii = [30, 5, 18, 12, 25, 8, 3, 15, 20, 10];

function checkPacked(label: string, node: GoFishNode): void {
  const own = enclosingCircle(node.geometry());
  const R = own.r;
  const kids = node.children.map((c) => circleInParent(c as GoFishNode));
  let overlap = "";
  for (let i = 0; i < kids.length; i++)
    for (let j = i + 1; j < kids.length; j++) {
      const d = Math.hypot(kids[i].cx - kids[j].cx, kids[i].cy - kids[j].cy);
      if (d < kids[i].r + kids[j].r - EPS)
        overlap ||= `${i}/${j}: ${d} < ${kids[i].r + kids[j].r}`;
    }
  ok(`${label}: no two children overlap`, overlap === "", overlap);
  const outside = kids.findIndex(
    (k) => Math.hypot(k.cx - own.cx, k.cy - own.cy) + k.r > R + EPS
  );
  ok(`${label}: every child is inside the pack's circle`, outside === -1);
  const dims = node.intrinsicDims!;
  ok(
    `${label}: box is [0, 2R] on both axes`,
    dims[0].min === 0 && near(dims[0].size!, 2 * R) && dims[1].min === 0 &&
      near(dims[1].size!, 2 * R)
  );
  ok(
    `${label}: circle is centered in the box`,
    near(own.cx, R) && near(own.cy, R)
  );
  const dflt = enclosingCircle(
    defaultGeometry(
      { intrinsicDims: node.intrinsicDims!, transform: node.transform },
      node.children,
      node
    )
  );
  ok(
    `${label}: the default circle around the children equals pack's own`,
    sameCircle(dflt, own, 1e-6 * Math.max(1, R)),
    `${show(dflt)} vs ${show(own)}`
  );
}

console.log("# pack: mixed circles");
{
  const node = layOut((await Pack({}, radii.map(circle))) as GoFishNode);
  checkPacked("circles", node);
  // Children keep data order: circle i has radius radii[i].
  ok(
    "children keep data order",
    node.children.every((c, i) =>
      near(enclosingCircle((c as GoFishNode).geometry()).r, radii[i])
    )
  );
}

console.log("# pack: mixed shapes");
{
  const node = layOut(
    (await Pack({}, [
      circle(20),
      Ellipse({ w: 50, h: 24 }),
      Polygon({
        points: [
          [0, 0],
          [30, 0],
          [15, 26],
        ],
      }),
      Rect({ w: 20, h: 14 }),
      circle(9),
    ])) as GoFishNode
  );
  checkPacked("shapes", node);
}

console.log("# pack: nested");
{
  const inner = (await Pack({}, [12, 7, 9, 4].map(circle))) as GoFishNode;
  const node = layOut(
    (await Pack({}, [circle(25), inner, circle(10)])) as GoFishNode
  );
  checkPacked("outer", node);
  checkPacked("inner", inner);
}

console.log("# pack: 0 and 1 children");
{
  const empty = layOut((await Pack({}, [])) as GoFishNode);
  ok(
    "empty pack has a zero box",
    empty.intrinsicDims![0].size === 0 && empty.intrinsicDims![1].size === 0
  );
  const one = layOut((await Pack({}, [circle(6)])) as GoFishNode);
  checkPacked("one", one);
  ok("one child: R is its radius", near(one.intrinsicDims![0].size!, 12));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
