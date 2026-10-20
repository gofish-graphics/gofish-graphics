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
const { enclose, ellipse, Shape } = GoFish as any;

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
