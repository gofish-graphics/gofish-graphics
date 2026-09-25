/**
 * String-name resolution: `ref("x")` and `.constrain()` operands share one
 * innermost-enclosing lookup bounded by `createMark` (`resolveScopedName` in
 * `_ref.tsx`; essay: /internals/core/names-and-scoping).
 *
 * Run: `pnpm build && tsx src/tests/nameScope.test.ts` (wired as
 * `pnpm test:name-scope`). Imports from `dist` for the same lodash-ESM reason
 * as the other dist-backed tests.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const gf = GoFish as any;

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

async function items(node: any): Promise<any[]> {
  return (await node.toDisplayList({ w: 400, h: 300 })).items;
}

async function rejects(
  name: string,
  build: () => any,
  pattern: RegExp
): Promise<void> {
  try {
    await items(build());
    check(name, false, "rendered without throwing");
  } catch (e: any) {
    check(name, pattern.test(String(e?.message)), String(e?.message));
  }
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

async function main() {
  console.log("\n# Name scope — ref and .constrain() share one lookup");

  // 1. Nested operand: an outer layer's .constrain() names a node inside
  //    enclose › spread (the Diagrams tutorial's planets figure).
  {
    const data = [
      { name: "mercury", r: 8 },
      { name: "venus", r: 14 },
      { name: "earth", r: 15 },
    ];
    const out = await items(
      gf
        .layer([
          gf
            .enclose({ padding: 20, fill: "#252150", stroke: "none" }, [
              gf.spread(
                { dir: "x", spacing: 50, alignment: "middle" },
                data.map((d) => gf.circle({ r: d.r, fill: "#ccc" }).name(d.name))
              ),
            ])
            .name("planets"),
          // A rect stands in for the label text so its box is exact.
          gf.rect({ w: 30, h: 10, fill: "#e94560" }).name("label"),
        ])
        .constrain(({ mercury, planets, label }: any) => [
          gf.Constraint.align({ x: "middle" }, [mercury, label]),
          gf.Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
        ])
    );
    const bg = out.find((i) => i.kind === "rect" && i.style?.fill === "#252150");
    const mercury = out.find((i) => i.kind === "ellipse" && i.rx === 8);
    const label = out.find((i) => i.kind === "rect" && i.w === 30);
    check(
      "nested operand: label is centered under mercury",
      label && mercury && close(label.x + label.w / 2, mercury.cx),
      JSON.stringify({ label, mercury })
    );
    check(
      "nested operand: label sits 20px below the background",
      bg && label && close(label.y - (bg.y + bg.h), 20),
      JSON.stringify({ bg, label })
    );
  }

  // 2. The per-row pattern: one constrained mark repeated per chart row, with
  //    the same local names in every row. Each row's layer finds its own.
  {
    const rows = [
      { k: "a", v: 10 },
      { k: "b", v: 30 },
      { k: "c", v: 20 },
    ];
    const out = await items(
      gf
        .chart(rows, { axes: false })
        .flow(gf.spread({ by: "k", dir: "x", spacing: 20, axes: false }))
        .mark(
          gf
            .layer([
              gf.rect({ w: 40, h: "v", fill: "#9cf" }).name("bar"),
              gf.rect({ w: 10, h: 4, fill: "#000" }).name("tick"),
            ])
            .constrain(({ bar, tick }: any) => [
              gf.Constraint.align({ x: "end", y: "end" }, [bar, tick]),
            ])
        )
    );
    const bars = out.filter((i) => i.kind === "rect" && i.w === 40);
    const ticks = out.filter((i) => i.kind === "rect" && i.w === 10);
    check("per-row: one bar and one tick per row", bars.length === 3 && ticks.length === 3);
    check(
      "per-row: every tick is aligned to its own bar's right edge",
      bars.every((b, i) => close(ticks[i].x + ticks[i].w, b.x + b.w)),
      JSON.stringify({ bars, ticks })
    );
  }

  // 3. Two nodes with the same name equally close to the use site.
  await rejects(
    "same-level duplicate is an error",
    () =>
      gf
        .layer([
          gf.rect({ w: 10, h: 10 }).name("a"),
          gf.rect({ w: 10, h: 10 }).name("a"),
          gf.rect({ w: 5, h: 5 }).name("b"),
        ])
        .constrain(({ a, b }: any) => [gf.Constraint.align({ x: "middle" }, [a, b])]),
    /the name "a" is ambiguous — 2 nodes/
  );
  await rejects(
    "same-level duplicate is an error for ref() too",
    () =>
      gf.layer([
        gf.rect({ w: 10, h: 10 }).name("a"),
        gf.rect({ w: 10, h: 10 }).name("a"),
        gf.arrow({}, [gf.ref("a"), gf.ref("a")]),
      ]),
    /ref\("a"\): the name "a" is ambiguous/
  );

  // 3b. An inner match hides an outer one (intended): the inner layer's
  //     `a` wins, so there is no ambiguity with the outer `a`.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf.layer([
          gf.rect({ w: 50, h: 50, fill: "#111" }).name("a"),
          gf
            .layer([
              gf.rect({ w: 20, h: 20, fill: "#222" }).name("a"),
              gf.rect({ w: 6, h: 6, fill: "#333" }).name("b"),
            ])
            .constrain(({ a, b }: any) => [
              gf.Constraint.align({ x: "end", y: "end" }, [a, b]),
            ]),
        ])
      );
      const inner = out.find((i) => i.style?.fill === "#222");
      const b = out.find((i) => i.style?.fill === "#333");
      ok = close(b.x + b.w, inner.x + inner.w) && close(b.y + b.h, inner.y + inner.h);
      detail = JSON.stringify({ inner, b });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("an inner match hides an outer one", ok, detail);
  }

  // 4. A name that matches nothing.
  await rejects(
    "missing constraint operand is an error",
    () =>
      gf
        .layer([gf.rect({ w: 10, h: 10 }).name("a")])
        .constrain(({ a, typo }: any) => [gf.Constraint.align({ x: "middle" }, [a, typo])]),
    /no node named "typo"/
  );

  // 5. createMark is a boundary in both directions.
  const Inside = gf.createMark(() =>
    gf.Layer([gf.rect({ w: 10, h: 10 }).name("inner")])
  );
  await rejects(
    "a string name inside a createMark is invisible outside it",
    () =>
      gf
        .layer([Inside({}), gf.rect({ w: 5, h: 5 }).name("b")])
        .constrain(({ inner, b }: any) => [gf.Constraint.align({ x: "middle" }, [inner, b])]),
    /no node named "inner"/
  );
  const ReachesOut = gf.createMark(() =>
    gf.Layer([
      gf.rect({ w: 10, h: 10 }).name("x"),
      gf.arrow({}, [gf.ref("x"), gf.ref("outer")]),
    ])
  );
  await rejects(
    "an outer string name is invisible inside a createMark",
    () => gf.layer([ReachesOut({}), gf.rect({ w: 5, h: 5 }).name("outer")]),
    /ref\("outer"\): no node named "outer" in the enclosing createMark component/
  );
  // A createName token still crosses the boundary.
  {
    const tag = gf.createName("inner");
    const Exposed = gf.createMark(() =>
      gf.Layer([gf.rect({ w: 10, h: 10 }).name(tag)])
    );
    const handle = gf.createName("handle");
    let ok = true;
    let detail = "";
    try {
      await items(
        gf.layer([
          Exposed({}).name(handle),
          gf.rect({ w: 5, h: 5 }).name("b"),
          gf.arrow({}, [gf.ref(handle).inner, gf.ref("b")]),
        ])
      );
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("a createName token path still crosses the boundary", ok, detail);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
