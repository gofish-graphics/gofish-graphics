/**
 * The `Spacing` family: `spread`'s and `Constraint.distribute`'s `spacing`
 * value. A bare amount is `Spacing.box(amount)`, a gap between facing edges;
 * `Spacing.pitch(distance, { at })` is a fixed distance between the same point
 * on each child.
 *
 *   pnpm test:spacing
 */
import {
  chart,
  spread,
  rect,
  percent,
  fr,
  Spacing,
  Constraint,
  Serialize,
} from "../lib";
import { Frontend } from "gofish-ir";
import {
  distributePlacementAnchors,
  spacingOf,
} from "../ast/constraints/distribute";
import { check, items, report } from "./testHelpers";
import relateDistributePitch from "./fixtures/relate-distribute-pitch.json";

declare const process: { exit(code: number): never };

const close = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1e-6;

const errorOf = (f: () => unknown): string => {
  try {
    f();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

/** The rects a horizontal spread of three rects of widths 10, 40 and 20
 *  draws with `spacing`, left to right. */
async function rects(spacing: unknown) {
  const dl = await spread(
    { dir: "x", spacing: spacing as any, alignment: "start" },
    [10, 40, 20].map((w) => rect({ w, h: 10 }))
  ).toDisplayList({});
  return items(dl)
    .filter((i) => i.kind === "rect")
    .sort((p, q) => p.x! - q.x!);
}

async function main() {
  console.log("\n# the strategy objects");
  check(
    "Spacing.box(4) is { kind: box, gap: 4 }",
    JSON.stringify(Spacing.box(4)) === '{"kind":"box","gap":4}'
  );
  check(
    "Spacing.pitch(70) is { kind: pitch, distance: 70 }",
    JSON.stringify(Spacing.pitch(70)) === '{"kind":"pitch","distance":70}'
  );
  check(
    'Spacing.pitch(70, { at: "baseline" }) carries its at',
    JSON.stringify(Spacing.pitch(70, { at: "baseline" })) ===
      '{"kind":"pitch","distance":70,"at":"baseline"}'
  );
  check(
    "Spacing.pitch(percent(10)) writes the length's wire form",
    JSON.stringify(Spacing.pitch(percent(10), { at: "middle" })) ===
      '{"kind":"pitch","distance":{"type":"length","percent":10},"at":"middle"}'
  );

  console.log("\n# a bare amount is Spacing.box");
  check(
    "spacingOf(4) is Spacing.box(4)",
    JSON.stringify(spacingOf(4)) === JSON.stringify(Spacing.box(4))
  );
  check(
    "spacingOf(fr(1)) is a box over the length",
    spacingOf(fr(1)).kind === "box"
  );
  check(
    "Constraint.distribute holds its spacing as a strategy",
    Constraint.distribute({ dir: "x", spacing: 6 }, []).spacing.kind ===
      "box" &&
      Constraint.distribute({ dir: "x" }, []).spacing.kind === "box"
  );

  console.log("\n# validation");
  const unknownKind = errorOf(() =>
    spacingOf({ kind: "contour", gap: 4 } as any)
  );
  check(
    "an unknown kind is a loud error naming the family",
    /unknown kind "contour"/.test(unknownKind) &&
      unknownKind.includes("Spacing family"),
    unknownKind
  );
  const notFinite = errorOf(() => spacingOf(Spacing.pitch(Infinity)));
  check(
    "a pitch of Infinity is a loud error naming its distance",
    /distance/.test(notFinite),
    notFinite
  );
  const bareNaN = errorOf(() => spacingOf(NaN));
  check(
    "a bare NaN is checked as the box it is: the error is Spacing.box(NaN)'s",
    bareNaN !== "" && bareNaN === errorOf(() => spacingOf(Spacing.box(NaN))),
    bareNaN
  );
  const glued = await spread(
    { dir: "x", glue: true, spacing: { kind: "nope" } as any },
    [10, 40].map((w) => rect({ w, h: 10 }))
  )
    .toDisplayList({})
    .then(
      () => "",
      (e) => (e as Error).message
    );
  check(
    "a glued spread still checks its spacing",
    /unknown kind "nope"/.test(glued),
    glued
  );
  const wrongType = await rects("50").then(
    () => "",
    (e) => (e as Error).message
  );
  check(
    "a string spread spacing names the option and what it takes",
    wrongType ===
      "[gofish] spacing: expected a number, a length (percent(n) or fr(k)) " +
        "or a Spacing strategy, got string.",
    wrongType
  );

  console.log("\n# the points each kind relates");
  // A box relates the end of one child to the start of the next; a pitch at
  // `a` relates `a` on one child to `a` on the next.
  check(
    "a box relates end to start",
    JSON.stringify(
      distributePlacementAnchors({ spacing: Spacing.box(4), glue: false })
    ) === JSON.stringify({ from: "end", to: "start" })
  );
  for (const at of ["start", "middle", "end", "baseline"] as const) {
    check(
      `a pitch at "${at}" relates ${at} to ${at}`,
      JSON.stringify(
        distributePlacementAnchors({
          spacing: Spacing.pitch(30, { at }),
          glue: false,
        })
      ) === JSON.stringify({ from: at, to: at })
    );
  }
  check(
    "a pitch's at defaults to baseline",
    JSON.stringify(
      distributePlacementAnchors({ spacing: Spacing.pitch(30), glue: false })
    ) === JSON.stringify({ from: "baseline", to: "baseline" })
  );
  check(
    "a stack relates head to tail whatever its spacing",
    JSON.stringify(
      distributePlacementAnchors({
        spacing: Spacing.pitch(30, { at: "middle" }),
        glue: true,
      })
    ) === JSON.stringify({ from: "head", to: "tail" })
  );

  console.log("\n# layout");
  {
    // Widths 10, 40, 20.
    const bareRects = await rects(8);
    const boxRects = await rects(Spacing.box(8));
    check(
      "a bare 8 lays out as Spacing.box(8)",
      bareRects.length === 3 &&
        bareRects.every(
          (r, i) => close(r.x, boxRects[i].x!) && close(r.w, boxRects[i].w!)
        ),
      [bareRects.map((r) => r.x), boxRects.map((r) => r.x)]
    );
    check(
      "a box leaves its gap between facing edges",
      close(boxRects[1].x! - (boxRects[0].x! + boxRects[0].w!), 8) &&
        close(boxRects[2].x! - (boxRects[1].x! + boxRects[1].w!), 8),
      boxRects.map((r) => [r.x, r.w])
    );
    const point = {
      start: (r: { x?: number; w?: number }) => r.x!,
      middle: (r: { x?: number; w?: number }) => r.x! + r.w! / 2,
      end: (r: { x?: number; w?: number }) => r.x! + r.w!,
    };
    for (const at of ["start", "middle", "end"] as const) {
      const pitched = await rects(Spacing.pitch(50, { at }));
      const p = pitched.map(point[at]);
      check(
        `a pitch of 50 at "${at}" puts each ${at} 50 px past the last`,
        close(p[1] - p[0], 50) && close(p[2] - p[1], 50),
        pitched.map((r) => [r.x, r.w])
      );
    }
    // A rect's baseline is its local 0, its start, so a baseline pitch lays
    // rects out as a start pitch does.
    const base = await rects(Spacing.pitch(50, { at: "baseline" }));
    const start = await rects(Spacing.pitch(50, { at: "start" }));
    check(
      "a baseline pitch over rects lays out as a start pitch",
      base.every((r, i) => close(r.x, start[i].x!)),
      [base.map((r) => r.x), start.map((r) => r.x)]
    );
    const pct = await rects(Spacing.pitch(percent(10), { at: "start" }));
    check(
      "a pitch takes a percent: the starts are evenly spaced",
      close(pct[1].x! - pct[0].x!, pct[2].x! - pct[1].x!) &&
        pct[1].x! - pct[0].x! > 0,
      pct.map((r) => r.x)
    );
  }

  console.log("\n# the wire");
  {
    const spec = () =>
      chart([{ k: "a" }, { k: "b" }])
        .flow(
          spread({
            by: "k",
            dir: "y",
            spacing: Spacing.pitch(70, { at: "baseline" }),
          })
        )
        .mark(rect({ w: 10, h: 10 }));
    const ir = await Serialize.toJSON(spec());
    const op = (ir as any).root.operators?.[0];
    check(
      "spread writes its Spacing as the plain strategy object",
      JSON.stringify(op?.spacing) ===
        '{"kind":"pitch","distance":70,"at":"baseline"}',
      JSON.stringify(op)
    );
    const valid = Frontend.validate(ir);
    check(
      "the IR validates",
      valid.valid,
      JSON.stringify((valid as any).errors)
    );
    // Rebuilt from the IR, it lays out as the spread it came from.
    const rebuilt = items(await (Serialize.buildIR(ir as any) as any).toDisplayList({}));
    const direct = items(await spec().toDisplayList({}));
    check(
      "the IR rebuilds to the same layout",
      JSON.stringify(rebuilt.map((i) => [i.kind, i.x, i.y])) ===
        JSON.stringify(direct.map((i) => [i.kind, i.x, i.y]))
    );
  }

  console.log("\n# a distribute constraint from Python");
  {
    // The document Python's test_families.py writes for a `.relate()` of a
    // `Constraint.distribute` with a pitch: it validates, and JS lays it out.
    const valid = Frontend.validate(relateDistributePitch as any);
    check(
      "the fixture validates",
      valid.valid,
      JSON.stringify((valid as any).errors)
    );
    const rebuilt = items(
      await (
        Serialize.buildIR(relateDistributePitch as any) as any
      ).toDisplayList({})
    )
      .filter((i) => i.kind === "rect")
      .sort((p, q) => p.x! - q.x!);
    const middles = rebuilt.map((r) => r.x! + r.w! / 2);
    check(
      "its operands' middles are 50 px apart",
      rebuilt.length === 2 && close(middles[1] - middles[0], 50),
      rebuilt.map((r) => [r.x, r.w])
    );
  }
  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
