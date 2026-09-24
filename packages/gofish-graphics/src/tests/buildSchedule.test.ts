/**
 * Unit tests for the build-in time layout (`src/animation/schedule.ts`) and a
 * stagger's `by` grouping (`src/animation/grouping.ts`). Run:
 * `tsx src/tests/buildSchedule.test.ts` (wired into `pnpm test` as
 * `test:build-schedule`).
 *
 * The contract: a stagger is distribute on t. `lag` fixes the step between
 * starts, `spacing` the gap between one end and the next start, `dwell` the
 * share of the time spent between starts; `from` picks which group goes
 * first; `by` groups children that start together; and a nested arrangement
 * is a nested time frame whose children start when its slot starts.
 */
// The library first, so its modules initialize in their usual order.
import { field } from "../lib";
import {
  solveSchedule,
  wavesOf,
  type Arrangement,
  type Clip,
} from "../animation/schedule";
import { groupEntries, rowsOf } from "../animation/grouping";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => near(v, b[i]));

const leaf = (duration: number, id: string): Clip<string> => ({
  kind: "leaf",
  duration,
  payload: id,
});
const group = (
  arrangement: Arrangement,
  children: Clip<string>[]
): Clip<string> => ({
  kind: "group",
  arrangement,
  groups: children.map((c) => [c]),
});
/** Starts in payload order. */
const startsOf = (clip: Clip<string>) => {
  const { items, total } = solveSchedule(clip);
  const byId = new Map(items.map((i) => [i.payload, i.start]));
  return {
    total,
    starts: (ids: string[]) => ids.map((id) => byId.get(id)!),
  };
};
const ids = (n: number, prefix = "") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

console.log("# lag: a fixed step between starts");
{
  const bars = ids(26);
  const s = startsOf(
    group(
      { kind: "stagger", lag: 60 },
      bars.map((id) => leaf(600, id))
    )
  );
  ok(
    "bar i starts at 60·i",
    same(
      s.starts(bars),
      bars.map((_, i) => 60 * i)
    )
  );
  ok("the build lasts 25·60 + 600 = 2100 ms", near(s.total, 2100));
}

console.log("# parallel: everything together");
{
  const s = startsOf(
    group({ kind: "parallel" }, [leaf(600, "a"), leaf(300, "b")])
  );
  ok("both start at 0", same(s.starts(["a", "b"]), [0, 0]));
  ok("the group lasts its longest child", near(s.total, 600));
}

console.log("# spacing: each starts when the one before ends");
{
  const s = startsOf(
    group({ kind: "stagger", spacing: 0 }, [
      leaf(100, "a"),
      leaf(200, "b"),
      leaf(300, "c"),
    ])
  );
  ok(
    "spacing 0 plays back to back",
    same(s.starts(["a", "b", "c"]), [0, 100, 300])
  );
  ok("and lasts the sum", near(s.total, 600));
  const t = startsOf(
    group({ kind: "stagger", spacing: 50 }, [leaf(100, "a"), leaf(100, "b")])
  );
  ok("spacing 50 leaves a 50 ms gap", same(t.starts(["a", "b"]), [0, 150]));
}

console.log("# dwell: the share of the time spent between starts");
{
  const bars = ids(26);
  const at = (dwell: number) =>
    startsOf(
      group(
        { kind: "stagger", dwell },
        bars.map((id) => leaf(600, id))
      )
    );
  const lag = (0.3 * 600) / (26 - 0.3 * 25);
  const s = at(0.3);
  ok(
    "δ = w·d / (n − w(n−1)) for w = 0.3",
    same(
      s.starts(bars),
      bars.map((_, i) => i * lag)
    )
  );
  ok(
    "and the dwell comes back out: n·δ / total = 0.3",
    near((26 * lag) / s.total, 0.3)
  );
  ok(
    "w = 0 starts everything together",
    same(
      at(0).starts(bars),
      bars.map(() => 0)
    )
  );
  ok(
    "w = 1 plays back to back",
    same(
      at(1).starts(bars),
      bars.map((_, i) => 600 * i)
    )
  );
}

console.log("# from: which group goes first");
{
  ok("first", JSON.stringify(wavesOf(4, "first")) === "[[0],[1],[2],[3]]");
  ok("last", JSON.stringify(wavesOf(4, "last")) === "[[3],[2],[1],[0]]");
  ok(
    "center, odd: the middle, then outward in pairs",
    JSON.stringify(wavesOf(5, "center")) === "[[2],[1,3],[0,4]]"
  );
  ok(
    "center, even: the middle two together",
    JSON.stringify(wavesOf(4, "center")) === "[[1,2],[0,3]]"
  );
  ok(
    "edges: both ends, then inward",
    JSON.stringify(wavesOf(5, "edges")) === "[[0,4],[1,3],[2]]"
  );
  ok(
    "an index: that group, then outward",
    JSON.stringify(wavesOf(4, 1)) === "[[1],[0,2],[3]]"
  );
  const bars = ids(5);
  const s = startsOf(
    group(
      { kind: "stagger", lag: 100, from: "center" },
      bars.map((id) => leaf(400, id))
    )
  );
  ok(
    "center with lag 100: 200, 100, 0, 100, 200",
    same(s.starts(bars), [200, 100, 0, 100, 200])
  );
  const r = startsOf(
    group({ kind: "stagger", spacing: 0, from: "last" }, [
      leaf(100, "a"),
      leaf(200, "b"),
    ])
  );
  ok(
    "last with spacing 0: b first, then a",
    same(r.starts(["a", "b"]), [200, 0])
  );
}

console.log("# by: equal keys start together, groups in the key's order");
{
  const children = [
    { datum: [{ city: "Seattle", v: 1 }] },
    { datum: [{ city: "Chicago", v: 5 }] },
    { datum: [{ city: "Seattle", v: 2 }] },
    { datum: [{ city: "Boston", v: 4 }] },
  ];
  const plain = groupEntries(children, rowsOf, "city");
  ok(
    "a plain field keeps the order the data shows",
    JSON.stringify([...plain.keys()]) ===
      JSON.stringify(["Seattle", "Chicago", "Boston"])
  );
  ok(
    "ties land in one group",
    plain.get("Seattle")!.length === 2 &&
      plain.get("Seattle")![0] === children[0] &&
      plain.get("Seattle")![1] === children[2]
  );
  const sorted = groupEntries(
    children,
    rowsOf,
    field("city").sort("v", "desc")
  );
  ok(
    "a field expression orders the groups (sum of v, descending)",
    JSON.stringify([...sorted.keys()]) ===
      JSON.stringify(["Chicago", "Boston", "Seattle"])
  );
  ok(
    "no by: each child is its own group, in order",
    [...groupEntries(children, rowsOf, undefined).values()].every(
      (g, i) => g.length === 1 && g[0] === children[i]
    )
  );
  let threw = false;
  try {
    groupEntries([{ datum: [{ city: "A" }, { city: "B" }] }], rowsOf, "city");
  } catch {
    threw = true;
  }
  ok("a child with rows of two keys is an error", threw);

  // Ties start together: a stagger over the grouped children.
  const clips: Clip<string>[][] = [...plain.values()].map((g) =>
    g.map((c) => leaf(400, String(children.indexOf(c))))
  );
  const { items } = solveSchedule<string>({
    kind: "group",
    arrangement: { kind: "stagger", lag: 100 },
    groups: clips,
  });
  const start = new Map(items.map((i) => [i.payload, i.start]));
  ok(
    "Seattle's two children start together, then Chicago, then Boston",
    same(
      ["0", "2", "1", "3"].map((k) => start.get(k)!),
      [0, 0, 100, 200]
    )
  );
}

console.log("# nesting: 4b, one month at a time, cities staggered inside");
{
  // 12 months, 3 cities each, lag 50 inside a month, 300 between months,
  // 400 ms grows.
  const months = ids(12, "m");
  const clip = group(
    { kind: "stagger", lag: 300 },
    months.map((m) =>
      group(
        { kind: "stagger", lag: 50 },
        ["a", "b", "c"].map((c) => leaf(400, `${m}${c}`))
      )
    )
  );
  const { items, total } = solveSchedule(clip);
  const start = new Map(items.map((i) => [i.payload, i.start]));
  ok(
    "city c of month m starts at 300·m + 50·c",
    months.every((m, i) =>
      ["a", "b", "c"].every((c, j) =>
        near(start.get(`${m}${c}`)!, 300 * i + 50 * j)
      )
    )
  );
  const monthEnd = (i: number) =>
    Math.max(...["a", "b", "c"].map((c) => start.get(`m${i}${c}`)! + 400)) -
    300 * i;
  ok(
    "each month lasts 2·50 + 400 = 500 ms",
    months.every((_, i) => near(monthEnd(i), 500))
  );
  ok("the build lasts 11·300 + 500 = 3800 ms", near(total, 3800));
}

console.log("# 4c, one city after another across all months (spacing 0)");
{
  // The selection form's shape: the stagger's children ARE the city groups.
  const clip: Clip<string> = {
    kind: "group",
    arrangement: { kind: "stagger", spacing: 0 },
    groups: ["Seattle", "Chicago", "Boston"].map((c) => [leaf(400, c)]),
  };
  const s = startsOf(clip);
  ok(
    "each city's bars start when the one before has grown",
    same(s.starts(["Seattle", "Chicago", "Boston"]), [0, 400, 800])
  );
}

console.log("# errors");
{
  const bad = (arrangement: Arrangement) => {
    try {
      solveSchedule(group(arrangement, [leaf(1, "a"), leaf(1, "b")]));
      return false;
    } catch {
      return true;
    }
  };
  ok("no lag / spacing / dwell", bad({ kind: "stagger" }));
  ok("two of them", bad({ kind: "stagger", lag: 10, spacing: 0 }));
  ok("a dwell over 1", bad({ kind: "stagger", dwell: 1.5 }));
  ok("a negative lag", bad({ kind: "stagger", lag: -5 }));
  ok("an index past the end", bad({ kind: "stagger", lag: 5, from: 7 }));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
