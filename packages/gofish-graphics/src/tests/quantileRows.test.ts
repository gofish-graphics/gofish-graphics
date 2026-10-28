/**
 * `quantileRows` (a shortcut until first-class distributions, #980): the
 * grid rows of a density curve become rows at its quantiles.
 *
 * Run: `tsx src/tests/quantileRows.test.ts` (wired as `pnpm
 * test:quantile-rows`).
 */
import { quantileRows } from "../ast/quantileRows";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}
const throws = (f: () => unknown): string => {
  try {
    f();
    return "no error";
  } catch (e) {
    return (e as Error).message;
  }
};

/** The inverse of the standard normal CDF (Acklam's rational
 *  approximation, relative error below 1.2e-9). */
function normInv(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

const normPdf = (x: number) => Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);

console.log("# quantileRows");
{
  // A normal density on a grid over [-6, 6] (wide enough that the tails it
  // leaves out move no quantile), given out of order, with a constant column
  // (`month`) and a varying one (`pdf`).
  const grid = Array.from({ length: 601 }, (_, i) => {
    const x = -6 + i * 0.02;
    return { month: "Jan", x, pdf: normPdf(x) };
  }).reverse();
  const n = 1000;
  const rows = quantileRows(grid, { x: "x", density: "pdf", n });
  const worst = Math.max(
    ...rows.map((r, i) => Math.abs((r.x as number) - normInv((i + 0.5) / n)))
  );
  check(
    "the rows of a normal grid are at its quantiles, to 0.005",
    rows.length === n && worst < 0.005,
    `worst error ${worst}`
  );
  check(
    "each row keeps the constant columns and drops the varying ones",
    rows.every((r) => r.month === "Jan" && !("pdf" in r)),
    JSON.stringify(rows[0])
  );
  check(
    "the rows are in order of x",
    rows.every((r, i) => i === 0 || (r.x as number) >= (rows[i - 1].x as number))
  );
  const uniform = quantileRows(
    [
      { x: 0, d: 2 },
      { x: 10, d: 2 },
    ],
    { x: "x", density: "d", n: 4 }
  );
  check(
    "a flat density gives evenly spaced rows",
    JSON.stringify(uniform.map((r) => r.x)) === "[1.25,3.75,6.25,8.75]",
    JSON.stringify(uniform)
  );
  check(
    "a density with no area is an error",
    throws(() =>
      quantileRows([{ x: 0, d: 1 }], { x: "x", density: "d", n: 3 })
    ).includes("no area")
  );
  check(
    "a negative density is an error",
    throws(() =>
      quantileRows(
        [
          { x: 0, d: 1 },
          { x: 1, d: -1 },
        ],
        { x: "x", density: "d", n: 3 }
      )
    ).includes("0 or more")
  );
  check(
    "n must be a whole number, 1 or more",
    throws(() =>
      quantileRows(
        [
          { x: 0, d: 1 },
          { x: 1, d: 1 },
        ],
        { x: "x", density: "d", n: 0 }
      )
    ).includes("whole number")
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
