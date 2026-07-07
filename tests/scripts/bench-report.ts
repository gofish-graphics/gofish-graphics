/**
 * Post-process bench results for CI: build the longitudinal trend series and
 * render the PR comment.
 *
 * The trend model has three deliberately-separated statistics:
 *
 *   - **Ruler-normalized matched geomean** — the "existing examples aren't
 *     getting slower" signal. For each consecutive pair of runs we take the
 *     per-story ratio of engine-pass medians over *matched* stories (same id AND
 *     same specHash present in both runs), divide each side by its run's ruler
 *     factor (canceling the CI hardware lottery), geomean the ratios per pass,
 *     and chain them into a cumulative `ecologicalIndex` (first run in the window
 *     = 1.0). Matching on specHash auto-excludes new/edited stories, so this is
 *     never a corpus median over a shifting set. Runs lacking ruler data fall
 *     back to raw-ms ratios (still same-corpus matched).
 *   - **Fitted exponents** — per synthetic family we fit `ln t = ln a + b·ln n`
 *     for `solve` and the engine total. The slope `b` is nearly machine-
 *     invariant (machine speed shifts the intercept `a`, not `b`), so it's the
 *     asymptotics trend; `a` is reported ruler-normalized when possible.
 *   - **Same-runner pairwise Δ vs base** (`--base <file>`, produced interleaved
 *     by bench.ts --ab): HEAD and base sampled alternately on the same runner, so
 *     the synthetic Δ is free of both cross-machine variance and thermal drift.
 *
 * Ecological ms numbers are shown HEAD-absolute for magnitude, plus a matched
 * geomean vs the most recent history run. Caveat: examples-js `wallMs` is a lower
 * bound (fire-and-forget stories), so matched ratios and totals use the sum of
 * engine passes, never wallMs.
 *
 * Inputs:
 *   - tests/tmp/bench/results.json   (HEAD run, written by bench.ts)
 *   - --base <file>                  (optional) a base-commit results.json
 *                                    produced interleaved on THIS runner
 *   - --history-dir <dir>            (optional) a checkout of the `benchmarks`
 *                                    data branch: results/<sha>.json plus
 *                                    ruler/<ver>/manifest.json and
 *                                    ruler/<ver>/splice.json
 *
 * Outputs (under tests/tmp/bench/):
 *   - history.json   trend series (fixed contract, see HistoryRun)
 *   - comment.md     the PR comment (record-only, never a gate)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const TESTS_DIR = join(import.meta.dirname, "..");
const BENCH_DIR = join(TESTS_DIR, "tmp/bench");
// Engine passes (excludes `fonts`); "total" is the sum, tracked alongside.
const PASSES = ["resolve", "axes", "embed", "solve", "lower", "paint"];

type Stat = { median: number; min: number; p95: number; n: number };
type ExampleResult = {
  id: string;
  specHash?: string;
  passes: Record<string, Stat>;
  totalMs: Stat;
};
type SyntheticPoint = {
  family: string;
  n: number;
  passes: Record<string, Stat>;
  totalMs: Stat;
};
type RulerMeta = {
  version: string;
  factorMs: number;
  points: { family: string; n: number; wallMs: Stat }[];
};
type Results = {
  meta: {
    sha: string;
    timestamp: string;
    interleaved?: boolean;
    ruler: RulerMeta | null;
  };
  examplesJs: ExampleResult[];
  examplesPy: { path: string; totalMs: Stat; loadMs: Stat; overheadMs: Stat }[];
  synthetic: SyntheticPoint[];
};

// --- history.json contract (fixed — the trend-plot story reads exactly this) ---
type Fit = { a: number; b: number; r2: number };
type HistoryRun = {
  idx: number;
  label: string; // sha7
  timestamp: string;
  rulerVersion: string | null;
  matchedCount: number;
  // Cumulative ruler-normalized index; keys: each engine pass + "total".
  // First run in the window = 1.0.
  ecologicalIndex: Record<string, number>;
  // Per synthetic family: fitted exponents for `solve` and engine `total`.
  exponents: Record<string, { solve: Fit; total: Fit }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Geometric mean over strictly-positive values; 1 if empty. */
const geomean = (xs: number[]): number => {
  const pos = xs.filter((x) => x > 0);
  if (pos.length === 0) return 1;
  return Math.exp(pos.reduce((a, x) => a + Math.log(x), 0) / pos.length);
};

const fmt = (ms: number): string => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(2));
const deltaPct = (cur: number, base: number): string => {
  if (!base) return "—";
  const p = ((cur - base) / base) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};
const ratioPct = (r: number): string => {
  const p = (r - 1) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};

const rulerFactor = (r: Results): number | null => {
  const f = r.meta.ruler?.factorMs;
  return f && f > 0 ? f : null;
};

// ---------------------------------------------------------------------------
// Matched-story ratios (ruler-normalized) for the ecological index
// ---------------------------------------------------------------------------

const matchKey = (e: ExampleResult): string => `${e.id}@${e.specHash ?? ""}`;

/** Stories present in BOTH runs under the same id AND specHash. */
function matchedPairs(
  prev: Results,
  cur: Results
): { prev: ExampleResult; cur: ExampleResult }[] {
  const byKey = new Map(prev.examplesJs.map((e) => [matchKey(e), e]));
  const out: { prev: ExampleResult; cur: ExampleResult }[] = [];
  for (const e of cur.examplesJs) {
    const p = byKey.get(matchKey(e));
    if (p) out.push({ prev: p, cur: e });
  }
  return out;
}

/**
 * Geomean of per-story ratios of a pass value between prev→cur over matched
 * stories, each side divided by its run's ruler factor when both runs carry
 * ruler data (else raw ms — same-corpus matched, so still meaningful).
 */
function passStepRatio(
  prev: Results,
  cur: Results,
  valueOf: (e: ExampleResult) => number
): number {
  const pf = rulerFactor(prev);
  const cf = rulerFactor(cur);
  const ruled = pf != null && cf != null;
  const ratios: number[] = [];
  for (const { prev: p, cur: c } of matchedPairs(prev, cur)) {
    const pv = valueOf(p);
    const cv = valueOf(c);
    if (!(pv > 0) || !(cv > 0)) continue;
    ratios.push(ruled ? cv / cf! / (pv / pf!) : cv / pv);
  }
  return geomean(ratios);
}

// ---------------------------------------------------------------------------
// Log-log exponent fit: t = a · n^b
// ---------------------------------------------------------------------------

function fitExponent(
  pts: { n: number; t: number }[],
  factor: number | null
): Fit {
  // Only points above the timer-noise floor, and enough of them to fit.
  const use = pts.filter((p) => p.t > 0.5 && p.n > 0);
  if (use.length < 4) return { a: 0, b: 0, r2: 0 };
  const xs = use.map((p) => Math.log(p.n));
  const ys = use.map((p) => Math.log(p.t));
  const m = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / m;
  const my = ys.reduce((a, y) => a + y, 0) / m;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < m; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return { a: 0, b: 0, r2: 0 };
  const b = sxy / sxx;
  const intercept = my - b * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  // Intercept a scales with machine speed → ruler-normalize when possible.
  const a = Math.exp(intercept) / (factor ?? 1);
  return { a, b, r2 };
}

function familyExponents(r: Results): HistoryRun["exponents"] {
  const factor = rulerFactor(r);
  const out: HistoryRun["exponents"] = {};
  for (const fam of new Set(r.synthetic.map((s) => s.family))) {
    const pts = r.synthetic.filter((s) => s.family === fam);
    out[fam] = {
      solve: fitExponent(
        pts.map((p) => ({ n: p.n, t: p.passes.solve?.median ?? 0 })),
        factor
      ),
      total: fitExponent(
        pts.map((p) => ({ n: p.n, t: p.totalMs.median })),
        factor
      ),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Splice lookup: cross-ruler multiplier folded into the chain at a re-cut
// ---------------------------------------------------------------------------

/** ruler/<toVer>/splice.json ratio (geomean new/old wall), or null if absent.
 *  Tolerant of a `v`-prefixed dir name (v0.1.0) vs the bare manifest version. */
function spliceRatio(
  historyDir: string | undefined,
  toVer: string | null
): number | null {
  if (!historyDir || !toVer) return null;
  for (const dir of [toVer, `v${toVer}`]) {
    const f = join(historyDir, "ruler", dir, "splice.json");
    if (!existsSync(f)) continue;
    try {
      const s = JSON.parse(readFileSync(f, "utf-8"));
      return typeof s.ratio === "number" && s.ratio > 0 ? s.ratio : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Synthetic pairwise (same-runner Δ vs base)
// ---------------------------------------------------------------------------

const families = (r: Results): string[] => [
  ...new Set(r.synthetic.map((s) => s.family)),
];
const pointAt = (r: Results, fam: string, n: number) =>
  r.synthetic.find((s) => s.family === fam && s.n === n);
const commonNs = (a: Results, b: Results, fam: string): number[] => {
  const bn = new Set(
    b.synthetic.filter((s) => s.family === fam).map((s) => s.n)
  );
  return a.synthetic
    .filter((s) => s.family === fam && bn.has(s.n))
    .map((s) => s.n)
    .sort((x, y) => x - y);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const results: Results = JSON.parse(
    readFileSync(join(BENCH_DIR, "results.json"), "utf-8")
  );
  const base: Results | null =
    argBase && existsSync(argBase)
      ? (JSON.parse(readFileSync(argBase, "utf-8")) as Results)
      : null;

  // --- Assemble the run window (past runs from the data branch + current). ---
  const past: Results[] = (() => {
    if (!argHistoryDir) return [];
    const resultsDir = join(argHistoryDir, "results");
    if (!existsSync(resultsDir)) return [];
    return readdirSync(resultsDir)
      .filter((f) => f.endsWith(".json"))
      .map(
        (f) => JSON.parse(readFileSync(join(resultsDir, f), "utf-8")) as Results
      )
      .sort((a, b) => a.meta.timestamp.localeCompare(b.meta.timestamp));
  })();
  const series = [...past.slice(-19), results]; // last 19 + current = 20

  // --- Chain the cumulative ecological index over consecutive pairs. ---
  const history: HistoryRun[] = [];
  const indexKeys = [...PASSES, "total"];
  let prevIndex: Record<string, number> = Object.fromEntries(
    indexKeys.map((k) => [k, 1.0])
  );
  series.forEach((run, idx) => {
    const rulerVersion = run.meta.ruler?.version ?? null;
    if (idx === 0) {
      history.push({
        idx,
        label: run.meta.sha.slice(0, 7),
        timestamp: run.meta.timestamp,
        rulerVersion,
        matchedCount: 0,
        ecologicalIndex: { ...prevIndex },
        exponents: familyExponents(run),
      });
      return;
    }
    const prev = series[idx - 1];
    const matchedCount = matchedPairs(prev, run).length;
    // A ruler re-cut between runs: fold the splice multiplier into every pass.
    // Only valid when the step itself is ruler-normalized — passStepRatio falls
    // back to raw ms when either side lacks a usable factor, and a raw step
    // must not be splice-corrected.
    const splice =
      prev.meta.ruler?.version !== rulerVersion &&
      rulerFactor(prev) != null &&
      rulerFactor(run) != null
        ? spliceRatio(argHistoryDir, rulerVersion)
        : null;
    let nextIndex: Record<string, number>;
    if (matchedCount < 3) {
      // Too few matched stories to trust a geomean — carry the index flat.
      nextIndex = { ...prevIndex };
    } else {
      nextIndex = {};
      for (const p of PASSES) {
        const step = passStepRatio(prev, run, (e) => e.passes[p]?.median ?? 0);
        nextIndex[p] = prevIndex[p] * step * (splice ?? 1);
      }
      const totalStep = passStepRatio(prev, run, (e) => e.totalMs.median);
      nextIndex.total = prevIndex.total * totalStep * (splice ?? 1);
    }
    history.push({
      idx,
      label: run.meta.sha.slice(0, 7),
      timestamp: run.meta.timestamp,
      rulerVersion,
      matchedCount,
      ecologicalIndex: nextIndex,
      exponents: familyExponents(run),
    });
    prevIndex = nextIndex;
  });

  writeFileSync(
    join(BENCH_DIR, "history.json"),
    JSON.stringify(history, null, 2)
  );

  // ------------------------------------------------------------------------
  // PR comment
  // ------------------------------------------------------------------------
  const lines: string[] = [];
  lines.push("<!-- gofish-perf-bench -->");
  lines.push("## ⏱️ Layout performance benchmark");
  lines.push("");
  lines.push("**Record-only — never blocks the PR.**");
  if (results.meta.ruler)
    lines.push(
      `\n<sub>ruler v${results.meta.ruler.version} factor: ${fmt(results.meta.ruler.factorMs)} ms — longitudinal numbers are divided by this.</sub>`
    );
  lines.push("");

  // Section 1: synthetic same-runner Δ vs base.
  if (base) {
    const interleaved = base.meta.interleaved || results.meta.interleaved;
    lines.push(
      `### Synthetic micro-benchmarks — same-runner Δ vs base \`${base.meta.sha.slice(0, 7)}\``
    );
    lines.push("");
    lines.push(
      interleaved
        ? "Base and PR sampled **interleaved** on the same runner (one sample each, alternating), so this Δ is free of cross-machine variance *and* thermal drift. Columns are the geomean of per-`n` ratios across all common `n`; detail is the absolute pair at the largest common `n`."
        : "Base and PR benchmarked back-to-back on the same runner. Columns are the geomean of per-`n` ratios across all common `n`; detail is the absolute pair at the largest common `n`."
    );
    lines.push("");
    lines.push(
      "| Family | solve (geomean Δ) | total (geomean Δ) | largest-n total base→PR |"
    );
    lines.push("| --- | ---: | ---: | ---: |");
    for (const fam of families(results)) {
      const ns = commonNs(results, base, fam);
      if (ns.length === 0) continue;
      const solveRatios: number[] = [];
      const totalRatios: number[] = [];
      let outOfSpread = 0;
      for (const n of ns) {
        const h = pointAt(results, fam, n)!;
        const b = pointAt(base, fam, n)!;
        const hs = h.passes.solve?.median ?? 0;
        const bs = b.passes.solve?.median ?? 0;
        if (bs > 0 && hs > 0) solveRatios.push(hs / bs);
        if (b.totalMs.median > 0 && h.totalMs.median > 0)
          totalRatios.push(h.totalMs.median / b.totalMs.median);
        // Flag when HEAD's total lands outside the base run's own spread.
        if (
          h.totalMs.median < b.totalMs.min ||
          h.totalMs.median > b.totalMs.p95
        )
          outOfSpread++;
      }
      const flag = outOfSpread * 2 > ns.length ? " ⚠️" : "";
      const nMax = ns[ns.length - 1];
      const hT = pointAt(results, fam, nMax)!.totalMs.median;
      const bT = pointAt(base, fam, nMax)!.totalMs.median;
      lines.push(
        `| ${fam}${flag} | ${ratioPct(geomean(solveRatios))} | ${ratioPct(geomean(totalRatios))} | ${fmt(bT)} → ${fmt(hT)} ms (n=${nMax}) |`
      );
    }
    lines.push("");
    lines.push(
      "<sub>⚠️ = HEAD total fell outside the base run's min–p95 spread at the majority of common points. Unflagged rows are within run-to-run noise.</sub>"
    );
    lines.push("");
  } else {
    lines.push("### Synthetic micro-benchmarks (this run)");
    lines.push("");
    lines.push(
      "_No same-runner base available; showing absolute `solve` at the largest `n`._"
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

  // Section 2: fitted exponents (asymptotics trend).
  {
    const exps = familyExponents(results);
    const baseExps = base ? familyExponents(base) : null;
    lines.push("### Fitted exponents — `t = a·n^b` (solve)");
    lines.push("");
    lines.push(
      "Slope `b` is near machine-invariant (speed shifts the intercept, not the slope), so it tracks the asymptotics regardless of runner."
    );
    lines.push("");
    lines.push(
      base
        ? "| Family | b (solve) | R² | Δb vs base |"
        : "| Family | b (solve) | R² |"
    );
    lines.push(base ? "| --- | ---: | ---: | ---: |" : "| --- | ---: | ---: |");
    for (const fam of Object.keys(exps)) {
      const f = exps[fam].solve;
      if (f.r2 === 0 && f.b === 0) continue; // too few points to fit
      const db =
        base && baseExps?.[fam]
          ? (f.b - baseExps[fam].solve.b >= 0 ? "+" : "") +
            (f.b - baseExps[fam].solve.b).toFixed(2)
          : "—";
      lines.push(
        base
          ? `| ${fam} | ${f.b.toFixed(2)} | ${f.r2.toFixed(3)} | ${db} |`
          : `| ${fam} | ${f.b.toFixed(2)} | ${f.r2.toFixed(3)} |`
      );
    }
    lines.push("");
  }

  // Section 3: ecological numbers, HEAD-absolute + matched geomean vs last run.
  // PR runs are synthetic-only — an all-zero "real examples" table there would
  // be noise masquerading as data, so the section only renders when an
  // ecological leg actually ran.
  if (results.examplesJs.length > 0 || results.examplesPy.length > 0) {
    const aggPass = (r: Results, p: string): number =>
      median(r.examplesJs.map((e) => e.passes[p]?.median ?? 0));
    const recentPast = past.length > 0 ? past[past.length - 1] : null;
    const ruled = recentPast
      ? rulerFactor(recentPast) != null && rulerFactor(results) != null
      : false;
    lines.push("### Real examples — absolute (this run)");
    lines.push("");
    lines.push(
      recentPast
        ? `Per-pass median across the JS example corpus (HEAD-absolute), plus the matched geomean vs the most recent history run \`${recentPast.meta.sha.slice(0, 7)}\` over stories present in both (same id + specHash), ${ruled ? "**ruler-normalized**" : "raw ms (no ruler on both runs)"}.`
        : "Per-pass median across the JS example corpus, plus the Python-path tax. Shown for magnitude, not delta'd (no history baseline available)."
    );
    lines.push("");
    lines.push(
      recentPast
        ? "| Pass (JS examples) | median | matched Δ vs last |"
        : "| Pass (JS examples) | median |"
    );
    lines.push(recentPast ? "| --- | ---: | ---: |" : "| --- | ---: |");
    for (const p of PASSES) {
      if (recentPast) {
        const step = passStepRatio(
          recentPast,
          results,
          (e) => e.passes[p]?.median ?? 0
        );
        lines.push(
          `| ${p} | ${fmt(aggPass(results, p))} ms | ${ratioPct(step)} |`
        );
      } else {
        lines.push(`| ${p} | ${fmt(aggPass(results, p))} ms |`);
      }
    }
    if (results.examplesPy.length > 0) {
      const pyLoad = median(results.examplesPy.map((e) => e.loadMs.median));
      const pyOver = median(results.examplesPy.map((e) => e.overheadMs.median));
      const span = recentPast ? " |" : "";
      lines.push(`| warm \`/load\` (Python) | ${fmt(pyLoad)} ms |${span}`);
      lines.push(`| deserialize + RPC (Python) | ${fmt(pyOver)} ms |${span}`);
    }
    lines.push("");
  }
  lines.push(
    `<sub>Matched ratios use the engine-pass sum, never \`wallMs\` (a lower bound on fire-and-forget stories). Full numbers + trend plots in the \`bench-results\` artifact. sha \`${results.meta.sha.slice(0, 7)}\`.</sub>`
  );

  writeFileSync(join(BENCH_DIR, "comment.md"), lines.join("\n") + "\n");
  console.log(
    `Wrote history.json (${history.length} runs) and comment.md${base ? " (same-runner pairwise)" : " (HEAD-only)"}`
  );
}

main();
