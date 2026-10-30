/**
 * Column types (#984): `chart(data, { schema })` with a unit's `domain`
 * (`Domain.discrete`: HasLevels; `Domain.ordered`: HasLevels and HasOrder) and
 * `Trait.diverging()` (HasMidpoint). Covers the unit definition's checks,
 * nominal levels beside ordered ones, the midpoint of an
 * order (the default for odd and even orders, a set midpoint on a boundary,
 * inside a level, and at either end, a missing level), the midpoint's range
 * check, the centered stack's extent fold, the stray-level and signed-part
 * errors (checked where the order is used, so a `filter` in the flow can drop
 * a stray), the HasOrder prerequisite of HasMidpoint, the one-unit rule, the
 * levels-fit rule, a spread of centered stacks lining up on their midpoints,
 * and the schema keeping the column types (a column's quantity and unit)
 * its data carries.
 *
 * Run: `pnpm build && tsx src/tests/schema.test.ts` (wired as
 * `pnpm test:schema`). The rendering checks import from `dist` for the same
 * lodash-ESM reason as `axisDims.test.ts`.
 *
 * The repo's test files are not typechecked, so this file checks the runtime
 * counterparts of the builder's type-level rules (schema.ts), on records as
 * they would arrive from the wire.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import {
  applySchema,
  columnTypeOf,
  getColumnTypes,
  orderByLevels,
  setColumnTypes,
  stackOrigin,
  Unit as SrcUnit,
  type ColumnType,
} from "../ast/schema";
import { interval } from "../util/interval";
import schemaWireFixture from "./fixtures/schema-wire.json";
import { textsOf } from "./testHelpers";
import {
  distributeSpaceFold,
  type StackOrigin,
} from "../ast/constraints/distribute";
import {
  continuousInterval,
  type CONTINUOUS_TYPE,
  CONTINUOUS,
} from "../ast/underlyingSpace";

const {
  chart,
  spread,
  stack,
  scatter,
  layer,
  rect,
  circle,
  filter,
  derive,
  chunk,
  Unit,
  Domain,
  Trait,
  Serialize,
  Color,
} = GoFish as any;

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

/** A display list as JSON with its render-global node ids left out, so two
 *  renders compare by what they draw. */
const drawn = (dl: any): string =>
  JSON.stringify(dl, (k, v) => (k === "id" ? undefined : v));

const LEVELS5 = ["SD", "D", "N", "A", "SA"];
const LEVELS4 = ["SD", "D", "A", "SA"];
const centered = (levels: string[], at = levels.length / 2): ColumnType => ({
  HasLevels: { levels },
  HasOrder: {},
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
      stackOrigin(
        "r",
        { HasLevels: { levels: LEVELS5 }, HasOrder: {} },
        LEVELS5,
        LEVELS5
      ) === undefined
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
        {
          schema: {
            r: Unit({
              domain: Domain.ordered(LEVELS5),
              traits: [Trait.diverging()],
            }),
          },
        }
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
          schema: { r: Unit({ domain: Domain.ordered(LEVELS5) }) },
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
        { schema: { r: Unit({ domain: Domain.ordered(LEVELS5) }) } }
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

  console.log("\n# a column's domain is computed, never declared");
  {
    // The wire form of a schema is a record, so nothing but this check
    // stops one from carrying a domain: declaring one is not supported yet.
    const declared = await errorOf(() =>
      applySchema([{ v: 1 }, { v: 2 }], {
        v: { HasDomain: { lo: 0, hi: 10 } },
      } as any)
    );
    check(
      "a schema record with HasDomain is a loud error",
      declared?.includes('schema: column "v" declares HasDomain') === true &&
        declared.includes("not supported yet"),
      declared
    );
  }

  console.log("\n# HasMidpoint needs HasOrder and a midpoint on the order");
  {
    check("the Schema namespace is gone", !("Schema" in GoFish));
    check(
      "Trait.diverging() implies the order, its midpoint n / 2",
      JSON.stringify(
        Unit({
          domain: Domain.ordered(["a", "b", "c"]),
          traits: [Trait.diverging()],
        }).type
      ) ===
        JSON.stringify({
          HasLevels: { levels: ["a", "b", "c"] },
          HasOrder: {},
          HasMidpoint: { at: 1.5 },
        })
    );
    check(
      "Trait.diverging(midpoint) writes the midpoint",
      JSON.stringify(
        Unit({ domain: Domain.ordered(LEVELS5), traits: [Trait.diverging(2)] })
          .type
      ) ===
        JSON.stringify({
          HasLevels: { levels: LEVELS5 },
          HasOrder: {},
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
        Unit({ domain: Domain.ordered(LEVELS5), traits: [Trait.diverging(at)] })
      );
      check(
        `Trait.diverging(${String(at)}) throws at once`,
        eager === expected,
        eager
      );
      const wire = await errorOf(() =>
        columnTypeOf("r", {
          HasLevels: { levels: LEVELS5 },
          HasOrder: {},
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
      columnTypeOf("r", {
        HasLevels: { levels: LEVELS5 },
        HasMidpoint: { at: 1 },
      })
    );
    check(
      "a HasMidpoint record without HasOrder is an error",
      message !== undefined &&
        message.includes("HasOrder") &&
        message.includes("Trait.diverging()"),
      message
    );
    const noLevels = await errorOf(() => columnTypeOf("r", { HasOrder: {} }));
    check(
      "a HasOrder record without HasLevels is an error",
      noLevels ===
        `schema: column "r" has HasOrder but no HasLevels. An order is an ` +
          `order of levels; declare them with a unit's domain: ` +
          `Unit({ domain: Domain.ordered(levels) }).`,
      noLevels
    );
    // A time is a column in a unit read on a calendar: Unit.time() writes
    // the instant, its zone, and its difference unit, a duration.
    check(
      "Unit.time({ zone }) is the instant in that zone, differing by durations",
      JSON.stringify(
        columnTypeOf("t", SrcUnit.time({ zone: "Asia/Tokyo" }))
      ) ===
        JSON.stringify({
          HasUnit: {
            unit: "instant",
            traits: {},
            difference: { unit: "duration", traits: { CanAdd: {} } },
            zone: "Asia/Tokyo",
          },
        })
    );
    check(
      "a column record names a time column",
      JSON.stringify(
        columnTypeOf("t", { name: "Sold", unit: SrcUnit.time() })
      ) ===
        JSON.stringify({
          HasQuantity: { name: "Sold" },
          ...SrcUnit.time().type,
        })
    );
    check(
      "Unit.duration adds up",
      SrcUnit.duration.type.HasUnit?.traits?.CanAdd !== undefined &&
        SrcUnit.duration.name === "duration"
    );
    // The levels-fit rule: text levels are not amounts, numbers are.
    const textUnit = await errorOf(() =>
      columnTypeOf("r", {
        HasLevels: { levels: LEVELS5 },
        HasUnit: { unit: "pts" },
      })
    );
    check(
      "a record with text levels and a unit is an error",
      textUnit ===
        `schema: column "r" has the level "SD", which is not a value HasUnit accepts.`,
      textUnit
    );
    check(
      "numeric levels take a unit",
      columnTypeOf("likert", {
        HasLevels: { levels: [1, 2, 3, 4, 5] },
        HasUnit: { unit: "pts" },
      }).HasUnit?.unit === "pts"
    );
  }

  console.log("\n# a unit's domain and traits");
  {
    const Stars = SrcUnit("stars", { domain: Domain.ordered([1, 2, 3, 4, 5]) });
    check(
      "a named unit with a domain is a unit with levels",
      JSON.stringify(Stars.type) ===
        JSON.stringify({
          HasUnit: { unit: "stars", symbol: "stars", traits: {} },
          HasLevels: { levels: [1, 2, 3, 4, 5] },
          HasOrder: {},
        }) && Stars.name === "stars",
      JSON.stringify(Stars.type)
    );
    check(
      "a column record names a column in it",
      JSON.stringify(
        columnTypeOf("rating", { name: "Rating", unit: Stars })
      ) === JSON.stringify({ HasQuantity: { name: "Rating" }, ...Stars.type })
    );
    const Party = Unit({ domain: Domain.discrete(["Dem", "Rep", "Ind"]) });
    check(
      "Domain.discrete is nominal: levels and no order",
      JSON.stringify(Party.type) ===
        JSON.stringify({ HasLevels: { levels: ["Dem", "Rep", "Ind"] } }) &&
        Party.name === undefined,
      JSON.stringify(Party.type)
    );
    check(
      "Unit(name, { traits: [Trait.summable()] }) has CanAdd",
      JSON.stringify(Unit("USD", { traits: [Trait.summable()] }).type) ===
        JSON.stringify({
          HasUnit: { unit: "USD", symbol: "USD", traits: { CanAdd: {} } },
        })
    );
    check(
      "a Unit is immutable",
      Object.isFrozen(Stars) &&
        Object.isFrozen(Stars.type) &&
        Object.isFrozen(Stars.type.HasLevels!.levels)
    );
    // The same literals as `test_unit_definition_errors` in
    // gofish-python/tests/test_ast.py.
    const errors: [string, () => unknown, string][] = [
      [
        "a unit with neither a name nor a domain",
        () => Unit({ traits: [Trait.diverging()] } as any),
        `Unit needs a name, a domain, or both: Unit("USD"), ` +
          `Unit({ domain: Domain.discrete(["low", "high"]) }).`,
      ],
      [
        "a midpoint on a unit's amounts",
        () => Unit("pp", { traits: [Trait.summable(), Trait.diverging(0)] }),
        `Unit("pp"): Trait.diverging() needs an ordered domain: a midpoint ` +
          `is a point along an order, so list the levels in ` +
          `Domain.ordered(levels). A midpoint on a unit's amounts is not ` +
          `supported yet.`,
      ],
      [
        "a midpoint on unordered levels",
        () =>
          Unit({
            domain: Domain.discrete(LEVELS5),
            traits: [Trait.diverging()],
          }),
        `Unit: Trait.diverging() needs an ordered domain, but ` +
          `Domain.discrete(levels) is unordered. A midpoint is a point ` +
          `along an order: use Domain.ordered(levels).`,
      ],
      [
        "a summable unit without a name",
        () =>
          Unit({ domain: Domain.discrete([1, 2]), traits: [Trait.summable()] }),
        `Unit: Trait.summable() needs a name. Whether amounts add up ` +
          `belongs to their unit, which is known by its name: ` +
          `Unit("USD", { traits: [Trait.summable()] }).`,
      ],
      [
        "a trait listed twice",
        () => Unit("USD", { traits: [Trait.summable(), Trait.summable()] }),
        `Unit("USD") lists Trait.summable() twice.`,
      ],
      [
        "two midpoints",
        () =>
          Unit({
            domain: Domain.ordered(LEVELS5),
            traits: [Trait.diverging(1), Trait.diverging(2)],
          }),
        `Unit lists Trait.diverging() twice.`,
      ],
      [
        "a bare list as a domain",
        () => Unit("pp", { domain: [1, 2] } as any),
        `Unit("pp"): domain must be a Domain: Domain.discrete(levels) or ` +
          `Domain.ordered(levels), got [1,2]. A domain that is an interval ` +
          `is not supported yet.`,
      ],
      [
        "an interval domain",
        () => Unit("pp", { domain: { lo: 0, hi: 1 } } as any),
        `Unit("pp"): domain must be a Domain: Domain.discrete(levels) or ` +
          `Domain.ordered(levels), got {"lo":0,"hi":1}. A domain that is an ` +
          `interval is not supported yet.`,
      ],
      [
        "a trait that is not one",
        () => Unit("USD", { traits: ["summable"] } as any),
        `Unit("USD") has the trait "summable". A unit's traits are ` +
          `Trait.diverging() and Trait.summable().`,
      ],
      [
        "an unknown option",
        () => Unit("USD", { levels: [1] } as any),
        `Unit("USD") has the unknown option "levels". A unit takes domain ` +
          `and traits.`,
      ],
      [
        "text levels in a named unit",
        () => Unit("pts", { domain: Domain.discrete(["low", "high"]) }),
        `Unit("pts") has the level "low", which is not a value HasUnit ` +
          `accepts.`,
      ],
      [
        "a level listed twice",
        () => Domain.ordered(["a", "b", "a"]),
        `Domain.ordered: the level "a" is listed twice. Each level is listed ` +
          `once, in its place.`,
      ],
      [
        "a level listed twice in a domain written as a record",
        () => Unit({ domain: { kind: "discrete", levels: [1, 2, 1] } } as any),
        `Domain.discrete: the level 1 is listed twice. Each level is listed ` +
          `once, in its place.`,
      ],
      [
        "a domain with no levels",
        () => Domain.ordered([]),
        `Domain.ordered: levels must list at least one level, e.g. ` +
          `Domain.ordered(["low", "mid", "high"]).`,
      ],
      [
        "a name that is not a string",
        () => Unit(42 as any),
        `Unit: the name must be a string, got 42`,
      ],
      [
        "an undefined name",
        () => Unit(undefined as any),
        `Unit: the name must be a string, got undefined`,
      ],
    ];
    for (const [name, fn, expected] of errors) {
      const got = await errorOf(fn);
      check(`${name} throws at once`, got === expected, got);
    }

    // Nominal levels lay groups out in the list's order and check strays,
    // like ordered ones; only the order (an ordinal axis's alignment, a
    // midpoint) differs.
    const votes = [
      { party: "Ind", n: 1 },
      { party: "Rep", n: 2 },
      { party: "Dem", n: 3 },
    ];
    const bars = (unit: unknown) =>
      chart(votes, { schema: { party: unit }, axes: true })
        .flow(spread({ by: "party", dir: "x" }))
        .mark(rect({ h: "n", w: 10 }))
        .toDisplayList({ w: 120, h: 100 });
    const nominal = textsOf(await bars(Party)).filter((t) =>
      ["Dem", "Rep", "Ind"].includes(t)
    );
    check(
      "a nominal domain lays its groups out in the list's order",
      nominal.join() === "Dem,Rep,Ind",
      nominal.join()
    );
    const strays = await errorOf(() =>
      bars(Unit({ domain: Domain.discrete(["Dem", "Rep"]) }))
    );
    check(
      "a value outside a nominal domain is an error",
      strays !== undefined &&
        strays.includes('"Ind"') &&
        strays.includes("HasLevels"),
      strays
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
      schema: {
        r: Unit({
          domain: Domain.ordered(LEVELS5),
          traits: [Trait.diverging()],
        }),
      },
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
    const edge = { HasQuantity: { name: "x" } };
    const binned = setColumnTypes(
      [
        { start: 0, end: 5, count: 2 },
        { start: 5, end: 10, count: 1 },
      ],
      { start: edge, end: edge, count: { HasUnit: { unit: "count" } } }
    );
    const typed = await applySchema(binned, {
      count: SrcUnit({ domain: Domain.ordered([0, 1, 2]) }),
    });
    check(
      "a column's quantity survives a schema for another column",
      getColumnTypes(typed)?.start?.HasQuantity?.name === "x",
      JSON.stringify(getColumnTypes(typed))
    );
    check(
      "a schema entry is the column's whole type, with its domain",
      JSON.stringify(getColumnTypes(typed)?.count) ===
        JSON.stringify({
          HasLevels: { levels: [0, 1, 2] },
          HasOrder: {},
          HasDomain: { lo: 1, hi: 2 },
        }),
      JSON.stringify(getColumnTypes(typed)?.count)
    );
    check(
      "applySchema does not tag the caller's array",
      getColumnTypes(binned)?.count?.HasLevels === undefined
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
      chart(rows, {
        schema: { r: Unit({ domain: Domain.ordered(LEVELS5) }) },
      })
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
      chart(rows, {
        schema: { r: Unit({ domain: Domain.ordered(LEVELS5) }) },
      })
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
        schema: { r: Unit({ domain: Domain.ordered(LEVELS5) }) },
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

  console.log("\n# a legend over two columns with equal levels (#1197)");
  {
    // Two columns, each in its own unit with the same levels (as two columns
    // read from the wire are: each has its own copy of the levels). The
    // legend follows the levels, not the order the values are first seen.
    const rows = [
      { g1: "high", g2: "mid", a: 1, b: 3 },
      { g1: "low", g2: "high", a: 2, b: 1 },
    ];
    const grade = () => Unit({ domain: Domain.ordered(["low", "mid", "high"]) });
    const dl = await chart(rows, {
      schema: { g1: grade(), g2: grade() },
      color: Color.palette(["red", "green", "blue"]),
    })
      .flow(scatter({ x: "a", y: "b" }))
      .mark(layer([circle({ r: 3, fill: "g1" }), circle({ r: 2, fill: "g2" })]))
      .toDisplayList({ w: 100, h: 100 });
    const legend = textsOf(dl).filter((t) =>
      ["low", "mid", "high"].includes(t)
    );
    check(
      "two columns whose levels are equal lists order the legend by the levels",
      legend.join() === "low,mid,high",
      legend.join()
    );
  }

  console.log("\n# a split with no `by` is a split by row identity (#998)");
  {
    const grades = [
      { grade: "high", a: 1, b: 3 },
      { grade: "low", a: 2, b: 1 },
      { grade: "mid", a: 3, b: 2 },
    ];
    const dots = (by?: unknown) =>
      chart(grades, {
        schema: {
          grade: Unit({
            domain: Domain.ordered(["low", "mid", "high"]),
          }),
        },
        color: Color.palette(["red", "green", "blue"]),
      })
        .flow(scatter({ ...(by === undefined ? {} : { by }), x: "a", y: "b" }))
        .mark(circle({ r: 3, fill: "grade" }))
        .toDisplayList({ w: 100, h: 100 });
    const legend = textsOf(await dots()).filter((t) =>
      ["low", "mid", "high"].includes(t)
    );
    check(
      "a mark under a scatter with no `by` keeps the column's order: the legend reads low, mid, high",
      legend.join() === "low,mid,high",
      legend.join()
    );
    // No `by` is `chunk(1)`, a position key. (A key function returning the
    // row's position is not the same thing: its keys are values, which
    // label an axis when axes are on.)
    const noBy = drawn(await dots());
    check(
      "no `by` renders exactly as `by: chunk(1)`",
      noBy === drawn(await dots(chunk(1)))
    );

    const units = Array.from({ length: 7 }, (_, i) => ({
      i,
      k: i % 2 ? "x" : "y",
    }));
    const grid = (by: unknown) =>
      chart(units, { color: Color.palette(["red", "blue"]), axes: false })
        .flow(
          spread({ by, dir: "y", spacing: 1 }),
          spread({ dir: "x", spacing: 1 })
        )
        .mark(rect({ w: 4, h: 4, fill: "k" }))
        .toDisplayList({ w: 100, h: 100 });
    const chunked = await grid(chunk(3));
    check(
      "with no axes, `by: chunk(3)` renders exactly as `by` row position over 3",
      drawn(chunked) ===
        drawn(await grid((_r: unknown, i: number) => Math.floor(i / 3)))
    );
    const cells = rectsOf(chunked).filter((r: any) => r.datum !== undefined);
    const ys = [...new Set(cells.map((r) => r.y))];
    check(
      "`chunk(3)` over 7 rows makes 3 rows of rects",
      ys.length === 3 && cells.length === 7,
      JSON.stringify(ys)
    );
    check(
      "`chunk(3)` keys name no field, so they draw no axis labels",
      textsOf(chunked).every((t) => !["0", "1", "2"].includes(t)),
      textsOf(chunked).join()
    );
    // Only a position key (no `by`, or `chunk(n)`) is synthetic. A key
    // function's keys are values like a field's: they label a category
    // axis, which has no title, since no field names it.
    const eras = textsOf(
      await chart(
        [
          { year: 1990, v: 1 },
          { year: 2010, v: 3 },
          { year: 2020, v: 2 },
        ],
        { axes: true }
      )
        .flow(
          spread({
            by: (d: { year: number }) => (d.year > 2000 ? "new" : "old"),
            dir: "x",
          })
        )
        .mark(rect({ w: 10, h: 10 }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a key function's category axis is labeled by its keys, with no title",
      eras.join() === "old,new",
      eras.join()
    );
    const chunkAxes = textsOf(
      await chart(units, { axes: true })
        .flow(spread({ by: chunk(3), dir: "x" }))
        .mark(rect({ w: 4, h: 4 }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a `chunk(n)` key draws no axis even when axes are on",
      chunkAxes.length === 0,
      chunkAxes.join()
    );

    // An empty scope rendered on its own has no data: its mark gets none,
    // and the schema has nothing to type.
    const alone = await chart({ w: 100, h: 100 })
      .mark(rect({ x: 0, y: 0, w: 10, h: 10 }))
      .toDisplayList({ w: 100, h: 100 })
      .then(
        (dl: any) => rectsOf(dl).length,
        (e: Error) => e.message
      );
    check("an empty `chart()` renders on its own", alone === 1, String(alone));

    const seen: unknown[] = [];
    await chart(grades)
      .flow(spread({ dir: "x" }))
      .mark(
        rect({ w: 4, h: 4 }).label((d: unknown) => {
          seen.push(d);
          return "";
        })
      )
      .toDisplayList({ w: 100, h: 100 });
    check(
      "a mark under a split with no `by` gets `[row]`",
      seen.length === 3 &&
        seen.every((d) => Array.isArray(d) && d.length === 1),
      JSON.stringify(seen)
    );

    const nested = [[{ v: 1 }, { v: 2 }], [{ v: 3 }]];
    const items: unknown[] = [];
    await chart(nested)
      .flow(spread({ dir: "x" }))
      .mark(
        rect({ w: 4, h: 4 }).label((d: unknown) => {
          items.push(d);
          return "";
        })
      )
      .toDisplayList({ w: 100, h: 100 });
    check(
      "a split never looks inside an item: an array item is one item, `[item]`",
      JSON.stringify(items) === JSON.stringify(nested.map((x) => [x])),
      JSON.stringify(items)
    );
  }

  console.log("\n# units and column records cross the wire as traits");
  {
    // The same schema, spelled in Python, writes the same wire form: Python's
    // test_ast.py compares its `to_ir()` against this one fixture.
    const USD = Unit("USD", { traits: [Trait.summable()] });
    const Celsius = Unit("°C");
    const Stars = Unit("stars", {
      domain: Domain.ordered([1, 2, 3, 4, 5]),
    });
    const doc = await Serialize.toJSON(
      chart([{ balance: 1 }], {
        schema: {
          balance: { name: "Balance", unit: USD },
          revenue: USD,
          area: "km²",
          temp: { unit: Celsius },
          region: Unit({
            domain: Domain.ordered(["n", "s"]),
            traits: [Trait.diverging()],
          }),
          party: Unit({ domain: Domain.discrete(["Dem", "Rep", "Ind"]) }),
          rating: { name: "Rating", unit: Stars },
          day: Unit.time({ zone: "UTC" }),
          sold: { name: "Sold", unit: Unit.time({ zone: "America/New_York" }) },
          wait: Unit.duration,
        },
      }).mark(rect({}))
    );
    const sorted = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(sorted)
        : v !== null && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, sorted(x)])
            )
          : v;
    const wire = JSON.stringify(sorted(doc.root.options?.schema));
    const fixture = JSON.stringify(sorted(schemaWireFixture));
    check(
      "a schema of Units, names and records serializes to the shared fixture",
      wire === fixture,
      wire
    );
    // A derive's schema crosses the wire the same way (Python's test_ast.py
    // checks its derive against the fixture too).
    const deriveDoc = await Serialize.toJSON(
      chart([{ balance: 1 }])
        .flow(
          derive((rows: any[]) => rows, {
            schema: {
              balance: { name: "Balance", unit: USD },
              revenue: USD,
              area: "km²",
              temp: { unit: Celsius },
              region: Unit({
                domain: Domain.ordered(["n", "s"]),
                traits: [Trait.diverging()],
              }),
              party: Unit({ domain: Domain.discrete(["Dem", "Rep", "Ind"]) }),
              rating: { name: "Rating", unit: Stars },
              day: Unit.time({ zone: "UTC" }),
              sold: {
                name: "Sold",
                unit: Unit.time({ zone: "America/New_York" }),
              },
              wait: Unit.duration,
            },
          })
        )
        .mark(rect({}))
    );
    const deriveWire = JSON.stringify(
      sorted(deriveDoc.root.operators?.[0]?.schema)
    );
    check(
      "a derive's schema of Units, names and records serializes to the " +
        "shared fixture",
      deriveWire === fixture,
      deriveWire
    );
    // A record of the wire form is read back to the same column types.
    const back = await applySchema([{ balance: 1 }], schemaWireFixture as any);
    check(
      "and the wire form reads back with the area's unit name alone",
      getColumnTypes(back)?.area?.HasUnit?.traits === undefined &&
        getColumnTypes(back)?.revenue?.HasUnit?.traits?.CanAdd !== undefined
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
