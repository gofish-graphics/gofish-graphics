/**
 * Signed extents (#773): a free extent carries an ascent and a descent about
 * its baseline. Covers the places that read the pair or seat the baseline:
 * the shrink-to-fit root, nest padding, the solver's free-origin fallback
 * against a distribute chain, the alignment union per alignment mode, and the
 * chainable ref proxy that layout probes.
 *
 * Run: `pnpm build && tsx src/tests/signedExtent.test.ts` (wired as
 * `pnpm test:signed-extent`). The rendering checks import from `dist` for the
 * same lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import {
  SIZE,
  isPOSITION,
  continuousInterval,
  type CONTINUOUS_TYPE,
} from "../ast/underlyingSpace";
import { nestedSpace } from "../ast/constraints/nest";
import { resolveAlignmentSpace } from "../ast/graphicalOperators/alignment";
import { solveAxisProblem } from "../ast/constraints/differenceGraph";
import { anchorExpr, relationFact } from "../ast/constraints/placementFacts";
import { ref } from "../ast/shapes/ref";
import { createName } from "../ast/createName";
import { GoFishRef } from "../ast/_ref";
import * as M from "../util/monotonic";

const { chart, scatter, rect } = GoFish as any;

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

async function main() {
  console.log("\n# a shrink-to-fit root does not count its descent twice");
  {
    // A free root (scatter leaves y free) of signed bars, with no `h`: the
    // root pins its content's `min` edge, which already holds the descent.
    const signed = [
      { k: 1, v: 10 },
      { k: 2, v: -30 },
      { k: 3, v: 20 },
    ];
    const bars = (size: { w: number; h?: number }) =>
      chart(signed)
        .flow(scatter({ by: "k", x: "k" }))
        .mark(rect({ h: "v", w: 10 }))
        .toDisplayList(size);
    for (const size of [{ w: 300, h: 200 }, { w: 300 }]) {
      const [up, down, up2] = rectsOf(await bars(size));
      const label = size.h === undefined ? "shrink-to-fit" : "given h";
      check(
        `${label}: content starts at the top margin`,
        Math.min(up.y, down.y, up2.y) === 40,
        JSON.stringify([up, down, up2])
      );
      check(
        `${label}: positive and negative bars meet on one zero line`,
        Math.abs(up.y + up.h - down.y) < 1e-9 &&
          Math.abs(up2.y + up2.h - down.y) < 1e-9
      );
    }
  }

  console.log("\n# a nest pads both sides of its inner extent");
  {
    const inner = SIZE(M.linear(10, 0), undefined, M.linear(4, 0));
    const outer = nestedSpace(SIZE(M.ZERO), inner, 2) as CONTINUOUS_TYPE;
    check(
      "ascent + padding and descent + padding",
      outer.ascent.run(1) === 12 && outer.descent.run(1) === 6
    );
    check("width is inner width + 2·padding", outer.width.run(1) === 18);
  }

  console.log("\n# a distribute chain keeps its sequence origin");
  {
    // A chain a → b along the axis whose free members' baselines happen to
    // coincide. A chain composes along the axis and has no baseline of its
    // own, so the free origin (50) must not seat it.
    const problem = {
      relations: [
        relationFact(
          anchorExpr("a", "y", "start"),
          anchorExpr("b", "y", "start"),
          10,
          "distribute[0]"
        ),
      ],
      pins: [],
      participantFacts: [],
      participants: new Set(["a", "b"]),
    };
    const baselines = new Map([
      ["a", 10],
      ["b", 0],
    ]);
    const chain = solveAxisProblem("y", problem, { value: 50, baselines });
    check(
      "chain head stays at 0 (sequence origin)",
      chain.positions.get("a") === 0 && chain.positions.get("b") === 10,
      JSON.stringify([...chain.positions])
    );
    // The same two nodes tied by an align relation share a determined
    // baseline, which the free origin seats.
    const aligned = solveAxisProblem(
      "y",
      {
        ...problem,
        relations: [
          relationFact(
            anchorExpr("a", "y", "start"),
            anchorExpr("b", "y", "start"),
            10,
            "align[0]"
          ),
        ],
      },
      { value: 50, baselines }
    );
    check(
      "an aligned component seats its shared baseline at the origin",
      aligned.positions.get("a")! + 10 === 50,
      JSON.stringify([...aligned.positions])
    );
  }

  console.log("\n# the alignment union depends on the alignment");
  {
    const up = SIZE(M.linear(10, 0));
    const down = SIZE(M.ZERO, undefined, M.linear(20, 0));
    const span = (alignment: "baseline" | "start" | "end") => {
      const s = resolveAlignmentSpace([up, down], alignment);
      return isPOSITION(s) ? continuousInterval(s) : undefined;
    };
    check(
      "baseline: [−descent, ascent] about the shared baseline",
      JSON.stringify(span("baseline")) === JSON.stringify({ min: -20, max: 10 })
    );
    check(
      "start: each child's whole box from the aligned edge",
      JSON.stringify(span("start")) === JSON.stringify({ min: 0, max: 20 })
    );
    check(
      "end: the widest box",
      JSON.stringify(span("end")) === JSON.stringify({ min: 0, max: 20 })
    );
  }

  console.log("\n# the chainable ref proxy");
  {
    const tok = createName("planets");
    const named = (ref(tok) as any).name("x");
    const child = named.child;
    check(
      "ref(tok).name(...) returns the proxy, so the path still chains",
      child instanceof GoFishRef &&
        JSON.stringify((child as any).selection.slice(1)) ===
          JSON.stringify(["child"])
    );
    check(
      "an optional Placeable probe reads undefined, not a path segment",
      (ref(tok) as any).spaceOn === undefined &&
        (ref(tok) as any).setExtent === undefined
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
