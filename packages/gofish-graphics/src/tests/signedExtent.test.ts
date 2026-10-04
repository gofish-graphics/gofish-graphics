/**
 * Signed extents (#773): a free extent carries an ascent and a descent about
 * its baseline. Covers the places that read the pair or seat the baseline:
 * the shrink-to-fit root, nest padding, the solver's free-origin fallback
 * against a distribute chain, the alignment union per alignment mode, a stack
 * laying signed parts end to end, and the chainable ref proxy that layout
 * probes.
 *
 * Run: `pnpm build && tsx src/tests/signedExtent.test.ts` (wired as
 * `pnpm test:signed-extent`). The rendering checks import from `dist` for the
 * same lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import {
  continuousInterval,
  type CONTINUOUS_TYPE,
  CONTINUOUS,
  originIs,
} from "../ast/underlyingSpace";
import { nestedExtent, nestedSpace } from "../ast/constraints/nest";
import { Extent } from "../ast/extent";
import { resolveAlignmentSpace } from "../ast/graphicalOperators/alignment";
import { solveAxisProblem } from "../ast/constraints/differenceGraph";
import { distributeSpaceFold } from "../ast/constraints/distribute";
import { anchorExpr, relationFact } from "../ast/constraints/placementFacts";
import { ref } from "../ast/shapes/ref";
import { createName } from "../ast/createName";
import { GoFishRef } from "../ast/_ref";
import * as M from "../util/monotonic";
import { interval } from "../util/interval";

const { chart, scatter, stack, spread, rect } = GoFish as any;

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
    const inner = CONTINUOUS(interval(-4, 10), "free");
    const outer = nestedSpace(
      CONTINUOUS(interval(0, 0), "free"),
      inner
    ) as CONTINUOUS_TYPE;
    check(
      "the outer type keeps the inner data extent (padding is pixels)",
      JSON.stringify(outer.dataInterval) ===
        JSON.stringify((inner as CONTINUOUS_TYPE).dataInterval)
    );
    const claim = nestedExtent(
      Extent(M.ZERO),
      inner,
      Extent(M.linear(10, 0), M.linear(4, 0)),
      2
    )!;
    check(
      "claim: ascent + padding and descent + padding",
      claim.ascent.run(1) === 12 && claim.descent.run(1) === 6
    );
    check("claim width is inner width + 2·padding", claim.width.run(1) === 18);
  }

  console.log("\n# a chain seats only the baselines it leaves free");
  {
    // A chain a → b along the axis. The solver lists no baseline for the
    // members of a spread chain (it packs boxes from the first one's start),
    // so the free origin (50) has nothing to seat and the chain keeps its
    // sequence origin.
    const chain = (kind: "stack" | "spread") => ({
      relations: [
        relationFact(
          anchorExpr("a", "y", "start"),
          anchorExpr("b", "y", "start"),
          10,
          "distribute[0]",
          kind
        ),
      ],
      pins: [],
      participantFacts: [],
      participants: new Set(["a", "b"]),
    });
    const problem = chain("spread");
    const spreadChain = solveAxisProblem("y", problem, {
      value: 50,
      baselines: new Map(),
    });
    check(
      "a spread chain's head stays at 0 (sequence origin)",
      spreadChain.positions.get("a") === 0 &&
        spreadChain.positions.get("b") === 10,
      JSON.stringify([...spreadChain.positions])
    );
    // A stack lists its first part's baseline only (the others sit on the
    // previous head), and the free origin seats it.
    const stackChain = solveAxisProblem("y", chain("stack"), {
      value: 50,
      baselines: new Map([["a", 4]]),
    });
    check(
      "a stack's first baseline sits at the origin",
      stackChain.positions.get("a")! + 4 === 50 &&
        stackChain.positions.get("b") === stackChain.positions.get("a")! + 10,
      JSON.stringify([...stackChain.positions])
    );
    const baselines = new Map([
      ["a", 10],
      ["b", 0],
    ]);
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
    const up = CONTINUOUS(interval(0, 10), "free");
    const down = CONTINUOUS(interval(-20, 0), "free");
    const span = (alignment: "baseline" | "start" | "end") => {
      // Alignment establishes a shared baseline; it does not pin it.
      const s = resolveAlignmentSpace([up, down], alignment, 1);
      return originIs(s, "free") ? s.dataInterval : undefined;
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

  console.log("\n# a stack lays its parts end to end");
  {
    // The running sums of (30, −25, 10, −50) are 0, 30, 5, 15, −35, so the
    // stack spans [−35, 30]. With only positive parts it is [0, Σ].
    const fold = (values: number[]) => {
      const s = distributeSpaceFold(
        values.map((v) => CONTINUOUS(interval(0, v), "free")),
        [],
        {
          axis: 1,
          spacing: 0,
          anchor: "edge",
          glue: true,
          origin: { part: 0, fraction: 0, mirrored: false },
        }
      );
      return originIs(s, "pinned") ? continuousInterval(s) : undefined;
    };
    check(
      "a signed stack spans its running sums",
      JSON.stringify(fold([30, -25, 10, -50])) ===
        JSON.stringify({ min: -35, max: 30 })
    );
    check(
      "an all-negative stack hangs below 0",
      JSON.stringify(fold([-10, -20])) === JSON.stringify({ min: -30, max: 0 })
    );
    check(
      "a positive stack spans [0, Σ]",
      JSON.stringify(fold([10, 20])) === JSON.stringify({ min: 0, max: 30 })
    );

    // Rendered: 130px for the 65 units of [−35, 30], so 2px per unit, with
    // y growing downward. The first bar's zero edge is the stack's 0; each
    // bar spans its two running sums.
    const parts = [
      { k: "a", v: 30 },
      { k: "b", v: -25 },
      { k: "c", v: 10 },
      { k: "d", v: -50 },
    ];
    const render = (op: unknown) =>
      chart(parts)
        .flow(op)
        .mark(rect({ w: 10, h: "v" }))
        .toDisplayList({ w: 100, h: 130 });
    const stacked = rectsOf(await render(stack({ by: "k", dir: "y" })));
    const zero = stacked[0].y + stacked[0].h;
    const sums = [0, 30, 5, 15, -35];
    check(
      "each stacked part spans its two running sums",
      stacked.every((r, i) => {
        const [lo, hi] = [sums[i], sums[i + 1]].sort((p, q) => p - q);
        return (
          Math.abs(r.y - (zero - 2 * hi)) < 1e-9 &&
          Math.abs(r.y + r.h - (zero - 2 * lo)) < 1e-9
        );
      }),
      JSON.stringify(stacked)
    );
    // A spread packs the same bars as boxes, 8px apart, signs aside. It
    // separates them into a category axis, which reads top down.
    const spreadOut = rectsOf(await render(spread({ by: "k", dir: "y" })));
    check(
      "a spread still packs boxes edge to edge",
      spreadOut.every(
        (r, i) =>
          i === 0 ||
          Math.abs(spreadOut[i - 1].y + spreadOut[i - 1].h + 8 - r.y) < 1e-9
      ),
      JSON.stringify(spreadOut)
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

  console.log("\n# a sized spread of magnitudes roots its own scale");
  {
    // The spread's x type is ordinal (separate spaces), but its room depends
    // on σ, so its explicit w roots its own σ-scope: the bars fit the 300 px
    // box, not the 500 px canvas.
    const dl = await chart([
      { c: "a", v: 10 },
      { c: "b", v: 20 },
      { c: "c", v: 30 },
    ])
      .flow(spread({ by: "c", dir: "x", w: 300 }))
      .mark(rect({ w: "v", h: 20 }))
      .toDisplayList({ w: 500, h: 100 });
    const rs = rectsOf(dl);
    const span =
      Math.max(...rs.map((r) => r.x + r.w)) - Math.min(...rs.map((r) => r.x));
    check(
      "the bars span the spread's 300 px",
      Math.abs(span - 300) < 1e-6,
      `span ${span}`
    );
    check(
      "the bars keep their data ratio",
      Math.abs(rs[2].w / rs[0].w - 3) < 1e-9,
      JSON.stringify(rs.map((r) => r.w))
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
