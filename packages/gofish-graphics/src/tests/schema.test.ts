/**
 * Column types (#984): `chart(data, { schema })` with `Schema.ordered(levels)`
 * (HasOrder) and `.diverging()` (HasMidpoint). Covers the midpoint of an
 * order (the default for odd and even orders, a set midpoint on a boundary,
 * inside a level, and at either end, a missing level), the midpoint's range
 * check, the centered stack's extent fold, the stray-level and signed-part
 * errors (checked where the order is used, so a `filter` in the flow can drop
 * a stray), the HasOrder prerequisite of HasMidpoint, a spread of centered
 * stacks lining up on their midpoints, and the schema keeping the column
 * types (bin()'s units) its data carries.
 *
 * Run: `pnpm build && tsx src/tests/schema.test.ts` (wired as
 * `pnpm test:schema`). The rendering checks import from `dist` for the same
 * lodash-ESM reason as `axisDims.test.ts`.
 *
 * The type-level rule (`.diverging()` exists only after `.ordered(...)`) is
 * enforced by `ColumnSchema#diverging`'s `this` type. The repo's test files
 * are not typechecked, so this file checks the runtime counterpart (a
 * HasMidpoint record without HasOrder, as it would arrive from the wire).
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import {
  applySchema,
  columnTypeOf,
  getColumnTypes,
  orderByLevels,
  stackOrigin,
  type ColumnType,
} from "../ast/schema";
import { interval } from "../util/interval";
import { bin } from "../ast/transforms";
import {
  distributeSpaceFold,
  type StackOrigin,
} from "../ast/constraints/distribute";
import {
  continuousInterval,
  type CONTINUOUS_TYPE,
  CONTINUOUS,
} from "../ast/underlyingSpace";

const { chart, spread, stack, rect, filter, derive, Schema, Color } = GoFish as any;

declare const process: { exit(code: number): never };

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

/** The message of the error `fn` throws (or rejects with), or undefined. */
async function errorOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

type Box = { x: number; y: number; w: number; h: number };
const rectsOf = (dl: any): Box[] => {
  const out: Box[] = [];
  const walk = (it: any) => {
    if (it.kind === "rect") out.push(it);
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

const LEVELS5 = ["SD", "D", "N", "A", "SA"];
const LEVELS4 = ["SD", "D", "A", "SA"];
const centered = (levels: string[], at = levels.length / 2): ColumnType => ({
  HasOrder: { levels },
  HasMidpoint: { at },
});

async function main() {
  console.log("\n# the midpoint of an order");
  {
    const origin = (
      levels: string[],
      keys: string[],
      reverse = false,
      at?: number
    ) =>
      JSON.stringify(
        stackOrigin("r", centered(levels, at), levels, keys, reverse)
      );
    const is = (part: number, fraction: number) =>
      JSON.stringify({ part, fraction, mirrored: true });
    check(
      "odd: the middle of the middle level",
      origin(LEVELS5, LEVELS5) ===
        JSON.stringify({ part: 2, fraction: 0.5, mirrored: true })
    );
    check(
      "even: the boundary between the two middle levels",
      origin(LEVELS4, LEVELS4) ===
        JSON.stringify({ part: 2, fraction: 0, mirrored: true })
    );
    check(
      "a missing first level does not move the center",
      origin(LEVELS5, ["D", "N", "A", "SA"]) ===
        JSON.stringify({ part: 1, fraction: 0.5, mirrored: true })
    );
    check(
      "a missing middle level leaves the center on its boundary",
      origin(LEVELS5, ["SD", "D", "A", "SA"]) ===
        JSON.stringify({ part: 2, fraction: 0, mirrored: true })
    );
    check(
      "parts all before the center: the last part's head",
      origin(LEVELS5, ["SD", "D"]) ===
        JSON.stringify({ part: 1, fraction: 1, mirrored: true })
    );
    check(
      "a reversed stack keeps the center on the same level",
      origin(LEVELS4, LEVELS4, true) ===
        JSON.stringify({ part: 1, fraction: 0, mirrored: true })
    );
    check(
      "midpoint 2 of 5: the boundary after the second level",
      origin(LEVELS5, LEVELS5, false, 2) === is(2, 0)
    );
    check(
      "midpoint 2.25 of 5: a quarter of the way through the third level",
      origin(LEVELS5, LEVELS5, false, 2.25) === is(2, 0.25)
    );
    check(
      "midpoint 0: the first level's tail",
      origin(LEVELS5, LEVELS5, false, 0) === is(0, 0)
    );
    check(
      "midpoint n: the last level's head",
      origin(LEVELS5, LEVELS5, false, 5) === is(4, 1)
    );
    check(
      "a midpoint inside a missing level: the tail of the next present part",
      origin(LEVELS5, ["SD", "D", "A", "SA"], false, 2.25) === is(2, 0)
    );
    check(
      "a midpoint inside a missing last level: the last present part's head",
      origin(LEVELS5, ["SD", "D", "N"], false, 4.5) === is(2, 1)
    );
    check(
      "reversed, midpoint 2.25 of 5: three quarters through the third level",
      origin(LEVELS5, LEVELS5, true, 2.25) === is(2, 0.75)
    );
    check(
      "reversed, midpoint 2 of 5: the tail of the second level",
      origin(LEVELS5, LEVELS5, true, 2) === is(1, 0)
    );
    check(
      "reversed, midpoint 0: the head of the first level, laid out last",
      origin(LEVELS5, LEVELS5, true, 0) === is(0, 1)
    );
    check(
      "no HasMidpoint: the default origin",
      stackOrigin("r", { HasOrder: { levels: LEVELS5 } }, LEVELS5, LEVELS5) ===
        undefined
    );
    const shuffled = await errorOf(() =>
      stackOrigin(
        "r",
        centered(LEVELS5),
        ["A", "SD", "N", "D", "SA"],
        ["A", "SD", "N"]
      )
    );
    check(
      "parts out of order are an error",
      shuffled !== undefined && shuffled.includes("HasMidpoint"),
      shuffled
    );
  }

  console.log("\n# a centered stack's extent fold");
  {
    const fold = (
      values: number[],
      origin: StackOrigin<number> = { part: 0, fraction: 0, mirrored: false }
    ) =>
      distributeSpaceFold(
        values.map((v) => CONTINUOUS(interval(0, v), "free")),
        values.map((_, i) => `k${i}`),
        {
          axis: 1,
          spacing: 0,
          anchor: "edge",
          glue: true,
          measure: "r",
          origin,
        }
      ) as CONTINUOUS_TYPE;
    const odd = fold([5, 10, 20, 40, 25], {
      part: 2,
      fraction: 0.5,
      mirrored: true,
    });
    check(
      "odd: the parts before the center and half the middle lie below 0",
      JSON.stringify(continuousInterval(odd)) ===
        JSON.stringify({ min: -25, max: 75 }),
      JSON.stringify(continuousInterval(odd))
    );
    check("a centered stack's space is mirrored", odd.mirrored === true);
    const even = fold([10, 20, 30, 40], {
      part: 2,
      fraction: 0,
      mirrored: true,
    });
    check(
      "even: the two middle levels meet at 0",
      JSON.stringify(continuousInterval(even)) ===
        JSON.stringify({ min: -30, max: 70 })
    );
    const plain = fold([10, 20]);
    check(
      "the default origin is the first part's tail",
      JSON.stringify(continuousInterval(plain)) ===
        JSON.stringify({ min: 0, max: 30 }) && plain.mirrored === undefined
    );
    const signed = await errorOf(() =>
      fold([10, -5, 20], { part: 1, fraction: 0.5, mirrored: true })
    );
    check(
      "a negative part in a centered stack is an error naming HasMidpoint",
      signed !== undefined &&
        signed.includes("HasMidpoint") &&
        signed.includes(`"k1"`),
      signed
    );
    const rendered = await errorOf(() =>
      chart(
        [
          { r: "SD", n: 10 },
          { r: "N", n: -5 },
          { r: "A", n: 20 },
        ],
        { schema: { r: Schema.ordered(LEVELS5).diverging() } }
      )
        .flow(stack({ by: "r", dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a chart stacking a negative count on a centered column fails loudly",
      rendered !== undefined &&
        rendered.includes("HasMidpoint") &&
        rendered.includes(`"N"`),
      rendered
    );
  }

  console.log("\n# levels outside the order");
  {
    const rows = [
      { r: "SD" },
      { r: "Don't know" },
      { r: "A" },
      { r: "Refused" },
    ];
    // Checked where the order is used (a split, a color scale), not when the
    // chart types its data.
    const message = await errorOf(() =>
      orderByLevels(
        "r",
        { levels: LEVELS5 },
        rows.map((row) => row.r)
      )
    );
    check(
      "a stray level is an error naming the column and the levels",
      message !== undefined &&
        message.includes(`"r"`) &&
        message.includes(`"Don't know"`) &&
        message.includes(`"Refused"`),
      message
    );
    const rendered = await errorOf(() =>
      chart(
        rows.map((row) => ({ ...row, n: 1 })),
        {
          schema: { r: Schema.ordered(LEVELS5) },
        }
      )
        .flow(stack({ by: "r", dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a chart with a stray level fails loudly",
      rendered !== undefined && rendered.includes("Don't know"),
      rendered
    );
    // A derive that renames levels keeps the order (its values are still
    // text), so the error names the annotation that fixes it.
    const renamed = await errorOf(() =>
      chart(
        LEVELS5.map((r) => ({ r, n: 1 })),
        { schema: { r: Schema.ordered(LEVELS5) } }
      )
        .flow(
          derive((d: any[]) => d.map((row) => ({ ...row, r: `${row.r}!` }))),
          stack({ by: "r", dir: "x" })
        )
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "the stray-level error names derive(fn, { schema }) as a fix",
      renamed !== undefined &&
        renamed.includes("filter those rows out") &&
        renamed.includes("derive(fn, { schema })"),
      renamed
    );
  }

  console.log("\n# HasMidpoint needs HasOrder and a midpoint on the order");
  {
    check("Schema has no `diverging` factory", !("diverging" in Schema));
    check(
      "`.diverging()` follows `.ordered(...)`, its midpoint n / 2",
      JSON.stringify(Schema.ordered(["a", "b", "c"]).diverging()) ===
        JSON.stringify({
          HasOrder: { levels: ["a", "b", "c"] },
          HasMidpoint: { at: 1.5 },
        })
    );
    check(
      "`.diverging({ midpoint })` writes the midpoint",
      JSON.stringify(Schema.ordered(LEVELS5).diverging({ midpoint: 2 })) ===
        JSON.stringify({
          HasOrder: { levels: LEVELS5 },
          HasMidpoint: { at: 2 },
        })
    );
    // The same literals as `TestSchema` in gofish-python/tests/test_ast.py:
    // the two languages raise the same messages, word for word.
    const order = `the edges of the order ["SD", "D", "N", "A", "SA"]`;
    const offMessages: [unknown, string][] = [
      [-0.5, `diverging: midpoint -0.5 is outside 0..5, ${order}.`],
      [5.5, `diverging: midpoint 5.5 is outside 0..5, ${order}.`],
      [6, `diverging: midpoint 6 is outside 0..5, ${order}.`],
    ];
    for (const at of [NaN, Infinity, "2", true]) {
      offMessages.push([
        at,
        `diverging: midpoint must be a finite number from 0 to 5, ${order}.`,
      ]);
    }
    for (const [at, expected] of offMessages) {
      const eager = await errorOf(() =>
        Schema.ordered(LEVELS5).diverging({ midpoint: at })
      );
      check(
        `.diverging({ midpoint: ${String(at)} }) throws at once`,
        eager === expected,
        eager
      );
      const wire = await errorOf(() =>
        columnTypeOf("r", {
          HasOrder: { levels: LEVELS5 },
          HasMidpoint: { at },
        } as any)
      );
      check(
        `a wire record with midpoint ${String(at)} throws the same message`,
        wire === expected,
        wire
      );
    }
    const charted = await errorOf(() =>
      chart([{ r: "SD", n: 1 }], {
        schema: { r: centered(LEVELS5, 6) },
      })
        .flow(stack({ by: "r", dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "chart checks a wire record's midpoint",
      charted === `diverging: midpoint 6 is outside 0..5, ${order}.`,
      charted
    );
    const message = await errorOf(() =>
      columnTypeOf("r", { HasMidpoint: { at: 1 } })
    );
    check(
      "a HasMidpoint record without HasOrder is an error",
      message !== undefined &&
        message.includes("HasOrder") &&
        message.includes(".diverging()"),
      message
    );
  }

  console.log("\n# a spread of centered stacks lines up on the midpoint");
  {
    // Row "q2" has no "SD" responses; its center must not move.
    const counts: [string, number[]][] = [
      ["q1", [5, 10, 20, 40, 25]],
      ["q2", [0, 30, 10, 20, 40]],
      ["q3", [25, 25, 30, 10, 10]],
    ];
    const rows = counts.flatMap(([q, cs]) =>
      cs.flatMap((n, i) => (n === 0 ? [] : [{ q, r: LEVELS5[i], n }]))
    );
    // Shuffle so the order comes from the schema, not from the data.
    rows.reverse();
    const dl = await chart(rows, {
      schema: { r: Schema.ordered(LEVELS5).diverging() },
    })
      .flow(spread({ by: "q", dir: "y" }), stack({ by: "r", dir: "x" }))
      .mark(rect({ w: "n" }))
      .toDisplayList({ w: 300, h: 200 });
    const boxes = rectsOf(dl);
    // The rows come in data order (q3, q2, q1, reversed); within a row the
    // parts follow the schema's order, so each row's Neutral is its third
    // part, or its second when SD is missing.
    const byRow = [boxes.slice(0, 5), boxes.slice(5, 9), boxes.slice(9, 14)];
    const neutral = [byRow[0][2], byRow[1][1], byRow[2][2]];
    const centers = neutral.map((b) => b.x + b.w / 2);
    check(
      "every row's Neutral middle sits on one x",
      centers.every((c) => Math.abs(c - centers[0]) < 1e-6),
      JSON.stringify(centers)
    );
    check(
      "parts follow the schema order within a row",
      byRow.every((row) => row.every((b, i) => i === 0 || b.x > row[i - 1].x))
    );
  }

  console.log("\n# a schema keeps what the data array already carries");
  {
    const binned = bin([{ x: 1 }, { x: 2 }, { x: 7 }], "x");
    const typed = await applySchema(binned, { count: Schema.ordered([0, 1, 2]) });
    check(
      "bin()'s unit survives a schema for another column",
      getColumnTypes(typed)?.start?.HasUnit?.quantity === "x",
      JSON.stringify(getColumnTypes(typed))
    );
    check(
      "a schema entry is the column's whole type",
      JSON.stringify(getColumnTypes(typed)?.count) ===
        JSON.stringify({ HasOrder: { levels: [0, 1, 2] } }),
      JSON.stringify(getColumnTypes(typed)?.count)
    );
    check(
      "applySchema does not tag the caller's array",
      getColumnTypes(binned)?.count?.HasOrder === undefined
    );
  }

  console.log("\n# a value outside the order fails where the order is used");
  {
    const rows = [
      { r: "SD", n: 1, q: "q0" },
      { r: "Refused", n: 1, q: "q1" },
      { r: "A", n: 1, q: "q2" },
    ];
    const filtered = await errorOf(() =>
      chart(rows, { schema: { r: Schema.ordered(LEVELS5) } })
        .flow(
          filter((row: any) => row.r !== "Refused"),
          stack({ by: "r", dir: "x" })
        )
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a filter in the flow can drop a stray level",
      filtered === undefined,
      filtered
    );
    const kept = await errorOf(() =>
      chart(rows, { schema: { r: Schema.ordered(LEVELS5) } })
        .flow(
          filter((row: any) => row.n > 0),
          stack({ by: "r", dir: "x" })
        )
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a filter that keeps a stray level keeps the order, so the error fires",
      kept !== undefined && kept.includes(`"Refused"`),
      kept
    );
    const colored = await errorOf(() =>
      chart(rows, {
        schema: { r: Schema.ordered(LEVELS5) },
        color: Color.palette(["red", "green", "blue", "cyan", "magenta"]),
      })
        .flow(spread({ by: "q", dir: "x" }))
        .mark(rect({ h: "n", fill: "r" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a stray level a color scale reads is an error",
      colored !== undefined && colored.includes(`"Refused"`),
      colored
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
