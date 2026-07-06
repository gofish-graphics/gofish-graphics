/**
 * Interaction-layer unit tests (notes/design/interaction.md).
 * Run: `tsx src/tests/interaction.test.ts` (wired into `pnpm test` as
 * `test:interaction`).
 *
 * Pins the binding algebra's core contracts:
 *   - Equate: source pushes drive the target; one writer per anchor; gates
 *     drop writes while closed (sample-and-hold semantics);
 *   - Limit: clamp in the target's setter; multiple limits COMPOSE by
 *     interval intersection (the algebra's one well-defined meet);
 *   - invalid type pairs are rejected (scalar → range without offset);
 *   - invertAffine round-trips the recorded forward maps;
 *   - `when(...)` state channels carry cases + fallback without mutation.
 */
import {
  bind,
  invertAffine,
  type RangeAnchor,
  type ScalarAnchor,
  type SetAnchor,
} from "../interaction/bindings";
import { when, isStateChannel } from "../interaction/states";
import { from } from "../interaction/dataRef";
import { iscale } from "../interaction/params";

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

function scalarState(initial: number): ScalarAnchor & { peek: () => number } {
  let v = initial;
  const a: ScalarAnchor & { peek: () => number } = {
    kind: "scalar",
    get: () => v,
    set: (nv: number) => {
      v = nv;
    },
    peek: () => v,
  };
  return a;
}

function pushSource(): ScalarAnchor & { push: (v: number) => void } {
  const subs = new Set<(v: number) => void>();
  return {
    kind: "scalar",
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    push: (v: number) => {
      for (const fn of subs) fn(v);
    },
  };
}

console.log("equate");
{
  const src = pushSource();
  const dst = scalarState(0);
  bind(src, dst);
  src.push(42);
  ok("source push drives target", dst.peek() === 42);

  let threw = false;
  try {
    bind(pushSource(), dst);
  } catch {
    threw = true;
  }
  ok("second writer rejected (one writer per anchor)", threw);
}

console.log("equate gating");
{
  const src = pushSource();
  const dst = scalarState(0);
  let gate = false;
  bind(src, dst, { when: () => gate });
  src.push(7);
  ok("write dropped while gate closed", dst.peek() === 0);
  gate = true;
  src.push(9);
  ok("write lands while gate open", dst.peek() === 9);
}

console.log("limit (range → scalar)");
{
  const dst = scalarState(5);
  const range: RangeAnchor = { kind: "range", get: () => [0, 10] };
  bind(range, dst);
  dst.set!(25);
  ok("clamped to interval max", dst.peek() === 10);
  dst.set!(-3);
  ok("clamped to interval min", dst.peek() === 0);

  // A second limit narrows further: limits compose by intersection.
  bind({ kind: "range", get: () => [2, 6] }, dst);
  dst.set!(25);
  ok("two limits intersect (max)", dst.peek() === 6);
  dst.set!(-3);
  ok("two limits intersect (min)", dst.peek() === 2);
}

console.log("limit (range → range)");
{
  let cur: [number, number] = [0, 0];
  const dst: RangeAnchor = {
    kind: "range",
    get: () => cur,
    set: (v) => {
      cur = v;
    },
  };
  bind({ kind: "range", get: () => [0, 100] }, dst);
  dst.set!([-50, 150]);
  ok(
    "range clamped into domain",
    cur[0] === 0 && cur[1] === 100,
    JSON.stringify(cur)
  );
}

console.log("match (set → scalar/range)");
{
  const bandSet: SetAnchor = {
    kind: "set",
    member: "range",
    entries: () =>
      new Map<string, [number, number]>([
        ["a", [0, 10]],
        ["b", [20, 30]],
      ]),
  };

  const s = scalarState(0);
  bind(bandSet, s, { by: "nearest" });
  s.set!(12);
  ok("scalar snaps to nearest band edge", s.peek() === 10, String(s.peek()));
  s.set!(17);
  ok("scalar snaps up when closer", s.peek() === 20, String(s.peek()));

  let cur: [number, number] = [0, 0];
  const r: RangeAnchor = {
    kind: "range",
    get: () => cur,
    set: (v) => {
      cur = v;
    },
  };
  bind(bandSet, r, { by: "nearest" });
  r.set!([3, 24]);
  ok(
    "range endpoints snap independently",
    cur[0] === 0 && cur[1] === 20,
    JSON.stringify(cur)
  );

  let threw = false;
  try {
    bind(bandSet, scalarState(0));
  } catch {
    threw = true;
  }
  ok("match without explicit policy rejected", threw);

  // Gated match: writes pass through un-snapped while the gate is closed.
  const gated = scalarState(0);
  let gate = false;
  bind(bandSet, gated, { by: "nearest", when: () => gate });
  gated.set!(12);
  ok("gate closed → no snap", gated.peek() === 12);
  gate = true;
  gated.set!(12);
  ok("gate open → snap", gated.peek() === 10);
}

console.log("iscale");
{
  const s = iscale({ domain: [0, 600], range: [3, 40], round: true });
  ok("domain min → range min", s(0) === 3);
  ok("domain max → range max", s(600) === 40);
  ok("clamps below", s(-100) === 3);
  ok("clamps above", s(1000) === 40);
  ok("rounds", Number.isInteger(s(123)));
  const mid = s.invert(21.5);
  ok(
    "invert round-trips (unrounded)",
    Math.abs(iscale({ domain: [0, 600], range: [3, 40] })(mid) - 21.5) < 1e-9
  );
}

console.log("invalid pairs");
{
  const src = scalarState(1);
  const range: RangeAnchor = { kind: "range", get: () => [0, 1] };
  let threw = false;
  try {
    bind(src, range);
  } catch {
    threw = true;
  }
  ok("scalar → range rejected (Void without offset)", threw);
}

console.log("invertAffine");
{
  // Compose two affine legs like dataToPx = toPixel ∘ posScale, then invert.
  const posScale = (d: number) => d * 2.857142857;
  const toPixelY = (g: number) => 440 - g;
  const dataToPx = (d: number) => toPixelY(posScale(d));
  const pxToData = invertAffine(dataToPx);
  const roundTrip = pxToData(dataToPx(95));
  ok("round-trip within epsilon", Math.abs(roundTrip - 95) < 1e-9);

  let threw = false;
  try {
    invertAffine(() => 3);
  } catch {
    threw = true;
  }
  ok("degenerate scale rejected", threw);
}

console.log("when(...) state channels");
{
  const pred = () => true;
  const sc = when(pred, "red").elseWhen(() => false, "green").else("grey");
  ok("isStateChannel", isStateChannel(sc));
  ok("two cases in order", sc.cases.length === 2 && sc.cases[0].value === "red");
  ok("fallback", sc.fallback === "grey");
  ok("plain values are not state channels", !isStateChannel("red"));
}

console.log("dataRef");
{
  const data = [
    { v: 10, keep: true },
    { v: 20, keep: false },
    { v: 30, keep: true },
  ];
  const refAll = from(data);
  ok("count", refAll.count() === 3);
  const kept = refAll.filter((d) => d.keep);
  ok("filter", kept.count() === 2);
  ok("mean", kept.mean((d) => d.v)() === 20);
  ok("empty mean is undefined", from([]).mean((d: never) => 0)() === undefined);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
