/**
 * `enclose` through the built library, read off the display list: how a
 * member's geometry reaches the outline.
 *
 * Run: `pnpm build && tsx src/tests/encloseRender.test.ts` (wired as
 * `pnpm test:enclose-render`).
 */
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { items } from "./testHelpers";

declare const process: { exit(code: number): never };
const {
  chart,
  circle,
  enclose,
  ellipse,
  live,
  pack,
  rect,
  Shape,
  spread,
  treemap,
} = GoFish as any;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The width and height of the first path's points. */
const pathSize = (dl: any): [number, number] => {
  const path = items(dl).find((it) => it.kind === "path");
  const nums = (path?.d ?? "").match(/-?[\d.]+(e-?\d+)?/g)!.map(Number);
  const xs = nums.filter((_: number, i: number) => i % 2 === 0),
    ys = nums.filter((_: number, i: number) => i % 2 === 1);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

console.log("# Shape.oval() around an ellipse member");
{
  const dl = await enclose({ shape: Shape.oval(), padding: 4 }, [
    ellipse({ w: 200, h: 20 }),
  ]).toDisplayList({ w: 300, h: 100 });
  const [w, h] = pathSize(dl);
  // The ellipse grown by 4 is blunter than an ellipse at its ends, so the
  // least ellipse around it is about 224 by 29 (not 208 by 28, which leaves
  // the grown ends outside, and not the 208 by 208 circle of its larger
  // radius).
  check(
    "enclose({ shape: Shape.oval(), padding: 4 }, [ellipse({ w: 200, h: 20 })]) is a wide oval",
    w > 208 && w < 230 && h > 28 && h < 31,
    `${w.toFixed(1)} by ${h.toFixed(1)}`
  );
}

console.log("# an option a Shape kind does not have is an error naming it");
for (const [name, make] of [
  ["Shape.box", () => Shape.box({ padding: 10 })],
  ["Shape.oval", () => Shape.oval({ padding: 10 })],
  ["Shape.arcs", () => Shape.arcs({ padding: 10 })],
  ["Shape.blob", () => Shape.blob({ padding: 10 })],
  ["Shape.hull", () => Shape.hull({ padding: 10 })],
  ["Shape.spine", () => Shape.spine({ padding: 10 })],
] as [string, () => unknown][]) {
  let message = "";
  try {
    await enclose({ shape: make() }, [ellipse({ w: 20, h: 10 })]).toDisplayList(
      { w: 100, h: 100 }
    );
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    `${name}({ padding: 10 }) is an error naming padding`,
    /padding/.test(message),
    message || "no error"
  );
}

console.log("# a live strokeWidth's outline takes room, as a literal one does");
{
  // A live channel is read at resolve time (`withLiveStatics`), so the
  // node's outline is that number: the canvas holds half of it on each side.
  const viewport = async (strokeWidth: unknown) =>
    (
      await enclose({ strokeWidth, padding: 0 }, [
        rect({ w: 100, h: 50 }),
      ]).toDisplayList()
    ).viewport;
  const literal = await viewport(8);
  const fromLive = await viewport(live(() => 8));
  check(
    "enclose({ strokeWidth: live(() => 8) }) claims its outline",
    literal.w === 108 &&
      literal.h === 58 &&
      fromLive.w === literal.w &&
      fromLive.h === literal.h,
    JSON.stringify([literal, fromLive])
  );
}

console.log(
  "# enclose as a flow step, with padding from a field, and pack spacing"
);
{
  const rows = [
    { g: "a", pad: 2, r: 10 },
    { g: "a", pad: 2, r: 14 },
    { g: "b", pad: 10, r: 10 },
    { g: "b", pad: 10, r: 14 },
  ];
  const circleOf = (d: any[]) => circle({ r: d[0].r, fill: "#888" })(d);
  /** The outlines' paths, in paint order, and every circle. */
  const draw = async (padding: unknown, spacing = 0) => {
    const dl = await chart(rows)
      .flow(
        pack({ by: "g", spacing }),
        enclose({ shape: Shape.arcs(), padding, fill: "none" }),
        pack()
      )
      .mark(circleOf)
      .toDisplayList({ w: 400, h: 400 });
    return items(dl);
  };
  const sizeOf = (path: any): [number, number] => {
    const nums = (path.d as string).match(/-?[\d.]+(e-?\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0),
      ys = nums.filter((_, i) => i % 2 === 1);
    return [
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    ];
  };

  const constant = (await draw(4)).filter((it) => it.kind === "path");
  check(
    "a flow-step enclose draws one outline per group",
    constant.length === 2,
    `${constant.length} paths`
  );

  // Each group's outline sits its own `pad` from its circles: group b's is
  // 2 × (10 − 2) = 16 px wider than group a's.
  const fromField = (await draw("pad")).filter((it) => it.kind === "path");
  const [wa] = sizeOf(fromField[0]);
  const [wb] = sizeOf(fromField[1]);
  check(
    "padding: a field name is read once per group, in pixels",
    fromField.length === 2 && Math.abs(wb - wa - 16) < 0.01,
    `widths ${wa.toFixed(2)}, ${wb.toFixed(2)}`
  );

  let message = "";
  try {
    await chart(rows)
      .flow(enclose({ padding: "pad" }), pack())
      .mark(circleOf)
      .toDisplayList({ w: 400, h: 400 });
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "padding: a field that is not constant within the group is an error",
    /padding/.test(message) && /not constant/.test(message),
    message || "no error"
  );

  message = "";
  try {
    await draw("nope");
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "padding: a string that names no column is an error naming padding",
    /enclose\(\{ padding \}\)/.test(message),
    message || "no error"
  );

  // Two circles of radius 10 packed with spacing 6 are 26 px apart.
  const centers = async (spacing: number) =>
    items(
      await pack({ spacing }, [
        circle({ r: 10, fill: "#888" }),
        circle({ r: 10, fill: "#888" }),
      ]).toDisplayList({ w: 200, h: 200 })
    )
      .filter((it) => it.kind === "ellipse" || it.kind === "circle")
      .map((it) => [it.cx ?? it.x, it.cy ?? it.y] as [number, number]);
  const [p, q] = await centers(6);
  const gap = Math.hypot(p[0] - q[0], p[1] - q[1]);
  check(
    "pack({ spacing: 6 }) keeps sibling circles 6 px apart",
    Math.abs(gap - 26) < 1e-6,
    `centers ${gap} px apart`
  );
}

console.log("# enclose around a pack lowers and hugs the circles");
{
  const dl = await enclose({ shape: Shape.blob(), padding: 4 }, [
    pack({}, [circle({ r: 30 }), circle({ r: 10 })]),
  ]).toDisplayList({ w: 200, h: 200 });
  const kinds = items(dl).map((it) => it.kind);
  check(
    "enclose(opts, [pack(...)]) renders its outline and the circles",
    kinds.filter((k) => k === "path").length === 1 && kinds.length === 3,
    JSON.stringify(kinds)
  );
}

console.log("# enclose lowers any fresh subtree, as layer does");
{
  const tree = [
    { g: "a", v: 3 },
    { g: "a", v: 1 },
    { g: "b", v: 2 },
  ];
  let message = "";
  let kinds: string[] = [];
  try {
    const dl = await chart(tree)
      .flow(
        spread({ by: "g", dir: "x", spacing: 10 }),
        enclose({ padding: 4 }),
        treemap({ size: "v" })
      )
      .mark(rect({ w: 40, h: 40, fill: "#888" }))
      .toDisplayList({ w: 300, h: 100 });
    kinds = items(dl).map((it) => it.kind);
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "spread → enclose → treemap renders each group's outline and cells",
    message === "" && kinds.filter((k) => k === "rect").length === 5,
    message || JSON.stringify(kinds)
  );
}

console.log("# nested pack spacing is between siblings only");
{
  // Two groups of one r=10 circle each, packed with spacing 4 at both
  // levels: the inner packs carry no margin, so the circles are 24 apart.
  const rows = [
    { g: "a", r: 10 },
    { g: "b", r: 10 },
  ];
  const dl = await chart(rows)
    .flow(pack({ by: "g", spacing: 4 }), pack({ spacing: 4 }))
    .mark((d: any[]) => circle({ r: d[0].r, fill: "#888" })(d))
    .toDisplayList({ w: 200, h: 200 });
  const cs = items(dl)
    .filter((it) => it.kind === "ellipse" || it.kind === "circle")
    .map((it) => [it.cx ?? it.x, it.cy ?? it.y] as [number, number]);
  const gap = Math.hypot(cs[0][0] - cs[1][0], cs[0][1] - cs[1][1]);
  check(
    "pack({ spacing: 4 }) of packs keeps the circles 4 px apart, not 8",
    cs.length === 2 && Math.abs(gap - 24) < 1e-6,
    `centers ${gap} px apart`
  );
  const one = await pack({ spacing: 6 }, [circle({ r: 10 })]).toDisplayList();
  check(
    "pack({ spacing: 6 }) of one circle is that circle's size",
    one.viewport.w === 20 && one.viewport.h === 20,
    JSON.stringify(one.viewport)
  );
}

console.log("# pack({ spacing }) is checked");
for (const spacing of [-1, NaN, "4"]) {
  let message = "";
  try {
    await pack({ spacing }, [circle({ r: 10 })]).toDisplayList();
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    `pack({ spacing: ${JSON.stringify(spacing)} }) is an error naming spacing`,
    /pack\(\{ spacing \}\)/.test(message),
    message || "no error"
  );
}

console.log("# a flow-step enclose keeps its step through its modifiers");
{
  const rows = [
    { g: "a", r: 10 },
    { g: "a", r: 14 },
    { g: "b", r: 12 },
  ];
  const draw = async (step: unknown) => {
    const dl = await chart(rows)
      .flow(pack({ by: "g" }), step, pack())
      .mark((d: any[]) => circle({ r: d[0].r, fill: "#888" })(d))
      .toDisplayList({ w: 300, h: 300 });
    return items(dl);
  };
  const step = () => enclose({ shape: Shape.arcs(), padding: 4 });
  for (const [what, make] of [
    [".name(n)", () => step().name("region")],
    [".zOrder(n)", () => step().zOrder(-1)],
    [".translate(...)", () => step().translate({ x: 5 })],
    [".name(n).label(f)", () => step().name("region").label("g")],
  ] as [string, () => unknown][]) {
    let message = "";
    let drawn: any[] = [];
    try {
      drawn = await draw(make());
    } catch (e) {
      message = (e as Error).message;
    }
    const paths = drawn.filter((it) => it.kind === "path").length;
    check(
      `enclose(opts)${what} in .flow(...) is still the flow step`,
      message === "" && paths === 2,
      message || `${paths} paths`
    );
  }
  // `.label(field)` labels each group's outline with the group's value.
  const texts = (await draw(step().label("g")))
    .filter((it) => it.kind === "text")
    .map((it) => it.text)
    .sort();
  check(
    "enclose(opts).label(f) in .flow(...) labels each group's outline",
    JSON.stringify(texts) === JSON.stringify(["a", "b"]),
    JSON.stringify(texts)
  );
}

console.log("# a box-shape enclose is packed by the circle around its box");
{
  // Each outline is a 40 by 40 box (a circle of radius 10, padding 10), so
  // pack places them by circles of radius 20√2, not the circles' own 10.
  const dl = await pack({}, [
    enclose({ padding: 10 }, [circle({ r: 10, fill: "#888" })]),
    enclose({ padding: 10 }, [circle({ r: 10, fill: "#888" })]),
  ]).toDisplayList({ w: 300, h: 300 });
  const cs = items(dl)
    .filter((it) => it.kind === "ellipse" || it.kind === "circle")
    .map((it) => [it.cx ?? it.x, it.cy ?? it.y] as [number, number]);
  const gap = Math.hypot(cs[0][0] - cs[1][0], cs[0][1] - cs[1][1]);
  check(
    "pack of two box enclosures keeps the boxes' circles apart",
    cs.length === 2 && Math.abs(gap - 40 * Math.SQRT2) < 1e-6,
    `centers ${gap} px apart`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
