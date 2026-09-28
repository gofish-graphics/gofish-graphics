/**
 * results.jsonl rows and the markdown report built from them.
 */

import type { ChecksOutcome } from "./checks";
import type { CodeStats } from "./codestats";
import type { ContextInfo } from "./context";
import { extensionsOf, type Extensions } from "./extensions";
import { COST_BASIS, type Backend, type CostBasis, type Usage } from "./cost";
import { ARMS, GROUPS, type Arm, type Group } from "./tasks";

export interface TurnResult {
  /** Chains only: the 1-based step this turn belongs to. `turn` counts
   *  within the step. */
  step?: number;
  turn: number;
  usage: Usage;
  usd: number;
  /** How `usd` was arrived at (see CostBasis in cost.ts); missing for mock
   *  and reference turns and in older results (API). */
  costBasis?: CostBasis;
  latencyMs: number;
  stopReason: string;
  /** The reply text for this turn, relative to the run directory. */
  reply?: string;
  /** Output tokens that were the visible reply, and the rest (reasoning),
   *  see `splitOutput` in cost.ts. `tokenSplit` says whether the split came
   *  from the API or is an estimate (4 characters per visible token). */
  visibleTokens?: number;
  reasoningTokens?: number;
  tokenSplit?: "api" | "estimate";
  /** The program for this turn, relative to the run directory. */
  code?: string;
  /** The program's size (see codestats.ts). */
  codeStats?: CodeStats;
  /** gofish arm: the input tokens of this turn that were context (the
   *  context's system text, the retrieved examples, and for a skill, what
   *  the tools returned), in the model's tokens. The rest of the input is
   *  the task, the conversation and the backend's own text. */
  contextTokens?: number;
  /** Skill context: the tool calls the model made in this turn, each as
   *  "<tool> <file or pattern>" (for example "Read SKILL.md"). */
  toolUses?: string[];
  /** The program ran and its picture was drawn by the arm's library. */
  rendered: boolean;
  renderMs?: number;
  error?: string;
  /** Set with `error` when a program ran: "contract" when the picture was
   *  not produced by the arm's library (contract.ts), else "render". A
   *  contract failure still has `checks` (and `preserved`): the picture was
   *  read and judged. */
  errorKind?: "render" | "contract";
  checks?: ChecksOutcome;
  preserved?: ChecksOutcome;
}

/**
 * How a turn or a job came out.
 *   - "pass": the picture passes every check (and, for an edit, keeps what
 *     it must keep), and the arm's library drew it.
 *   - "partial": the same picture, but it breaks the arm contract (for
 *     example, hand-written SVG). Worse than a pass, since a user cannot
 *     keep iterating on it with the library; better than a fail.
 *   - "fail": anything else.
 * A job's outcome is its best turn's, in the order pass > partial > fail.
 */
export type Outcome = "pass" | "partial" | "fail";
const RANK: Record<Outcome, number> = { fail: 0, partial: 1, pass: 2 };

export function turnOutcome(t: TurnResult): Outcome {
  const right = !!t.checks?.pass && t.preserved?.pass !== false;
  if (!right) return "fail";
  if (t.rendered) return "pass";
  return t.errorKind === "contract" ? "partial" : "fail";
}

/** The outcome fields of a job (or one chain step) from its turns. The
 *  judged turn is the last turn with the best outcome, so a failed job is
 *  judged on its last turn. */
export function scoreTurns(
  turns: TurnResult[],
  edit: boolean
): Pick<
  JobResult,
  | "outcome"
  | "rendered"
  | "applied"
  | "preserved"
  | "pass"
  | "passFirst"
  | "codeStats"
> {
  let best: TurnResult | undefined;
  let outcome: Outcome = "fail";
  for (const t of turns) {
    const o = turnOutcome(t);
    if (!best || RANK[o] >= RANK[outcome]) {
      best = t;
      outcome = o;
    }
  }
  return {
    outcome,
    rendered: turns.some((t) => t.rendered),
    applied: !!best?.checks?.pass,
    preserved: edit ? !!best?.preserved?.pass : null,
    pass: outcome === "pass",
    passFirst: turns.length > 0 && turnOutcome(turns[0]) === "pass",
    codeStats: finalCodeStats(turns),
  };
}

/** The size of the last program among `turns` (the final program of a job
 *  or chain step). */
export function finalCodeStats(turns: TurnResult[]): CodeStats | undefined {
  for (let i = turns.length - 1; i >= 0; i--)
    if (turns[i].codeStats) return turns[i].codeStats;
  return undefined;
}

/** One step of a chain job. */
export interface StepResult {
  step: number;
  outcome: Outcome;
  applied: boolean;
  preserved: boolean;
  turns: number;
  /** The step's final program's size. */
  codeStats?: CodeStats;
}

/**
 * The outcome fields of a chain job from its turns (each tagged with its
 * step). A chain goes on only past a step that passes, so `stepsPassed`
 * (the steps passed before the first one that did not) is the number of
 * steps that passed. The job passes when every one of the `nSteps` steps
 * passed; `passFirst` when each passed on its first turn. `applied` and
 * `preserved` describe the last step attempted.
 */
export function scoreChain(
  turns: TurnResult[],
  nSteps: number
): ReturnType<typeof scoreTurns> & {
  steps: StepResult[];
  stepsPassed: number;
  nSteps: number;
} {
  const nums = [...new Set(turns.map((t) => t.step!))].sort((a, b) => a - b);
  const steps = nums.map((step) => {
    const ts = turns.filter((t) => t.step === step);
    const s = scoreTurns(ts, true);
    return {
      step,
      outcome: s.outcome,
      applied: s.applied,
      preserved: !!s.preserved,
      turns: ts.length,
      first: s.passFirst,
      ...(s.codeStats ? { codeStats: s.codeStats } : {}),
    };
  });
  let stepsPassed = 0;
  while (stepsPassed < steps.length && steps[stepsPassed].outcome === "pass")
    stepsPassed++;
  const pass = stepsPassed === nSteps;
  const last = steps[steps.length - 1];
  return {
    outcome: pass ? "pass" : "fail",
    rendered: turns.some((t) => t.rendered),
    applied: !!last?.applied,
    preserved: last ? last.preserved : null,
    pass,
    passFirst: pass && steps.every((s) => s.first),
    // The chain's final program: the last attempted step's.
    codeStats: last?.codeStats,
    steps: steps.map(({ first: _, ...s }) => s),
    stepsPassed,
    nSteps,
  };
}

export interface JobResult {
  mode: string;
  /** The model and where it ran ("mock" for a mock run). Missing in results
   *  from before they were recorded (API runs of claude-opus-5). */
  model?: string;
  backend?: "mock" | Backend;
  /** How GoFish was presented to the gofish arm (see context.ts; the same
   *  for every job of a run). Missing in references results and in results
   *  from before it was recorded. */
  context?: ContextInfo;
  /** Results from before `context` recorded the docs pack here (read by
   *  `contextOf` in context.ts). */
  docsPack?: { file: string; sha256: string };
  /** Whether the arm had its extension packages (see extensions.ts; the
   *  same for every job of a run). Only on arms that have extensions;
   *  missing in results from before it was recorded, which ran without them
   *  (read it with `extensionsOf`). */
  extensions?: Extensions;
  /** Retrieval context: the gallery examples sent with each conversation
   *  (one entry, or one per chain step). */
  retrieved?: { step?: number; ids: string[] }[];
  task: string;
  kind: "create" | "edit" | "chain";
  /** The task's report group (see `Group` in tasks.ts). */
  group: Group;
  arm: Arm;
  sample: number;
  /** Every turn; for a chain, every step's turns in order, each tagged with
   *  its `step`. */
  turns: TurnResult[];
  /** See `Outcome`. For a chain: "pass" when every step passed, else
   *  "fail". */
  outcome: Outcome;
  /** Some turn's picture was drawn by the arm's library. */
  rendered: boolean;
  /** All checks passed on the judged turn (see scoreTurns), whether or not
   *  the library drew it ("applied" for edits). */
  applied: boolean;
  /** Edits only: nothing outside `mayChange` changed, on the judged turn. */
  preserved: boolean | null;
  /** outcome === "pass". */
  pass: boolean;
  /** Passed on the first turn, with no repair. */
  passFirst: boolean;
  /** The size of the final program (the last turn with a program; for a
   *  chain, the last attempted step's). Missing when no turn had one, and
   *  in results from before it was recorded (rescore fills it in). */
  codeStats?: CodeStats;
  /** Chains only: each attempted step, the steps passed before the first
   *  one that did not pass, and the chain's length. */
  steps?: StepResult[];
  stepsPassed?: number;
  nSteps?: number;
  /** Why the job ended early, if it did. "budget": the budget guard refused
   *  a call; "api-error": a call failed after all its retries. Either can
   *  happen on turn 1 (the job is then not scored, see isScored) or on a
   *  repair turn (the job is scored on what it achieved). */
  stopped?: "budget" | "api-error" | "refusal";
  /** For "api-error": the last error's class and message. */
  apiError?: string;
  usage: Usage;
  usd: number;
  latencyMs: number;
  /** Rescore mode only: why this job's rescored outcome rests on less than
   *  a real run would have seen (see rescore in llm-bench.ts). */
  rescoreNote?: string;
}

/** A turn's name in the report: "turn 2", or "step 1 turn 2" in a chain. */
const turnName = (t: TurnResult) =>
  `${t.step ? `step ${t.step} ` : ""}turn ${t.turn}`;

/** Turns of `r` that broke the arm contract. */
const contractTurns = (r: JobResult) =>
  r.turns.filter((t) => t.errorKind === "contract");

/** Reasoning tokens over the job's turns, or null when a turn lacks them
 *  (a turn from before they were recorded). */
const reasoning = (r: JobResult) =>
  r.turns.every((t) => t.reasoningTokens !== undefined)
    ? r.turns.reduce((s, t) => s + t.reasoningTokens!, 0)
    : null;

const meanReasoning = (rs: JobResult[]) =>
  mean(rs.map(reasoning).filter((x): x is number => x !== null));

const INFRA_STOPS = new Set<JobResult["stopped"]>(["budget", "api-error"]);

/** Whether the job counts toward pass rates: false when it ended on an
 *  infrastructure stop (budget or API error) before any model turn came
 *  back, so it says nothing about the chart. */
export function isScored(r: JobResult): boolean {
  return !(INFRA_STOPS.has(r.stopped) && r.turns.length === 0);
}

/** Scored, but a later turn ended on an infrastructure stop, so the job may
 *  have lost a repair turn it would otherwise have had. */
function cutShort(r: JobResult): boolean {
  return INFRA_STOPS.has(r.stopped) && r.turns.length > 0;
}

const pct = (k: number, n: number) =>
  n === 0 ? "-" : `${Math.round((100 * k) / n)}%`;
const mean = (xs: number[]) =>
  xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x: number, digits = 0) =>
  Number.isFinite(x) ? x.toFixed(digits) : "-";

/** Deterministic PRNG (mulberry32) so bootstrap intervals are reproducible. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mean of per-task differences with a 95% percentile bootstrap interval,
 *  resampling tasks. */
export function pairedDiff(
  diffs: number[],
  iterations = 2000
): { mean: number; lo: number; hi: number } {
  const m = mean(diffs);
  if (diffs.length < 2) return { mean: m, lo: NaN, hi: NaN };
  const rand = rng(12345);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let s = 0;
    for (let j = 0; j < diffs.length; j++)
      s += diffs[Math.floor(rand() * diffs.length)];
    means.push(s / diffs.length);
  }
  means.sort((a, b) => a - b);
  return {
    mean: m,
    lo: means[Math.floor(0.025 * iterations)],
    hi: means[Math.floor(0.975 * iterations)],
  };
}

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/** The reasoning column's header: marked as an estimate when any turn's
 *  split was estimated. */
const reasoningHeader = (rs: JobResult[]) =>
  rs.some((r) => r.turns.some((t) => t.tokenSplit === "estimate"))
    ? "mean reasoning tok (est.)"
    : "mean reasoning tok";

function perArmTable(ran: JobResult[], arms: Arm[]): string {
  const count = (rs: JobResult[], o: Outcome) =>
    pct(rs.filter((r) => r.outcome === o).length, rs.length);
  return table(
    [
      "arm",
      "jobs",
      "pass",
      "partial",
      "fail",
      "pass or partial",
      "first-turn pass",
      "rendered",
      "mean turns",
      "mean input tok",
      "mean output tok",
      reasoningHeader(ran),
      "mean cost $",
      "mean latency s",
      "mean render ms (successful renders)",
      ...CODE_STATS_HEADER(ran),
    ],
    arms.map((arm) => {
      const rs = ran.filter((r) => r.arm === arm);
      const renders = rs.flatMap((r) =>
        r.turns.filter((t) => t.rendered).map((t) => t.renderMs!)
      );
      return [
        arm,
        String(rs.length),
        count(rs, "pass"),
        count(rs, "partial"),
        count(rs, "fail"),
        pct(rs.filter((r) => r.outcome !== "fail").length, rs.length),
        pct(rs.filter((r) => r.passFirst).length, rs.length),
        pct(rs.filter((r) => r.rendered).length, rs.length),
        fmt(mean(rs.map((r) => r.turns.length)), 2),
        fmt(
          mean(
            rs.map(
              (r) => r.usage.input + r.usage.cacheWrite + r.usage.cacheRead
            )
          )
        ),
        fmt(mean(rs.map((r) => r.usage.output))),
        fmt(meanReasoning(rs)),
        fmt(mean(rs.map((r) => r.usd)), 4),
        fmt(mean(rs.map((r) => r.latencyMs / 1000)), 1),
        fmt(mean(renders)),
        ...codeStatsCells(rs),
      ];
    })
  );
}

const defined = (xs: (number | undefined)[]) =>
  xs.filter((x): x is number => x !== undefined && !Number.isNaN(x));

/** Mean of `f` over the jobs where it is defined. */
const meanOf = (rs: JobResult[], f: (r: JobResult) => number | undefined) =>
  mean(defined(rs.map(f)));

const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "mean (median)" of `f` over the jobs where it is defined. */
const meanMedian = (
  rs: JobResult[],
  f: (r: JobResult) => number | undefined
) => {
  const xs = defined(rs.map(f));
  return xs.length ? `${fmt(mean(xs), 1)} (${fmt(median(xs), 1)})` : "-";
};

/** The code columns of each job's final program: size in syntax tokens
 *  (the headline), model tokens and lines, then explicit calculation
 *  (arithmetic operators and magic numbers, as mean and median). */
const CODE_STATS_HEADER = (rs: JobResult[]) => [
  "mean code syntax tok",
  rs.some((r) => r.codeStats?.modelEst)
    ? "mean code model tok (est.)"
    : "mean code model tok",
  "mean code LOC",
  "arith ops mean (median)",
  "magic numbers mean (median)",
];
const codeStatsCells = (rs: JobResult[]) => [
  fmt(meanOf(rs, (r) => r.codeStats?.syntax)),
  fmt(meanOf(rs, (r) => r.codeStats?.model)),
  fmt(meanOf(rs, (r) => r.codeStats?.loc)),
  meanMedian(rs, (r) => r.codeStats?.arithOps),
  meanMedian(rs, (r) => r.codeStats?.magicNumbers),
];

const sumTurns = (r: JobResult, f: (t: TurnResult) => number | undefined) =>
  r.turns.some((t) => f(t) !== undefined)
    ? r.turns.reduce((s, t) => s + (f(t) ?? 0), 0)
    : undefined;

/** The columns of the gofish summary (the context section and `compare`):
 *  outcomes, then the cost of getting there. */
export const GOFISH_SUMMARY_HEADER = [
  "jobs",
  "pass",
  "partial",
  "fail",
  "first-turn pass",
  "mean turns",
  "mean input tok",
  "mean context tok",
  "mean output tok",
  "mean thinking tok",
  "mean latency s",
  "mean cost $",
  "mean tool calls",
  "mean code syntax tok",
  "mean code LOC",
  "arith ops mean (median)",
  "magic numbers mean (median)",
];

/** One row of the gofish summary over `rs` (scored single jobs). Input
 *  tokens include cache reads and writes; context tokens are the part of
 *  them that was the context (see TurnResult.contextTokens); thinking
 *  tokens are the reasoning part of the output. Sums are per job, over its
 *  turns. */
export function gofishSummaryRow(rs: JobResult[]): string[] {
  const count = (o: Outcome) =>
    pct(rs.filter((r) => r.outcome === o).length, rs.length);
  return [
    String(rs.length),
    count("pass"),
    count("partial"),
    count("fail"),
    pct(rs.filter((r) => r.passFirst).length, rs.length),
    fmt(mean(rs.map((r) => r.turns.length)), 2),
    fmt(
      mean(
        rs.map((r) => r.usage.input + r.usage.cacheWrite + r.usage.cacheRead)
      )
    ),
    fmt(meanOf(rs, (r) => sumTurns(r, (t) => t.contextTokens))),
    fmt(mean(rs.map((r) => r.usage.output))),
    fmt(meanReasoning(rs)),
    fmt(mean(rs.map((r) => r.latencyMs / 1000)), 1),
    fmt(mean(rs.map((r) => r.usd)), 4),
    fmt(
      meanOf(rs, (r) => sumTurns(r, (t) => t.toolUses?.length)),
      1
    ),
    fmt(meanOf(rs, (r) => r.codeStats?.syntax)),
    fmt(meanOf(rs, (r) => r.codeStats?.loc)),
    meanMedian(rs, (r) => r.codeStats?.arithOps),
    meanMedian(rs, (r) => r.codeStats?.magicNumbers),
  ];
}

/** Statistics of a reference program (see lexicalStats in codestats.ts). */
export type ReferenceStats = Omit<CodeStats, "model" | "modelEst">;

/** Per task and arm: the mean of some statistics of the final programs,
 *  with the reference solution's in parentheses, and a last row over all
 *  jobs (the reference's mean over the tasks). `keys` are the CodeStats
 *  fields shown in a cell, joined by " / ". */
function codeStatsTable(
  single: JobResult[],
  arms: Arm[],
  tasks: string[],
  refs: Record<string, ReferenceStats>,
  keys: ("syntax" | "arithOps" | "magicNumbers")[]
): string {
  const digits = keys.length > 1 ? 1 : 0;
  const cell = (rs: JobResult[], refList: ReferenceStats[]) => {
    const got = keys
      .map((k) =>
        fmt(
          meanOf(rs, (r) => r.codeStats?.[k]),
          digits
        )
      )
      .join(" / ");
    const ref = refList.length
      ? ` (ref ${keys.map((k) => fmt(mean(defined(refList.map((x) => x[k]))), digits)).join(" / ")})`
      : "";
    return `${got}${ref}`;
  };
  const refsOf = (ts: string[], arm: Arm) =>
    ts.map((t) => refs[`${t}|${arm}`]).filter((x): x is ReferenceStats => !!x);
  const rows = tasks.map((t) => [
    t,
    ...arms.map((arm) =>
      cell(
        single.filter((r) => r.task === t && r.arm === arm),
        refsOf([t], arm)
      )
    ),
  ]);
  const all = (arm: Arm) =>
    `**${cell(
      single.filter((r) => r.arm === arm),
      refsOf(tasks, arm)
    )}**`;
  return table(
    ["task", ...arms],
    [...rows, ["**mean over jobs**", ...arms.map(all)]]
  );
}

/** gofish minus each other arm, per task, over `ran`'s tasks, in the rate
 *  of jobs that `counts`. */
function pairedTable(
  ran: JobResult[],
  arms: Arm[],
  counts: (r: JobResult) => boolean
): string {
  const tasks = [...new Set(ran.map((r) => r.task))];
  const rate = (t: string, arm: Arm) => {
    const rs = ran.filter((r) => r.task === t && r.arm === arm);
    return rs.length ? rs.filter(counts).length / rs.length : null;
  };
  return table(
    ["other arm", "tasks", "mean difference", "95% CI"],
    arms
      .filter((a) => a !== "gofish")
      .map((arm) => {
        const diffs = tasks
          .map((t) => [rate(t, "gofish"), rate(t, arm)])
          .filter((p): p is [number, number] => p[0] !== null && p[1] !== null)
          .map(([g, o]) => g - o);
        const d = pairedDiff(diffs);
        return [
          arm,
          String(diffs.length),
          `${d.mean >= 0 ? "+" : ""}${fmt(100 * d.mean, 1)} pts`,
          Number.isFinite(d.lo)
            ? `[${fmt(100 * d.lo, 1)}, ${fmt(100 * d.hi, 1)}]`
            : "-",
        ];
      })
  );
}

export function buildReport(
  results: JobResult[],
  meta: {
    mode: string;
    runDir: string;
    maxTurns: number;
    /** Rescore mode: the run that was rescored. */
    rescoredFrom?: string;
    /** "-" when no model ran (references). */
    model: string;
    /** "api", "claude-code", "mock", or "-" (references). */
    backend: string;
    /** This run's spend on its backend, at that backend's cost basis (0 for
     *  mock and references). */
    spendUsd: number;
    /** Ledger totals over all runs, per backend, and their caps. */
    ledger: {
      apiUsd: number;
      budgetUsd: number;
      subscriptionUsd: number;
      subscriptionCapUsd: number;
    };
    effort: string;
    /** How GoFish was presented to the gofish arm; missing for references
     *  and for runs from before it was recorded. */
    context?: ContextInfo;
    /** Statistics of each reference program (lexicalStats), by
     *  `${task}|${arm}`, for the code-size table. */
    referenceStats?: Record<string, ReferenceStats>;
  }
): string {
  const ran = results.filter(isScored);
  const unscored = results.filter((r) => !isScored(r));
  // Chains have their own section; every other table is over single jobs.
  const single = ran.filter((r) => r.kind !== "chain");
  const chains = ran.filter((r) => r.kind === "chain");
  const arms = ARMS.filter((a) => ran.some((r) => r.arm === a));
  const tasks = [...new Set(single.map((r) => r.task))];
  const out: string[] = [];
  out.push(`# LLM authoring benchmark: ${meta.mode} run`);
  out.push("");
  if (meta.rescoredFrom)
    out.push(
      `Rescored from \`${meta.rescoredFrom}\`: every saved turn's program was rendered again through the current harness, checks and arm contract. No model was called; tokens and costs are the original run's.`,
      ""
    );
  const backendNote: Record<string, string> = {
    api: "api (the Anthropic API)",
    "claude-code":
      "claude-code (headless Claude Code, billed to the Claude subscription)",
  };
  // Extension packages (extensions.ts): shown when an arm that has them ran.
  const extArms = ARMS.filter((a) =>
    results.some((r) => r.arm === a && extensionsOf(r))
  );
  const extSettings = [
    ...new Set(results.map(extensionsOf).filter(Boolean)),
  ].join(", ");
  const extensions = extArms.length
    ? ` Extensions: ${extSettings} (${extArms.join(", ")}).`
    : "";
  out.push(
    `Model: ${meta.model}. Backend: ${backendNote[meta.backend] ?? meta.backend}. Effort: ${meta.effort}. GoFish context: ${meta.context ? `${meta.context.name} (sha256 ${meta.context.sha256})` : meta.backend === "-" ? "-" : "not recorded"}.${extensions} Max turns: ${meta.maxTurns}. Run directory: \`${meta.runDir}\`. ` +
      `Jobs: ${results.length}, of which ${ran.length} scored and ${unscored.length} not scored (infrastructure; excluded from every rate and comparison below).`
  );
  const spend =
    meta.backend === "mock"
      ? "Spend this run: none (a mock run's token counts and costs are simulated from character counts)."
      : meta.backend in COST_BASIS
        ? `Spend this run: $${meta.spendUsd.toFixed(4)} (${COST_BASIS[meta.backend as Backend] === "api" ? "API" : "list price, billed to the Claude subscription, not the API"}).`
        : "Spend this run: none.";
  const l = meta.ledger;
  out.push(
    `${spend} Ledger (all runs): API $${l.apiUsd.toFixed(4)} of $${l.budgetUsd.toFixed(2)} budget; claude-code $${l.subscriptionUsd.toFixed(4)} at list price (subscription) of $${l.subscriptionCapUsd.toFixed(2)} cap.`
  );

  // Groups present in this run; the per-arm table and the paired comparison
  // are shown for all tasks and then for each group, when there is more than
  // one.
  const groups = GROUPS.filter((g) => single.some((r) => r.group === g));
  const sections: { title: string; rs: JobResult[] }[] = [
    { title: "all tasks", rs: single },
    ...(groups.length > 1
      ? groups.map((g) => ({
          title: `group "${g}"`,
          rs: single.filter((r) => r.group === g),
        }))
      : []),
  ];

  if (single.length > 0) {
    out.push(
      "",
      "## Per arm",
      "",
      "Outcomes: **pass** is the right picture drawn by the arm's library; **partial** is the right picture not drawn by it (it broke the arm contract, for example hand-written SVG); **fail** is anything else. A job's outcome is its best turn's. Output tokens include adaptive thinking; reasoning tokens are output tokens minus the visible reply, per job (summed over its turns). When the API does not report the split, the visible reply is estimated at 4 characters per token, and the column says (est.).",
      ""
    );
    for (const { title, rs } of sections) {
      if (sections.length > 1) out.push(`### ${title}`, "");
      out.push(perArmTable(rs, arms), "");
    }
    out.pop();
  }

  const gofish = single.filter((r) => r.arm === "gofish");
  if (meta.context && gofish.length > 0) {
    out.push(
      "",
      `## GoFish context: ${meta.context.name}`,
      "",
      "The gofish arm under this run's context. Input tokens include cache reads and writes; context tokens are the part of them that was the context (its system text, retrieved examples, and for a skill, what the tools returned), summed over a job's turns. Turns count repair rounds; tool calls are the skill's file reads and searches. Compare contexts across runs with `pnpm llm-bench compare`.",
      ""
    );
    out.push(
      table(
        ["tasks", ...GOFISH_SUMMARY_HEADER],
        sections.map(({ title, rs }) => [
          title,
          ...gofishSummaryRow(rs.filter((r) => r.arm === "gofish")),
        ])
      )
    );
    const retrieved = gofish.filter((r) => r.retrieved?.length);
    if (retrieved.length > 0) {
      out.push("", "Retrieved examples per task:", "");
      const seen = new Set<string>();
      for (const r of retrieved) {
        const ids = r.retrieved!.map((x) => x.ids.join(", ")).join("; ");
        if (seen.has(`${r.task}|${ids}`)) continue;
        seen.add(`${r.task}|${ids}`);
        out.push(`- ${r.task}: ${ids}`);
      }
    }
    const uses = new Map<string, number>();
    for (const r of gofish)
      for (const t of r.turns)
        for (const u of t.toolUses ?? []) uses.set(u, (uses.get(u) ?? 0) + 1);
    if (uses.size > 0)
      out.push(
        "",
        "Tool calls (skill), most frequent first:",
        "",
        [...uses]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([u, n]) => `\`${u}\` x${n}`)
          .join(", ")
      );
  }

  const edits = single.filter((r) => r.kind === "edit");
  if (edits.length > 0) {
    out.push(
      "",
      "## Edits: applied and preserved",
      "",
      "Applied and preserved are judged on the picture, whether or not the library drew it; pass and partial split the jobs where both hold.",
      ""
    );
    out.push(
      table(
        ["arm", "edit jobs", "applied", "preserved", "pass", "partial"],
        arms.map((arm) => {
          const rs = edits.filter((r) => r.arm === arm);
          return [
            arm,
            String(rs.length),
            pct(rs.filter((r) => r.applied).length, rs.length),
            pct(rs.filter((r) => r.preserved).length, rs.length),
            pct(rs.filter((r) => r.outcome === "pass").length, rs.length),
            pct(rs.filter((r) => r.outcome === "partial").length, rs.length),
          ];
        })
      )
    );
  }

  if (single.length > 0) {
    out.push(
      "",
      "## Per task",
      "",
      "Cells: passed / scored samples (first-turn passes in parentheses); `k partial` counts partial outcomes; `+k not scored` counts samples lost to infrastructure errors.",
      ""
    );
    out.push(
      table(
        ["task", ...(groups.length > 1 ? ["group"] : []), ...arms],
        tasks.map((t) => [
          t,
          ...(groups.length > 1
            ? [single.find((r) => r.task === t)!.group]
            : []),
          ...arms.map((arm) => {
            const rs = single.filter((r) => r.task === t && r.arm === arm);
            const lost = unscored.filter(
              (r) => r.task === t && r.arm === arm
            ).length;
            const note = lost ? ` +${lost} not scored` : "";
            if (rs.length === 0) return lost ? `-${note}` : "-";
            const partial = rs.filter((r) => r.outcome === "partial").length;
            return `${rs.filter((r) => r.pass).length}/${rs.length} (${rs.filter((r) => r.passFirst).length})${partial ? `, ${partial} partial` : ""}${note}`;
          }),
        ])
      )
    );
    out.push(
      "",
      "## Code size per task",
      "",
      "Cells: mean syntax tokens of the final program (lexical tokens: identifiers, keywords, literals, operators and punctuation; whitespace and comments are not counted, so line breaking does not change it), over scored jobs; the reference solution's in parentheses.",
      "",
      codeStatsTable(single, arms, tasks, meta.referenceStats ?? {}, [
        "syntax",
      ]),
      "",
      "## Explicit calculation per task",
      "",
      "Cells: arithmetic operators / magic numbers in the final program, mean over scored jobs; the reference solution's in parentheses. Arithmetic operators are + - * / % ** (and // in Python) with their compound assignments, plus every call into Math, math, np or numpy. Magic numbers are numeric literals other than 0 and 1. A declarative library should leave little to compute by hand.",
      "",
      codeStatsTable(single, arms, tasks, meta.referenceStats ?? {}, [
        "arithOps",
        "magicNumbers",
      ])
    );
  }

  if (arms.includes("gofish") && arms.length > 1 && single.length > 0) {
    out.push(
      "",
      "## Paired comparison: gofish minus each arm",
      "",
      "Per task, the difference in rate (within max turns) between gofish and the other arm, averaged over the tasks where both arms have a scored job; 95% bootstrap interval over tasks. The headline is the pass rate; the second table counts partials as passes.",
      ""
    );
    const variants = [
      { name: "pass", counts: (r: JobResult) => r.pass },
      {
        name: "pass or partial",
        counts: (r: JobResult) => r.outcome !== "fail",
      },
    ];
    for (const { title, rs } of sections)
      for (const v of variants) {
        out.push(
          `### ${v.name}${sections.length > 1 ? `, ${title}` : ""}`,
          "",
          pairedTable(rs, arms, v.counts),
          ""
        );
      }
    out.pop();
  }

  if (chains.length > 0) out.push("", chainSection(chains, unscored, arms));

  const violators = ran.filter((r) => contractTurns(r).length > 0);
  out.push(
    "",
    "## Contract violations",
    "",
    "A turn violates the arm contract when its picture was not produced by the arm's library (for example, SVG written by hand). The error goes back to the model like a render error, so it can still earn a pass on a later turn. A job whose best turn is a violation with the right picture is partial. For a chain, the job's outcome is the chain's.",
    ""
  );
  out.push(
    table(
      [
        "arm",
        "jobs with a violation",
        "violating turns",
        "of those jobs: pass",
        "partial",
        "fail",
      ],
      arms.map((arm) => {
        const rs = violators.filter((r) => r.arm === arm);
        return [
          arm,
          String(rs.length),
          String(rs.reduce((n, r) => n + contractTurns(r).length, 0)),
          ...(["pass", "partial", "fail"] as const).map((o) =>
            String(rs.filter((r) => r.outcome === o).length)
          ),
        ];
      })
    )
  );
  if (violators.length > 0) out.push("");
  for (const r of violators) {
    const ts = contractTurns(r);
    const detail = ts[0].error!.split("\n").slice(1).join(" ");
    const turns = ts.map(
      (t) =>
        `${turnName(t)} (${turnOutcome(t) === "partial" ? "right" : "wrong"} picture)`
    );
    out.push(
      `- ${r.task} / ${r.arm} / sample ${r.sample}: ${turns.join(", ")}; job ${r.outcome}${detail ? ` (${detail})` : ""}`
    );
  }

  const noted = results.filter((r) => r.rescoreNote);
  if (noted.length > 0) {
    out.push(
      "",
      "## Rescore caveats",
      "",
      "Jobs whose rescored outcome differs in which turn ended them. A real run would have continued (or stopped) differently, so these are scored on the saved turns only.",
      ""
    );
    for (const r of noted)
      out.push(`- ${r.task} / ${r.arm} / sample ${r.sample}: ${r.rescoreNote}`);
  }

  if (unscored.length > 0) {
    out.push(
      "",
      "## Not scored (infrastructure)",
      "",
      "These jobs ended on a budget refusal or an API error (after retries) before any model turn came back. They are left out of every rate and comparison above.",
      ""
    );
    out.push(
      table(
        ["arm", "api-error", "budget"],
        ARMS.filter((a) => unscored.some((r) => r.arm === a)).map((arm) => {
          const rs = unscored.filter((r) => r.arm === arm);
          return [
            arm,
            String(rs.filter((r) => r.stopped === "api-error").length),
            String(rs.filter((r) => r.stopped === "budget").length),
          ];
        })
      )
    );
    out.push("");
    for (const r of unscored)
      out.push(
        `- ${r.task} / ${r.arm} / sample ${r.sample}: ${r.stopped}${r.apiError ? ` (${firstLineOf(r.apiError)})` : ""}`
      );
  }

  const short = ran.filter(cutShort);
  if (short.length > 0) {
    out.push(
      "",
      "## Scored, then cut short (infrastructure)",
      "",
      "These jobs produced at least one turn, then a repair turn (or a later chain step) ended on a budget refusal or an API error. They are scored on what they achieved, but may have lost a turn they would otherwise have had.",
      ""
    );
    for (const r of short)
      out.push(
        `- ${r.task} / ${r.arm} / sample ${r.sample}: ${r.stopped} after ${r.turns.length} turn(s)${r.apiError ? ` (${firstLineOf(r.apiError)})` : ""}`
      );
  }

  const failures = single.filter((r) => r.outcome === "fail");
  if (failures.length > 0) {
    out.push("", "## Failures", "");
    for (const r of failures)
      out.push(`- ${r.task} / ${r.arm} / sample ${r.sample}: ${whyFailed(r)}`);
  }
  return out.join("\n") + "\n";
}

const firstLineOf = (s: string | undefined) => (s ?? "").split("\n")[0];

/** Why a job (or a chain step, given its turns) did not pass, from its last
 *  turn. */
function whyFailed(
  r: Pick<JobResult, "stopped" | "rendered">,
  turns: TurnResult[] = (r as JobResult).turns
): string {
  const last = turns[turns.length - 1];
  if (r.stopped === "refusal") return "refusal";
  const infra = cutShort(r as JobResult) ? `[then ${r.stopped}] ` : "";
  if (!last) return `${infra}no turn`;
  const contract =
    last.errorKind === "contract"
      ? `contract violation: ${(last.error ?? "").replace(/\n/g, " ")}`
      : "";
  if (!last.checks)
    return `${infra}${contract || `render error: ${firstLineOf(last.error)}`}`;
  // The picture was read (drawn by the library or not): what was wrong with
  // it.
  const failed = [...last.checks.results, ...(last.preserved?.results ?? [])]
    .filter((c) => !c.pass)
    .map((c) => `${c.check}: ${c.detail}`)
    .join("; ");
  return `${infra}${[contract, failed].filter(Boolean).join("; ")}`;
}

/** The chains section: per arm, per chain, and where each chain stopped. */
function chainSection(
  chains: JobResult[],
  unscored: JobResult[],
  arms: Arm[]
): string {
  const out: string[] = [
    "## Chains",
    "",
    "A chain is a series of edits on one chart. Step 1 starts from the arm's reference program for the chain's base task; each later step starts from the model's own final program of the step before, and preservation is judged against that step's final render. Each step is a fresh conversation with up to max turns. The chain goes on only past a step that passes (a partial step stops it), so steps passed counts the steps passed before the first one that did not pass.",
    "",
  ];
  out.push(
    table(
      [
        "arm",
        "chain jobs",
        "mean steps passed",
        "full-chain pass",
        "mean turns",
        reasoningHeader(chains),
        "mean cost $",
        "mean step code syntax tok",
      ],
      arms.map((arm) => {
        const rs = chains.filter((r) => r.arm === arm);
        const n = rs[0]?.nSteps;
        const sameLength = rs.every((r) => r.nSteps === n);
        return [
          arm,
          String(rs.length),
          `${fmt(mean(rs.map((r) => r.stepsPassed!)), 2)}${sameLength && n ? ` of ${n}` : ""}`,
          pct(rs.filter((r) => r.pass).length, rs.length),
          fmt(mean(rs.map((r) => r.turns.length)), 2),
          fmt(meanReasoning(rs)),
          fmt(mean(rs.map((r) => r.usd)), 4),
          // Each attempted step's final program.
          fmt(
            mean(
              rs.flatMap((r) =>
                (r.steps ?? [])
                  .map((s) => s.codeStats?.syntax)
                  .filter((x): x is number => x !== undefined)
              )
            )
          ),
        ];
      })
    ),
    "",
    "Cells: steps passed per scored sample, out of the chain's steps; `+k not scored` counts samples lost to infrastructure errors.",
    ""
  );
  const ids = [...new Set(chains.map((r) => r.task))];
  out.push(
    table(
      ["chain", ...arms],
      ids.map((id) => [
        id,
        ...arms.map((arm) => {
          const rs = chains.filter((r) => r.task === id && r.arm === arm);
          const lost = unscored.filter(
            (r) => r.task === id && r.arm === arm
          ).length;
          const note = lost ? ` +${lost} not scored` : "";
          if (rs.length === 0) return lost ? `-${note}` : "-";
          return `${rs.map((r) => `${r.stepsPassed}/${r.nSteps}`).join(", ")}${note}`;
        }),
      ])
    )
  );
  const stopped = chains.filter((r) => !r.pass);
  if (stopped.length > 0) {
    out.push("", "Where chains stopped:", "");
    for (const r of stopped) {
      const s = r.steps![r.steps!.length - 1];
      const why = s
        ? `step ${s.step} ${s.outcome}${
            s.outcome === "fail" || s.outcome === "partial"
              ? `: ${whyFailed(
                  r,
                  r.turns.filter((t) => t.step === s.step)
                )}`
              : ""
          }`
        : "no step";
      const unrun =
        s && s.outcome === "pass"
          ? `; step ${s.step + 1} not run (${r.stopped})`
          : "";
      out.push(`- ${r.task} / ${r.arm} / sample ${r.sample}: ${why}${unrun}`);
    }
  }
  return out.join("\n");
}
