/**
 * `Animation.draw()`: reveals a stroke along its path by length, through the
 * renderer's own measure (`pathLength = 1` and a dash `p` long), so it works
 * on any path a mark lowers to: a polyline, a step, an arc, a cubic. The
 * strokes inside a mask are drawn too, in sync.
 *
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/drawEffect.test.ts`.
 */
import { items } from "./animationTestHelpers";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { blank, layer, line, mask, rect, Animation, Curve } = GoFish as any;

declare const process: { exit(code: number): never };

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

const OPTS = { w: 300, h: 200, axes: false };

/** Three points joined by a line with `curve`. */
const path = (curve: unknown) =>
  layer([
    blank({ x: 0, y: 0, w: 0, h: 0 }).name("a"),
    blank({ x: 100, y: 80, w: 0, h: 0 }).name("b"),
    blank({ x: 200, y: 10, w: 0, h: 0 }).name("c"),
  ]).relate(({ a, b, c }: any) => [
    line({ stroke: "black", curve }, [a, b, c]),
  ]);

const paths = async (mark: any, at: number) =>
  items(await mark.toDisplayList({ ...OPTS, playing: false, at })).filter(
    (n: any) => n.kind === "path"
  );

for (const [name, curve] of [
  ["linear (M L L)", Curve.linear()],
  ["step", Curve.step()],
  ["arc (two cubics per pair)", Curve.arc()],
  ["monotone", Curve.monotone()],
] as const) {
  const drawn = () =>
    path(curve).transition({
      enter: Animation.draw({ duration: 1000, ease: "linear" }),
    });
  const [p0, mid, end] = [
    await paths(drawn(), 0),
    await paths(drawn(), 400),
    await paths(drawn(), 1000),
  ];
  ok(
    `${name}: nothing at 0, 40% of its length at 400 ms, all of it at the end`,
    p0.length === 1 &&
      p0[0].pathLength === 1 &&
      p0[0].style?.strokeDasharray === "0 1" &&
      mid[0].style?.strokeDasharray === "0.4 1" &&
      end[0].style?.strokeDasharray === "1 1" &&
      mid[0].d === end[0].d,
    JSON.stringify([p0[0], mid[0]?.style, end[0]?.style])
  );
}

// A stroke under a mask (the gun-deaths arch): the content is drawn, the
// mask's clip region is not touched, and both copies move together.
{
  const arch = (stroke: string) =>
    layer([
      blank({ x: 0, y: 0, w: 0, h: 0 }).name("a"),
      blank({ x: 200, y: 0, w: 0, h: 0 }).name("b"),
    ]).relate(({ a, b }: any) => [
      line(
        {
          stroke,
          curve: Curve.bezier({
            controls: [
              [0.25, 0.4],
              [0.75, 0.4],
            ],
          }),
        },
        [a, b]
      ),
    ]);
  const life = () =>
    layer([
      mask([rect({ x: 100, y: -100, w: 100, h: 100, fill: "white" }), arch("grey")]),
      mask([rect({ x: 0, y: -100, w: 100, h: 100, fill: "white" }), arch("orange")]),
    ]).transition({ enter: Animation.draw({ duration: 1000, ease: "linear" }) });
  const doc = await life().toDisplayList({ ...OPTS, playing: false, at: 250 });
  const masks = items(doc).filter((n: any) => n.kind === "mask");
  const strokes = masks.flatMap((m: any) => m.content.filter((c: any) => c.kind === "path"));
  ok(
    "under masks: both copies at 25%, the clip rects untouched",
    masks.length === 2 &&
      strokes.length === 2 &&
      strokes.every((s: any) => s.style?.strokeDasharray === "0.25 1") &&
      masks.every((m: any) => m.mask.every((r: any) => r.style?.strokeDasharray === undefined)),
    JSON.stringify(strokes.map((s: any) => s.style))
  );
}

// A mark with no stroke is an error.
{
  let message = "no error";
  try {
    await rect({ w: 10, h: 10 })
      .transition({ enter: Animation.draw() })
      .toDisplayList(OPTS);
  } catch (e) {
    message = String((e as Error).message);
  }
  ok("a rect has no stroke to draw: a loud error", message.includes("Animation.draw()"), message);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
