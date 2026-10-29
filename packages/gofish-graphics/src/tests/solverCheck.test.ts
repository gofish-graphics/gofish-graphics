/**
 * The solver shadow checks (`solver/shadow.ts`) on layouts they must accept.
 * The checks run only with `GOFISH_SOLVER_CHECK` set, which the module reads
 * when it loads, so this file sets it and then loads the library.
 *
 * Run: `tsx src/tests/solverCheck.test.ts` (wired as `pnpm test:solver-check`).
 */
declare const process: { exit(code: number): never };

(globalThis as Record<string, unknown>).GOFISH_SOLVER_CHECK = true;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const { table, rect } = await import("../lib");

  console.log("# a grid whose last row is partial");
  {
    // Five cells in two columns: the third row has one cell, and the grid
    // check reads the empty cell beside it as absent.
    let error = "";
    let rects: unknown[] = [];
    try {
      const out = await (table as any)(
        { numCols: 2 },
        [1, 2, 3, 4, 5].map(() => rect({ w: 10, h: 10 }))
      ).toDisplayList({ w: 100, h: 100 });
      rects = out.items.filter((i: { kind: string }) => i.kind === "rect");
    } catch (e) {
      error = (e as Error).message;
    }
    check(
      "the grid check accepts a partial last row",
      error === "" && rects.length === 5,
      error || JSON.stringify(rects)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
