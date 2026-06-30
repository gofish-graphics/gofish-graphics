/**
 * Post-process bench results for CI: build the trend series the Trend plot
 * reads, and render the PR comment.
 *
 * Two comparison signals, deliberately separated by how trustworthy they are:
 *
 *   - **Synthetic, same-runner Δ vs base** (`--base <file>`): the base commit is
 *     benchmarked in the *same CI job on the same runner* (Penrose-style
 *     pairwise A/B), so this delta is immune to cross-machine hardware variance
 *     — it's the rigorous regression signal.
 *   - **Real examples, absolute (this run)**: ecological per-pass + Python-tax
 *     numbers for HEAD only. We do NOT delta these against the history branch:
 *     that baseline was measured on a *different* runner at a different time, so
 *     a cross-run ms delta would be mostly noise. Shown for magnitude/health.
 *
 * Inputs:
 *   - tests/tmp/bench/results.json   (HEAD run, written by bench.ts)
 *   - --base <file>                  (optional) a base-commit results.json
 *                                    produced on THIS runner (synthetic mode)
 *   - --history-dir <dir>            (optional) a checkout of the `benchmarks`
 *                                    data branch (results/<sha>.json) for trend
 *
 * Outputs (under tests/tmp/bench/):
 *   - history.json   trend series (recent runs + current), read by the Trend plot
 *   - comment.md     the PR comment (record-only, never a gate)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const TESTS_DIR = join(import.meta.dirname, "..");
const BENCH_DIR = join(TESTS_DIR, "tmp/bench");
const PASSES = ["resolve", "axes", "embed", "solve", "lower", "paint"];

type Stat = { median: number; min: number; p95: number; n: number };
type SyntheticPoint = {
  family: string;
  n: number;
  passes: Record<string, Stat>;
  totalMs: Stat;
};
type Results = {
  meta: { sha: string; timestamp: string };
  examplesJs: { id: string; passes: Record<string, Stat>; totalMs: Stat }[];
  examplesPy: { path: string; totalMs: Stat; loadMs: Stat; overheadMs: Stat }[];
  synthetic: SyntheticPoint[];
};

const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const argHistoryDir = argValue("--history-dir");
const argBase = argValue("--base");

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Aggregate per-pass median across the JS example corpus (the "real" mix). */
const aggPasses = (r: Results): Record<string, number> =>
  Object.fromEntries(
    PASSES.map((p) => [
      p,
      median(r.examplesJs.map((e) => e.passes[p]?.median ?? 0)),
    ])
  );

const pyOverhead = (r: Results): number =>
  median(r.examplesPy.map((e) => e.overheadMs.median));
const pyLoad = (r: Results): number =>
  median(r.examplesPy.map((e) => e.loadMs.median));

const fmt = (ms: number): string => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(2));
const deltaPct = (cur: number, base: number): string => {
  if (!base) return "—";
  const pct = ((cur - base) / base) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const families = (r: Results): string[] => [
  ...new Set(r.synthetic.map((s) => s.family)),
];
const pointAt = (
  r: Results,
  fam: string,
  n: number
): SyntheticPoint | undefined =>
  r.synthetic.find((s) => s.family === fam && s.n === n);
/** Largest n present for `fam` in BOTH runs (fair same-n comparison). */
const commonMaxN = (
  a: Results,
  b: Results,
  fam: string
): number | undefined => {
  const bn = new Set(
    b.synthetic.filter((s) => s.family === fam).map((s) => s.n)
  );
  const shared = a.synthetic
    .filter((s) => s.family === fam && bn.has(s.n))
    .map((s) => s.n);
  return shared.length ? Math.max(...shared) : undefined;
};

function main() {
  const results: Results = JSON.parse(
    readFileSync(join(BENCH_DIR, "results.json"), "utf-8")
  );
  const base: Results | null =
    argBase && existsSync(argBase)
      ? (JSON.parse(readFileSync(argBase, "utf-8")) as Results)
      : null;

  // --- Build trend history from the benchmarks branch checkout (+ current). ---
  const history: {
    idx: number;
    label: string;
    passes: Record<string, number>;
  }[] = [];
  if (argHistoryDir) {
    const resultsDir = join(argHistoryDir, "results");
    const past: Results[] = existsSync(resultsDir)
      ? readdirSync(resultsDir)
          .filter((f) => f.endsWith(".json"))
          .map(
            (f) =>
              JSON.parse(readFileSync(join(resultsDir, f), "utf-8")) as Results
          )
          .sort((a, b) => a.meta.timestamp.localeCompare(b.meta.timestamp))
      : [];
    const series = [...past.slice(-19), results]; // last 19 + current = 20
    series.forEach((r, idx) =>
      history.push({
        idx,
        label: r.meta.sha.slice(0, 7),
        passes: aggPasses(r),
      })
    );
  } else {
    history.push({
      idx: 0,
      label: results.meta.sha.slice(0, 7),
      passes: aggPasses(results),
    });
  }
  writeFileSync(
    join(BENCH_DIR, "history.json"),
    JSON.stringify(history, null, 2)
  );

  // --- PR comment. ---
  const lines: string[] = [];
  lines.push("<!-- gofish-perf-bench -->");
  lines.push("## ⏱️ Layout performance benchmark");
  lines.push("");
  lines.push("**Record-only — never blocks the PR.**");
  lines.push("");

  // Section 1: synthetic same-runner Δ (the trustworthy regression signal).
  if (base) {
    lines.push(
      `### Synthetic micro-benchmarks — same-runner Δ vs base \`${base.meta.sha.slice(0, 7)}\``
    );
    lines.push("");
    lines.push(
      "Base and PR benchmarked back-to-back on the *same* runner, so this Δ is free of cross-machine variance. Values are `solve` / total engine median at the largest `n` (or depth) measured on both."
    );
    lines.push("");
    lines.push("| Family | n | solve base→PR | Δ | total base→PR | Δ |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const fam of families(results)) {
      const n = commonMaxN(results, base, fam);
      if (n === undefined) continue;
      const h = pointAt(results, fam, n)!;
      const b = pointAt(base, fam, n)!;
      const hs = h.passes.solve?.median ?? 0;
      const bs = b.passes.solve?.median ?? 0;
      lines.push(
        `| ${fam} | ${n} | ${fmt(bs)} → ${fmt(hs)} ms | ${deltaPct(hs, bs)} | ${fmt(b.totalMs.median)} → ${fmt(h.totalMs.median)} ms | ${deltaPct(h.totalMs.median, b.totalMs.median)} |`
      );
    }
    lines.push("");
  } else {
    lines.push("### Synthetic micro-benchmarks (this run)");
    lines.push("");
    lines.push(
      "_No same-runner base available (the base commit predates the bench tooling); showing absolute `solve` at the largest `n`._"
    );
    lines.push("");
    lines.push("| Family | n | solve |");
    lines.push("| --- | ---: | ---: |");
    for (const fam of families(results)) {
      const pts = results.synthetic.filter((s) => s.family === fam);
      const last = pts.reduce((a, b) => (b.n > a.n ? b : a), pts[0]);
      if (last)
        lines.push(
          `| ${fam} | ${last.n} | ${fmt(last.passes.solve?.median ?? 0)} ms |`
        );
    }
    lines.push("");
  }

  // Section 2: ecological numbers, HEAD-absolute (NOT cross-run delta'd).
  const cur = aggPasses(results);
  lines.push("### Real examples — absolute (this run)");
  lines.push("");
  lines.push(
    "Per-pass median across the JS example corpus, plus the Python-path tax. Shown for magnitude, not delta'd: the only cross-run baseline lives on a different runner, so a ms delta here would be mostly noise. Watch these via the trend plot in the artifact."
  );
  lines.push("");
  lines.push("| Pass (JS examples) | median |");
  lines.push("| --- | ---: |");
  for (const p of PASSES) lines.push(`| ${p} | ${fmt(cur[p])} ms |`);
  if (results.examplesPy.length > 0) {
    lines.push(`| warm \`/load\` (Python) | ${fmt(pyLoad(results))} ms |`);
    lines.push(
      `| deserialize + RPC (Python) | ${fmt(pyOverhead(results))} ms |`
    );
  }
  lines.push("");
  lines.push(
    `<sub>Full numbers + plots in the run's \`bench-results\` artifact. sha \`${results.meta.sha.slice(0, 7)}\`.</sub>`
  );

  writeFileSync(join(BENCH_DIR, "comment.md"), lines.join("\n") + "\n");
  console.log(
    `Wrote history.json and comment.md${base ? " (same-runner pairwise)" : " (HEAD-only)"}`
  );
}

main();
