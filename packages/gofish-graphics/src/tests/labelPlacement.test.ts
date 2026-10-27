/**
 * Label placement with the `Place` family: the strategies' candidates
 * (`labels/strategies.ts`), the chooser (`labels/placeStep.ts`) through real
 * charts, the defaults by geometry, the auto color read from where a label
 * landed, and the errors. Run via `tsx` (`pnpm test:label-placement`).
 *
 * Without a DOM, text is measured by the fallback (0.6 em per character, a
 * 1 em line), which is enough to check geometry.
 */
import { GoFishNode } from "../ast/_node";
import * as Place from "../families/place";
import {
  aroundCandidates,
  alongCandidates,
  dodgeVertically,
  endSpot,
  extremePoint,
  interiorCandidates,
  type TargetShape,
} from "../ast/labels/strategies";
import {
  convexOverlap,
  corners,
  covers,
  outlineObstacles,
  type Pt,
} from "../ast/labels/collide";
import { pointInRing } from "../ast/geometry/plane";
import { boxOutline } from "../ast/geometry";
import { autoLabelColorForFill } from "../ast/labels/autoLabelColor";
import {
  chart,
  circle,
  Coord,
  group,
  line,
  polygon,
  rect,
  ribbon,
  scatter,
  spread,
  stack,
} from "../lib";

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

async function errorOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Every item of a display list, flattened. */
function items(doc: any): any[] {
  const out: any[] = [];
  const walk = (n: any): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    if (n.kind !== undefined) out.push(n);
    if (n.items) walk(n.items);
    if (n.children) walk(n.children);
  };
  walk(doc.items ?? doc);
  return out;
}

const textItems = (doc: any) => items(doc).filter((i) => i.kind === "text");

/** A text item's box, from the fallback metrics (0.6 em wide per character,
 *  ascent 0.8 em, descent 0.2 em) and its start-baseline anchor; level text
 *  only. */
function textBox(t: any): Pt[] {
  const w = t.text.length * t.fontSize * 0.6;
  const x0 = t.x;
  const y0 = t.y - t.fontSize * 0.8;
  const y1 = t.y + t.fontSize * 0.2;
  return [
    [x0, y0],
    [x0 + w, y0],
    [x0 + w, y1],
    [x0, y1],
  ];
}

const circleShape = (cx: number, cy: number, r: number): TargetShape => {
  const points: Pt[] = [];
  for (let i = 0; i < 64; i++) {
    const t = (2 * Math.PI * i) / 64;
    points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return { outlines: [{ points, closed: true, filled: true }], type: "ellipse" };
};

console.log("# Place family");
{
  ok("a bare kind is its value", JSON.stringify(Place.end) === '{"kind":"end"}');
  ok(
    "calling a kind sets options",
    JSON.stringify(Place.along({ at: 0.6, orient: "sloped" })) ===
      '{"kind":"along","at":0.6,"orient":"sloped"}'
  );
  ok(
    "an option left undefined is not set",
    !("side" in Place.around({ side: undefined }))
  );
}

console.log("# around");
{
  const size = { hx: 20, hy: 6 };
  const cands = aroundCandidates(circleShape(0, 0, 10), size, 0, Place.around(), 3);
  ok("eight candidates by default", cands.length === 8);
  // Top-right: the label's lower-left corner at the circle's 45° point, moved
  // 3 px out along the diagonal.
  const d = 13 / Math.SQRT2;
  ok(
    "top-right first, touching the circle's own diagonal point",
    near(cands[0].cx, d + 20, 1e-2) && near(cands[0].cy, -d - 6, 1e-2),
    JSON.stringify(cands[0])
  );
  ok(
    "Imhof order: top-left second",
    cands[1].cx < 0 && cands[1].cy < 0
  );
  ok(
    "right is centered vertically",
    near(cands[4].cy, 0) && near(cands[4].cx, 13 + 20)
  );
  const bars = aroundCandidates(
    { outlines: [boxOutline({ min: [0, 0], max: [30, 100] }, 1)], type: "rect" },
    size,
    0,
    Place.around({ directions: ["top"], side: ["outset", "inset"] }),
    3
  );
  ok(
    "a box's top run stands for its middle",
    bars.every((c) => near(c.cx, 15))
  );
  ok(
    "outset sits above the top, inset just below it",
    near(bars[0].cy, -3 - 6) && near(bars[1].cy, 3 + 6),
    JSON.stringify(bars)
  );
  // A C opening right: its two arm tips both face right; the run nearest
  // the middle of the box's right side wins, then the upper one.
  const C: Pt[] = [
    [0, 0],
    [40, 0],
    [40, 10],
    [10, 10],
    [10, 30],
    [40, 30],
    [40, 40],
    [0, 40],
  ];
  const p = extremePoint([{ points: C, closed: true, filled: true }], "right");
  ok("C facing right: the upper arm tip, at its middle", near(p[0], 40) && near(p[1], 5), JSON.stringify(p));
}

console.log("# along");
{
  const flat: TargetShape = {
    outlines: [
      {
        points: [
          [0, 50],
          [200, 50],
        ],
        closed: false,
        filled: false,
      },
    ],
    type: "connect",
  };
  const size = { hx: 15, hy: 5 };
  const on = alongCandidates(flat, size, 0, Place.along({ at: 0.25 }), 3);
  ok("on: the first spot is at 25% of the length", near(on[0].cx, 50) && near(on[0].cy, 50));
  ok("on: the label may cover its own path", on[0].onOutline);
  ok(
    "spots slide away from at, nearest first",
    Math.abs(on[1].cx - 50) <= Math.abs(on[3].cx - 50) &&
      on.every((c) => c.cx >= 15 - 1e-9 && c.cx <= 185 + 1e-9)
  );
  const above = alongCandidates(flat, size, 0, Place.along({ side: "above" }), 3);
  ok("above: the box clears the path by the offset", near(above[0].cy, 50 - 3 - 5), JSON.stringify(above[0]));
  const left = alongCandidates(flat, size, 0, Place.along({ side: "left" }), 3);
  ok("left of rightward travel is up the screen", left[0].cy < 50);
  const right = alongCandidates(flat, size, 0, Place.along({ side: "right" }), 3);
  ok("right of rightward travel is down the screen", right[0].cy > 50);
  const start = alongCandidates(flat, size, 0, Place.along({ at: "start" }), 3);
  ok("at start: the label's start is flush with the path's", near(start[0].cx, 15));
  const vertical: TargetShape = {
    outlines: [
      {
        points: [
          [0, 0],
          [0, 200],
        ],
        closed: false,
        filled: false,
      },
    ],
    type: "connect",
  };
  ok(
    "above: no spot on a vertical path",
    alongCandidates(vertical, size, 0, Place.along({ side: "above" }), 3)
      .length === 0
  );
  const both = alongCandidates(
    flat,
    size,
    0,
    Place.along({ side: ["above", "below"] }),
    3
  );
  ok(
    "a list of sides: every side at a spot before sliding",
    near(both[0].cx, both[1].cx) && both[0].cy < 50 && both[1].cy > 50
  );
  const sloped = alongCandidates(
    {
      outlines: [
        {
          points: [
            [0, 0],
            [100, 100],
          ],
          closed: false,
          filled: false,
        },
      ],
      type: "connect",
    },
    size,
    0,
    Place.along({ orient: "sloped" }),
    3
  );
  ok("sloped: turned to the path", near(sloped[0].angle, 45));
  const zigzag: Pt[] = [];
  for (let x = 0; x <= 200; x += 5) zigzag.push([x, x % 10 === 0 ? 0 : 20]);
  ok(
    "sloped: no spot where the path strays from the chord",
    alongCandidates(
      { outlines: [{ points: zigzag, closed: false, filled: false }], type: "connect" },
      size,
      0,
      Place.along({ orient: "sloped" }),
      3
    ).length === 0
  );
  const box = { outlines: [boxOutline({ min: [0, 0], max: [80, 20] }, 1)], type: "rect" };
  const part = alongCandidates(box, size, 0, Place.along({ at: "x-max", side: "outset" }), 3);
  ok(
    "a part: the label sits past the box's right edge, at its middle",
    near(part[0].cx, 80 + 3 + 15) && near(part[0].cy, 10),
    JSON.stringify(part[0])
  );
  ok(
    "a part shorter than the label: no spot",
    alongCandidates(
      { outlines: [boxOutline({ min: [0, 0], max: [80, 8] }, 1)], type: "rect" },
      size,
      0,
      Place.along({ at: "x-max", side: "outset" }),
      3
    ).length === 0
  );
  const msg = await errorOf(() =>
    alongCandidates(flat, size, 0, Place.along({ side: "inset" }), 3)
  );
  ok(
    "inset on an open path is an error naming it",
    msg?.includes("needs a closed outline") ?? false,
    msg
  );
  const partMsg = await errorOf(() =>
    alongCandidates(flat, size, 0, Place.along({ at: "y-max" }), 3)
  );
  ok("an unknown part is an error", partMsg?.includes('no part "y-max"') ?? false, partMsg);
}

console.log("# start, end, dodge");
{
  const path: TargetShape = {
    outlines: [
      {
        points: [
          [0, 10],
          [100, 40],
        ],
        closed: false,
        filled: false,
      },
    ],
    type: "connect",
  };
  const e = endSpot(path, { hx: 10, hy: 5 }, 0, "end", 4);
  ok("end: right of the last point", near(e.cx, 114) && near(e.cy, 40) && e.side === 1);
  const s = endSpot(path, { hx: 10, hy: 5 }, 0, "start", 4);
  ok("start: left of the first point", near(s.cx, -14) && s.side === -1);
  const ys = dodgeVertically(
    [
      { want: 50, h: 10 },
      { want: 52, h: 10 },
      { want: 100, h: 10 },
    ],
    1
  );
  ok("dodged boxes do not overlap", ys[1] - ys[0] >= 11 - 1e-9, JSON.stringify(ys));
  ok("a run centers on what its members want", near((ys[0] + ys[1]) / 2, 51));
  ok("a box with room stays put", near(ys[2], 100));
  const closedMsg = await errorOf(() =>
    endSpot(circleShape(0, 0, 5), { hx: 1, hy: 1 }, 0, "end", 4)
  );
  ok(
    "end on a closed outline is an error",
    closedMsg?.includes("Place.end needs an open path") ?? false,
    closedMsg
  );
}

console.log("# interior");
{
  // An L: a 100×20 foot and a 20×100 leg. The widest arm is the foot.
  const L: Pt[] = [
    [0, 0],
    [20, 0],
    [20, 80],
    [100, 80],
    [100, 100],
    [0, 100],
  ];
  const shape: TargetShape = { outlines: [{ points: L, closed: true, filled: true }], type: "polygon" };
  const c = interiorCandidates(shape, { hx: 20, hy: 5 }, 0);
  ok("an L: the label goes in the foot", c[0].cy > 80 && c[0].cx > 30, JSON.stringify(c[0]));
  ok(
    "the label's box lies inside",
    corners(c[0], { hx: 20, hy: 5 }).every((p) => pointInRing(p, L))
  );
  ok(
    "a label too big for the region has no spot",
    interiorCandidates(shape, { hx: 80, hy: 30 }, 0).length === 0
  );
  const msg = await errorOf(() =>
    interiorCandidates(
      {
        outlines: [
          {
            points: [
              [0, 0],
              [10, 10],
            ],
            closed: false,
            filled: false,
          },
        ],
        type: "connect",
      },
      { hx: 1, hy: 1 },
      0
    )
  );
  ok(
    "interior on an open path is an error naming it",
    msg === "[gofish] Place.interior needs a filled region; connect has an open one.",
    msg
  );
}

/** Every node of a laid-out tree, depth first. */
function* walk(node: GoFishNode): Generator<GoFishNode> {
  yield node;
  for (const c of node.children) if (c instanceof GoFishNode) yield* walk(c);
}

console.log("# the chooser, in a chart");
{
  // Twelve dots in a tight cluster: every label either has a spot that
  // covers no other label and no dot, or is hidden.
  const rows = Array.from({ length: 12 }, (_, i) => ({
    name: `p${i}`,
    x: 1 + (i % 4) * 0.3,
    y: 1 + Math.floor(i / 4) * 0.3,
  }));
  const info: string[] = [];
  const saved = console.info;
  console.info = (m: string) => info.push(m);
  const node = (await chart(rows)
    .flow(scatter({ by: "name", x: "x", y: "y" }))
    .mark(circle({ r: 3 }).label("name"))
    .resolve()) as GoFishNode;
  const doc = await node.toDisplayList({ w: 120, h: 80 });
  console.info = saved;
  const texts = textItems(doc);
  const dots = items(doc).filter((i) => i.kind === "ellipse");
  let clash = "";
  for (let i = 0; i < texts.length; i++) {
    const a = textBox(texts[i]);
    for (let j = 0; j < i; j++)
      if (convexOverlap(a, textBox(texts[j])))
        clash ||= `${texts[i].text} / ${texts[j].text}`;
    for (const d of dots) {
      const ring: Pt[] = [];
      for (let k = 0; k < 16; k++) {
        const t = (2 * Math.PI * k) / 16;
        ring.push([d.cx + d.rx * Math.cos(t), d.cy + d.ry * Math.sin(t)]);
      }
      if (convexOverlap(a, ring)) clash ||= `${texts[i].text} / a dot`;
    }
  }
  ok("no label covers another label or a dot", clash === "", clash);
  ok("some labels are hidden", texts.length < 12 && texts.length > 0, `${texts.length}`);
  ok(
    "one note names how many were hidden, for which call",
    info.length === 1 &&
      info[0].includes(`${12 - texts.length} of 12 for .label("name")`),
    JSON.stringify(info)
  );
  // The labels join the layout, so they are part of the chart's box.
  ok(
    "labels keep inside the plot area",
    texts.every((t) => textBox(t).every(([x]) => x >= -1))
  );
}

console.log("# one call, one placement");
{
  // Bars stacked in two columns: each column is its own tier, but the
  // labels of one .label() call are placed together, in the plot's area.
  const rows = [
    { x: "a", c: "p", v: 3 },
    { x: "a", c: "q", v: 2 },
    { x: "b", c: "p", v: 2 },
    { x: "b", c: "q", v: 3 },
  ];
  const node = (await chart(rows, { axes: false })
    .flow(
      spread({ by: "x", dir: "x", spacing: 30 }),
      stack({ by: "c", dir: "y" })
    )
    .mark(rect({ h: "v", w: 10 }).label("c", { position: Place.around() }))
    .resolve()) as GoFishNode;
  const doc = await node.toDisplayList({ w: 200, h: 200 });
  const labels = [...walk(node)].filter((n) => n.type === "label");
  ok(
    "the labels of one call sit in one tier",
    labels.length === 4 && labels.every((l) => l.parent === labels[0].parent),
    String(labels.length)
  );
  const texts = textItems(doc);
  let clash = "";
  for (let i = 0; i < texts.length; i++)
    for (let j = 0; j < i; j++)
      if (convexOverlap(textBox(texts[i]), textBox(texts[j])))
        clash ||= `${texts[i].text} / ${texts[j].text}`;
  ok(
    "they are placed together: none is hidden and none covers another",
    texts.length === 4 && clash === "",
    `${texts.length} ${clash}`
  );
  const bare = (await chart(rows, { axes: false })
    .flow(
      spread({ by: "x", dir: "x", spacing: 30 }),
      stack({ by: "c", dir: "y" })
    )
    .mark(rect({ h: "v", w: 10 }))
    .resolve()) as GoFishNode;
  const boxes = (d: any) =>
    JSON.stringify(
      items(d)
        .filter((i) => i.kind === "rect")
        .map((r) => [r.x, r.y, r.w, r.h])
    );
  ok(
    "the labels do not move the bars",
    boxes(doc) === boxes(await bare.toDisplayList({ w: 200, h: 200 })),
    boxes(doc)
  );
}

console.log("# a call over marks with different defaults");
{
  // One call labels dots (around) and the line through them (end): each
  // kind is placed its own way, in one run.
  const rows = [
    { x: 1, y: 1 },
    { x: 2, y: 3 },
    { x: 3, y: 2 },
  ];
  const node = (await chart(rows, { axes: false })
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 3 }))
    .layer(line())
    .resolve()) as GoFishNode;
  const call = {};
  for (const n of [...walk(node)])
    if (n.type === "ellipse" || n.type === "connect")
      n.label(() => n.type, undefined, call);
  const doc = await node.toDisplayList({ w: 200, h: 200 });
  const texts = textItems(doc).map((t) => t.text);
  ok(
    "a call that mixes end and around places both",
    texts.filter((t) => t === "connect").length === 1 &&
      texts.filter((t) => t === "ellipse").length >= 1,
    JSON.stringify(texts)
  );
}

console.log("# defaults by geometry");
{
  const rows = [
    { s: "a", x: 0, y: 1 },
    { s: "a", x: 1, y: 2 },
    { s: "a", x: 2, y: 1.5 },
  ];
  const node = (await chart(rows)
    .flow(group({ by: "s" }), scatter({ by: "x", x: "x", y: "y" }))
    .mark(line().label("s"))
    .resolve()) as GoFishNode;
  const doc = await node.toDisplayList({ w: 200, h: 100 });
  const [t] = textItems(doc);
  const path = items(doc).find((i) => i.kind === "path");
  const xs = (path.d as string).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const pathRight = Math.max(...xs.filter((_, i) => i % 2 === 0));
  ok(
    "a line is labeled past its end (Place.end)",
    t !== undefined && t.x >= pathRight,
    JSON.stringify({ t, pathRight })
  );

  const dot = (await chart([{ x: 1, y: 1, n: "only" }])
    .flow(scatter({ by: "n", x: "x", y: "y" }))
    .mark(circle({ r: 5 }).label("n"))
    .resolve()) as GoFishNode;
  const ddoc = await dot.toDisplayList({ w: 100, h: 100 });
  const [dt] = textItems(ddoc);
  const e = items(ddoc).find((i) => i.kind === "ellipse");
  ok(
    "a dot is labeled at its upper right (Place.around)",
    dt.x > e.cx && dt.y < e.cy,
    JSON.stringify({ dt, e })
  );

  const bar = (await chart([{ c: "a", v: 3 }])
    .flow(spread({ by: "c", dir: "x" }))
    .mark(rect({ h: "v" }).label("v"))
    .resolve()) as GoFishNode;
  const bdoc = await bar.toDisplayList({ w: 100, h: 100 });
  const [bt] = textItems(bdoc);
  const r = items(bdoc).find((i) => i.kind === "rect");
  ok(
    "a rect keeps \"outset\": centered above it",
    near(bt.x + (bt.text.length * bt.fontSize * 0.6) / 2, r.x + r.w / 2, 1e-6) &&
      bt.y < r.y,
    JSON.stringify({ bt, r })
  );
}

console.log("# the auto color reads where the label landed");
{
  // A C opening right: the center of its box is in the opening.
  const C = [
    [0, 0],
    [4, 0],
    [4, 1],
    [1, 1],
    [1, 3],
    [4, 3],
    [4, 4],
    [0, 4],
  ];
  const fill = "#1f3a93";
  const render = async (position?: "center") => {
    const node = (await chart([{ n: "C", ring: C }], { axes: false })
      .flow(group({ by: "n" }))
      .mark(
        polygon({ points: "ring", fill }).label(
          "n",
          position ? { position } : undefined
        )
      )
      .resolve()) as GoFishNode;
    return textItems(await node.toDisplayList({ w: 200, h: 200 }))[0];
  };
  const centered = await render("center");
  ok(
    '"center" outside a C takes the outside color',
    centered.style.fill === autoLabelColorForFill(fill, false),
    centered.style.fill
  );
  const inside = await render();
  ok(
    "Place.interior inside it takes the inside color",
    inside.style.fill === autoLabelColorForFill(fill, true),
    inside.style.fill
  );
}

console.log("# unfilled regions");
{
  // A closed outline with no fill is ink only along its stroke: a label
  // inside it covers nothing, one across its edge covers the band.
  const square: Pt[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const unfilled = outlineObstacles({ points: square, closed: true, filled: false, width: 4 }, "m");
  const filled = outlineObstacles({ points: square, closed: true, filled: true, width: 4 }, "m");
  const inside = corners({ cx: 50, cy: 50, angle: 0 }, { hx: 10, hy: 5 });
  ok(
    "an unfilled closed outline is only its band: a label inside it is free",
    !unfilled.some((o) => covers(inside, o))
  );
  ok(
    "a filled one covers its inside",
    filled.some((o) => covers(inside, o))
  );
  // 1 px from the edge's center line: clear of a 0-wide segment, inside
  // the 4 px band.
  const nearEdge = corners({ cx: 50, cy: 6, angle: 0 }, { hx: 10, hy: 5 });
  ok(
    "the band is as wide as the stroke",
    unfilled.some((o) => covers(nearEdge, o)) &&
      !outlineObstacles({ points: square, closed: true, filled: false }, "m").some((o) =>
        covers(nearEdge, o)
      )
  );

  const ring: Pt[] = [
    [0, 0],
    [40, 0],
    [40, 40],
    [0, 40],
  ];
  const msg = await errorOf(() =>
    interiorCandidates(
      {
        outlines: [{ points: ring, closed: true, filled: false, width: 1 }],
        type: "polygon",
      },
      { hx: 1, hy: 1 },
      0
    )
  );
  ok(
    "interior on an unfilled polygon is an error naming it",
    msg ===
      "[gofish] Place.interior needs a filled region; polygon has a closed one with no fill.",
    msg
  );
  const chartMsg = await errorOf(async () => {
    const node = (await chart([{ n: "a", ring }], { axes: false })
      .flow(group({ by: "n" }))
      .mark(
        polygon({ points: "ring", fill: "none", stroke: "black" }).label("n", {
          position: Place.interior(),
        })
      )
      .resolve()) as GoFishNode;
    await node.toDisplayList({ w: 100, h: 100 });
  });
  ok(
    "Place.interior on a polygon with fill none throws through a chart",
    chartMsg === msg,
    chartMsg
  );
  const defaultMsg = await errorOf(async () => {
    const node = (await chart([{ n: "a", ring }], { axes: false })
      .flow(group({ by: "n" }))
      .mark(polygon({ points: "ring", fill: "none", stroke: "black" }).label("n"))
      .resolve()) as GoFishNode;
    await node.toDisplayList({ w: 100, h: 100 });
  });
  ok(
    "an unfilled polygon's default label goes around it instead of throwing",
    defaultMsg === undefined,
    defaultMsg
  );
}

console.log("# halo and background");
{
  const node = (await chart([{ c: "a", v: 3 }])
    .flow(spread({ by: "c", dir: "x" }))
    .mark(
      rect({ h: "v" }).label("v", {
        halo: { color: "white", width: 4 },
        background: { fill: "#eee", padding: 3 },
      })
    )
    .resolve()) as GoFishNode;
  const all = items(await node.toDisplayList({ w: 100, h: 100 }));
  const t = all.find((i) => i.kind === "text");
  ok(
    "a halo strokes the text under its fill",
    t.style.stroke === "white" &&
      t.style.strokeWidth === 4 &&
      t.style.paintOrder === "stroke"
  );
  const bg = all.filter((i) => i.kind === "rect" && i.style?.fill === "#eee");
  ok("a background is a box behind the text", bg.length === 1 && all.indexOf(bg[0]) < all.indexOf(t));
}

console.log("# errors");
{
  const lineMsg = await errorOf(async () => {
    const node = (await chart([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ])
      .flow(scatter({ x: "x", y: "y" }))
      .mark(line().label(() => "l", { position: Place.interior() }))
      .resolve()) as GoFishNode;
    await node.toDisplayList({ w: 100, h: 100 });
  });
  ok(
    "Place.interior on a line names the missing outline",
    lineMsg === "[gofish] Place.interior needs a filled region; connect has an open one.",
    lineMsg
  );
  const polarMsg = await errorOf(async () => {
    const node = (await chart([{ c: "a", v: 3 }], { coord: Coord.polar() })
      .flow(spread({ by: "c", dir: "x" }))
      .mark(rect({ h: "v" }).label("v", { position: Place.around() }))
      .resolve()) as GoFishNode;
    await node.toDisplayList({ w: 100, h: 100 });
  });
  ok(
    "a Place strategy in polar coordinates is not supported yet",
    polarMsg?.includes("issues/1201") ?? false,
    polarMsg
  );
  const defaultPolar = await errorOf(async () => {
    const node = (await chart(
      [
        { c: "a", v: 3 },
        { c: "b", v: 2 },
      ],
      { coord: Coord.polar() }
    )
      .flow(spread({ by: "c", dir: "x" }))
      .mark(circle({ r: 3 }).label("c"))
      .resolve()) as GoFishNode;
    await node.toDisplayList({ w: 100, h: 100 });
  });
  ok("a default in polar coordinates falls back to \"outset\"", defaultPolar === undefined, defaultPolar);
  const bad = await errorOf(async () => {
    const node = (await chart([{ c: "a", v: 3 }])
      .flow(spread({ by: "c", dir: "x" }))
      .mark(rect({ h: "v" }).label("v", { position: { kind: "repel" } as any }))
      .resolve()) as GoFishNode;
    await node.toDisplayList({ w: 100, h: 100 });
  });
  ok("an unknown strategy is an error", bad?.includes("Make one with the Place family") ?? false, bad);
}

console.log("# a ribbon's label goes inside its band");
{
  const rows = [
    { x: "a", s: "p", v: 5 },
    { x: "b", s: "p", v: 6 },
    { x: "c", s: "p", v: 5 },
    { x: "a", s: "q", v: 4 },
    { x: "b", s: "q", v: 5 },
    { x: "c", s: "q", v: 4 },
  ];
  const node = (await chart(rows)
    .flow(spread({ by: "x", dir: "x", spacing: 60 }), stack({ by: "s", dir: "y" }))
    .mark(ribbon({ h: "v", fill: "s" }).label("s"))
    .resolve()) as GoFishNode;
  await node.toDisplayList({ w: 240, h: 200, axes: false });
  const labels = [...walk(node)].filter((n) => n.type === "label");
  const bands = [...walk(node)].filter((n) => n.type === "connect");
  ok("one label per band", labels.length === 2 && bands.length === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
