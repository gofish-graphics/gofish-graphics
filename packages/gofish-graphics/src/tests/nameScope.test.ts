/**
 * String-name resolution: `ref("x")` and `.relate()` operands share one
 * lookup (nearest level, then closest match) bounded by `createMark` (`resolveScopedName` in
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
  console.log("\n# Name scope — ref and .relate() share one lookup");

  // 1. Nested operand: an outer layer's .relate() names a node inside
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
                data.map((d) =>
                  gf.circle({ r: d.r, fill: "#ccc" }).name(d.name)
                )
              ),
            ])
            .name("planets"),
          // A rect stands in for the label text so its box is exact.
          gf.rect({ w: 30, h: 10, fill: "#e94560" }).name("label"),
        ])
        .relate(({ mercury, planets, label }: any) => [
          gf.Constraint.align({ x: "middle" }, [mercury, label]),
          gf.Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
        ])
    );
    const bg = out.find(
      (i) => i.kind === "rect" && i.style?.fill === "#252150"
    );
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
            .relate(({ bar, tick }: any) => [
              gf.Constraint.align({ x: "end", y: "end" }, [bar, tick]),
            ])
        )
    );
    const bars = out.filter((i) => i.kind === "rect" && i.w === 40);
    const ticks = out.filter((i) => i.kind === "rect" && i.w === 10);
    check(
      "per-row: one bar and one tick per row",
      bars.length === 3 && ticks.length === 3
    );
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
        .relate(({ a, b }: any) => [
          gf.Constraint.align({ x: "middle" }, [a, b]),
        ]),
    /the name "a" is ambiguous: it matched 2 nodes/
  );
  await rejects(
    "same-level duplicate is an error for ref() too",
    () =>
      gf
        .layer([
          gf.rect({ w: 10, h: 10 }).name("a"),
          gf.rect({ w: 10, h: 10 }).name("a"),
        ])
        .relate(() => [gf.arrow({}, [gf.ref("a"), gf.ref("a")])]),
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
            .relate(({ a, b }: any) => [
              gf.Constraint.align({ x: "end", y: "end" }, [a, b]),
            ]),
        ])
      );
      const inner = out.find((i) => i.style?.fill === "#222");
      const b = out.find((i) => i.style?.fill === "#333");
      ok =
        close(b.x + b.w, inner.x + inner.w) &&
        close(b.y + b.h, inner.y + inner.h);
      detail = JSON.stringify({ inner, b });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("an inner match hides an outer one", ok, detail);
  }

  // 3c. The old stand-in workaround, `ref("x").name("x")` as a plain child, is
  //     a string ref outside a relate clause. It errors and says what to do
  //     instead.
  await rejects(
    'the old ref("x").name("x") stand-in is an error',
    () =>
      gf.layer([
        gf.rect({ w: 10, h: 10 }).name("x"),
        gf
          .layer([gf.ref("x").name("x"), gf.rect({ w: 5, h: 5 }).name("label")])
          .relate(({ x, label }: any) => [
            gf.Constraint.align({ x: "middle" }, [x, label]),
          ]),
      ]),
    /ref\("x"\) is a string ref outside a \.relate\(\) clause/
  );

  // 4. A name that matches nothing.
  await rejects(
    "missing constraint operand is an error",
    () =>
      gf
        .layer([gf.rect({ w: 10, h: 10 }).name("a")])
        .relate(({ a, typo }: any) => [
          gf.Constraint.align({ x: "middle" }, [a, typo]),
        ]),
    /Constraint\.align: operand 2 is undefined.*Names inside this layer: a\./
  );

  // 5. createMark is a boundary in both directions.
  const Inside = gf.createMark(() =>
    gf.layer([gf.rect({ w: 10, h: 10 }).name("inner")])
  );
  await rejects(
    "a string name inside a createMark is invisible outside it",
    () =>
      gf
        .layer([Inside({}), gf.rect({ w: 5, h: 5 }).name("b")])
        .relate(({ inner, b }: any) => [
          gf.Constraint.align({ x: "middle" }, [inner, b]),
        ]),
    /operand 1 is undefined.*Names inside this layer: b\./
  );
  const ReachesOut = gf.createMark(() =>
    gf
      .layer([gf.rect({ w: 10, h: 10 }).name("x")])
      .relate(() => [gf.arrow({}, [gf.ref("x"), gf.ref("outer")])])
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
      gf.layer([gf.rect({ w: 10, h: 10 }).name(tag)])
    );
    const handle = gf.createName("handle");
    let ok = true;
    let detail = "";
    try {
      await items(
        gf
          .layer([Exposed({}).name(handle), gf.rect({ w: 5, h: 5 }).name("b")])
          .relate(({ b }: any) => [gf.arrow({}, [gf.ref(handle).inner, b])])
      );
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("a createName token path still crosses the boundary", ok, detail);
  }

  // 6. Closest match wins within the stopping level: a direct child beats a
  //    same-name node nested deeper, for `.relate()` and for `ref()`.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf.layer([gf.rect({ w: 40, h: 40, fill: "#111" }).name("a")]),
            gf.rect({ w: 20, h: 20, fill: "#222" }).name("a"),
            gf.rect({ w: 6, h: 6, fill: "#333" }).name("b"),
          ])
          .relate(({ a, b }: any) => [
            gf.Constraint.distribute({ dir: "x", spacing: 5 }, [a, b]),
          ])
      );
      const direct = out.find((i) => i.style?.fill === "#222");
      const b = out.find((i) => i.style?.fill === "#333");
      ok = close(b.x, direct.x + direct.w + 5);
      detail = JSON.stringify({ direct, b });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("a direct child beats a nested node with the same name", ok, detail);
  }
  {
    let ok = true;
    let detail = "";
    try {
      await items(
        gf
          .layer([
            gf.layer([gf.rect({ w: 40, h: 40 }).name("a")]),
            gf.rect({ w: 20, h: 20 }).name("a"),
          ])
          .relate(() => [gf.arrow({}, [gf.ref("a"), gf.ref("a")])])
      );
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check(
      "ref(): a direct child beats a nested node with the same name",
      ok,
      detail
    );
  }

  // 7. A nested name is reachable when it is the only one.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf.layer([
              gf.layer([gf.rect({ w: 30, h: 30, fill: "#444" }).name("deep")]),
            ]),
            gf.rect({ w: 6, h: 6, fill: "#555" }).name("b"),
          ])
          .relate(({ deep, b }: any) => [
            gf.Constraint.align({ x: "end" }, [deep, b]),
          ])
      );
      const deep = out.find((i) => i.style?.fill === "#444");
      const b = out.find((i) => i.style?.fill === "#555");
      ok = close(b.x + b.w, deep.x + deep.w);
      detail = JSON.stringify({ deep, b });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("a unique nested name is reachable", ok, detail);
  }

  // 8. Two matches at the same smallest distance are ambiguous, even when
  //    neither is a direct child.
  await rejects(
    "a tie at the smallest distance is an error",
    () =>
      gf
        .layer([
          gf.layer([gf.rect({ w: 10, h: 10 }).name("a")]),
          gf.layer([gf.rect({ w: 10, h: 10 }).name("a")]),
          gf.rect({ w: 5, h: 5 }).name("b"),
        ])
        .relate(({ a, b }: any) => [
          gf.Constraint.align({ x: "middle" }, [a, b]),
        ]),
    /the name "a" is ambiguous: it matched 2 nodes/
  );

  // 9. Library-made names never clash with user names: a spread's children
  //    (keyed "a" and "b" by the data) are not named "a", so the text named
  //    "a" is the only "a" and the constraint is not ambiguous.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf
              .chart(
                [
                  { k: "a", v: 10 },
                  { k: "b", v: 20 },
                ],
                { axes: false }
              )
              .flow(gf.spread({ by: "k", dir: "x", axes: false }))
              .mark(gf.rect({ h: "v", fill: "#666" }))
              .name("bars"),
            gf.rect({ w: 12, h: 12, fill: "#777" }).name("a"),
          ])
          .relate(({ a, bars }: any) => [
            gf.Constraint.distribute({ dir: "x", spacing: 10 }, [bars, a]),
          ])
      );
      const bars = out.filter((i) => i.style?.fill === "#666");
      const a = out.find((i) => i.style?.fill === "#777");
      const right = Math.max(...bars.map((r) => r.x + r.w));
      ok = bars.length === 2 && close(a.x, right + 10);
      detail = JSON.stringify({ bars, a });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check(
      "a spread's data keys are not names (no clash with a user name)",
      ok,
      detail
    );
  }
  await rejects(
    "a data key cannot be looked up as a name",
    () =>
      gf
        .layer([
          gf
            .chart([{ k: "a", v: 10 }], { axes: false })
            .flow(gf.spread({ by: "k", dir: "x", axes: false }))
            .mark(gf.rect({ h: "v" })),
          gf.rect({ w: 5, h: 5 }).name("b"),
        ])
        .relate(({ a, b }: any) => [
          gf.Constraint.align({ x: "middle" }, [a, b]),
        ]),
    /operand 1 is undefined/
  );

  // 10. The callback gets an ordinary object: a missing name reads as
  //     `undefined`, so destructuring defaults and optional checks work.
  {
    let ok = true;
    let detail = "";
    try {
      let seenNote: unknown = "unset";
      const out = await items(
        gf
          .layer([
            gf.rect({ w: 10, h: 10, fill: "#888" }).name("a"),
            gf.rect({ w: 10, h: 10, fill: "#999" }).name("b"),
          ])
          .relate(({ a, b, note, pad = 8 }: any) => {
            seenNote = note;
            return [
              gf.Constraint.distribute({ dir: "x", spacing: pad }, [a, b]),
              ...(note
                ? [gf.Constraint.align({ y: "middle" }, [a, note])]
                : []),
            ];
          })
      );
      const a = out.find((i) => i.style?.fill === "#888");
      const b = out.find((i) => i.style?.fill === "#999");
      ok = seenNote === undefined && close(b.x, a.x + a.w + 8);
      detail = JSON.stringify({ seenNote, a, b });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check(
      "a missing name is undefined: defaults and optional checks work",
      ok,
      detail
    );
  }

  // A ref laid out again lands in the same place (#928). The ref's
  // translate is recomputed on every layout, so the walk from the ref up to
  // the common ancestor must not include the ref's own translate from the
  // previous layout. (Token refs: a string ref is legal only in .relate(),
  // whose callback builds a fresh arrow on every render.)
  {
    const a = gf.createName("a");
    const b = gf.createName("b");
    const node = gf.layer([
      gf.spread({ dir: "x", spacing: 60 }, [
        gf.rect({ w: 20, h: 20 }).name(a),
        gf.rect({ w: 20, h: 20 }).name(b),
      ]),
      gf.arrow({}, [gf.ref(a), gf.ref(b)]),
    ]);
    const paths: string[] = [];
    for (let i = 0; i < 3; i++) {
      const out = await node.toDisplayList({ w: 300, h: 100 });
      paths.push(
        JSON.stringify(out.items.filter((it: any) => it.kind === "path"))
      );
    }
    check(
      "a ref laid out three times draws the same connector each time",
      paths[0] !== "[]" && paths[1] === paths[0] && paths[2] === paths[0],
      paths.join("\n")
    );
  }

  console.log("\n# relate() — drawing clauses and dependency order");

  // 11. #878: two named rects placed by a distribute, and an arrow between
  //     them in the same relate(). The arrow reads the FINAL positions: it
  //     runs horizontally from a's right edge to b's left edge.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf.rect({ w: 70, h: 40, fill: "#e2ebf6" }).name("a"),
            gf.rect({ w: 70, h: 40, fill: "#e2ebf6" }).name("b"),
          ])
          .relate(({ a, b }: any) => [
            gf.Constraint.distribute({ dir: "x", spacing: 60 }, [a, b]),
            gf.arrow({ bow: 0, stretch: 0, stroke: "#1a5683" }, [a, b]),
          ])
      );
      const rects = out
        .filter((i) => i.kind === "rect")
        .sort((p, q) => p.x - q.x);
      const body = out.find(
        (i) => i.kind === "path" && i.style?.fill === "none"
      );
      const nums = String(body?.d)
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      const [sx, sy] = nums;
      const [ex, ey] = nums.slice(-2);
      const [ra, rb] = rects;
      const midY = ra.y + ra.h / 2;
      ok =
        rects.length === 2 &&
        close(rb.x, ra.x + ra.w + 60) &&
        sx > ra.x + ra.w - 1e-6 &&
        ex < rb.x + 1e-6 &&
        ex > sx &&
        close(sy, midY) &&
        close(ey, midY);
      detail = JSON.stringify({ rects, d: body?.d });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check(
      "#878: an arrow in relate() runs between the final positions",
      ok,
      detail
    );
  }

  // 12. The Diagrams tutorial's final step: the label is centered under
  //     Mercury 20px below the background, and the arrow runs from the
  //     label's top up to Mercury.
  {
    const data = [
      { name: "mercury", r: 8 },
      { name: "venus", r: 14 },
      { name: "earth", r: 15 },
    ];
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf
              .enclose(
                {
                  padding: 20,
                  fill: "#252150",
                  shape: gf.Shape.box({ rx: 16 }),
                },
                [
                  gf.spread(
                    { dir: "x", spacing: 50, alignment: "middle" },
                    data.map((d) =>
                      gf.circle({ r: d.r, fill: "#ccc" }).name(d.name)
                    )
                  ),
                ]
              )
              .name("planets"),
            gf.rect({ w: 30, h: 10, fill: "#e94560" }).name("label"),
          ])
          .relate(({ mercury, planets, label }: any) => [
            gf.Constraint.align({ x: "middle" }, [mercury, label]),
            gf.Constraint.distribute({ dir: "y", spacing: 20 }, [
              planets,
              label,
            ]),
            gf.arrow({ stroke: "#E94560" }, [label, mercury]),
          ])
      );
      const bg = out.find(
        (i) => i.kind === "rect" && i.style?.fill === "#252150"
      );
      const mercury = out.find((i) => i.kind === "ellipse" && i.rx === 8);
      const label = out.find((i) => i.kind === "rect" && i.w === 30);
      const body = out.find(
        (i) => i.kind === "path" && i.style?.stroke === "#E94560"
      );
      const nums = String(body?.d)
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      const [sx, sy] = nums;
      const [ex, ey] = nums.slice(-2);
      // Pixel space is y-down: the label is below the background, so its top
      // edge is `label.y`, and the arrow goes up (ey < sy) toward Mercury.
      ok =
        close(label.x + label.w / 2, mercury.cx) &&
        close(label.y - (bg.y + bg.h), 20) &&
        sy <= label.y + 1e-6 &&
        sy > label.y - 10 &&
        close(sx, label.x + label.w / 2) &&
        ey < sy &&
        ey > mercury.cy + mercury.ry - 1e-6 &&
        Math.abs(ex - mercury.cx) < 1;
      detail = JSON.stringify({ bg, mercury, label, d: body?.d });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check(
      "planets: label under the background, arrow from label to Mercury",
      ok,
      detail
    );
  }

  // 13. A drawing clause over refs to other clauses runs after them; a cycle
  //     is a loud error that names the clauses.
  await rejects(
    "a cycle between relate clauses is an error naming them",
    () =>
      gf
        .layer([
          gf.rect({ w: 10, h: 10 }).name("a"),
          gf.rect({ w: 10, h: 10 }).name("b"),
        ])
        .relate(({ a, b }: any) => [
          gf.Constraint.distribute({ dir: "x", spacing: 10 }, [a, b]),
          gf.enclose({}, [a, gf.ref("q")]).name("p"),
          gf.enclose({}, [b, gf.ref("p")]).name("q"),
        ]),
    /form a cycle.*clause 2 \(enclose named "p"\), clause 3 \(enclose named "q"\)/
  );
  await rejects(
    "a clause that reads its own result is a cycle",
    () =>
      gf
        .layer([gf.rect({ w: 10, h: 10 }).name("a")])
        .relate(({ a }: any) => [
          gf.arrow({}, [a, gf.ref("self")]).name("self"),
        ]),
    /form a cycle.*clause 1 \(arrow named "self"\)/
  );
  // An object that only spells a name is not an operand: a name means
  // nothing until a .relate() call binds it (env[name] for a computed one).
  await rejects(
    "a constraint operand built by hand from a name is an error",
    () =>
      gf
        .layer([
          gf.rect({ w: 10, h: 10 }).name("a"),
          gf.rect({ w: 10, h: 10 }).name("b"),
        ])
        .relate(() => [
          gf.Constraint.align({ x: "middle" }, [{ name: "a" }, { name: "b" }]),
        ]),
    /operand 1 is \{"name":"a"\}, not an operand.*Names inside this layer: a, b/
  );
  {
    // A computed name reads its operand from the env.
    let ok = false;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf.rect({ x: 0, y: 0, w: 10, h: 10, fill: "#a00" }).name("a"),
            gf.rect({ y: 40, w: 30, h: 10, fill: "#0a0" }).name("b"),
          ])
          .relate((env: any) => [
            gf.Constraint.align(
              { x: "middle" },
              ["a", "b"].map((n) => env[n])
            ),
          ])
      );
      const a = out.find((i: any) => i.style?.fill === "#a00");
      const b = out.find((i: any) => i.style?.fill === "#0a0");
      ok = close(a.x + a.w / 2, b.x + b.w / 2);
      detail = JSON.stringify({ a, b });
    } catch (e: any) {
      detail = String(e?.message);
    }
    check("a computed name reads its operand as env[name]", ok, detail);
  }
  // A clause over another clause (no cycle) lays out after it.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf.rect({ w: 10, h: 10, fill: "#111" }).name("a"),
            gf.rect({ w: 10, h: 10, fill: "#222" }).name("b"),
          ])
          .relate(({ a, b }: any) => [
            gf.enclose({ padding: 5, stroke: "#0a0" }, [gf.ref("inner")]),
            gf.Constraint.distribute({ dir: "x", spacing: 30 }, [a, b]),
            gf.enclose({ padding: 5, stroke: "#00a" }, [a, b]).name("inner"),
          ])
      );
      const inner = out.find((i) => i.style?.stroke === "#00a");
      const outer = out.find((i) => i.style?.stroke === "#0a0");
      ok =
        close(inner.w, 10 + 30 + 10 + 10) &&
        close(outer.w, inner.w + 10) &&
        close(outer.x, inner.x - 5);
      detail = JSON.stringify({ inner, outer });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("a clause over another clause lays out after it", ok, detail);
  }

  // 14. A string ref outside a relate() clause is an error that says to move
  //     it into .relate().
  await rejects(
    "a string ref outside relate() is an error",
    () =>
      gf.layer([
        gf.rect({ w: 10, h: 10 }).name("a"),
        gf.rect({ w: 10, h: 10 }).name("b"),
        gf.arrow({}, [gf.ref("a"), gf.ref("b")]),
      ]),
    /ref\("a"\) is a string ref outside a \.relate\(\) clause.*move this ref into the enclosing layer's \.relate\(\) callback/
  );
  // A relate clause relates nodes inside its own layer only.
  await rejects(
    "a string ref in a clause cannot name a node outside the layer",
    () =>
      gf.layer([
        gf.rect({ w: 10, h: 10 }).name("outside"),
        gf
          .layer([gf.rect({ w: 10, h: 10 }).name("a")])
          .relate(({ a }: any) => [gf.arrow({}, [a, gf.ref("outside")])]),
      ]),
    /names a node outside the relating layer/
  );
  // Open terms: a clause may mix an operand with a fresh mark. The spread
  // places the fresh label under the (already placed) bar.
  {
    let ok = true;
    let detail = "";
    try {
      const out = await items(
        gf
          .layer([
            gf.rect({ w: 40, h: 10, fill: "#abc" }).name("a"),
            gf.rect({ w: 40, h: 10, fill: "#cba" }).name("b"),
          ])
          .relate(({ a, b }: any) => [
            gf.Constraint.distribute({ dir: "x", spacing: 20 }, [a, b]),
            gf.spread({ dir: "y", spacing: 5, alignment: "middle" }, [
              b,
              gf.rect({ w: 10, h: 4, fill: "#f00" }),
            ]),
          ])
      );
      const b = out.find((i) => i.style?.fill === "#cba");
      const tag = out.find((i) => i.style?.fill === "#f00");
      ok =
        out.filter((i) => i.style?.fill === "#cba").length === 1 &&
        close(tag.x + tag.w / 2, b.x + b.w / 2) &&
        close(Math.abs(tag.y - b.y) - (tag.y > b.y ? b.h : tag.h), 5);
      detail = JSON.stringify({ b, tag });
    } catch (e: any) {
      ok = false;
      detail = String(e?.message);
    }
    check("open term: a clause mixes an operand with a fresh mark", ok, detail);
  }

  // 15. A sequenced tier names its mark so its transitions can read the marks
  //     back. A name the mark already has, a string before other modifiers or
  //     a createName token, is the one it keeps: selectAll, ref, and the
  //     transitions all find the mark by it.
  console.log("\n# Name scope — a sequenced tier keeps its mark's own name");
  {
    const rows = [
      { year: 2000, x: 1, y: 2 },
      { year: 2001, x: 2, y: 3 },
      { year: 2002, x: 3, y: 1 },
    ];
    const sequence = () => {
      const clock = gf.timer({
        domain: [2000, 2002],
        duration: 1000,
        playing: false,
        loop: false,
      });
      clock.set(2001);
      return gf.time.sequence({ by: "year", on: clock });
    };
    const tier = (data: any[], mark: any) =>
      gf
        .chart(data)
        .flow(sequence(), gf.scatter({ x: "x", y: "y" }))
        .mark(mark);

    /** The bag `selectAll(name)` hands a chart drawn beside the tier. */
    async function selected(mark: any, name: string): Promise<unknown[]> {
      let seen: unknown[] = [];
      await items(
        gf.layer([
          tier(rows, mark),
          gf.chart(gf.selectAll(name)).mark((bag: unknown[]) => {
            seen = bag;
            return gf.rect({ w: 1, h: 1 });
          }),
        ])
      );
      return seen;
    }

    /** Whether `ref(target)` reaches the tier's one mark: a line from it to
     *  a sibling rect, drawn by a relate clause, is drawn. */
    async function reached(mark: any, target: any): Promise<string> {
      try {
        const out = await items(
          gf
            .layer([tier([rows[0]], mark), gf.rect({ w: 5, h: 5 }).name("b")])
            .relate(() => [gf.line({}, [gf.ref(target), gf.ref("b")])])
        );
        return out.some((i) => i.kind === "path") ? "" : "no line drawn";
      } catch (e: any) {
        return String(e?.message);
      }
    }

    const tween = () => ({ update: gf.Animation.tween() });

    // `.name("dots").transition(...)`
    {
      const dots = () => gf.circle({ r: 4 }).name("dots").transition(tween());
      const bag = await selected(dots(), "dots").catch((e) => e);
      check(
        ".name().transition(): selectAll finds every mark",
        Array.isArray(bag) && bag.length === rows.length,
        String(bag instanceof Error ? bag.message : (bag as any)?.length)
      );
      const miss = await reached(dots(), "dots");
      check(".name().transition(): ref finds the mark", miss === "", miss);
    }

    // `.name("bars").label(...)`
    {
      const bars = () => gf.rect({ w: 5, h: 5 }).name("bars").label("x");
      const bag = await selected(bars(), "bars").catch((e) => e);
      check(
        ".name().label(): selectAll finds every mark",
        Array.isArray(bag) && bag.length === rows.length,
        String(bag instanceof Error ? bag.message : (bag as any)?.length)
      );
      const miss = await reached(bars(), "bars");
      check(".name().label(): ref finds the mark", miss === "", miss);
    }

    // A createName token.
    {
      const token = gf.createName("dot");
      const miss = await reached(gf.circle({ r: 4 }).name(token), token);
      check("a token-named mark: ref(token) finds the mark", miss === "", miss);
      // Its transitions read the marks back by the token, so they draw what
      // the same mark's transitions draw under a string name.
      const drawn = async (name: any) =>
        (
          await items(
            tier(rows, gf.circle({ r: 4 }).name(name).transition(tween()))
          )
        ).length;
      const byToken = await drawn(gf.createName("dot"));
      const byString = await drawn("dot");
      check(
        "a token-named mark: its transitions draw as under a string name",
        byToken === byString,
        JSON.stringify({ byToken, byString })
      );
    }
  }

  console.log(
    "\n# relate() — an operand is bound when .relate() runs (#1236)"
  );

  // (a) #1235: the axes' own `.relate()` calls on other layers cannot drop
  //     this layer's clause, whichever axes are drawn.
  {
    const rows = [{ x: 1 }, { x: 2 }];
    const dots = () =>
      gf
        .chart(rows)
        .flow(gf.scatter({ x: "x" }))
        .mark(gf.circle({ r: 3 }));
    for (const axes of [true, { x: true, y: false }, false]) {
      let msg = "";
      let n = 0;
      try {
        n = (
          await gf
            .layer([dots()])
            .relate(() => [dots()])
            .toDisplayList({ w: 300, h: 100, axes })
        ).items.filter((i: any) => i.kind === "ellipse").length;
      } catch (e: any) {
        msg = String(e?.message);
      }
      check(
        `a drawing clause survives axes: ${JSON.stringify(axes)} (#1235)`,
        msg === "" && n === 4,
        msg || `ellipses: ${n}`
      );
    }
  }

  // (b) selectAll inside a clause reads the layer's names.
  {
    const rows = [
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 4 },
    ];
    let msg = "";
    let lines = 0;
    try {
      const out = await items(
        gf
          .layer([
            gf
              .chart(rows)
              .flow(gf.scatter({ x: "x", y: "y" }))
              .mark(gf.circle({ r: 3 }).name("means")),
          ])
          .relate(() => [
            gf.chart(gf.selectAll("means")).mark(gf.line({ stroke: "#c00" })),
          ])
      );
      lines = out.filter((i: any) => i.style?.stroke === "#c00").length;
    } catch (e: any) {
      msg = String(e?.message);
    }
    check(
      "selectAll inside a .relate() clause finds the layer's marks",
      msg === "" && lines === 1,
      msg || `lines: ${lines}`
    );
  }

  // (c) An outer operand in a nested layer's clause keeps its binding: the
  //     nested layer's own "density" does not capture it.
  {
    const nested = (inner: (env: any, outer: any) => any[]) =>
      gf
        .layer([
          // Deeper than the nested layer's own "density", so only the
          // binding scope, not distance, keeps the operand on this node.
          gf.layer([
            gf.layer([
              gf
                .rect({ x: 0, y: 0, w: 40, h: 20, fill: "#00f" })
                .name("density"),
            ]),
          ]),
        ])
        .relate(({ density }: any) => [
          gf
            .layer([
              gf
                .rect({ x: 200, y: 100, w: 10, h: 10, fill: "#0f0" })
                .name("density"),
            ])
            .relate((env: any) => inner(env, density)),
        ]);
    const out = await items(
      nested((_env, density) => [
        gf.enclose({ padding: 5, fill: "#fc0", stroke: "none" }, [density]),
      ])
    );
    const box = out.find((i: any) => i.style?.fill === "#fc0");
    check(
      "an outer operand in a nested clause names the outer node",
      box?.w === 50 && box?.h === 30,
      JSON.stringify(box)
    );

    // The nested layer's own operand of the same name is its own node.
    const own = (
      await items(
        nested(({ density }) => [
          gf.enclose({ padding: 5, fill: "#fc0", stroke: "none" }, [density]),
        ])
      )
    ).find((i: any) => i.style?.fill === "#fc0");
    check(
      "the nested layer's own operand names its own node",
      own?.w === 20 && own?.h === 20,
      JSON.stringify(own)
    );

    // Paint order is hygienic too: a connector clause paints under the
    // layer's "density" (its default `zBelow`), not under a nested clause's
    // same-named node, which keeps its declaration order below the line.
    const painted = await items(
      gf
        .layer([
          gf.rect({ x: 0, y: 0, w: 40, h: 20, fill: "#00f" }).name("density"),
          gf.rect({ x: 100, y: 0, w: 10, h: 10, fill: "#999" }).name("box"),
        ])
        .relate(({ density, box }: any) => [
          gf.layer([
            gf
              .rect({ x: 0, y: 60, w: 40, h: 20, fill: "#0f0" })
              .name("density"),
          ]),
          gf.line({ stroke: "#f00" }, [box, density]),
        ])
    );
    const at = (pred: (i: any) => boolean) => painted.findIndex(pred);
    const inner = at((i) => i.style?.fill === "#0f0");
    const line = at((i) => i.style?.stroke === "#f00");
    const outer = at((i) => i.style?.fill === "#00f");
    check(
      "a clause connector's paint default ignores a nested same-named node",
      inner >= 0 && line >= 0 && inner < line && line < outer,
      `inner ${inner}, line ${line}, outer ${outer}`
    );

    // A constraint places only nodes inside its own layer.
    await rejects(
      "a nested constraint on an outer operand is an error",
      () =>
        nested((_env, density) => [
          gf.Constraint.align({ x: "middle" }, [density]),
        ]),
      /operand "density" is not inside the layer this \.relate\(\) is attached to/
    );
  }

  console.log("\n# selectAll widens like ref, nearer scope first (#1236)");
  {
    const rows = [
      { g: "a", v: 1 },
      { g: "b", v: 2 },
      { g: "c", v: 3 },
    ];
    // One `layer` per spread cell, each naming its dot "dot".
    const cells = (inCell: () => any[]) =>
      gf
        .chart(rows, { axes: false })
        .flow(gf.spread({ by: "g", dir: "x", spacing: 20 }))
        .mark(
          gf.layer([
            gf.chart().mark(gf.circle({ r: 4, fill: "#c00" }).name("dot")),
            ...inCell(),
          ])
        );
    const lines = (out: any[], stroke: string) =>
      out.filter((i: any) => i.kind === "path" && i.style?.stroke === stroke);

    // From outside the spread, the cells are the nearest scopes with "dot":
    // selectAll gathers all three.
    const across = await items(
      gf.layer([
        cells(() => []),
        gf
          .chart(gf.selectAll("dot"))
          .mark(gf.line({ stroke: "#00c" }).zOrder(1)),
      ])
    );
    const path = lines(across, "#00c")[0]?.d ?? "";
    check(
      "selectAll outside a spread gathers every cell's marks",
      (path.match(/[ML]/g) ?? []).length === 3 ||
        (path.match(/C/g) ?? []).length === 2,
      path
    );

    // Inside a cell, its own scope has "dot": each cell's selectAll finds
    // only its own dot.
    let msg = "";
    try {
      await items(
        cells(() => [
          gf.chart(gf.ref("dot")).mark(gf.circle({ r: 1, fill: "#0c0" })),
        ])
      );
    } catch (e: any) {
      msg = String(e?.message);
    }
    check("ref inside a cell finds only its own cell's mark", msg === "", msg);

    // The singular ref, from outside, sees the plural name and says so.
    await rejects(
      "ref of a name a split repeats reports how many it found",
      () =>
        gf.layer([
          cells(() => []),
          gf.chart(gf.ref("dot")).mark(gf.circle({ r: 1 })),
        ]),
      /matched 3 nodes/
    );
  }

  console.log("\n# Names are hygienic (#1246)");

  // The library names nothing: two siblings that share a user name both keep
  // it, so the name is plural, and a singular use of it is ambiguous. (An
  // operator used to rename the second one, so it resolved to the first.)
  await rejects(
    "two spread children sharing a name both keep it",
    () =>
      gf
        .layer([
          gf.spread({ dir: "x", spacing: 10 }, [
            gf.rect({ w: 10, h: 10 }).name("a"),
            gf.rect({ w: 10, h: 10 }).name("a"),
          ]),
          gf.rect({ w: 5, h: 5 }).name("b"),
        ])
        .relate(({ a, b }: any) => [
          gf.Constraint.align({ x: "middle" }, [a, b]),
        ]),
    /the name "a" is ambiguous: it matched 2 nodes/
  );

  // A paint-order operand means every node the name means, by the one
  // lookup: the matches at the nearest depth, all of them.
  {
    const fills = async (children: any[]) =>
      (
        await items(
          gf
            .layer(children)
            .relate(({ a, b }: any) => [gf.Constraint.zBelow(b, a)])
        )
      ).map((i: any) => i.style?.fill);
    const sq = (fill: string, name: string) =>
      gf.rect({ w: 10, h: 10, fill }).name(name);
    const both = await fills([
      sq("#a10", "a"),
      sq("#a20", "a"),
      sq("#b00", "b"),
    ]);
    check(
      "zBelow(b, a) puts b under both nodes named a",
      both.indexOf("#b00") < both.indexOf("#a10") &&
        both.indexOf("#b00") < both.indexOf("#a20"),
      JSON.stringify(both)
    );
    const nearest = await fills([
      gf.layer([sq("#a30", "a")]),
      sq("#a10", "a"),
      sq("#b00", "b"),
    ]);
    check(
      "a z-order name means the nearest depth only: a deeper same name is not ordered",
      JSON.stringify(nearest) === JSON.stringify(["#a30", "#b00", "#a10"]),
      JSON.stringify(nearest)
    );
  }

  // A labeled mark keeps its name, and the label's wrapper takes none and
  // adds no depth: ref("bar") is the bar alone, not the bar and its label.
  {
    let detail = "";
    let ok = false;
    try {
      const out = await items(
        gf
          .layer([
            gf
              .rect({ x: 0, y: 0, w: 20, h: 40, fill: "#1a1" })
              .name("bar")
              .label(() => "a long label", { position: "outset-right" }),
            gf.rect({ x: 200, y: 10, w: 20, h: 20, fill: "#777" }).name("dot"),
          ])
          .relate(() => [
            gf.line({ stroke: "#c00" }, [gf.ref("bar"), gf.ref("dot")]),
          ])
      );
      const bar = out.find((i: any) => i.style?.fill === "#1a1");
      const text = out.find((i: any) => i.kind === "text");
      const path = out.find((i: any) => i.style?.stroke === "#c00");
      const xs = (path?.d ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
      // A line between two refs runs between their centers.
      ok = text !== undefined && close(xs[0], bar.x + bar.w / 2);
      detail = JSON.stringify({ bar, d: path?.d });
    } catch (e: any) {
      detail = String(e?.message);
    }
    check('ref("bar") on a labeled bar is the bar alone', ok, detail);
  }

  // A line over token refs gets no paint-order default: a token ref has no
  // node before the round, so the line paints in child order, over a box
  // that holds what it reads (the DFSCQ funnels draw over their stages).
  {
    let detail = "";
    let ok = false;
    try {
      const a = gf.createName("a");
      const b = gf.createName("b");
      const out = await items(
        gf.layer([
          gf.layer([
            gf.rect({ x: 0, y: 0, w: 200, h: 100, fill: "#fff" }),
            gf.rect({ x: 10, y: 10, w: 10, h: 10, fill: "#a00" }).name(a),
            gf.rect({ x: 150, y: 60, w: 10, h: 10, fill: "#0a0" }).name(b),
          ]),
          gf.line({ stroke: "#c00" }, [gf.ref(a), gf.ref(b)]),
        ])
      );
      const at = (pred: (i: any) => boolean) => out.findIndex(pred);
      const box = at((i) => i.style?.fill === "#fff");
      const line = at((i) => i.style?.stroke === "#c00");
      ok = box >= 0 && line > box;
      detail = `box ${box}, line ${line}`;
    } catch (e: any) {
      detail = String(e?.message);
    }
    check("a line over token refs paints over the box that holds them", ok, detail);
  }

  // A clause's paint-order default follows a named ref (an alias) to the
  // node it stands for: the connector paints under the bar, not the ref.
  {
    let detail = "";
    let ok = false;
    try {
      const barTag = gf.createName("bar");
      const out = await items(
        gf
          .layer([
            gf.rect({ x: 0, y: 0, w: 40, h: 40, fill: "#1a1" }).name(barTag),
            gf.rect({ x: 200, y: 10, w: 20, h: 20, fill: "#777" }).name("dot"),
            gf.ref(barTag).name("alias"),
          ])
          .relate(({ alias, dot }: any) => [
            gf.line({ stroke: "#c00", strokeWidth: 8 }, [alias, dot]),
          ])
      );
      const at = (pred: (i: any) => boolean) => out.findIndex(pred);
      const bar = at((i) => i.style?.fill === "#1a1");
      const line = at((i) => i.style?.stroke === "#c00");
      ok = bar >= 0 && line >= 0 && line < bar;
      detail = `line ${line}, bar ${bar}`;
    } catch (e: any) {
      detail = String(e?.message);
    }
    check("a clause's z default follows a named-ref alias", ok, detail);
  }

  // A createName token on a repeated mark is plural: selectAll(token)
  // gathers every node it made, and the singular ref(token) says how many
  // it matched.
  {
    const token = gf.createName("dot");
    const rows = [
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 1 },
    ];
    const dots = () =>
      gf
        .chart(rows)
        .flow(gf.scatter({ x: "x", y: "y" }))
        .mark(gf.circle({ r: 3 }).name(token));
    let seen: unknown[] = [];
    let msg = "";
    try {
      await items(
        gf.layer([
          dots(),
          gf.chart(gf.selectAll(token)).mark((bag: unknown[]) => {
            seen = bag;
            return gf.rect({ w: 1, h: 1 });
          }),
        ])
      );
    } catch (e: any) {
      msg = String(e?.message);
    }
    check(
      "selectAll(token) gathers every node a repeated mark made",
      msg === "" && seen.length === rows.length,
      msg || `seen: ${seen.length}`
    );
    await rejects(
      "ref(token) of a token on a repeated mark says how many it matched",
      () =>
        gf.layer([
          gf.rect({ w: 5, h: 5 }).name(token),
          gf.rect({ w: 5, h: 5 }).name(token),
          gf.rect({ w: 5, h: 5 }).name("b"),
          gf.arrow({}, [gf.ref(token), gf.ref(gf.createName("b"))]),
        ]),
      /matched 2 nodes/
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
