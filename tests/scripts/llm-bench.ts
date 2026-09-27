/**
 * LLM authoring benchmark runner (v0: static charts; arms gofish, recharts,
 * d3, matplotlib). Design: apps/docs/docs/internals/design/llm-authoring-benchmark.md.
 * How to use and extend it: tests/llm-bench/README.md.
 *
 * Usage:
 *   tsx scripts/llm-bench.ts <mode> [options]
 *     references   render every reference solution and run its checks (no API);
 *                  must be all green before a paid run (a chain's every
 *                  step is checked, each against the previous step's
 *                  reference render)
 *     mock         run the full model loop with a mock model that replays the
 *                  references (--mock-break-first: turn 1 is a syntax error)
 *     run          call the real model (--model, default claude-opus-5-5) on
 *                  --backend api (the Anthropic API) or claude-code
 *                  (headless Claude Code on the Claude subscription); prints
 *                  the estimate, and needs --yes to start
 *     rescore <runDir>
 *                  render every saved turn of an earlier run again through the
 *                  current harness, checks and arm contract (no API); writes
 *                  <runDir>-rescored/
 *     compare <runDir>[=label] ...
 *                  one table comparing the gofish arm across runs (for
 *                  example, one run per --context)
 *   Options:
 *     --arms gofish,recharts,d3,matplotlib   --tasks <substring>
 *     --samples N (1)   --max-turns N (3)   --budget-usd X (10, API)
 *     --subscription-cap-usd X (40, claude-code at list price)
 *     --model ID (claude-opus-5-5)   --backend api|claude-code (api)
 *     --effort low|medium|high|xhigh|max (medium)   --concurrency N (3)
 *     --context pack:<path>|cheatsheet|retrieval|skill
 *                  (pack:context/gofish.md): how GoFish is presented to the
 *                  gofish arm (mock records it but ignores it); skill needs
 *                  --backend claude-code. --docs-pack <path> is
 *                  --context pack:<path>.
 */

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join, relative, resolve } from "path";
import {
  preserved as preservedCheck,
  runChecks,
  type ChecksOutcome,
} from "./llm-bench/checks";
import { callWithRetry } from "./llm-bench/call";
import {
  addUsage,
  COST_BASIS,
  costUsd,
  DEFAULT_MODEL,
  Ledger,
  prices,
  splitOutput,
  typicalUsage,
  worstCaseUsd,
  ZERO_USAGE,
  type Backend,
} from "./llm-bench/cost";
import {
  AnthropicModel,
  apiKey,
  CLAUDE_CODE_OVERHEAD_TOKENS,
  ClaudeCodeModel,
  MockModel,
  type Model,
  type Turn,
} from "./llm-bench/model";
import {
  codeStats,
  lexicalStats,
  ModelTokenCounter,
  type CodeStats,
} from "./llm-bench/codestats";
import { compareRuns } from "./llm-bench/compare";
import {
  contextOf,
  DEFAULT_CONTEXT,
  examplesMessage,
  loadContext,
  type GofishContext,
} from "./llm-bench/context";
import {
  extractCode,
  firstMessage,
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
  scoreChain,
  scoreTurns,
  turnOutcome,
  type JobResult,
  type Outcome,
  type TurnResult,
} from "./llm-bench/report";
import {
  ARM_EXT,
  ARMS,
  BENCH_DIR,
  chainBase,
  chainSteps,
  dataPath,
  loadData,
  loadReference,
  loadTasks,
  referencePath,
  taskGroup,
  TOKEN_CACHE,
  type Arm,
  type ChainTask,
  type SingleTask,
  type Task,
} from "./llm-bench/tasks";

const OUT_ROOT = join(import.meta.dirname, "../tmp/llm-bench");
const LEDGER_PATH = join(OUT_ROOT, "ledger.json");

const ledgerCaps = (opts: Options) => ({
  apiUsd: opts.budgetUsd,
  subscriptionUsd: opts.subscriptionCapUsd,
});

const ledgerMeta = (ledger: Ledger) => ({
  apiUsd: ledger.total("api"),
  budgetUsd: ledger.cap("api"),
  subscriptionUsd: ledger.total("claude-code"),
  subscriptionCapUsd: ledger.cap("claude-code"),
});

/** Input tokens the backend adds to each call on top of our prompt. */
const overheadTokens = (backend: Backend) =>
  backend === "claude-code" ? CLAUDE_CODE_OVERHEAD_TOKENS : 0;

/** A skill call is several API round trips (one per round of tool use), so
 *  the budget guard reserves this many worst-case calls for it. */
const SKILL_RESERVE_FACTOR = 4;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type Mode = "references" | "mock" | "run" | "rescore" | "compare";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

interface Options {
  mode: Mode;
  arms: Arm[];
  tasks?: string;
  samples: number;
  maxTurns: number;
  budgetUsd: number;
  /** claude-code: the cap on list-price spend (all runs), so a runaway loop
   *  stops. It does not bill anything. */
  subscriptionCapUsd: number;
  model: string;
  backend: Backend;
  effort: (typeof EFFORTS)[number];
  concurrency: number;
  /** How GoFish is presented to the gofish arm (see context.ts). */
  context: string;
  mockBreakFirst: boolean;
  yes: boolean;
  /** rescore: the run directory to rescore. */
  runDir?: string;
  /** compare: the run directories, each with an optional label. */
  compare?: { dir: string; label?: string }[];
}

/** A run directory named by path (from where the command was typed) or by
 *  run id under tests/tmp/llm-bench/runs/. */
function findRunDir(arg: string): string {
  const found = [process.env.INIT_CWD, process.cwd(), join(OUT_ROOT, "runs")]
    .filter((d): d is string => !!d)
    .map((d) => resolve(d, arg))
    .find((d) => existsSync(join(d, "results.jsonl")));
  if (!found) throw new Error(`no results.jsonl in run directory ${arg}`);
  return found.replace(/\/+$/, "");
}

function parseArgs(argv: string[]): Options {
  const mode = argv[0] as Mode;
  if (
    !["references", "mock", "run", "rescore", "compare"].includes(mode) ||
    ((mode === "rescore" || mode === "compare") && !argv[1])
  ) {
    console.error(
      "usage: llm-bench <references|mock|run|rescore <runDir>|compare <runDir>[=label] ...> [--arms a,b] [--tasks substr] [--samples N] [--max-turns N] [--budget-usd X] [--subscription-cap-usd X] [--model ID] [--backend api|claude-code] [--effort E] [--concurrency N] [--context pack:<path>|cheatsheet|retrieval|skill] [--docs-pack path] [--mock-break-first] [--yes]"
    );
    process.exit(2);
  }
  const opts: Options = {
    mode,
    arms: [...ARMS],
    samples: 1,
    maxTurns: 3,
    budgetUsd: 10,
    subscriptionCapUsd: 40,
    model: DEFAULT_MODEL,
    backend: "api",
    effort: "medium",
    concurrency: 3,
    context: DEFAULT_CONTEXT,
    mockBreakFirst: false,
    yes: false,
  };
  // pnpm runs this from tests/; resolve paths from where they were typed.
  const typedFrom = process.env.INIT_CWD ?? process.cwd();
  let i0 = 1;
  if (mode === "rescore") opts.runDir = findRunDir(argv[i0++]);
  if (mode === "compare") {
    opts.compare = [];
    while (i0 < argv.length && !argv[i0].startsWith("--")) {
      const [dir, label] = argv[i0++].split("=");
      opts.compare.push({ dir: findRunDir(dir), label });
    }
  }
  for (let i = i0; i < argv.length; i++) {
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
    else if (flag === "--subscription-cap-usd")
      opts.subscriptionCapUsd = Number(value());
    else if (flag === "--concurrency") opts.concurrency = Number(value());
    else if (flag === "--model") opts.model = value();
    else if (flag === "--docs-pack")
      opts.context = `pack:${resolve(typedFrom, value())}`;
    else if (flag === "--context") opts.context = value();
    else if (flag === "--backend") {
      const b = value() as Backend;
      if (!(b in COST_BASIS))
        throw new Error("--backend must be api or claude-code");
      opts.backend = b;
    } else if (flag === "--effort") {
      const e = value() as Options["effort"];
      if (!EFFORTS.includes(e))
        throw new Error(`--effort must be one of ${EFFORTS.join(", ")}`);
      opts.effort = e;
    } else if (flag === "--mock-break-first") opts.mockBreakFirst = true;
    else if (flag === "--yes") opts.yes = true;
    else throw new Error(`unknown option ${flag}`);
  }
  prices(opts.model); // fail now on a model with no prices
  if (
    opts.context === "skill" &&
    opts.mode === "run" &&
    opts.backend !== "claude-code"
  )
    throw new Error(
      "--context skill needs --backend claude-code (the model reads the skill folder with Claude Code's tools)"
    );
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
          const base = this.tasks.get(baseId) as SingleTask;
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
          return r.ok ? r.record! : null;
        })()
      );
    }
    return this.cache.get(key)!;
  }
}

/** Run the checks on a picture, and for an edit (or chain step) compare it
 *  with `base`, the picture it started from. */
function judge(
  task: SingleTask,
  record: RenderRecord,
  base: RenderRecord | null | undefined
): { checks: ChecksOutcome; preserved?: ChecksOutcome } {
  const checks = runChecks(task.checks, record, {
    data: loadData(task),
    size: task.size,
  });
  if (task.kind !== "edit") return { checks };
  const preserved: ChecksOutcome = base
    ? preservedCheck(base, record, task.mayChange)
    : {
        pass: false,
        results: [
          {
            check: "base render",
            pass: false,
            detail: "the picture this edit started from did not render",
          },
        ],
      };
  return { checks, preserved };
}

const TAG: Record<Outcome, string> = {
  pass: "PASS",
  partial: "PART",
  fail: "FAIL",
};

// ---------------------------------------------------------------------------
// References mode
// ---------------------------------------------------------------------------

/** Render the reference for `task` in `dir` and judge it against `base`. */
async function referenceTurn(
  renderer: Renderer,
  runDir: string,
  task: SingleTask,
  arm: Arm,
  dir: string,
  base: RenderRecord | null | undefined,
  step?: number
): Promise<{ turn: TurnResult; record: RenderRecord | null }> {
  mkdirSync(dir, { recursive: true });
  const refPath = referencePath(task.id, arm);
  if (!existsSync(refPath)) {
    // A missing reference fails this job, not the whole run.
    console.log(
      `FAIL  ${task.id.padEnd(28)} ${arm.padEnd(10)}  missing reference ${relative(BENCH_DIR, refPath)}`
    );
    const turn: TurnResult = {
      ...(step ? { step } : {}),
      turn: 1,
      usage: ZERO_USAGE,
      usd: 0,
      latencyMs: 0,
      stopReason: "reference",
      rendered: false,
      error: `missing reference ${refPath}`,
    };
    return { turn, record: null };
  }
  const codePath = join(dir, `reference.${ARM_EXT[arm]}`);
  writeFileSync(codePath, readFileSync(refPath, "utf8"));
  const r = await renderer.render(
    arm,
    codePath,
    loadData(task),
    dataPath(task),
    task.size
  );
  const turn: TurnResult = {
    ...(step ? { step } : {}),
    turn: 1,
    usage: ZERO_USAGE,
    usd: 0,
    latencyMs: 0,
    stopReason: "reference",
    code: relative(runDir, codePath),
    rendered: r.ok,
    renderMs: r.renderMs,
    error: r.error,
    errorKind: r.errorKind,
  };
  if (r.record) Object.assign(turn, judge(task, r.record, base));
  writeFileSync(join(dir, "result.json"), JSON.stringify(turn, null, 1));
  const outcome = turnOutcome(turn);
  const failed = [
    ...(turn.checks?.results ?? []),
    ...(turn.preserved?.results ?? []),
  ].filter((c) => !c.pass);
  const why = [
    ...(r.error ? [`${r.errorKind} error: ${r.error}`] : []),
    ...failed.map((c) => `${c.check}: ${c.detail}`),
  ].join("; ");
  console.log(
    `${TAG[outcome]}  ${task.id.padEnd(28)} ${arm.padEnd(10)} ${Math.round(r.renderMs).toString().padStart(5)}ms${outcome === "pass" ? "" : `  ${why}`}`
  );
  return { turn, record: r.record ?? null };
}

/**
 * Every reference, judged like a model's answer. A chain's step k is judged
 * against step k-1's reference render (the base task's on step 1), and every
 * step is checked even when an earlier one fails.
 */
async function runReferences(
  opts: Options,
  tasks: Task[],
  byId: Map<string, Task>,
  renderer: Renderer,
  runDir: string,
  bases: BaseRecords
): Promise<JobResult[]> {
  const jobs = tasks.flatMap((task) => opts.arms.map((arm) => ({ task, arm })));
  const results: JobResult[] = [];
  const job = (task: Task, arm: Arm, turns: TurnResult[]): JobResult => ({
    mode: "references",
    task: task.id,
    kind: task.kind,
    group: taskGroup(task),
    arm,
    sample: 0,
    turns,
    ...(task.kind === "chain"
      ? scoreChain(turns, task.steps.length)
      : scoreTurns(turns, task.kind === "edit")),
    usage: ZERO_USAGE,
    usd: 0,
    latencyMs: 0,
  });
  await pool(jobs, opts.concurrency, async ({ task, arm }) => {
    const dir = join(runDir, slug(task.id), arm);
    if (task.kind !== "chain") {
      const base =
        task.kind === "edit" ? await bases.get(task.base, arm) : undefined;
      const { turn } = await referenceTurn(
        renderer,
        runDir,
        task,
        arm,
        dir,
        base
      );
      results.push(job(task, arm, [turn]));
      return;
    }
    const turns: TurnResult[] = [];
    let base = await bases.get(task.base, arm);
    for (const [i, step] of chainSteps(task, chainBase(task, byId)).entries()) {
      const { turn, record } = await referenceTurn(
        renderer,
        runDir,
        step,
        arm,
        join(dir, `step${i + 1}`),
        base,
        i + 1
      );
      turns.push(turn);
      base = record;
    }
    // Every step is judged above; the job passes only if all of them do.
    results.push(job(task, arm, turns));
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
  byId: Map<string, Task>;
  runDir: string;
  runId: string;
  context: GofishContext;
  /** Counts programs and context text in the model's tokens. */
  counter: ModelTokenCounter;
  /** Set once the budget refuses a call: no new calls start after that. */
  halted: { budget: boolean; fatal: string | null };
}

interface Conversation {
  turns: TurnResult[];
  stopped?: JobResult["stopped"];
  apiError?: string;
  /** Worst-case bookings for failed attempts that may have been billed. */
  failedUsd: number;
  /** The passing turn's program and picture, if a turn passed (a chain
   *  goes on from them). */
  final?: { code: string; record: RenderRecord };
  /** Retrieval context: the gallery examples sent with the task. */
  retrieved?: string[];
}

/**
 * One conversation about one task: the task message, then repair turns
 * until a turn renders (drawn by the library) or `--max-turns` run out.
 * Render errors and contract violations go back to the model; check results
 * never do. For an edit, `startCode` is the program shown to the model and
 * `base` the picture preservation is judged against. Writes every turn's
 * files and `transcript.md` into `dir`.
 */
async function converse(
  ctx: JobContext,
  task: SingleTask,
  arm: Arm,
  dir: string,
  label: string,
  edit: { startCode: string; base: RenderRecord | null } | undefined,
  step?: number
): Promise<Conversation> {
  const { opts, model, ledger, renderer, runDir } = ctx;
  mkdirSync(dir, { recursive: true });
  const data = loadData(task);
  const system = systemBlocks(arm, ctx.context);
  const gofish = arm === "gofish";
  // Retrieval sees the instruction only: not the task id, checks or
  // references.
  const examples = gofish
    ? ctx.context.retrieve?.(task.instruction)
    : undefined;
  const messages: Turn[] = [
    {
      role: "user",
      content: firstMessage(
        taskMessage(task, arm, data, edit?.startCode),
        examples
      ),
    },
  ];
  const skillDir = gofish ? ctx.context.skillDir : undefined;
  const conv: Conversation = {
    turns: [],
    failedUsd: 0,
    ...(examples ? { retrieved: examples.map((e) => e.id) } : {}),
  };
  // The context's tokens that every turn sends again (the system text, and
  // the examples in the first message), in the model's tokens.
  const count = async (text: string) =>
    (await ctx.counter.count(text, model.id)).tokens;
  const resent = gofish
    ? (await count(ctx.context.systemText)) +
      (examples ? await count(examplesMessage(examples)) : 0)
    : 0;

  for (let t = 1; t <= opts.maxTurns; t++) {
    if (ctx.halted.fatal) {
      conv.stopped = "api-error";
      conv.apiError = `run halted: ${ctx.halted.fatal}`;
      break;
    }
    if (ctx.halted.budget) {
      conv.stopped = "budget";
      break;
    }
    const inputChars =
      system.reduce((n, b) => n + b.text.length, 0) +
      JSON.stringify(messages).length;
    const outcome = await callWithRetry({
      model,
      req: { system, messages, task, arm, turn: t, skillDir },
      ledger,
      reserveUsd:
        model.backend === "mock"
          ? 0
          : worstCaseUsd(inputChars, model.id, overheadTokens(model.backend)) *
            (skillDir ? SKILL_RESERVE_FACTOR : 1),
      run: ctx.runId,
      stop: () => ctx.halted.fatal !== null,
    });
    conv.failedUsd += outcome.failedUsd;
    if (outcome.kind === "budget") {
      ctx.halted.budget = true;
      const b = model.backend as Backend;
      console.log(
        `budget: refusing ${label} turn ${t} (${b} ledger $${ledger.total(b).toFixed(2)} + worst case $${outcome.reserveUsd.toFixed(2)} > $${ledger.cap(b)} ${b === "api" ? "budget" : "list-price cap"})`
      );
      conv.stopped = "budget";
      break;
    }
    if (outcome.kind === "error") {
      if (outcome.info.fatal) ctx.halted.fatal = outcome.info.label;
      conv.stopped = "api-error";
      conv.apiError = outcome.info.label;
      break;
    }
    const { reply, usd } = outcome;
    const replyPath = join(dir, `turn${t}.reply.md`);
    writeFileSync(replyPath, reply.text);
    const turn: TurnResult = {
      ...(step ? { step } : {}),
      turn: t,
      usage: reply.usage,
      // Mock: simulated, not in the ledger.
      usd: model.backend === "mock" ? (reply.costUsd ?? 0) : usd,
      ...(model.backend === "mock"
        ? {}
        : { costBasis: COST_BASIS[model.backend] }),
      latencyMs: reply.latencyMs,
      stopReason: reply.stopReason,
      reply: relative(runDir, replyPath),
      ...splitOutput(reply.text, reply.usage.output, reply.thinkingTokens),
      ...(gofish
        ? {
            contextTokens:
              resent +
              (reply.toolResults?.length
                ? await count(reply.toolResults.join("\n"))
                : 0),
          }
        : {}),
      ...(reply.toolUses ? { toolUses: reply.toolUses } : {}),
      rendered: false,
    };
    conv.turns.push(turn);
    if (reply.stopReason === "refusal") {
      turn.error = "The model refused.";
      conv.stopped = "refusal";
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
      turn.codeStats = await codeStats(code, arm, model.id, ctx.counter);
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
      turn.errorKind = r.errorKind;
      // A contract violation still has a picture: judge it, so a right
      // picture drawn some other way scores as partial.
      if (r.record) Object.assign(turn, judge(task, r.record, edit?.base));
      if (r.ok) {
        if (turnOutcome(turn) === "pass")
          conv.final = { code, record: r.record! };
        break; // Rendered: the conversation ends here. Check results are never sent back.
      }
    }
    messages.push({ role: "user", content: repairMessage(turn.error!) });
  }

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
  return conv;
}

function finishJob(
  ctx: JobContext,
  task: Task,
  arm: Arm,
  sample: number,
  dir: string,
  turns: TurnResult[],
  conv: Omit<Conversation, "turns" | "final" | "retrieved">,
  retrieved: JobResult["retrieved"]
): JobResult {
  const result: JobResult = {
    mode: ctx.opts.mode,
    model: ctx.model.id,
    backend: ctx.model.backend,
    context: { name: ctx.context.name, sha256: ctx.context.sha256 },
    ...(retrieved?.length ? { retrieved } : {}),
    task: task.id,
    kind: task.kind,
    group: taskGroup(task),
    arm,
    sample,
    turns,
    ...(task.kind === "chain"
      ? scoreChain(turns, task.steps.length)
      : scoreTurns(turns, task.kind === "edit")),
    stopped: conv.stopped,
    apiError: conv.apiError,
    usage: turns.reduce((u, t) => addUsage(u, t.usage), ZERO_USAGE),
    usd: turns.reduce((s, t) => s + t.usd, 0) + conv.failedUsd,
    latencyMs: turns.reduce((s, t) => s + t.latencyMs, 0),
  };
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 1));
  const tag = !isScored(result)
    ? conv.stopped === "budget"
      ? "SKIP"
      : "ERR "
    : TAG[result.outcome];
  const steps =
    task.kind === "chain"
      ? `  steps=${result.stepsPassed}/${result.nSteps}`
      : "";
  console.log(
    `${tag}  ${task.id.padEnd(28)} ${arm.padEnd(10)} s${sample}${steps}  turns=${turns.length}  $${result.usd.toFixed(4)}${conv.stopped && isScored(result) ? `  (then ${conv.stopped})` : ""}`
  );
  return result;
}

/** A create or edit task. */
async function runJob(
  ctx: JobContext,
  task: SingleTask,
  arm: Arm,
  sample: number
): Promise<JobResult> {
  const dir = join(ctx.runDir, slug(task.id), arm, `s${sample}`);
  const edit =
    task.kind === "edit"
      ? {
          startCode: loadReference(task.base, arm),
          base: await ctx.bases.get(task.base, arm),
        }
      : undefined;
  const conv = await converse(
    ctx,
    task,
    arm,
    dir,
    `${task.id}/${arm}/s${sample}`,
    edit
  );
  return finishJob(
    ctx,
    task,
    arm,
    sample,
    dir,
    conv.turns,
    conv,
    conv.retrieved && [{ ids: conv.retrieved }]
  );
}

/**
 * A chain: each step is a conversation that starts from the previous step's
 * passing program and is judged against its picture (step 1: the base
 * task's reference). The chain stops at the first step that does not pass.
 */
async function runChain(
  ctx: JobContext,
  chain: ChainTask,
  arm: Arm,
  sample: number
): Promise<JobResult> {
  const dir = join(ctx.runDir, slug(chain.id), arm, `s${sample}`);
  const steps = chainSteps(chain, chainBase(chain, ctx.byId));
  let edit = {
    startCode: loadReference(chain.base, arm),
    base: await ctx.bases.get(chain.base, arm),
  };
  const turns: TurnResult[] = [];
  const conv: Omit<Conversation, "turns" | "final" | "retrieved"> = {
    failedUsd: 0,
  };
  const retrieved: NonNullable<JobResult["retrieved"]> = [];
  for (const [i, step] of steps.entries()) {
    const c = await converse(
      ctx,
      step,
      arm,
      join(dir, `step${i + 1}`),
      `${step.id}/${arm}/s${sample}`,
      edit,
      i + 1
    );
    turns.push(...c.turns);
    if (c.retrieved) retrieved.push({ step: i + 1, ids: c.retrieved });
    conv.failedUsd += c.failedUsd;
    conv.stopped = c.stopped;
    conv.apiError = c.apiError;
    if (!c.final) break;
    edit = { startCode: c.final.code, base: c.final.record };
  }
  return finishJob(ctx, chain, arm, sample, dir, turns, conv, retrieved);
}

/** The statistics of each reference program that `results` has a single
 *  task and arm for (the report's per-task tables show them). */
function referenceStats(
  results: JobResult[]
): Record<string, ReturnType<typeof lexicalStats>> {
  const out: Record<string, ReturnType<typeof lexicalStats>> = {};
  for (const r of results) {
    const key = `${r.task}|${r.arm}`;
    if (r.kind === "chain" || key in out) continue;
    if (!existsSync(referencePath(r.task, r.arm))) continue;
    out[key] = lexicalStats(loadReference(r.task, r.arm), r.arm);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rescore mode
// ---------------------------------------------------------------------------

/** Measures a program (see codestats.ts). */
type Sizer = (code: string, arm: Arm) => Promise<CodeStats>;

/** Saved per-job files copied into the rescored run (the rendered outputs
 *  are produced again). */
const SAVED_FILE =
  /^(turn\d+\.(reply\.md|js|jsx|py)|reference\.(js|jsx|py)|transcript\.md)$/;

/** Copy the saved files of a job directory (and its chain step
 *  directories). */
function copySaved(src: string, dst: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (SAVED_FILE.test(f)) copyFileSync(join(src, f), join(dst, f));
    else if (/^step\d+$/.test(f)) copySaved(join(src, f), join(dst, f));
  }
}

/** Results from before outcomes existed: a job either passed or failed. */
function normalize(r: JobResult): JobResult {
  return { ...r, outcome: r.outcome ?? (r.pass ? "pass" : "fail") };
}

/**
 * Render the saved turns of one conversation again from `outDir` (a copy of
 * the original run) and judge them against `base`. The reasoning split is
 * filled in from the saved replies. Returns the turns, the turns a real run
 * would have scored (up to the first that renders), that turn's picture,
 * and a note when that turn is not where the original conversation ended.
 */
async function rescoreTurns(
  old: TurnResult[],
  task: SingleTask,
  arm: Arm,
  outDir: string,
  renderer: Renderer,
  base: RenderRecord | null | undefined,
  replyPath: (t: TurnResult) => string,
  size: Sizer
): Promise<{
  turns: TurnResult[];
  scored: TurnResult[];
  endRecord?: RenderRecord;
  note?: string;
}> {
  const data = loadData(task);
  const turns: TurnResult[] = [];
  const records = new Map<TurnResult, RenderRecord>();
  for (const o of old) {
    const rp = replyPath(o);
    const split = existsSync(rp)
      ? splitOutput(readFileSync(rp, "utf8"), o.usage.output)
      : {};
    if (!o.code) {
      turns.push({ ...o, ...split }); // no program (no code block, refusal)
      continue;
    }
    const r = await renderer.render(
      arm,
      join(outDir, o.code),
      data,
      dataPath(task),
      task.size
    );
    const turn: TurnResult = {
      ...o,
      ...split,
      codeStats: await size(readFileSync(join(outDir, o.code), "utf8"), arm),
      rendered: r.ok,
      renderMs: r.renderMs,
      error: r.error,
      errorKind: r.errorKind,
      checks: undefined,
      preserved: undefined,
    };
    if (r.record) {
      Object.assign(turn, judge(task, r.record, base));
      records.set(turn, r.record);
    }
    turns.push(turn);
  }
  const endIdx = turns.findIndex((t) => t.rendered);
  const end = endIdx >= 0 ? turns[endIdx] : undefined;
  const origEnd = old[old.length - 1];
  const where = (t: TurnResult) =>
    t.step ? `step ${t.step} turn ${t.turn}` : `turn ${t.turn}`;
  let note: string | undefined;
  if (!end && origEnd?.rendered)
    note = `${where(origEnd)} rendered in the original run, so the model stopped there; it now fails (${turns[turns.length - 1].errorKind ?? "render"} error), and a real run would have given the model another turn`;
  else if (end && end.turn !== origEnd.turn)
    note = `${where(end)} now renders, so a real run would have stopped there; the original run went on to turn ${origEnd.turn}`;
  return {
    turns,
    scored: end ? turns.slice(0, endIdx + 1) : turns,
    endRecord: end ? records.get(end) : undefined,
    note,
  };
}

/**
 * Rescore one saved job the way runJob (or runChain) would have scored it:
 * a conversation ends at its first turn that renders, and is scored on the
 * turns up to that one. When that is not the turn the original run ended
 * on, a real run would have gone differently (the model would have had
 * another turn, or would have stopped sooner), so the job is scored on the
 * saved turns only and flagged. A chain step is judged against the rescored
 * previous step's picture; if a step no longer passes, the saved later
 * steps are dropped, and if a step that stopped the chain now passes, the
 * chain ends there (there are no saved later steps to score).
 */
async function rescoreJob(
  job: JobResult,
  task: Task,
  byId: Map<string, Task>,
  srcDir: string,
  outDir: string,
  renderer: Renderer,
  bases: BaseRecords,
  size: Sizer
): Promise<JobResult> {
  const jobRel = join(
    slug(task.id),
    job.arm,
    ...(job.sample ? [`s${job.sample}`] : [])
  );
  copySaved(join(srcDir, jobRel), join(outDir, jobRel));
  const replyPath = (t: TurnResult) =>
    join(
      srcDir,
      t.reply ??
        (t.code
          ? t.code.replace(/\.[^.]+$/, ".reply.md")
          : join(
              jobRel,
              ...(t.step ? [`step${t.step}`] : []),
              `turn${t.turn}.reply.md`
            ))
    );

  let result: JobResult;
  if (task.kind !== "chain") {
    const base =
      task.kind === "edit" ? await bases.get(task.base, job.arm) : undefined;
    const r = await rescoreTurns(
      job.turns,
      task,
      job.arm,
      outDir,
      renderer,
      base,
      replyPath,
      size
    );
    result = {
      ...job,
      turns: r.turns,
      ...scoreTurns(r.scored, task.kind === "edit"),
      rescoreNote: r.note,
    };
  } else {
    const steps = chainSteps(task, chainBase(task, byId));
    let base = await bases.get(task.base, job.arm);
    const turns: TurnResult[] = [];
    const scored: TurnResult[] = [];
    const notes: string[] = [];
    const saved = [...new Set(job.turns.map((t) => t.step!))].sort(
      (a, b) => a - b
    );
    for (const k of saved) {
      const r = await rescoreTurns(
        job.turns.filter((t) => t.step === k),
        steps[k - 1],
        job.arm,
        outDir,
        renderer,
        base,
        replyPath,
        size
      );
      turns.push(...r.turns);
      scored.push(...r.scored);
      if (r.note) notes.push(r.note);
      const passed = scoreTurns(r.scored, true).pass;
      const more = k < saved[saved.length - 1];
      if (!passed) {
        if (more)
          notes.push(
            `step ${k} no longer passes, so the saved steps after it are not scored`
          );
        break;
      }
      if (!more && k < steps.length && !job.stopped)
        notes.push(
          `step ${k} now passes, so a real run would have gone on to step ${k + 1}; the chain is scored as stopping there`
        );
      base = r.endRecord ?? null;
    }
    result = {
      ...job,
      turns,
      ...scoreChain(scored, steps.length),
      rescoreNote: notes.length ? notes.join("; ") : undefined,
    };
  }
  writeFileSync(
    join(outDir, jobRel, "result.json"),
    JSON.stringify(result, null, 1)
  );
  const changed = CHANGED_FIELDS.filter((k) => job[k] !== result[k]);
  console.log(
    `${TAG[result.outcome]}  ${task.id.padEnd(28)} ${job.arm.padEnd(10)} s${job.sample}${changed.length ? `  CHANGED (${changed.map((k) => `${k} ${job[k]}->${result[k]}`).join(", ")})` : ""}`
  );
  return result;
}

const CHANGED_FIELDS = [
  "outcome",
  "pass",
  "passFirst",
  "applied",
  "preserved",
  "rendered",
  "stepsPassed",
] as const;

/** The report section listing jobs whose outcome changed under rescoring. */
function changedSection(before: JobResult[], after: JobResult[]): string {
  const key = (r: JobResult) => `${r.task}|${r.arm}|${r.sample}`;
  const orig = new Map(before.map((r) => [key(r), r]));
  const lines = after.flatMap((r) => {
    const o = orig.get(key(r))!;
    const diff = CHANGED_FIELDS.filter((k) => o[k] !== r[k]);
    return diff.length
      ? [
          `- ${r.task} / ${r.arm} / sample ${r.sample}: ${diff.map((k) => `${k} ${o[k]} -> ${r[k]}`).join(", ")}`,
        ]
      : [];
  });
  return [
    "",
    "## Changed from the original run",
    "",
    ...(lines.length ? lines : ["No job changed outcome."]),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function rescore(opts: Options): Promise<void> {
  const srcDir = opts.runDir!;
  const outDir = `${srcDir}-rescored`;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const original: JobResult[] = readFileSync(
    join(srcDir, "results.jsonl"),
    "utf8"
  )
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => normalize(JSON.parse(l)));
  const all = await loadTasks();
  const byId = new Map<string, Task>(all.map((t) => [t.id, t]));
  const missing = [...new Set(original.map((r) => r.task))].filter(
    (t) => !byId.has(t)
  );
  if (missing.length)
    throw new Error(`tasks no longer exist: ${missing.join(", ")}`);
  // The original report holds the settings results.jsonl does not.
  const origReport = existsSync(join(srcDir, "report.md"))
    ? readFileSync(join(srcDir, "report.md"), "utf8")
    : "";
  const maxTurns = Number(/Max turns: (\d+)/.exec(origReport)?.[1] ?? 3);
  const effort = /Effort: ([\w-]+)/.exec(origReport)?.[1] ?? "-";
  // Results from before the model and backend were recorded are API runs of
  // claude-opus-5 (or references, which have neither).
  const ran = original.some((r) => r.mode !== "references");
  const model =
    original.find((r) => r.model)?.model ??
    /Model: ([\w.-]+)/.exec(origReport)?.[1] ??
    (ran ? "claude-opus-5" : "-");
  const backend =
    original.find((r) => r.backend)?.backend ??
    /Backend: ([\w-]+)/.exec(origReport)?.[1] ??
    (original.some((r) => r.mode === "run") ? "api" : ran ? "mock" : "-");
  const context = original.map(contextOf).find(Boolean);
  const counter = new ModelTokenCounter(TOKEN_CACHE, apiKey());
  const size: Sizer = (code, arm) =>
    codeStats(code, arm, model === "-" ? DEFAULT_MODEL : model, counter);

  const renderer = await Renderer.start({
    python: original.some((r) => r.arm === "matplotlib"),
  });
  const bases = new BaseRecords(renderer, outDir, byId);
  const results: JobResult[] = [];
  try {
    await pool(original, opts.concurrency, async (job) => {
      results.push(
        await rescoreJob(
          job,
          byId.get(job.task)!,
          byId,
          srcDir,
          outDir,
          renderer,
          bases,
          size
        )
      );
    });
  } finally {
    await renderer.close();
  }
  const pos = new Map(original.map((r, i) => [r, i]));
  const origOf = (r: JobResult) =>
    original.find(
      (o) => o.task === r.task && o.arm === r.arm && o.sample === r.sample
    )!;
  results.sort((a, b) => pos.get(origOf(a))! - pos.get(origOf(b))!);
  writeFileSync(
    join(outDir, "results.jsonl"),
    results.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  const testsDir = join(import.meta.dirname, "..");
  const report =
    buildReport(results, {
      mode: "rescore",
      runDir: relative(testsDir, outDir),
      rescoredFrom: relative(testsDir, srcDir),
      maxTurns,
      model,
      backend,
      spendUsd: original.some((r) => r.mode === "run")
        ? results.reduce((s, r) => s + r.usd, 0)
        : 0,
      ledger: ledgerMeta(new Ledger(LEDGER_PATH, ledgerCaps(opts))),
      effort,
      context,
      referenceStats: referenceStats(results),
    }) + changedSection(original, results);
  writeFileSync(join(outDir, "report.md"), report);
  console.log(`\n${report}`);
  console.log(`Report: ${join(outDir, "report.md")}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === "rescore") return rescore(opts);
  if (opts.mode === "compare") {
    console.log(compareRuns(opts.compare!));
    return;
  }
  const all = await loadTasks();
  const tasks = opts.tasks
    ? all.filter((t) => t.id.includes(opts.tasks!))
    : all;
  if (tasks.length === 0) throw new Error(`no tasks match "${opts.tasks}"`);
  const byId = new Map<string, Task>(all.map((t) => [t.id, t]));
  const ledger = new Ledger(LEDGER_PATH, ledgerCaps(opts));
  // References send no prompt, so they need no context.
  const context =
    opts.mode === "references"
      ? undefined
      : loadContext(opts.context, process.env.INIT_CWD ?? process.cwd());

  let model: Model | null = null;
  if (opts.mode === "run") {
    const key = opts.backend === "api" ? apiKey() : undefined;
    if (opts.backend === "api" && !key)
      throw new Error(
        "ANTHROPIC_API_KEY is not set (environment or tests/llm-bench/.env)"
      );
    const firstTurns = tasks.length * opts.arms.length * opts.samples;
    const extra = overheadTokens(opts.backend);
    let typical = ZERO_USAGE;
    let worst = 0;
    // A chain costs like its steps, each starting from the previous step's
    // reference (every step is assumed to run).
    const conversations = tasks.flatMap((t) =>
      t.kind === "chain" ? chainSteps(t, chainBase(t, byId)) : [t]
    );
    for (const task of conversations)
      for (const arm of opts.arms) {
        const sys = systemBlocks(arm, context!).reduce(
          (n, b) => n + b.text.length,
          0
        );
        const user = firstMessage(
          taskMessage(
            task,
            arm,
            loadData(task),
            task.kind === "edit" ? loadReference(task.base, arm) : undefined
          ),
          arm === "gofish" ? context!.retrieve?.(task.instruction) : undefined
        ).length;
        for (let i = 0; i < opts.samples; i++)
          typical = addUsage(typical, typicalUsage(sys, user, extra));
        worst +=
          opts.samples *
          opts.maxTurns *
          worstCaseUsd(sys + user * opts.maxTurns, opts.model, extra);
      }
    const b = opts.backend;
    const typicalUsd = costUsd(typical, opts.model);
    const k = (n: number) => `${Math.round(n / 1000)}k`;
    const tokens =
      `~${k(typical.input + typical.cacheRead)} input tokens (~${k(typical.cacheRead)} of them from the cache` +
      `${extra ? `, including ~${extra} per call that Claude Code adds` : ""}) and ~${k(typical.output)} output tokens`;
    console.log(
      `Model ${opts.model}, effort ${opts.effort}, backend ${b}, context ${context!.name} (sha256 ${context!.sha256})${context!.skillDir ? " (skill calls also read files, which this estimate leaves out)" : ""}. ${firstTurns} jobs (${tasks.length} tasks x ${opts.arms.length} arms x ${opts.samples} samples), up to ${opts.maxTurns} turns each.\n` +
        (b === "api"
          ? `Estimate: ~$${typicalUsd.toFixed(2)} if every job passes on turn 1 (${tokens}); worst case ~$${worst.toFixed(2)}.\n` +
            `API ledger so far: $${ledger.total(b).toFixed(4)}; budget cap $${ledger.cap(b).toFixed(2)} (calls stop before the cap).`
          : `Bills to your Claude subscription, not the API (its usage limits apply). Estimate if every job passes on turn 1: ${tokens}, ~$${typicalUsd.toFixed(2)} at list price; worst case ~$${worst.toFixed(2)} at list price.\n` +
            `claude-code ledger so far: $${ledger.total(b).toFixed(4)} at list price; cap $${ledger.cap(b).toFixed(2)} (--subscription-cap-usd; calls stop before it). This does not count against the API budget.`)
    );
    if (!opts.yes) {
      console.log("Re-run with --yes to start.");
      return;
    }
    model =
      b === "api"
        ? new AnthropicModel(key!, opts.model, opts.effort)
        : new ClaudeCodeModel(opts.model, opts.effort);
  } else if (opts.mode === "mock") {
    model = new MockModel(opts.model, { breakFirst: opts.mockBreakFirst });
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
      results = await runReferences(opts, tasks, byId, renderer, runDir, bases);
      for (const r of results)
        appendFileSync(resultsPath, JSON.stringify(r) + "\n");
    } else {
      const ctx: JobContext = {
        opts,
        model: model!,
        ledger,
        renderer,
        bases,
        byId,
        runDir,
        runId,
        context: context!,
        counter: new ModelTokenCounter(TOKEN_CACHE, apiKey()),
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
        const r =
          task.kind === "chain"
            ? await runChain(ctx, task, arm, sample)
            : await runJob(ctx, task, arm, sample);
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
  const spend =
    model && model.backend !== "mock"
      ? results.reduce((s, r) => s + r.usd, 0)
      : 0;
  const report = buildReport(results, {
    mode: opts.mode,
    runDir: relative(join(import.meta.dirname, ".."), runDir),
    maxTurns: opts.mode === "references" ? 1 : opts.maxTurns,
    model: model?.id ?? "-",
    backend: model?.backend ?? "-",
    spendUsd: spend,
    ledger: ledgerMeta(ledger),
    effort: opts.mode === "references" ? "-" : opts.effort,
    context: context && { name: context.name, sha256: context.sha256 },
    referenceStats: referenceStats(results),
  });
  writeFileSync(join(runDir, "report.md"), report);
  copyFileSync(join(runDir, "report.md"), join(OUT_ROOT, "report.md"));
  console.log(`\n${report}`);
  console.log(`Report: ${join(runDir, "report.md")}`);
  if (halted.fatal) {
    console.error(
      halted.fatal.startsWith("usage limit reached")
        ? `Stopped: the Claude subscription's usage limit was reached. The jobs it cut short are not scored. ${halted.fatal}`
        : `Stopped on a fatal ${model?.backend === "claude-code" ? "claude-code" : "API"} error: ${halted.fatal}`
    );
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
