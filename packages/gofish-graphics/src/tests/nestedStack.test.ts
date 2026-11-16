/**
 * A stack inside a stack on the same axis (#1357). The outer stack lays its
 * parts end to end, and a part that is itself a stack is one of them: its
 * pinned type does not place it, since the outer chain does
 * (`placedByOwnData` in `_node.ts`). So each inner stack starts where the
 * one before it ends. A nested stack is laid as a box, its extent, not as
 * the vector of its net value, so with mixed signs the whole is not the flat
 * stack's (#992); these checks use positive parts.
 *
 * Run: `pnpm build && tsx src/tests/nestedStack.test.ts` (wired as
 * `pnpm test:nested-stack`). The rendering checks import from `dist` for
 * the same lodash-ESM reason as `stackOrigin.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { check, items, report, type Item } from "./testHelpers";

const { chart, spread, stack, rect } = GoFish as any;

declare const process: { exit(code: number): never };

type Box = Required<Pick<Item, "x" | "y" | "w" | "h">>;
const rectsOf = (dl: any): Box[] =>
  items(dl).filter((it) => it.kind === "rect") as Box[];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const show = (boxes: Box[]) =>
  boxes.map((b) => `[${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.w.toFixed(1)}x${b.h.toFixed(1)}]`).join(" ");

const rows = [
  { g: "A", k: "a1", v: 1 },
  { g: "A", k: "a2", v: 2 },
  { g: "B", k: "b1", v: 3 },
  { g: "B", k: "b2", v: 1 },
  { g: "C", k: "c1", v: 2 },
  { g: "C", k: "c2", v: 2 },
];

/** Each box starts where the one before it ends along `axis`, and each
 *  length is its value times one scale. */
function endToEnd(boxes: Box[], values: number[], axis: "x" | "y"): boolean {
  const len = (b: Box) => (axis === "x" ? b.w : b.h);
  const start = (b: Box) => (axis === "x" ? b.x : b.y);
  const sigma = len(boxes[0]) / values[0];
  const lengthsOk = boxes.every((b, i) => near(len(b), values[i] * sigma));
  // Along x the chain runs left to right; along y a stack grows upward, so
  // the next part sits above (a smaller screen y).
  const chainOk = boxes.every((b, i) => {
    if (i === 0) return true;
    const prev = boxes[i - 1];
    return axis === "x"
      ? near(start(b), start(prev) + len(prev))
      : near(start(b) + len(b), start(prev));
  });
  return lengthsOk && chainOk;
}

async function main() {
  console.log("\n# a stack inside a stack on the same axis lays its groups end to end");

  const xx = rectsOf(
    await chart(rows, { axes: false })
      .flow(stack({ by: "g", dir: "x" }), stack({ by: "k", dir: "x" }))
      .mark(rect({ w: "v", h: 40 }))
      .toDisplayList({ w: 400, h: 60 })
  );
  check(
    "along x: six parts end to end, one scale",
    xx.length === 6 && endToEnd(xx, rows.map((r) => r.v), "x"),
    show(xx)
  );

  const yy = rectsOf(
    await chart(rows, { axes: false })
      .flow(stack({ by: "g", dir: "y" }), stack({ by: "k", dir: "y" }))
      .mark(rect({ w: 40, h: "v" }))
      .toDisplayList({ w: 60, h: 400 })
  );
  check(
    "along y: six parts end to end, one scale",
    yy.length === 6 && endToEnd(yy, rows.map((r) => r.v), "y"),
    show(yy)
  );

  console.log("\n# inside a spread, each column is as tall as its total (#1357)");

  // The issue's shape: spread by class, stack by sex, stack by survived.
  const titanic = [
    { c: "1st", sex: "m", s: "no", n: 118 },
    { c: "1st", sex: "m", s: "yes", n: 62 },
    { c: "1st", sex: "f", s: "no", n: 4 },
    { c: "1st", sex: "f", s: "yes", n: 141 },
    { c: "crew", sex: "m", s: "no", n: 670 },
    { c: "crew", sex: "m", s: "yes", n: 192 },
    { c: "crew", sex: "f", s: "no", n: 3 },
    { c: "crew", sex: "f", s: "yes", n: 20 },
  ];
  const cols = rectsOf(
    await chart(titanic, { axes: false })
      .flow(
        spread({ by: "c", dir: "x" }),
        stack({ by: "sex", dir: "y" }),
        stack({ by: "s", dir: "y" })
      )
      .mark(rect({ w: 30, h: "n" }))
      .toDisplayList({ w: 200, h: 400 })
  );
  const first = cols.slice(0, 4);
  const crew = cols.slice(4, 8);
  check(
    "each column's parts lie end to end",
    endToEnd(first, titanic.slice(0, 4).map((r) => r.n), "y") &&
      endToEnd(crew, titanic.slice(4, 8).map((r) => r.n), "y"),
    show(cols)
  );
  const height = (bs: Box[]) =>
    Math.max(...bs.map((b) => b.y + b.h)) - Math.min(...bs.map((b) => b.y));
  check(
    "the columns' heights are in the ratio of their totals",
    near(height(first) / height(crew), 325 / 885),
    `${height(first)} / ${height(crew)}`
  );

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
