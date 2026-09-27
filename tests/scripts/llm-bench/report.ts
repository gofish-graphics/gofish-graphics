/**
 * results.jsonl rows and the markdown report built from them.
 */

import type { ChecksOutcome } from "./checks";
import type { Usage } from "./cost";
import { ARMS, GROUPS, type Arm, type Group } from "./tasks";

export interface TurnResult {
  turn: number;
  usage: Usage;
  usd: number;
  latencyMs: number;
  stopReason: string;
  /** The program for this turn, relative to the run directory. */
  code?: string;
  rendered: boolean;
  renderMs?: number;
  error?: string;
  checks?: ChecksOutcome;
  preserved?: ChecksOutcome;
}

export interface JobResult {
  mode: string;
  task: string;
  kind: "create" | "edit";
  /** The task's report group (see `Group` in tasks.ts). */
  group: Group;
  arm: Arm;
  sample: number;
  turns: TurnResult[];
  /** The last turn produced a usable picture. */
  rendered: boolean;
  /** All checks passed on the last rendered turn ("applied" for edits). */
  applied: boolean;
  /** Edits only: nothing outside `mayChange` changed. */
  preserved: boolean | null;
  /** applied && preserved (when an edit). */
  pass: boolean;
  /** Passed on the first turn, with no repair. */
  passFirst: boolean;
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
}

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

function perArmTable(ran: JobResult[], arms: Arm[]): string {
  return table(
    [
      "arm",
      "jobs",
      "first-turn pass",
      "pass within max turns",
      "rendered",
      "mean turns",
      "mean input tok",
      "mean output tok",
      "mean cost $",
      "mean latency s",
      "mean render ms (successful renders)",
    ],
    arms.map((arm) => {
      const rs = ran.filter((r) => r.arm === arm);
      const renders = rs.flatMap((r) =>
        r.turns.filter((t) => t.rendered).map((t) => t.renderMs!)
      );
      return [
        arm,
        String(rs.length),
        pct(rs.filter((r) => r.passFirst).length, rs.length),
        pct(rs.filter((r) => r.pass).length, rs.length),
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
        fmt(mean(rs.map((r) => r.usd)), 4),
        fmt(mean(rs.map((r) => r.latencyMs / 1000)), 1),
        fmt(mean(renders)),
      ];
    })
  );
}

/** gofish minus each other arm, per task, over `ran`'s tasks. */
function pairedTable(ran: JobResult[], arms: Arm[]): string {
  const tasks = [...new Set(ran.map((r) => r.task))];
  const rate = (t: string, arm: Arm) => {
    const rs = ran.filter((r) => r.task === t && r.arm === arm);
    return rs.length ? rs.filter((r) => r.pass).length / rs.length : null;
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
    realSpendUsd: number;
    ledgerTotalUsd: number;
    budgetUsd: number;
    effort: string;
  }
): string {
  const ran = results.filter(isScored);
  const unscored = results.filter((r) => !isScored(r));
  const arms = ARMS.filter((a) => ran.some((r) => r.arm === a));
  const tasks = [...new Set(ran.map((r) => r.task))];
  const out: string[] = [];
  out.push(`# LLM authoring benchmark: ${meta.mode} run`);
  out.push("");
  out.push(
    `Run directory: \`${meta.runDir}\`. Max turns: ${meta.maxTurns}. Effort: ${meta.effort}. ` +
      `Jobs: ${results.length}, of which ${ran.length} scored and ${unscored.length} not scored (infrastructure; excluded from every rate and comparison below).`
  );
  const simulated =
    meta.mode === "mock"
      ? " Token counts and costs in a mock run are simulated from character counts."
      : "";
  out.push(
    `Real spend this run: $${meta.realSpendUsd.toFixed(4)}. Ledger total (all runs): $${meta.ledgerTotalUsd.toFixed(4)} of $${meta.budgetUsd.toFixed(2)} budget.${simulated}`
  );

  // Groups present in this run; the per-arm table and the paired comparison
  // are shown for all tasks and then for each group, when there is more than
  // one.
  const groups = GROUPS.filter((g) => ran.some((r) => r.group === g));
  const sections: { title: string; rs: JobResult[] }[] = [
    { title: "all tasks", rs: ran },
    ...(groups.length > 1
      ? groups.map((g) => ({
          title: `group "${g}"`,
          rs: ran.filter((r) => r.group === g),
        }))
      : []),
  ];

  out.push("", "## Per arm", "");
  for (const { title, rs } of sections) {
    if (sections.length > 1) out.push(`### ${title}`, "");
    out.push(perArmTable(rs, arms), "");
  }
  out.pop();

  const edits = ran.filter((r) => r.kind === "edit");
  if (edits.length > 0) {
    out.push("", "## Edits: applied and preserved", "");
    out.push(
      table(
        ["arm", "edit jobs", "applied", "preserved", "both"],
        arms.map((arm) => {
          const rs = edits.filter((r) => r.arm === arm);
          return [
            arm,
            String(rs.length),
            pct(rs.filter((r) => r.applied).length, rs.length),
            pct(rs.filter((r) => r.preserved).length, rs.length),
            pct(rs.filter((r) => r.pass).length, rs.length),
          ];
        })
      )
    );
  }

  out.push(
    "",
    "## Per task",
    "",
    "Cells: passed / scored samples (first-turn passes in parentheses); `+k not scored` counts samples lost to infrastructure errors.",
    ""
  );
  out.push(
    table(
      ["task", ...(groups.length > 1 ? ["group"] : []), ...arms],
      tasks.map((t) => [
        t,
        ...(groups.length > 1 ? [ran.find((r) => r.task === t)!.group] : []),
        ...arms.map((arm) => {
          const rs = ran.filter((r) => r.task === t && r.arm === arm);
          const lost = unscored.filter(
            (r) => r.task === t && r.arm === arm
          ).length;
          const note = lost ? ` +${lost} not scored` : "";
          if (rs.length === 0) return lost ? `-${note}` : "-";
          return `${rs.filter((r) => r.pass).length}/${rs.length} (${rs.filter((r) => r.passFirst).length})${note}`;
        }),
      ])
    )
  );

  if (arms.includes("gofish") && arms.length > 1) {
    out.push(
      "",
      "## Paired comparison: gofish minus each arm",
      "",
      "Per task, the difference in pass rate (within max turns) between gofish and the other arm, averaged over the tasks where both arms have a scored job; 95% bootstrap interval over tasks.",
      ""
    );
    for (const { title, rs } of sections) {
      if (sections.length > 1) out.push(`### ${title}`, "");
      out.push(pairedTable(rs, arms), "");
    }
    out.pop();
  }

  const firstLine = (s: string | undefined) => (s ?? "").split("\n")[0];

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
        `- ${r.task} / ${r.arm} / sample ${r.sample}: ${r.stopped}${r.apiError ? ` (${firstLine(r.apiError)})` : ""}`
      );
  }

  const short = ran.filter(cutShort);
  if (short.length > 0) {
    out.push(
      "",
      "## Scored, then cut short (infrastructure)",
      "",
      "These jobs produced at least one turn, then a repair turn ended on a budget refusal or an API error. They are scored on what they achieved (a fail, since no turn passed), but may have lost a repair turn.",
      ""
    );
    for (const r of short)
      out.push(
        `- ${r.task} / ${r.arm} / sample ${r.sample}: ${r.stopped} after ${r.turns.length} turn(s)${r.apiError ? ` (${firstLine(r.apiError)})` : ""}`
      );
  }

  const failures = ran.filter((r) => !r.pass);
  if (failures.length > 0) {
    out.push("", "## Failures", "");
    for (const r of failures) {
      const last = r.turns[r.turns.length - 1];
      const why =
        r.stopped === "refusal"
          ? r.stopped
          : !r.rendered
            ? `${cutShort(r) ? `[then ${r.stopped}] ` : ""}render error: ${firstLine(last?.error)}`
            : [
                ...(last?.checks?.results ?? []),
                ...(last?.preserved?.results ?? []),
              ]
                .filter((c) => !c.pass)
                .map((c) => `${c.check}: ${c.detail}`)
                .join("; ");
      out.push(`- ${r.task} / ${r.arm} / sample ${r.sample}: ${why}`);
    }
  }
  return out.join("\n") + "\n";
}
