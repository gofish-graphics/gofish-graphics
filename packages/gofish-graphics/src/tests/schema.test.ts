/**
 * Column types (#984): `chart(data, { schema })` with `Schema.ordered(levels)`
 * (HasOrder) and `.diverging()` (HasCenter). Covers the center of an order
 * (odd, even, a missing level), the centered stack's extent fold, the
 * stray-level and signed-part errors (checked where the order is used, so a
 * `filter` in the flow can drop a stray), the HasOrder prerequisite of
 * HasCenter, a spread of centered stacks lining up on their centers, and the
 * schema keeping the measure provenance its data carries.
 *
 * Run: `pnpm build && tsx src/tests/schema.test.ts` (wired as
 * `pnpm test:schema`). The rendering checks import from `dist` for the same
 * lodash-ESM reason as `axisDims.test.ts`.
 *
 * The type-level rule (`.diverging()` exists only after `.ordered(...)`) is
 * enforced by `ColumnSchema#diverging`'s `this` type. The repo's test files
 * are not typechecked, so this file checks the runtime counterpart (a
 * HasCenter record without HasOrder, as it would arrive from the wire).
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
import { getMeasureProvenance } from "../ast/data";
import { bin } from "../ast/transforms";
import {
  distributeSpaceFold,
  type StackOrigin,
} from "../ast/constraints/distribute";
import {
  baselineSpan,
  continuousInterval,
  type CONTINUOUS_TYPE,
} from "../ast/underlyingSpace";

const { chart, spread, stack, rect, filter, palette, Schema } = GoFish as any;

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
const centered = (levels: string[]): ColumnType => ({
  HasOrder: { levels },
  HasCenter: true,
});

async function main() {
  console.log("\n# the center of an order");
  {
    const origin = (levels: string[], keys: string[], reverse = false) =>
      JSON.stringify(
        stackOrigin("r", centered(levels), levels, keys, reverse)
      );
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
      "no HasCenter: the default origin",
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
      shuffled !== undefined && shuffled.includes("HasCenter"),
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
        values.map((v) => baselineSpan(v)),
        values.map((_, i) => `k${i}`),
        { spacing: 0, anchor: "edge", glue: true, measure: "r", origin }
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
    const even = fold([10, 20, 30, 40], { part: 2, fraction: 0, mirrored: true });
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
      "a negative part in a centered stack is an error naming HasCenter",
      signed !== undefined &&
        signed.includes("HasCenter") &&
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
        rendered.includes("HasCenter") &&
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
      chart(rows.map((row) => ({ ...row, n: 1 })), {
        schema: { r: Schema.ordered(LEVELS5) },
      })
        .flow(stack({ by: "r", dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a chart with a stray level fails loudly",
      rendered !== undefined && rendered.includes("Don't know"),
      rendered
    );
  }

  console.log("\n# HasCenter needs HasOrder");
  {
    check("Schema has no `diverging` factory", !("diverging" in Schema));
    check(
      "`.diverging()` follows `.ordered(...)`",
      JSON.stringify(Schema.ordered(["a", "b"]).diverging()) ===
        JSON.stringify({ HasOrder: { levels: ["a", "b"] }, HasCenter: true })
    );
    const message = await errorOf(() =>
      columnTypeOf("r", { HasCenter: true })
    );
    check(
      "a HasCenter record without HasOrder is an error",
      message !== undefined &&
        message.includes("HasOrder") &&
        message.includes(".diverging()"),
      message
    );
  }

  console.log("\n# a spread of centered stacks lines up on the center");
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
    const typed = applySchema(binned, { count: Schema.ordered([0, 1, 2]) });
    check(
      "bin()'s measure provenance survives a schema",
      getMeasureProvenance(typed)?.start === "x",
      JSON.stringify(getMeasureProvenance(typed))
    );
    check(
      "applySchema does not tag the caller's array",
      getColumnTypes(binned) === undefined
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
    const colored = await errorOf(() =>
      chart(rows, {
        schema: { r: Schema.ordered(LEVELS5) },
        color: palette(["red", "green", "blue", "cyan", "magenta"]),
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
