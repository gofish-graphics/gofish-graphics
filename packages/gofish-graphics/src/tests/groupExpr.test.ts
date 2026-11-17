/**
 * Group expressions: `field(...).map` and
 * `field(...).reduce`, and the named methods as built-in callbacks on the
 * same evaluation path. Covers the lift for each result shape, the array
 * and chaining errors, the shape of the `unit` option and an undeclared
 * unit refusing to stack, once-per-group caching, and the named methods
 * equal to their callbacks on real data. The type-level half is
 * `marks/groupExpr.typetest.ts`.
 *
 * Run: `pnpm build && tsx src/tests/groupExpr.test.ts` (wired as
 * `pnpm test:group-expr`). Charts come from `dist` for the same lodash-ESM
 * reason as `axisDims.test.ts`; the evaluator is imported from source.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import {
  evalGroup,
  FieldExpr,
  meanOf,
  medianOf,
  sumOf,
} from "../ast/fieldExpr";
import { fun } from "../ast/groupExpr";
import { penguins } from "../data/penguins";

const {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  text,
  partition,
  Bin,
  Unit,
  Trait,
} = GoFish as any;
/** The dist build's field and fun, which its charts read. */
const F = (GoFish as any).field as (name: string) => any;
const dfun = (GoFish as any).fun;

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
const errorOf = async (f: () => unknown): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

const field = (name: string) => new FieldExpr(name);
const rows = [{ v: 3 }, { v: 1 }, { v: 4 }, { v: 1 }, { v: 5 }];

/** Each drawn rect's [x, y, w, h], in paint order. */
const rectsOf = (dl: any): number[][] => {
  const out: number[][] = [];
  const walk = (it: any) => {
    if (it.kind === "rect") out.push([it.x, it.y, it.w, it.h]);
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

const measured = penguins.filter((p) => p["Body Mass (g)"] !== null);

async function main() {
  console.log("\n# the lift, by the shape of the result");
  {
    const n = evalGroup(
      field("v").reduce((xs) => Math.max(...xs)) as any,
      rows,
      undefined
    );
    check(
      "a number is a value",
      n.kind === "value" && n.value === 5,
      JSON.stringify(n)
    );
    const s = field("v").reduce((xs) => ({
      lo: Math.min(...xs),
      at: (i: number) => xs[i],
      nested: { hi: Math.max(...xs) },
    }));
    const lo = evalGroup(s.lo() as any, rows, undefined);
    check(
      "a record's member is read with s.lo()",
      lo.kind === "value" && lo.value === 1
    );
    const at = evalGroup(s.at(2) as any, rows, undefined);
    check(
      "a method member keeps its arguments",
      at.kind === "value" && at.value === 4
    );
    const hi = evalGroup(s.nested().hi() as any, rows, undefined);
    check(
      "a nested record is lifted in turn",
      hi.kind === "value" && hi.value === 5
    );
    const f = field("v").reduce((xs) =>
      fun((t) => t * xs.length, { domain: [0, 2] })
    );
    const g = evalGroup(f as any, rows, undefined);
    check(
      "a Fun is a function",
      g.kind === "function" && g.fun.at(1) === 5,
      JSON.stringify(g.kind)
    );
    const sup = evalGroup(f.support() as any, rows, undefined);
    check(
      "a function's support() is t over its domain",
      sup.kind === "function" &&
        sup.fun.at(1.5) === 1.5 &&
        sup.fun.domain.max === 2
    );
    const m = evalGroup(
      field("v").map((x, i) => x * 10 + i) as any,
      rows,
      undefined
    );
    check(
      "map gives one value per row, fn(x, i, xs)",
      m.kind === "rows" &&
        JSON.stringify(m.values) === JSON.stringify([30, 11, 42, 13, 54])
    );
    const mr = evalGroup(
      field("v")
        .map((x, _i, xs) => x - Math.min(...xs))
        .reduce((xs) => Math.max(...xs)) as any,
      rows,
      undefined
    );
    check(
      "a map before a reduce feeds it",
      mr.kind === "value" && mr.value === 4
    );
  }

  console.log("\n# errors");
  {
    const arr = await errorOf(() =>
      evalGroup(
        field("v").reduce((xs) => [...xs] as any) as any,
        rows,
        undefined
      )
    );
    check("a returned array is an error", arr.includes("is an array"), arr);
    const rec = await errorOf(() =>
      evalGroup(
        field("v").reduce((xs) => ({ lo: xs[0] })) as any,
        rows,
        undefined
      )
    );
    check(
      "a record at a channel says to read a member",
      rec.includes("Read a member"),
      rec
    );
    const after = await errorOf(() =>
      evalGroup(
        (field("v").reduce((xs) => xs.length) as any).sum(),
        rows,
        undefined
      )
    );
    check(
      "a member after a number is a chaining error",
      after.includes("nothing chains after a value"),
      after
    );
    const mapAfter = await errorOf(() =>
      evalGroup(
        (field("v").sum() as any).map((x: number) => x),
        rows,
        undefined
      )
    );
    check(
      "a map after a fold in one group is a chaining error",
      mapAfter.includes("put .map(...) before .sum(...)"),
      mapAfter
    );
    const two = await errorOf(() =>
      evalGroup((field("v").sum() as any).mean(), rows, undefined)
    );
    check(
      "two named folds keep their message",
      two.includes("can only carry one aggregate op; found sum, mean"),
      two
    );
    const noMember = await errorOf(() =>
      evalGroup(
        (field("v").reduce((xs) => ({ lo: xs[0] })) as any).hi(),
        rows,
        undefined
      )
    );
    check(
      "a member the record does not have is an error",
      noMember.includes("has no member hi"),
      noMember
    );
    const fnRect = await errorOf(() =>
      chart(rows)
        .mark(
          rect({
            w: 10,
            h: F("v").reduce((xs: number[]) =>
              dfun((t) => t, { domain: [0, xs.length] })
            ),
          })
        )
        .toDisplayList({ w: 200, h: 200, axes: false })
    );
    check(
      "a reduce that returns a function is an error in a rect",
      fnRect.length > 0,
      fnRect
    );
  }

  console.log("\n# units");
  {
    const q = (e: any) => (evalGroup(e, rows, undefined) as any).quantity;
    const one = q(field("v").reduce((xs) => xs.length, { unit: "g" }));
    check(
      "one unit names the value's unit",
      one?.unit?.unit === "g",
      JSON.stringify(one)
    );
    const s = field("v").reduce((xs) => ({ lo: xs[0], hi: xs[1] }), {
      unit: { lo: "g" },
    });
    check(
      "a record of units gives each member its unit",
      q(s.lo())?.unit?.unit === "g" && q(s.hi())?.undeclared !== undefined
    );
    const all = field("v").reduce((xs) => ({ lo: xs[0] }), { unit: "kg" });
    check("one unit covers every member", q(all.lo())?.unit?.unit === "kg");
    const bad = await errorOf(() =>
      q(
        field("v").reduce((xs) => xs.length, {
          unit: { lo: "g" } as any,
        })
      )
    );
    check(
      "a record of units where the result is a number is an error",
      bad.includes("mirrors the result's shape"),
      bad
    );
    const groups = [
      { k: "a", v: 1 },
      { k: "a", v: 2 },
      { k: "b", v: 3 },
    ];
    const undeclared = await errorOf(() =>
      chart(groups)
        .flow(stack({ by: "k", dir: "y" }))
        .mark(rect({ w: 10, h: F("v").reduce((xs) => xs.length) }))
        .toDisplayList({ w: 200, h: 200, axes: false })
    );
    check(
      "an undeclared unit does not stack",
      undeclared.includes("not declared"),
      undeclared
    );
    const USD = Unit("USD", { traits: [Trait.summable()] });
    const declared = await errorOf(() =>
      chart(groups)
        .flow(stack({ by: "k", dir: "y" }))
        .mark(
          rect({ w: 10, h: F("v").reduce((xs) => xs.length, { unit: USD }) })
        )
        .toDisplayList({ w: 200, h: 200, axes: false })
    );
    check("a declared summable unit stacks", declared === "", declared);
  }

  console.log("\n# once per group");
  {
    let calls = 0;
    const s = F("Body Mass (g)").reduce(
      (xs) => {
        calls += 1;
        return { lo: Math.min(...xs), hi: Math.max(...xs) };
      },
      { unit: "g" }
    );
    await chart(measured)
      .flow(spread({ by: "Species", dir: "x" }))
      .mark(rect({ w: 10, y: s.lo(), y2: s.hi() }))
      .toDisplayList({ w: 300, h: 200, axes: true });
    check(
      "a reduce read by two channels runs once per group",
      calls === 3,
      `${calls} calls for 3 species`
    );

    // The cache is keyed by the rows a step ran on, and every render reads
    // a fresh copy of the chart's data (`resolveData` types a copy), so
    // rows changed in place between renders are read again.
    const data = [{ v: 1 }, { v: 2 }];
    const label = async (t: unknown) => {
      const out: string[] = [];
      const walk = (it: any) => {
        if (it.kind === "text") out.push(String(it.text));
        for (const c of it.children ?? []) walk(c);
      };
      (
        await chart(data)
          .mark(text({ text: t }))
          .toDisplayList({ w: 100, h: 100, axes: false })
      ).items.forEach(walk);
      return out.join();
    };
    const sum = F("v").sum();
    const total = F("v").reduce((xs: number[]) => xs[0] + xs[1]);
    const before = [await label(sum), await label(total)].join();
    data[0].v = 50;
    const after = [await label(sum), await label(total)].join();
    check(
      "a re-render after the rows change in place reads them again",
      before === "3,3" && after === "52,52",
      `${before} then ${after}`
    );
  }

  console.log("\n# the named methods are their callbacks");
  {
    const col = "Body Mass (g)";
    const draw = (h: unknown) =>
      chart(measured)
        .flow(spread({ by: "Species", dir: "x" }))
        .mark(rect({ w: 20, h }))
        .toDisplayList({ w: 300, h: 200, axes: false })
        .then(rectsOf);
    const pairs: [string, unknown, unknown][] = [
      ["sum", F(col).sum(), F(col).reduce(sumOf, { unit: "g" })],
      ["mean", F(col).mean(), F(col).reduce(meanOf)],
      ["median", F(col).median(), F(col).reduce(medianOf)],
      ["count", F(col).count(), F(col).reduce((xs) => xs.length)],
      ["distinct", F(col).distinct(), F(col).reduce((xs) => new Set(xs).size)],
    ];
    for (const [name, named, callback] of pairs) {
      const a = await draw(named);
      const b = await draw(callback);
      check(
        `.${name}() draws as its callback`,
        a.length === 3 && JSON.stringify(a) === JSON.stringify(b),
        `${JSON.stringify(a)} vs ${JSON.stringify(b)}`
      );
    }
    for (const [name, fn] of [
      ["sum", sumOf],
      ["mean", meanOf],
      ["median", medianOf],
    ] as const) {
      const a = evalGroup((field(col) as any)[name](), measured, undefined);
      const b = evalGroup(field(col).reduce(fn) as any, measured, undefined);
      check(
        `.${name}() evaluates to its callback's value`,
        (a as any).value === (b as any).value,
        `${(a as any).value} vs ${(b as any).value}`
      );
    }
    const shares = evalGroup(field("v").normalize() as any, rows, undefined);
    check(
      ".normalize() is the map x / Σxs",
      shares.kind === "rows" &&
        JSON.stringify(shares.values) ===
          JSON.stringify(rows.map((r) => r.v / 14))
    );
  }

  console.log("\n# a map after a named fold, on an operator's size");
  {
    // Each entry's share of the counts, as on main (`applyEntryNormalize`):
    // a has 2 rows, b 1 and c 3, so the shares are 2/6, 1/6 and 3/6 of the
    // stack's 300 px.
    const counted = [
      { k: "a" },
      { k: "a" },
      { k: "b" },
      { k: "c" },
      { k: "c" },
      { k: "c" },
    ];
    const widths = async (size: unknown) =>
      rectsOf(
        await chart(counted)
          .flow(stack({ by: "k", dir: "x", size }))
          .mark(rect({ h: 20 }))
          .toDisplayList({ w: 300, h: 100, axes: false })
      ).map((r) => Math.round(r[2] * 1000) / 1000);
    const shares = await widths(F("k").count().normalize());
    check(
      "field(...).count().normalize() is each entry's share of the counts",
      JSON.stringify(shares) === JSON.stringify([100, 50, 150]),
      JSON.stringify(shares)
    );
    const doubled = await widths(
      F("k")
        .count()
        .map((x: number, _i: number, xs: number[]) => x / Math.max(...xs), {
          unit: Unit("of most", { traits: [Trait.summable()] }),
        })
        .normalize()
    );
    check(
      "a map after a named fold maps the entries' counts",
      JSON.stringify(doubled) === JSON.stringify([100, 50, 150]),
      JSON.stringify(doubled)
    );
    const inMark = await errorOf(() =>
      evalGroup((field("v").sum() as any).normalize(), rows, undefined)
    );
    check(
      "outside an operator's size it says where the map runs",
      inMark.includes("only the size channel of spread or stack has") &&
        inMark.includes("put .normalize(...) before .sum(...)"),
      inMark
    );
    const afterReduce = await errorOf(() =>
      chart(counted)
        .flow(
          stack({
            by: "k",
            dir: "x",
            size: (
              F("k").reduce((xs: unknown[]) => xs.length) as any
            ).normalize(),
          })
        )
        .mark(rect({ h: 20 }))
        .toDisplayList({ w: 300, h: 100, axes: false })
    );
    check(
      "a lifted result still takes no map, even on an operator's size",
      afterReduce.length > 0,
      afterReduce
    );
  }

  console.log("\n# a reduce that returns a function, in a ribbon");
  {
    const dl = await chart(measured)
      .flow(spread({ by: "Species", dir: "y", spacing: 10 }))
      .mark(
        ribbon({
          x: F(col()).reduce(spanOf).support(),
          h: F(col()).reduce(spanOf),
        })
      )
      .toDisplayList({ w: 300, h: 200, axes: false });
    let paths = 0;
    const walk = (it: any) => {
      if (it.kind === "path") paths += 1;
      for (const c of it.children ?? []) walk(c);
    };
    dl.items.forEach(walk);
    check("one function ribbon per group", paths === 3, `${paths} paths`);
  }

  console.log("\n# a density in a split inside a binned partition's cell");
  {
    // Each species' density is cut at the cells: its pieces meet, and no
    // two of them overlap, as the pieces of one curve.
    const dl = await chart(measured)
      .flow(
        partition({ by: F(col()).bin(Bin.step(1000)), dir: "x" }),
        spread({ by: "Species", dir: "y" })
      )
      .mark(ribbon({ x: F(col()).support(), h: F(col()).density() }))
      .toDisplayList({ w: 500, h: 200, axes: false });
    const spans = new Map<string, [number, number][]>();
    const walk = (it: any) => {
      if (it.kind === "path") {
        const nums = String(it.d)
          .match(/-?\d+(\.\d+)?(e-?\d+)?/g)!
          .map(Number);
        const xs = nums.filter((_, i) => i % 2 === 0);
        const species = String(it.datum?.[0]?.Species ?? it.datum?.Species);
        if (!spans.has(species)) spans.set(species, []);
        spans.get(species)!.push([Math.min(...xs), Math.max(...xs)]);
      }
      for (const c of it.children ?? []) walk(c);
    };
    dl.items.forEach(walk);
    const overlaps = [...spans.entries()].flatMap(([species, s]) => {
      const sorted = [...s].sort((a, b) => a[0] - b[0]);
      return sorted
        .slice(1)
        .filter((sp, i) => sp[0] < sorted[i][1] - 0.01)
        .map((sp) => `${species} ${JSON.stringify(sp)}`);
    });
    check(
      "a species' pieces do not overlap",
      spans.size === 3 && overlaps.length === 0,
      `${[...spans.keys()].join(", ")}: ${overlaps.join("; ")}`
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

const col = () => "Body Mass (g)";
const spanOf = (xs: readonly number[]) =>
  dfun((t) => 1 + (t - Math.min(...xs)) / 1000, {
    domain: [Math.min(...xs), Math.max(...xs)],
  });

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
