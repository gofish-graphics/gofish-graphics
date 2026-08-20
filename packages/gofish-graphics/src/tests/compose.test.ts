import { chart, compose, derive, rect, spread } from "../lib";
import type { Mark, Operator } from "../lib";

declare const process: { exit(code: number): never };

let failed = 0;
function check(name: string, ok: boolean): void {
  if (ok) {
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

async function main() {
  console.log("\n# compose operator fragments");

  const addOne = derive((value: number) => value + 1);
  const stringify = derive((value: number) => `value:${value}`);
  const fragment: Operator<number, string> = compose(addOne, stringify);
  const finalMark = ((value: string) => value) as unknown as Mark<string>;
  const composedMark = await fragment(finalMark);

  check(
    "operators run left-to-right",
    ((await composedMark(2)) as unknown) === "value:3"
  );

  const identity = compose<string>();
  check("empty compose is the identity", (await identity(finalMark)) === finalMark);

  const nested = compose(addOne, compose(addOne, stringify));
  const nestedMark = await nested(finalMark);
  check(
    "nested fragments preserve order",
    ((await nestedMark(2)) as unknown) === "value:4"
  );

  const spec = chart([{ category: "A" }])
    .flow(
      compose(
        spread({ by: "category", dir: "x" }),
        spread({ dir: "y" })
      )
    )
    .mark(rect({ w: 1, h: 1 }));
  const operators = ((await spec.toJSON()).root as any).operators;
  check(
    "flow expands fragments for serialization",
    operators.length === 2 && operators.every((op: any) => op.type === "spread")
  );

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
