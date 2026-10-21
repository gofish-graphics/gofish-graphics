/**
 * Expressions (`src/ast/expr.ts`) and their tier (`src/ast/exprTier.ts`).
 * Run: `pnpm test:expr`.
 */
import { field } from "../ast/data";
import { when, concatStr } from "../ast/expr";
import { tierOf } from "../ast/exprTier";
import { signal, timer, wheel } from "../interaction/inputs";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function throws(name: string, fn: () => unknown, match: RegExp): void {
  try {
    fn();
    ok(name, false, "did not throw");
  } catch (e) {
    ok(name, match.test(String(e)), String(e));
  }
}

console.log("operations");
{
  const row = { a: 3, b: 4, s: "x", n: null };
  ok("gt", field("a").gt(2)(row) === true);
  ok("gtEq / ltEq", field("a").gtEq(3)(row) && field("a").ltEq(3)(row));
  ok("lt false", field("b").lt(field("a"))(row) === false);
  ok("eq on strings", field("s").eq("x")(row) === true);
  ok("neq", field("s").neq("y")(row) === true);
  ok("add/mul", field("a").add(field("b")).mul(2)(row) === 14);
  ok("sub/div", field("b").sub(1).div(field("a"))(row) === 1);
  ok("and / or / not", field("a").gt(1).and(field("b").gt(10)).not()(row));
  ok("or", field("a").gt(10).or(field("b").gt(1))(row) === true);
  ok("clip", field("a").clip(0, 2)(row) === 2);
  ok("floor/round", field("a").div(2).floor()(row) === 1);
  ok("round", field("a").div(2).round()(row) === 2);
  ok("null in, null out", field("n").gt(1)(row) === null);
  ok("fillNull", field("n").fillNull(7)(row) === 7);
  ok("and: false wins over null", field("n").gt(1).and(false)(row) === false);
  ok("or: true wins over null", field("n").gt(1).or(true)(row) === true);
  ok("concatStr", concatStr("a=", field("a"))(row) === "a=3");
  ok("concatStr null", concatStr("n=", field("n"))(row) === null);
  throws("arithmetic on a string", () => field("s").add(1)(row), /numbers/);
}

console.log("when / then / otherwise");
{
  const e = when(field("a").gt(5))
    .then("big")
    .when(field("a").gt(2))
    .then("mid")
    .otherwise("small");
  ok("first true branch", e({ a: 9 }) === "big");
  ok("second branch", e({ a: 3 }) === "mid");
  ok("otherwise", e({ a: 1 }) === "small");
  ok("no otherwise is null", when(field("a").gt(5)).then(1)({ a: 1 }) === null);
  ok("a null condition does not hold", e({}) === "small");
}

console.log("field leaves over a mark's rows");
{
  const rows = [
    { cat: "a", count: 2 },
    { cat: "a", count: 5 },
  ];
  ok("an aggregate folds the bag", field("count").sum().gt(6)(rows) === true);
  ok("a field the rows agree on collapses", field("cat").eq("a")(rows));
  throws(
    "a field the rows disagree on is an error",
    () => field("count").gt(1)(rows),
    /different values/
  );
}

console.log("sources");
{
  const cut = signal(60);
  ok("a signal is an expression of its value", cut.gt(50)() === true);
  cut.set(40);
  ok("and reads its current value", cut.gt(50)() === false);
  const year = timer({ domain: [1955, 2005], duration: 1000, playing: false, at: 1997.5 });
  ok("timer({ at }) starts at `at`", year() === 1997.5, String(year()));
  ok("year.floor()", year.floor()() === 1997);
  ok(
    "a timer's declaration is its options",
    JSON.stringify((year as any)[Symbol.for("gofish.source")].declaration) ===
      JSON.stringify({ domain: [1955, 2005], duration: 1000, playing: false, at: 1997.5 })
  );
  const w = wheel({ range: [3, 40], initial: 12, round: true });
  ok("wheel expr", concatStr("bins: ", w)() === "bins: 12");
}

console.log("tier inference");
{
  const cut = signal(60);
  const colors = when(cut.gt(50)).then("#d62728").otherwise("steelblue");
  ok("literal colors on fill: paint", tierOf("fill", colors) === "paint");
  ok(
    "a scaled value on fill: pipeline",
    tierOf("fill", when(cut.gt(50)).then("species").otherwise("x")) ===
      "pipeline"
  );
  ok("a raw style channel: paint", tierOf("opacity", cut.div(100)) === "paint");
  ok("text content: paint", tierOf("text", cut.floor()) === "paint");
  ok("a position: pipeline", tierOf("y", cut) === "pipeline");
  ok("a size: pipeline", tierOf("h", cut.mul(2)) === "pipeline");
  ok(
    "no source: an ordinary accessor",
    tierOf("fill", when(field("a").gt(1)).then("red").otherwise("blue")) ===
      "pipeline"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
