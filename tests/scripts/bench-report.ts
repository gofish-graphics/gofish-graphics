/**
 * Post-process bench results for CI: build the trend series the Trend plot
 * reads, and render a PR delta comment against the latest `main` run.
 *
 * Inputs:
 *   - tests/tmp/bench/results.json   (current run, written by bench.ts)
 *   - --history-dir <dir>            (optional) a checkout of the `benchmarks`
 *                                    data branch, containing results/<sha>.json
 *
 * Outputs (under tests/tmp/bench/):
 *   - history.json   trend series (recent runs + the current one), consumed by
 *                    the Trend plot story via bench-plots.ts
 *   - comment.md     markdown delta table vs the latest main run (record-only)
 *
 * Timings on shared CI runners are noisy: this is informational, never a gate.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const TESTS_DIR = join(import.meta.dirname, "..");
const BENCH_DIR = join(TESTS_DIR, "tmp/bench");
const PASSES = ["resolve", "solve", "lower", "paint"];

type Stat = { median: number; min: number; p95: number; n: number };
type Results = {
  meta: { sha: string; timestamp: string };
  examplesJs: { id: string; passes: Record<string, Stat>; totalMs: Stat }[];
  examplesPy: { path: string; totalMs: Stat; loadMs: Stat; overheadMs: Stat }[];
  synthetic: {
    family: string;
    n: number;
    passes: Record<string, Stat>;
    totalMs: Stat;
  }[];
};

const argHistoryDir = (() => {
  const i = process.argv.indexOf("--history-dir");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

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
const delta = (cur: number, base: number): string => {
  if (!base) return "—";
  const pct = ((cur - base) / base) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
};

function main() {
  const results: Results = JSON.parse(
    readFileSync(join(BENCH_DIR, "results.json"), "utf-8")
  );

  // --- Build trend history from the benchmarks branch checkout (+ current). ---
  const history: {
    idx: number;
    label: string;
    passes: Record<string, number>;
  }[] = [];
  let baseline: Results | null = null;
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
    if (past.length > 0) baseline = past[past.length - 1];
    const series = [...past.slice(-19), results]; // last 19 + current = 20
    series.forEach((r, idx) => {
      history.push({
        idx,
        label: r.meta.sha.slice(0, 7),
        passes: aggPasses(r),
      });
    });
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

  // --- PR delta comment vs latest main run. ---
  const cur = aggPasses(results);
  const lines: string[] = [];
  lines.push("<!-- gofish-perf-bench -->");
  lines.push("## ⏱️ Layout performance benchmark");
  lines.push("");
  lines.push(
    baseline
      ? `Comparing against latest \`main\` run (\`${baseline.meta.sha.slice(0, 7)}\`). **Record-only — never blocks the PR.** CI runner timings are noisy; treat small deltas as noise.`
      : "First recorded run (no `main` baseline yet). **Record-only.**"
  );
  lines.push("");

  // Per-pass aggregate across real JS examples.
  lines.push("### Per-pass median across real examples (JS)");
  lines.push("");
  lines.push("| Pass | main | PR | Δ |");
  lines.push("| --- | ---: | ---: | ---: |");
  const base = baseline ? aggPasses(baseline) : null;
  for (const p of PASSES) {
    lines.push(
      `| ${p} | ${base ? fmt(base[p]) + " ms" : "—"} | ${fmt(cur[p])} ms | ${base ? delta(cur[p], base[p]) : "—"} |`
    );
  }
  lines.push("");

  // Python hit.
  lines.push("### Python path overhead (per example, median)");
  lines.push("");
  lines.push("| Metric | main | PR | Δ |");
  lines.push("| --- | ---: | ---: | ---: |");
  const curLoad = pyLoad(results);
  const curOver = pyOverhead(results);
  const baseLoad = baseline ? pyLoad(baseline) : 0;
  const baseOver = baseline ? pyOverhead(baseline) : 0;
  lines.push(
    `| warm \`/load\` (serialize) | ${baseline ? fmt(baseLoad) + " ms" : "—"} | ${fmt(curLoad)} ms | ${baseline ? delta(curLoad, baseLoad) : "—"} |`
  );
  lines.push(
    `| deserialize + derive RPC | ${baseline ? fmt(baseOver) + " ms" : "—"} | ${fmt(curOver)} ms | ${baseline ? delta(curOver, baseOver) : "—"} |`
  );
  lines.push("");

  // Synthetic headline: solve at the largest measured n per family.
  lines.push("### Synthetic `solve` at largest n");
  lines.push("");
  lines.push("| Family | n | solve (PR) |");
  lines.push("| --- | ---: | ---: |");
  const families = [...new Set(results.synthetic.map((s) => s.family))];
  for (const fam of families) {
    const pts = results.synthetic.filter((s) => s.family === fam);
    const last = pts.reduce((a, b) => (b.n > a.n ? b : a), pts[0]);
    if (last)
      lines.push(
        `| ${fam} | ${last.n} | ${fmt(last.passes.solve?.median ?? 0)} ms |`
      );
  }
  lines.push("");
  lines.push(
    `<sub>Full numbers + plots in the run's \`bench-results\` artifact. sha \`${results.meta.sha.slice(0, 7)}\`.</sub>`
  );

  writeFileSync(join(BENCH_DIR, "comment.md"), lines.join("\n") + "\n");
  console.log("Wrote history.json and comment.md");
}

main();
