/**
 * Function values (ast/fun.ts): exact pieces for functions built from rows,
 * and tolerance reads for opaque ones.
 * Run: `tsx src/tests/fun.test.ts` (wired into `pnpm test` as `test:fun`).
 */
import * as F from "../ast/fun";
import { channelSpline } from "../spline";

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
const close = (a: number, b: number, eps = 1e-9) =>
  Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const throws = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
};
const linear = { kind: "linear" } as const;
const step = { kind: "step" } as const;
const monotone = { kind: "monotone" } as const;
const smooth = { kind: "smooth" } as const;

/** The largest value of `f` over `n` even samples of its domain. */
const denseMax = (f: F.Fun<number>, n = 200000) => {
  const { min, max } = f.domain;
  let best = -Infinity;
  for (let i = 0; i <= n; i++)
    best = Math.max(best, f.at(min + ((max - min) * i) / n));
  return best;
};

console.log("# fun: functions built from rows");
{
  const f = F.through([0, 1, 3], [2, 6, 0], linear);
  ok(
    "a linear function reads its rows exactly",
    f.at(0) === 2 && f.at(1) === 6 && f.at(3) === 0
  );
  ok("and runs straight between them", f.at(2) === 3 && f.at(0.5) === 4);
  ok(
    "its domain is its knots' range",
    f.domain.min === 0 && f.domain.max === 3
  );
  ok("its knots are its rows", f.knots?.join() === "0,1,3", f.knots?.join());
  const g = F.through([0, 2], [0, 1], step);
  ok(
    "a step holds each value to the next knot",
    g.at(1.999) === 0 && g.at(2) === 1
  );
  const m = F.through([0, 1, 2, 4], [0, 3, 1, 5], monotone);
  const spline = channelSpline("monotone", [0, 1, 2, 4], [0, 3, 1, 5]);
  ok(
    "a monotone function is the curve spline.ts draws",
    [0.1, 0.5, 0.9].every((u) => close(m.at(u), spline.at(0, u))) &&
      [0.25, 0.75].every((u) => close(m.at(2 + 2 * u), spline.at(2, u)))
  );
  ok("and reads its rows exactly", m.at(1) === 3 && m.at(4) === 5);
  ok(
    "knots that are not ascending are an error",
    throws(() => F.through([0, 0], [1, 2], linear))?.includes(
      "strictly ascending"
    ) === true
  );
}

console.log("# fun: sums");
{
  const a = F.through([0, 2, 4], [1, 5, 1], linear);
  const b = F.through([1, 3], [4, 0], linear);
  const s = F.add(a, b);
  ok("a sum of two linears is linear", s.curve?.kind === "linear");
  ok(
    "over the union of their knots",
    s.knots?.join() === "0,1,2,3,4",
    s.knots?.join()
  );
  ok(
    "and exact at every knot, each part reading 0 outside its domain",
    s.at(0) === 1 &&
      s.at(1) === 3 + 4 &&
      s.at(2) === 5 + 2 &&
      s.at(3) === 3 + 0 &&
      s.at(4) === 1
  );
  ok("its maximum is exact", F.maximum(s) === 7, String(F.maximum(s)));
  ok("its minimum is exact", F.minimum(s) === 1);
  ok(
    "the sum's integral is the sum of integrals",
    F.integrate(s) === F.integrate(a) + F.integrate(b)
  );
  ok("a linear's integral is its trapezoids", F.integrate(a) === 12);
}

console.log("# fun: monotone sums, against dense sampling");
{
  const a = F.through([0, 1, 2, 3, 4, 5], [0, 4, 1, 3, 0.5, 2], monotone);
  const b = F.through([0.5, 1.5, 2.5, 3.5, 4.5], [3, 0, 5, 1, 4], monotone);
  const s = F.add(a, b);
  ok(
    "a sum with a cubic keeps its pieces but no curve",
    s.pieces !== undefined && s.curve === undefined
  );
  ok(
    "the max of a monotone sum is the max of dense sampling",
    close(F.maximum(s), denseMax(s), 1e-8),
    `${F.maximum(s)} vs ${denseMax(s)}`
  );
  ok("and is never below it", F.maximum(s) >= denseMax(s) - 1e-12);
  ok("its min likewise", close(F.minimum(s), -denseMax(F.scale(s, -1)), 1e-8));
  const c = F.add(
    F.through([0, 1, 2, 3], [1, 2, 0, 2], smooth),
    F.through([0, 1, 2, 3], [2, 0, 3, 1], smooth)
  );
  ok(
    "a smooth sum's max is the max of dense sampling",
    close(F.maximum(c), denseMax(c), 1e-8)
  );
  ok(
    "the integral of a monotone sum matches Simpson's",
    close(
      F.integrate(s),
      F.integrate(F.opaque(s.at, { domain: s.domain, knots: s.knots })),
      1e-8
    )
  );
}

console.log("# fun: steps");
{
  const f = F.through([0, 1, 3, 4], [2, -1, 5, 7], step);
  ok(
    "a step's integral holds each value to the next knot",
    F.integrate(f) === 2 * 1 + -1 * 2 + 5 * 1
  );
  ok("a step's maximum counts its last value", F.maximum(f) === 7);
  const g = F.add(f, F.through([0, 2, 4], [1, 1, 0], step));
  ok(
    "a sum of steps is a step",
    g.curve?.kind === "step" && g.at(3.5) === 6 && g.at(1.5) === 0
  );
  ok(
    "a step's derivative is 0",
    F.maximum(F.derivative(f)) === 0 && F.minimum(F.derivative(f)) === 0
  );
}

console.log("# fun: restrict");
{
  const f = F.through([0, 2, 4, 6], [0, 4, 2, 6], linear);
  const r = F.restrict(f, { min: 1, max: 5 });
  ok(
    "a restriction narrows the domain",
    r.domain.min === 1 && r.domain.max === 5
  );
  ok("and keeps the values", r.at(1) === 2 && r.at(3) === 3 && r.at(5) === 4);
  ok(
    "its maximum is inside the cell",
    F.maximum(r) === 4 && F.minimum(r) === 2
  );
  ok("its integral is over the cell", F.integrate(r) === 3 + 3 + 3 + 3);
  ok(
    "its knots are the cell's ends and the knots inside",
    r.knots?.join() === "1,2,4",
    r.knots?.join()
  );
  ok(
    "a cell that misses the domain is an error",
    throws(() => F.restrict(f, { min: 7, max: 8 })) !== undefined
  );
}

console.log("# fun: derivatives");
{
  const f = F.through([0, 1, 3], [0, 2, 1], linear);
  const d = F.derivative(f);
  ok(
    "a linear's derivative is its slopes",
    d.at(0.5) === 2 && d.at(2) === -0.5
  );
  const m = F.through([0, 1, 2, 3], [0, 1, 4, 9], monotone);
  const dm = F.derivative(m);
  const h = 1e-6;
  ok(
    "a cubic's derivative is exact",
    close(dm.at(1.5), (m.at(1.5 + h) - m.at(1.5 - h)) / (2 * h), 1e-6)
  );
}

console.log("# fun: constants, records and envelopes");
{
  const c = F.constant(3);
  ok(
    "a constant is defined everywhere",
    c.at(-1e9) === 3 && c.at(1e9) === 3 && F.isConstant(c)
  );
  ok("its maximum is its value", F.maximum(c) === 3 && F.minimum(c) === 3);
  const sum = F.add(F.constant(0.1), F.constant(0.2));
  ok(
    "a sum of constants is their floating-point sum",
    F.isConstant(sum) && sum.at(0) === 0.1 + 0.2
  );
  const iv = F.record({
    min: F.through([0, 2], [-1, -3], linear),
    max: F.through([0, 2], [2, 4], linear),
  });
  ok("a record reads its members", iv.at(1).min === -2 && iv.at(1).max === 3);
  ok(
    "and gives them back exactly",
    F.maximum(F.field(iv, "max")) === 4 && F.minimum(F.field(iv, "min")) === -3
  );
  const thick = F.subtract(F.field(iv, "max"), F.field(iv, "min"));
  ok(
    "its thickness is exact",
    thick.at(0) === 3 && thick.at(2) === 7 && thick.pieces !== undefined
  );
  const up = F.upperEnvelope([
    F.through([0, 4], [0, 4], linear),
    F.through([0, 4], [3, 1], linear),
  ]);
  ok(
    "an envelope takes the larger at every point",
    up.at(0) === 3 && up.at(4) === 4 && close(up.at(2), 2)
  );
  ok(
    "its maximum and minimum are exact",
    F.maximum(up) === 4 && close(F.minimum(up), 2)
  );
  ok(
    "an envelope of constants is the largest",
    F.maximum(
      F.upperEnvelope([F.constant(2), F.constant(5), F.constant(-1)])
    ) === 5
  );
  const low = F.lowerEnvelope([
    F.through([0, 1], [1, 1], linear),
    F.through([2, 3], [0, 0], linear),
  ]);
  ok(
    "a gap in a lower envelope reads +inf",
    low.at(1.5) === Infinity && F.minimum(low) === 0
  );
  const ends = F.upperEnvelope([
    F.through([0, 1], [3, 6], linear),
    F.constant(1),
  ]);
  ok(
    "an envelope keeps a member's value at the end of its domain",
    ends.at(1) === 6 && ends.at(1.5) === 1 && ends.at(0.5) === 4.5,
    `${ends.at(1)} ${ends.at(1.5)} ${ends.at(0.5)}`
  );
  ok("and its maximum counts it", F.maximum(ends) === 6);
  const joined = F.add(
    F.through([0, 1], [3, 6], linear),
    F.constant(1, { min: 0, max: 2 })
  );
  ok(
    "a sum reads each member's last value at its end",
    joined.at(1) === 7 && joined.at(1.5) === 1 && joined.at(2) === 1
  );
  const cubicUp = F.upperEnvelope([
    F.through([0, 1, 2, 3], [0, 3, 0, 3], monotone),
    F.through([0, 1, 2, 3], [2, 1, 2, 1], monotone),
  ]);
  ok(
    "an envelope of cubics matches dense sampling",
    close(F.maximum(F.scale(cubicUp, -1)), denseMax(F.scale(cubicUp, -1)), 1e-8)
  );
}

console.log("# fun: opaque functions");
{
  const g = F.opaque((t) => Math.exp(-t * t), { domain: { min: -3, max: 2 } });
  ok("an opaque maximum is read to a tolerance", close(F.maximum(g), 1, 1e-12));
  ok(
    "an opaque integral too",
    close(F.integrate(g), (Math.sqrt(Math.PI) / 2) * (erf(3) + erf(2)), 1e-8)
  );
  ok(
    "its derivative too",
    close(F.derivative(g).at(1), -2 * Math.exp(-1), 1e-5)
  );
  const unbounded = F.opaque((t) => t, { domain: { min: 0, max: Infinity } });
  ok(
    "an opaque function over an unbounded domain cannot be read",
    throws(() => F.maximum(unbounded)) !== undefined
  );
  const m = F.map(F.through([0, 1], [0, 1], linear), (v) => v * v);
  ok("a map is opaque", m.pieces === undefined && close(F.maximum(m), 1));
}

console.log("# fun: multiply and antiderivative");
{
  const f = F.through([0, 1, 3], [1, 3, 2], linear);
  const g = F.through([0, 2, 3], [2, 0, 4], linear);
  const fg = F.multiply(f, g);
  ok(
    "a product of exact functions is exact",
    fg.pieces !== undefined &&
      [0, 0.5, 1, 1.7, 2, 2.4, 3].every((u) =>
        close(fg.at(u), f.at(u) * g.at(u))
      )
  );
  const opaque = F.multiply(F.map(f, (v) => v), g);
  ok(
    "a product with an opaque function is opaque",
    opaque.pieces === undefined && close(opaque.at(1.7), f.at(1.7) * g.at(1.7))
  );
  const F1 = F.antiderivative(f);
  ok(
    "the antiderivative of a polyline is exact, 0 at its start",
    F1.pieces !== undefined &&
      close(F1.at(0), 0) &&
      close(F1.at(1), 2) &&
      close(F1.at(3), 2 + 5)
  );
  const from = F.antiderivative(f, 1);
  ok(
    "it is 0 where it runs from",
    close(from.at(1), 0) && close(from.at(0), -2) && close(from.at(3), 5)
  );
  const dF = F.derivative(F1);
  ok(
    "its derivative is the function",
    [0.25, 0.5, 1.5, 2.9].every((u) => close(dF.at(u), f.at(u)))
  );
  const curve = F.through([0, 1, 2, 4], [0, 2, 1, 3], smooth);
  const C = F.antiderivative(curve);
  ok(
    "the antiderivative of cubics matches their integral",
    close(C.at(4), F.integrate(curve), 1e-9)
  );
  const wave = F.opaque((u: number) => Math.sin(u), {
    domain: { min: 0, max: Math.PI },
  });
  const W = F.antiderivative(wave);
  ok(
    "the antiderivative of an opaque function holds pieces that match it",
    W.pieces !== undefined &&
      [0.3, 1, 2, Math.PI].every((u) => close(W.at(u), 1 - Math.cos(u), 1e-8)),
    JSON.stringify([0.3, 1, 2, Math.PI].map((u) => W.at(u) - (1 - Math.cos(u))))
  );
}

/** Abramowitz and Stegun 7.1.26 is too coarse; use a series. */
function erf(x: number): number {
  let sum = 0;
  let term = x;
  for (let n = 0; n < 200; n++) {
    sum += term / (2 * n + 1);
    term *= (-x * x) / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
