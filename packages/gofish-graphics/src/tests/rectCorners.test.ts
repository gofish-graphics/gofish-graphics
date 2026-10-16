/**
 * A rect's corner radii follow SVG's rule: one of `rx` / `ry` given is both,
 * neither is 0, and an explicit 0 stays 0. `Shape.box({ rx, ry })` follows
 * the same rule, with 2 when neither is given.
 *
 * Run: `pnpm build && tsx src/tests/rectCorners.test.ts` (wired as
 * `pnpm test:rect-corners`). It imports the built library, as circle.test
 * does.
 */
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

declare const process: { exit(code: number): never };
const { rect, enclose, circle, Shape } = GoFish as any;

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

/** The radii of every rect in a display list, in order. */
const radii = (dl: any): [number, number][] => {
  const out: [number, number][] = [];
  const walk = (it: any) => {
    if (it.kind === "rect") out.push([it.rx, it.ry]);
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("# rect");
for (const [opts, want] of [
  [{}, [0, 0]],
  [{ rx: 6 }, [6, 6]],
  [{ ry: 5 }, [5, 5]],
  [{ rx: 6, ry: 2 }, [6, 2]],
  [{ rx: 6, ry: 0 }, [6, 0]],
] as [Record<string, number>, [number, number]][]) {
  const got = radii(
    await rect({ w: 40, h: 20, ...opts }).toDisplayList({ w: 100, h: 100 })
  );
  check(`rect(${JSON.stringify(opts)}) has rx, ry ${want}`, same(got, [want]), JSON.stringify(got));
}

console.log("# Shape.box");
for (const [opts, want] of [
  [{}, [2, 2]],
  [{ rx: 16 }, [16, 16]],
  [{ ry: 9 }, [9, 9]],
  [{ rx: 16, ry: 0 }, [16, 0]],
] as [Record<string, number>, [number, number]][]) {
  const got = radii(
    await enclose({ shape: Shape.box(opts), padding: 4 }, [circle({ r: 10 })]).toDisplayList({
      w: 100,
      h: 100,
    })
  );
  check(`Shape.box(${JSON.stringify(opts)}) has rx, ry ${want}`, same(got, [want]), JSON.stringify(got));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
