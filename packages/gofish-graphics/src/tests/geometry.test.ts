/**
 * Shape geometry (`GoFishNode.geometry()`) and the `pack` operator that reads
 * it. Checks the `enclosingCircle` box fallback, the ellipse and polygon
 * overrides, that the default circle of a node with children agrees with the
 * circle `pack` reports for itself, and that packed children neither overlap
 * nor leave the pack's circle. Run via `tsx`.
 */
import { Rect } from "../ast/shapes/rect";
import * as Pwl from "../ast/solver/pwl";
import { Ellipse } from "../ast/shapes/ellipse";
import { Polygon } from "../ast/shapes/polygon";
import { Pack } from "../ast/graphicalOperators/pack";
import { mask, paint } from "../ast/graphicalOperators/porterDuff";
import { defaultGeometry, GoFishNode } from "../ast/_node";
import {
  enclosingCircle,
  translateCircle,
  boxOutline,
  flattenPath,
  reflectOutlineY,
  translateOutline,
  simplifyRing,
  type Circle,
  type Outline,
} from "../ast/geometry";
import { Text } from "../ast/shapes/text";
import { membersOf } from "../ast/graphicalOperators/enclose/members";
import { chart, line, live, ribbon, scatter, spread, stack, rect } from "../lib";
import { segDist } from "../ast/geometry/plane";

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

/** The largest distance from any point of `pts` to the circle or ellipse
 *  `(x−cx)²/rx² + (y−cy)²/ry² = 1`, measured along the radius. */
const ellipseStray = (
  pts: [number, number][],
  cx: number,
  cy: number,
  r: number
): number =>
  Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r)));

/** The longest gap between consecutive points (closing the ring when
 *  `closed`): a stand-in for "the samples follow the shape". */
const longestStep = (o: Outline): number => {
  let m = 0;
  const n = o.points.length;
  for (let i = 0; i + 1 < (o.closed ? n + 1 : n); i++) {
    const a = o.points[i];
    const b = o.points[(i + 1) % n];
    m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return m;
};

console.log("# outline: box fallback");
{
  const rg = layOut(Rect({ w: 30, h: 40 })).geometry();
  // A geometry with only a box: what a node with no outline of its own reads.
  const g = { box: rg.box };
  const [down] = [boxOutline(g.box, 1)];
  ok(
    "a node with no paint of its own is read as filling its box",
    down.filled && down.width === undefined
  );
  ok(
    "a filled rect's outline is the fallback's",
    JSON.stringify(rg.outline(0.5)) === JSON.stringify([down])
  );
  ok("the fallback is one closed rect", down.closed && down.points.length === 4);
  ok(
    "the fallback gives its box exactly, in the same frame as its points",
    JSON.stringify(down.box) === JSON.stringify(g.box)
  );
  ok(
    "it runs clockwise from the top-left corner",
    JSON.stringify(down.points) === "[[0,0],[30,0],[30,40],[0,40]]",
    JSON.stringify(down.points)
  );
  const part = (o: Outline, name: string) =>
    o.parts!.find((p) => p.name === name)!;
  ok(
    "a y that reads top-down names the top edge y-min",
    part(down, "y-min").from === 0 && part(down, "y-min").to === 30
  );
  ok(
    "the right edge is x-max, the left x-min",
    part(down, "x-max").from === 30 &&
      part(down, "x-max").to === 70 &&
      part(down, "x-min").from === 100 &&
      part(down, "x-min").to === 140
  );
  const [up] = [boxOutline(g.box, -1)];
  ok(
    "a y that grows upward names the top edge y-max",
    part(up, "y-max").from === 0 && part(up, "y-min").from === 70
  );
}

console.log("# outline: ellipse");
{
  const g = layOut(circle(20)).geometry();
  for (const tol of [0.1, 1]) {
    const [o] = (g).outline(tol);
    ok(`circle outline is closed (tolerance ${tol})`, o.closed);
    ok(
      `circle samples lie on the circle (tolerance ${tol})`,
      ellipseStray(o.points, 20, 20, 20) < 1e-9
    );
    // The sagitta of the longest chord is within the tolerance.
    const step = longestStep(o);
    const sagitta = 20 - Math.sqrt(20 * 20 - (step / 2) ** 2);
    ok(
      `circle chords stray at most the tolerance (${tol})`,
      sagitta <= tol + 1e-9,
      `${sagitta}`
    );
  }
  const fine = (g).outline(0.1)[0].points.length;
  const coarse = (g).outline(1)[0].points.length;
  ok("a finer tolerance takes more samples", fine > coarse, `${fine} ${coarse}`);
  const e = (g).outline(0.5)[0].ellipse;
  ok(
    "a circle's outline gives its ellipse exactly",
    e !== undefined && e.cx === 20 && e.cy === 20 && e.rx === 20 && e.ry === 20,
    JSON.stringify(e)
  );
}

console.log("# outline: polygon and text");
{
  const ring: [number, number][] = [
    [0, 0],
    [30, 0],
    [30, 10],
    [10, 10],
    [10, 30],
    [0, 30],
  ];
  const [o] = (layOut(Polygon({ points: ring })).geometry()).outline(0.5);
  ok(
    "polygon outline is its ring, closed",
    o.closed && JSON.stringify(o.points) === JSON.stringify(ring)
  );
  ok("a polygon is filled by default", o.filled && o.width === undefined);

  const [u] = (layOut(
      Polygon({ points: ring, fill: "none", stroke: "black", strokeWidth: 3 })
    ).geometry()).outline(0.5);
  ok(
    "an unfilled polygon's outline is closed, not filled, as wide as its stroke",
    u.closed && !u.filled && u.width === 3,
    JSON.stringify({ closed: u.closed, filled: u.filled, width: u.width })
  );
  const [tr] = (layOut(Polygon({ points: ring, fill: "transparent" })).geometry()).outline(0.5);
  ok("a transparent fill is not filled", tr.closed && !tr.filled);

  const [ro] = (layOut(Rect({ w: 20, h: 10, fill: "none", stroke: "red", strokeWidth: 2 }))
      .geometry()).outline(0.5);
  ok(
    "a rect's box outline carries its paint",
    ro.closed && !ro.filled && ro.width === 2 && ro.box !== undefined
  );

  // enclose reads an unfilled closed outline as its loop: a ring of segments
  // as wide as its stroke, closing back to its start.
  const members = membersOf(
    layOut(
      Polygon({ points: ring, fill: "none", stroke: "black", strokeWidth: 3 })
    )
  );
  ok(
    "enclose reads an unfilled polygon as a ring of segments",
    members.length === ring.length &&
      members.every((m) => m.kind === "segment" && m.w === 3),
    JSON.stringify(members.map((m) => m.kind))
  );
  const filledMembers = membersOf(layOut(Polygon({ points: ring })));
  ok(
    "enclose reads a filled polygon as its box",
    filledMembers.length === 1 && filledMembers[0].kind === "box"
  );

  const t = layOut(Text({ text: "hello", fontSize: 10, rotate: 90 }));
  const tg = t.geometry();
  const [to] = (tg).outline(0.5);
  ok("rotated text outline is a closed quad", to.closed && to.points.length === 4);
  const xs = to.points.map((p) => p[0]);
  const ys = to.points.map((p) => p[1]);
  ok(
    "rotated text outline fills its box",
    near(Math.min(...xs), tg.box.min[0]) &&
      near(Math.max(...xs), tg.box.max[0]) &&
      near(Math.min(...ys), tg.box.min[1]) &&
      near(Math.max(...ys), tg.box.max[1]),
    JSON.stringify({ pts: to.points, box: tg.box })
  );
  const hi = layOut(Text({ text: "hi" })).geometry();
  ok(
    "unrotated text's outline is its box",
    JSON.stringify(hi.outline(0.5)[0].box) === JSON.stringify(hi.box)
  );
}

console.log("# outline: paths");
{
  const pts = flattenPath(
    [
      {
        type: "bezier",
        start: [0, 0],
        control1: [0, 100],
        control2: [100, 100],
        end: [100, 0],
      },
    ],
    0.25
  );
  // The bezier's own points at the sample parameters are exact; check the
  // midpoints of the chords against the curve's points between them.
  const bez = (t: number): [number, number] => {
    const u = 1 - t;
    return [
      3 * u * t * t * 100 + t * t * t * 100,
      3 * u * u * t * 100 + 3 * u * t * t * 100,
    ];
  };
  const n = pts.length - 1;
  let worst = 0;
  for (let k = 0; k < n; k++) {
    const m = bez((k + 0.5) / n);
    const a = pts[k];
    const b = pts[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d =
      Math.abs((b[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (b[1] - a[1])) /
      len;
    worst = Math.max(worst, d);
  }
  ok("a flattened bezier stays within the tolerance", worst <= 0.25, `${worst}`);
  ok(
    "flattening keeps the ends",
    pts[0][0] === 0 && pts[0][1] === 0 && pts[n][0] === 100 && pts[n][1] === 0
  );
  const r = reflectOutlineY({ points: [[1, 2]], closed: false, filled: false });
  ok("reflecting flips y", r.points[0][0] === 1 && r.points[0][1] === -2);
  const ex = reflectOutlineY(
    translateOutline(
      {
        points: [],
        closed: true,
        filled: true,
        ellipse: { cx: 1, cy: 2, rx: 3, ry: 4 },
        box: { min: [0, 1], max: [5, 6] },
      },
      [10, 20]
    )
  );
  ok(
    "moving and reflecting an outline moves its exact forms with it",
    JSON.stringify([ex.ellipse, ex.box]) ===
      JSON.stringify([
        { cx: 11, cy: -22, rx: 3, ry: 4 },
        { min: [10, -26], max: [15, -21] },
      ]),
    JSON.stringify([ex.ellipse, ex.box])
  );
}

/** Every node of a laid-out tree, depth first. */
function* walk(node: GoFishNode): Generator<GoFishNode> {
  yield node;
  for (const c of node.children)
    if (c instanceof GoFishNode) yield* walk(c);
}

console.log("# outline: line and ribbon connectors");
{
  const rows = [
    { x: 0, y: 1, s: "a" },
    { x: 1, y: 3, s: "a" },
    { x: 2, y: 2, s: "a" },
  ];
  const lineChart = (await chart(rows)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(line())
    .resolve()) as GoFishNode;
  await lineChart.toDisplayList({ w: 200, h: 100, axes: false });
  const conn = [...walk(lineChart)].find((n) => n.type === "connect")!;
  const lo = (conn.geometry()).outline(0.5);
  ok("a line's outline is one open path", lo.length === 1 && !lo[0].closed);
  ok("a line's outline samples its curve", lo[0].points.length > 3);
  ok("a line's outline carries its stroke width", lo[0].width === 1, `${lo[0].width}`);
  const g = conn.geometry();
  ok(
    "a line's outline lies in its box",
    lo[0].points.every(
      ([x, y]) =>
        x >= g.box.min[0] - EPS &&
        x <= g.box.max[0] + EPS &&
        y >= g.box.min[1] - EPS &&
        y <= g.box.max[1] + EPS
    ),
    JSON.stringify({ pts: lo[0].points, box: g.box })
  );
  // A larger y is higher on the screen: the middle row (y = 3) is above
  // both ends, which are the first and last rows (y = 1 and y = 2).
  const py = lo[0].points.map((p) => p[1]);
  const top = Math.min(...py);
  ok(
    "the outline is in pixels, y down",
    top < py[0] && top < py[py.length - 1] && py[0] > py[py.length - 1],
    JSON.stringify(py)
  );

  const band = (await chart(rows)
    .flow(spread({ by: "x", dir: "x", spacing: 20 }), stack({ by: "s", dir: "y" }))
    .mark(rect({ h: "y", w: 0 }))
    .layer(ribbon({ by: "s" }))
    .resolve()) as GoFishNode;
  await band.toDisplayList({ w: 200, h: 100, axes: false });
  const rib = [...walk(band)].find((n) => n.type === "connect")!;
  const ro = (rib.geometry()).outline(0.5);
  ok("a ribbon's outline is one closed band", ro.length === 1 && ro[0].closed);
  ok("a ribbon's band has no stroke width", ro[0].width === undefined);

  // The outline's width is the stroke the line draws, with a live width
  // too: the connector is built from its value when the chart resolves,
  // and draws that value until the input changes.
  const liveChart = (await chart(rows)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(line({ strokeWidth: live(() => 4) }))
    .resolve()) as GoFishNode;
  const doc = await liveChart.toDisplayList({ w: 200, h: 100, axes: false });
  const drawn: any[] = [];
  const collect = (n: any): void => {
    if (Array.isArray(n)) return n.forEach(collect);
    if (n === null || typeof n !== "object") return;
    if (n.kind === "path") drawn.push(n);
    collect(n.items ?? []);
    collect(n.children ?? []);
  };
  collect(doc.items);
  const liveConn = [...walk(liveChart)].find((n) => n.type === "connect")!;
  const [lw] = liveConn.geometry().outline(0.5);
  ok(
    "a live stroke width: the outline is as wide as the path drawn",
    lw.width === 4 && drawn.length === 1 && drawn[0].style.strokeWidth === 4,
    JSON.stringify({ outline: lw.width, drawn: drawn.map((d) => d.style) })
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

console.log("# composites clipped to their first child claim its room");
{
  // A cut slice is `mask([window, source])`: it shows a 100-px window of a
  // 600-px source, so it claims 100 px, as it lays out to (#493).
  for (const [name, op] of [
    ["mask", mask],
    ["paint", paint],
  ] as const) {
    const node = (await op({}, [
      Rect({ w: 100, h: 80 }),
      Rect({ w: 600, h: 120 }),
    ])) as GoFishNode;
    node.resolveUnderlyingSpace();
    const [x, y] = node.resolveExtent();
    ok(
      `${name} claims its first child's width and height`,
      near(Pwl.at(x!.width, 0), 100) && near(Pwl.at(y!.width, 0), 80),
      `${x && Pwl.at(x.width, 0)} × ${y && Pwl.at(y.width, 0)}`
    );
    layOut(node);
    ok(
      `${name} lays out to the room it claims`,
      near(node.intrinsicDims![0].size!, 100) &&
        near(node.intrinsicDims![1].size!, 80)
    );
  }
}

console.log("# simplifyRing keeps a ring within the tolerance");
{
  // a circle of radius 50 sampled every 0.5 degrees, with a dent
  const ring: [number, number][] = Array.from({ length: 720 }, (_, i) => {
    const t = (i / 720) * 2 * Math.PI;
    const r = i >= 100 && i < 110 ? 45 : 50;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
  const kept = simplifyRing(ring, 0.5);
  const off = Math.max(
    ...ring.map(([x, y]) =>
      Math.min(
        ...kept.map((a, k) => {
          const b = kept[(k + 1) % kept.length];
          return segDist(x, y, a[0], a[1], b[0], b[1]);
        })
      )
    )
  );
  ok(
    "every point stays within 0.5 of the thinned ring",
    off <= 0.5 + 1e-9,
    `farthest ${off}`
  );
  ok(
    "it drops most of the points",
    kept.length < 100 && kept.length > 8,
    `${kept.length} kept`
  );
  ok(
    "a tolerance of 0 keeps every point",
    simplifyRing(ring, 0).length === ring.length
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
