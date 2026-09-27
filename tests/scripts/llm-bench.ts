/**
 * LLM authoring benchmark runner (v0: static charts; arms gofish, recharts,
 * d3, matplotlib). Design: apps/docs/docs/internals/design/llm-authoring-benchmark.md.
 * How to use and extend it: tests/llm-bench/README.md.
 *
 * Usage:
 *   tsx scripts/llm-bench.ts <mode> [options]
 *     references   render every reference solution and run its checks (no API);
 *                  must be all green before a paid run
 *     mock         run the full model loop with a mock model that replays the
 *                  references (--mock-break-first: turn 1 is a syntax error)
 *     run          call the real API (claude-opus-5); needs --yes
 *   Options:
 *     --arms gofish,recharts,d3,matplotlib   --tasks <substring>
 *     --samples N (1)   --max-turns N (3)   --budget-usd X (10)
 *     --effort low|medium|high|xhigh|max (medium)   --concurrency N (3)
 */

import { copyFileSync, mkdirSync, writeFileSync, appendFileSync } from "fs";
import { join, relative } from "path";
import {
  preserved as preservedCheck,
  runChecks,
  type ChecksOutcome,
} from "./llm-bench/checks";
import { callWithRetry } from "./llm-bench/call";
import {
  addUsage,
  costUsd,
  Ledger,
  typicalUsd,
  worstCaseUsd,
  ZERO_USAGE,
  MODEL,
} from "./llm-bench/cost";
import {
  AnthropicModel,
  apiKey,
  MockModel,
  type Model,
  type Turn,
} from "./llm-bench/model";
import {
  extractCode,
  NO_CODE_ERROR,
  repairMessage,
  systemBlocks,
  taskMessage,
} from "./llm-bench/prompt";
import type { RenderRecord } from "./llm-bench/record";
import { Renderer } from "./llm-bench/render";
import {
  buildReport,
  isScored,
  type JobResult,
  type TurnResult,
} from "./llm-bench/report";
import {
  ARM_EXT,
  ARMS,
  dataPath,
  loadData,
  loadReference,
  loadTasks,
  taskGroup,
  type Arm,
  type Task,
} from "./llm-bench/tasks";

const OUT_ROOT = join(import.meta.dirname, "../tmp/llm-bench");
const LEDGER_PATH = join(OUT_ROOT, "ledger.json");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type Mode = "references" | "mock" | "run";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

interface Options {
  mode: Mode;
  arms: Arm[];
  tasks?: string;
  samples: number;
  maxTurns: number;
  budgetUsd: number;
  effort: (typeof EFFORTS)[number];
  concurrency: number;
  mockBreakFirst: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): Options {
  const mode = argv[0] as Mode;
  if (!["references", "mock", "run"].includes(mode)) {
    console.error(
      "usage: llm-bench <references|mock|run> [--arms a,b] [--tasks substr] [--samples N] [--max-turns N] [--budget-usd X] [--effort E] [--concurrency N] [--mock-break-first] [--yes]"
    );
    process.exit(2);
  }
  const opts: Options = {
    mode,
    arms: [...ARMS],
    samples: 1,
    maxTurns: 3,
    budgetUsd: 10,
    effort: "medium",
    concurrency: 3,
    mockBreakFirst: false,
    yes: false,
  };
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--arms") {
      opts.arms = value().split(",") as Arm[];
      const bad = opts.arms.filter((a) => !ARMS.includes(a));
      if (bad.length) throw new Error(`unknown arms: ${bad.join(", ")}`);
    } else if (flag === "--tasks") opts.tasks = value();
    else if (flag === "--samples") opts.samples = Number(value());
    else if (flag === "--max-turns") opts.maxTurns = Number(value());
    else if (flag === "--budget-usd") opts.budgetUsd = Number(value());
    else if (flag === "--concurrency") opts.concurrency = Number(value());
    else if (flag === "--effort") {
      const e = value() as Options["effort"];
      if (!EFFORTS.includes(e))
        throw new Error(`--effort must be one of ${EFFORTS.join(", ")}`);
      opts.effort = e;
    } else if (flag === "--mock-break-first") opts.mockBreakFirst = true;
    else if (flag === "--yes") opts.yes = true;
    else throw new Error(`unknown option ${flag}`);
  }
  return opts;
}

async function pool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

const slug = (id: string) => id.replace(/\//g, "__");

// ---------------------------------------------------------------------------
// Base renders for edit tasks
// ---------------------------------------------------------------------------

/** Renders of each edit's base reference, per arm, computed once per run. */
class BaseRecords {
  private cache = new Map<string, Promise<RenderRecord | null>>();

  constructor(
    private renderer: Renderer,
    private runDir: string,
    private tasks: Map<string, Task>
  ) {}

  get(baseId: string, arm: Arm): Promise<RenderRecord | null> {
    const key = `${baseId}|${arm}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        (async () => {
          const base = this.tasks.get(baseId)!;
          const dir = join(this.runDir, "_base", slug(baseId), arm);
          mkdirSync(dir, { recursive: true });
          const codePath = join(dir, `reference.${ARM_EXT[arm]}`);
          writeFileSync(codePath, loadReference(baseId, arm));
          const r = await this.renderer.render(
            arm,
            codePath,
            loadData(base),
            dataPath(base),
            base.size
          );
          if (!r.ok)
            console.error(
              `base reference ${baseId}/${arm} failed to render: ${r.error}`
            );
          return r.record ?? null;
        })()
      );
    }
    return this.cache.get(key)!;
  }
}

async function judge(
  task: Task,
  arm: Arm,
  record: RenderRecord,
  bases: BaseRecords
): Promise<{ checks: ChecksOutcome; preserved?: ChecksOutcome }> {
  const checks = runChecks(task.checks, record, {
    data: loadData(task),
    size: task.size,
  });
  if (task.kind !== "edit") return { checks };
  const base = await bases.get(task.base, arm);
  const preserved: ChecksOutcome = base
    ? preservedCheck(base, record, task.mayChange)
    : {
        pass: false,
        results: [
          {
            check: "base render",
            pass: false,
            detail: "the base reference did not render",
          },
        ],
      };
  return { checks, preserved };
}

// ---------------------------------------------------------------------------
// References mode
// ---------------------------------------------------------------------------

async function runReferences(
  opts: Options,
  tasks: Task[],
  renderer: Renderer,
  runDir: string,
  bases: BaseRecords
): Promise<JobResult[]> {
  const jobs = tasks.flatMap((task) => opts.arms.map((arm) => ({ task, arm })));
  const results: JobResult[] = [];
  await pool(jobs, opts.concurrency, async ({ task, arm }) => {
    const dir = join(runDir, slug(task.id), arm);
    mkdirSync(dir, { recursive: true });
    const codePath = join(dir, `reference.${ARM_EXT[arm]}`);
    writeFileSync(codePath, loadReference(task.id, arm));
    const r = await renderer.render(
      arm,
      codePath,
      loadData(task),
      dataPath(task),
      task.size
    );
    const turn: TurnResult = {
      turn: 1,
      usage: ZERO_USAGE,
      usd: 0,
      latencyMs: 0,
      stopReason: "reference",
      code: relative(runDir, codePath),
      rendered: r.ok,
      renderMs: r.renderMs,
      error: r.error,
    };
    if (r.record) Object.assign(turn, await judge(task, arm, r.record, bases));
    writeFileSync(join(dir, "result.json"), JSON.stringify(turn, null, 1));
    const applied = !!turn.checks?.pass;
    const preserved = task.kind === "edit" ? !!turn.preserved?.pass : null;
    const pass = r.ok && applied && preserved !== false;
    results.push({
      mode: "references",
      task: task.id,
      kind: task.kind,
      group: taskGroup(task),
      arm,
      sample: 0,
      turns: [turn],
      rendered: r.ok,
      applied,
      preserved,
      pass,
      passFirst: pass,
      usage: ZERO_USAGE,
      usd: 0,
      latencyMs: 0,
    });
    const failed = [
      ...(turn.checks?.results ?? []),
      ...(turn.preserved?.results ?? []),
    ].filter((c) => !c.pass);
    const why = !r.ok
      ? `render error: ${r.error}`
      : failed.map((c) => `${c.check}: ${c.detail}`).join("; ");
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${task.id.padEnd(28)} ${arm.padEnd(10)} ${Math.round(r.renderMs).toString().padStart(5)}ms${pass ? "" : `  ${why}`}`
    );
  });
  return results;
}

// ---------------------------------------------------------------------------
// Model modes
// ---------------------------------------------------------------------------

interface JobContext {
  opts: Options;
  model: Model;
  ledger: Ledger;
  renderer: Renderer;
  bases: BaseRecords;
  runDir: string;
  runId: string;
  /** Set once the budget refuses a call: no new calls start after that. */
  halted: { budget: boolean; fatal: string | null };
}

async function runJob(
  ctx: JobContext,
  task: Task,
  arm: Arm,
  sample: number
): Promise<JobResult> {
  const { opts, model, ledger, renderer, runDir } = ctx;
  const dir = join(runDir, slug(task.id), arm, `s${sample}`);
  mkdirSync(dir, { recursive: true });
  const data = loadData(task);
  const system = systemBlocks(arm);
  const startCode =
    task.kind === "edit" ? loadReference(task.base, arm) : undefined;
  const messages: Turn[] = [
    { role: "user", content: taskMessage(task, arm, data, startCode) },
  ];
  const turns: TurnResult[] = [];
  let stopped: JobResult["stopped"];
  let apiError: string | undefined;
  let last: TurnResult | undefined;
  /** Worst-case bookings for failed attempts that may have been billed. */
  let failedUsd = 0;

  for (let t = 1; t <= opts.maxTurns; t++) {
    if (ctx.halted.fatal) {
      stopped = "api-error";
      apiError = `run halted: ${ctx.halted.fatal}`;
      break;
    }
    if (ctx.halted.budget) {
      stopped = "budget";
      break;
    }
    const inputChars =
      system.reduce((n, b) => n + b.text.length, 0) +
      JSON.stringify(messages).length;
    const outcome = await callWithRetry({
      model,
      req: { system, messages, task, arm, turn: t },
      ledger,
      reserveUsd: model.real ? worstCaseUsd(inputChars) : 0,
      run: ctx.runId,
      stop: () => ctx.halted.fatal !== null,
    });
    failedUsd += outcome.failedUsd;
    if (outcome.kind === "budget") {
      ctx.halted.budget = true;
      console.log(
        `budget: refusing ${task.id}/${arm}/s${sample} turn ${t} (ledger $${ledger.totalUsd.toFixed(2)} + worst case $${outcome.reserveUsd.toFixed(2)} > $${ledger.budgetUsd})`
      );
      stopped = "budget";
      break;
    }
    if (outcome.kind === "error") {
      if (outcome.info.fatal) ctx.halted.fatal = outcome.info.label;
      stopped = "api-error";
      apiError = outcome.info.label;
      break;
    }
    const { reply, usd } = outcome;
    writeFileSync(join(dir, `turn${t}.reply.md`), reply.text);
    const turn: TurnResult = {
      turn: t,
      usage: reply.usage,
      usd: model.real ? usd : costUsd(reply.usage), // mock: simulated, not in the ledger
      latencyMs: reply.latencyMs,
      stopReason: reply.stopReason,
      rendered: false,
    };
    turns.push(turn);
    last = turn;
    if (reply.stopReason === "refusal") {
      turn.error = "The model refused.";
      stopped = "refusal";
      break;
    }
    messages.push({ role: "assistant", content: reply.content });
    const code = extractCode(reply.text);
    if (code === null) {
      turn.error =
        reply.stopReason === "max_tokens"
          ? `${NO_CODE_ERROR} (the reply hit max_tokens)`
          : NO_CODE_ERROR;
    } else {
      const codePath = join(dir, `turn${t}.${ARM_EXT[arm]}`);
      writeFileSync(codePath, code);
      turn.code = relative(runDir, codePath);
      const r = await renderer.render(
        arm,
        codePath,
        data,
        dataPath(task),
        task.size
      );
      turn.renderMs = r.renderMs;
      turn.rendered = r.ok;
      turn.error = r.error;
      if (r.record) {
        Object.assign(turn, await judge(task, arm, r.record, ctx.bases));
        break; // Rendered: the job ends here. Check results are never sent back.
      }
    }
    messages.push({ role: "user", content: repairMessage(turn.error!) });
  }

  const applied = !!last?.rendered && !!last.checks?.pass;
  const preserved =
    task.kind === "edit" ? !!last?.rendered && !!last.preserved?.pass : null;
  const pass = applied && preserved !== false;
  const result: JobResult = {
    mode: opts.mode,
    task: task.id,
    kind: task.kind,
    group: taskGroup(task),
    arm,
    sample,
    turns,
    rendered: !!last?.rendered,
    applied,
    preserved,
    pass,
    passFirst: pass && turns.length === 1,
    stopped,
    apiError,
    usage: turns.reduce((u, t) => addUsage(u, t.usage), ZERO_USAGE),
    usd: turns.reduce((s, t) => s + t.usd, 0) + failedUsd,
    latencyMs: turns.reduce((s, t) => s + t.latencyMs, 0),
  };
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 1));
  // What the model saw and said, as text (thinking blocks omitted).
  const transcript = messages
    .map((m) => {
      const text =
        typeof m.content === "string"
          ? m.content
          : m.content
              .map((b) => (b.type === "text" ? b.text : `[${b.type}]`))
              .join("\n");
      return `## ${m.role}\n\n${text}`;
    })
    .join("\n\n");
  writeFileSync(
    join(dir, "transcript.md"),
    `## system\n\n${system.map((b) => b.text).join("\n\n")}\n\n${transcript}\n`
  );
  const tag = !isScored(result)
    ? stopped === "budget"
      ? "SKIP"
      : "ERR "
    : pass
      ? "PASS"
      : "FAIL";
  console.log(
    `${tag}  ${task.id.padEnd(28)} ${arm.padEnd(10)} s${sample}  turns=${turns.length}  $${result.usd.toFixed(4)}${stopped && isScored(result) ? `  (then ${stopped})` : ""}`
  );
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = await loadTasks();
  const tasks = opts.tasks
    ? all.filter((t) => t.id.includes(opts.tasks!))
    : all;
  if (tasks.length === 0) throw new Error(`no tasks match "${opts.tasks}"`);
  const byId = new Map(all.map((t) => [t.id, t]));
  const ledger = new Ledger(LEDGER_PATH, opts.budgetUsd);

  let model: Model | null = null;
  if (opts.mode === "run") {
    const key = apiKey();
    if (!key)
      throw new Error(
        "ANTHROPIC_API_KEY is not set (environment or tests/llm-bench/.env)"
      );
    const firstTurns = tasks.length * opts.arms.length * opts.samples;
    let typical = 0;
    let worst = 0;
    for (const task of tasks)
      for (const arm of opts.arms) {
        const sys = systemBlocks(arm).reduce((n, b) => n + b.text.length, 0);
        const user = taskMessage(
          task,
          arm,
          loadData(task),
          task.kind === "edit" ? loadReference(task.base, arm) : undefined
        ).length;
        typical += opts.samples * typicalUsd(sys, user);
        worst +=
          opts.samples *
          opts.maxTurns *
          worstCaseUsd(sys + user * opts.maxTurns);
      }
    console.log(
      `Model ${MODEL}, effort ${opts.effort}. ${firstTurns} jobs (${tasks.length} tasks x ${opts.arms.length} arms x ${opts.samples} samples), up to ${opts.maxTurns} turns each.\n` +
        `Estimate: ~$${typical.toFixed(2)} if every job passes on turn 1; worst case ~$${worst.toFixed(2)}.\n` +
        `Ledger so far: $${ledger.totalUsd.toFixed(4)}; budget cap $${opts.budgetUsd.toFixed(2)} (calls stop before the cap).`
    );
    if (!opts.yes) {
      console.log("Re-run with --yes to start.");
      return;
    }
    model = new AnthropicModel(key, opts.effort);
  } else if (opts.mode === "mock") {
    model = new MockModel({ breakFirst: opts.mockBreakFirst });
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${opts.mode}`;
  const runDir = join(OUT_ROOT, "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const renderer = await Renderer.start({
    python: opts.arms.includes("matplotlib"),
  });
  const bases = new BaseRecords(renderer, runDir, byId);
  let results: JobResult[] = [];
  const halted = { budget: false, fatal: null as string | null };
  const resultsPath = join(runDir, "results.jsonl");
  try {
    if (opts.mode === "references") {
      results = await runReferences(opts, tasks, renderer, runDir, bases);
      for (const r of results)
        appendFileSync(resultsPath, JSON.stringify(r) + "\n");
    } else {
      const ctx: JobContext = {
        opts,
        model: model!,
        ledger,
        renderer,
        bases,
        runDir,
        runId,
        halted,
      };
      const jobs = tasks.flatMap((task) =>
        opts.arms.flatMap((arm) =>
          Array.from({ length: opts.samples }, (_, s) => ({
            task,
            arm,
            sample: s + 1,
          }))
        )
      );
      await pool(jobs, opts.concurrency, async ({ task, arm, sample }) => {
        const r = await runJob(ctx, task, arm, sample);
        results.push(r);
        appendFileSync(resultsPath, JSON.stringify(r) + "\n");
      });
    }
  } finally {
    await renderer.close();
  }

  const order = (r: JobResult) =>
    `${tasks.findIndex((t) => t.id === r.task)}|${opts.arms.indexOf(r.arm)}|${r.sample}`;
  results.sort((a, b) =>
    order(a).localeCompare(order(b), undefined, { numeric: true })
  );
  const realSpend = model?.real ? results.reduce((s, r) => s + r.usd, 0) : 0;
  const report = buildReport(results, {
    mode: opts.mode,
    runDir: relative(join(import.meta.dirname, ".."), runDir),
    maxTurns: opts.mode === "references" ? 1 : opts.maxTurns,
    realSpendUsd: realSpend,
    ledgerTotalUsd: ledger.totalUsd,
    budgetUsd: opts.budgetUsd,
    effort: opts.mode === "references" ? "-" : opts.effort,
  });
  writeFileSync(join(runDir, "report.md"), report);
  copyFileSync(join(runDir, "report.md"), join(OUT_ROOT, "report.md"));
  console.log(`\n${report}`);
  console.log(`Report: ${join(runDir, "report.md")}`);
  if (halted.fatal) {
    console.error(`Stopped on a fatal API error: ${halted.fatal}`);
    process.exit(1);
  }
  if (halted.budget)
    console.log(
      "Stopped early: the budget cap was reached. Partial results are above."
    );
  if (opts.mode === "references" && results.some((r) => !r.pass))
    process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
