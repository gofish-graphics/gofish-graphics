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
const { chart, circle, enclose, ellipse, live, pack, rect, Shape } =
  GoFish as any;

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
  return [
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ];
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

console.log("# enclose as a flow step, with padding from a field, and pack spacing");
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
