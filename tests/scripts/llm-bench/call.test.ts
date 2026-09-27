/**
 * Offline test for retries, ledger bookings, and the report's handling of
 * infrastructure stops. No API calls, no browser.
 *
 *   pnpm --filter @gofish/tests exec tsx scripts/llm-bench/call.test.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { backoffMs, callWithRetry, classifyError } from "./call";
import { costUsd, Ledger, splitOutput, ZERO_USAGE } from "./cost";
import {
  ClaudeCodeError,
  claudeCodeReply,
  classifyClaudeCodeFailure,
  conversationPrompt,
  type ClaudeCodeResult,
  type Model,
  type ModelReply,
  type ModelRequest,
} from "./model";
import {
  buildReport,
  isScored,
  scoreChain,
  scoreTurns,
  turnOutcome,
  type JobResult,
  type TurnResult,
} from "./report";
import type { Task } from "./tasks";

const connection = () =>
  new Anthropic.APIConnectionError({ message: "Connection error." });
const timeout = () => new Anthropic.APIConnectionTimeoutError();
// What MessageStream rejects with when undici drops the stream mid-reply.
const terminated = () => new Anthropic.AnthropicError("terminated");
const overloaded = (headers?: Record<string, string>) =>
  Anthropic.APIError.generate(
    529,
    {
      type: "error",
      error: { type: "overloaded_error", message: "Overloaded" },
    },
    undefined,
    new Headers(headers)
  );
const unauthorized = () =>
  Anthropic.APIError.generate(
    401,
    {
      type: "error",
      error: { type: "authentication_error", message: "bad key" },
    },
    undefined,
    new Headers()
  );

const USAGE = { input: 1000, cacheWrite: 0, cacheRead: 0, output: 1000 };
const REPLY: ModelReply = {
  text: "ok",
  content: "ok",
  usage: USAGE,
  stopReason: "end_turn",
  latencyMs: 1,
};

/** A "real" model that throws the scripted errors, then replies. */
function scripted(
  errors: (() => unknown)[],
  backend: "api" | "claude-code" = "api",
  reply: ModelReply = REPLY
): Model & { calls: number } {
  return {
    backend,
    id: "claude-opus-5-5",
    calls: 0,
    async call() {
      const e = errors[this.calls++];
      if (e) throw e();
      return reply;
    },
  };
}

const req = {
  system: [],
  messages: [],
  task: { id: "create/test" } as Task,
  arm: "gofish",
  turn: 1,
} as ModelRequest;

function freshLedger(budget = 100, subscriptionCap = 100) {
  const path = join(mkdtempSync(join(tmpdir(), "llm-bench-")), "ledger.json");
  return {
    path,
    ledger: new Ledger(path, {
      apiUsd: budget,
      subscriptionUsd: subscriptionCap,
    }),
  };
}
const entries = (path: string) =>
  (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).calls : []) as {
    usd: number;
    backend: string;
    costBasis: string;
    estimated?: boolean;
    error?: string;
  }[];

async function run(
  errors: (() => unknown)[],
  budget = 100,
  opts: {
    backend?: "api" | "claude-code";
    reply?: ModelReply;
    subscriptionCap?: number;
  } = {}
) {
  const { path, ledger } = freshLedger(budget, opts.subscriptionCap);
  const model = scripted(errors, opts.backend, opts.reply);
  const sleeps: number[] = [];
  const outcome = await callWithRetry({
    model,
    req,
    ledger,
    reserveUsd: 0.4,
    run: "test",
    sleep: async (ms) => void sleeps.push(ms),
    log: () => {},
  });
  return { outcome, model, sleeps, ledger, calls: entries(path) };
}

// --- classification --------------------------------------------------------

assert.deepEqual(
  [connection(), timeout(), terminated(), overloaded(), unauthorized()].map(
    (e) => {
      const c = classifyError(e);
      return [c.billed, c.retryable, c.fatal];
    }
  ),
  [
    [false, true, false], // connection error: never reached the server
    [true, true, false], // timeout: may have been generating
    [true, true, false], // mid-stream drop
    [false, true, false], // 529 overloaded: rejected with a status
    [false, false, true], // 401: stop the run
  ]
);
assert.equal(
  classifyError(overloaded({ "retry-after": "3" })).retryAfterMs,
  3000
);
assert.deepEqual(
  [1, 2, 3, 4, 5, 6].map((a) => backoffMs(a)),
  [2000, 4000, 8000, 16000, 32000, 32000]
);
assert.equal(backoffMs(1, 7000), 7000);

// --- a connection error, a dropped stream, and a 529, then success ---------
{
  const { outcome, model, sleeps, ledger, calls } = await run([
    connection,
    terminated,
    () => overloaded({ "retry-after": "5" }),
  ]);
  assert.equal(outcome.kind, "ok");
  assert.equal(model.calls, 4);
  assert.deepEqual(sleeps, [2000, 4000, 5000]); // backoff, then retry-after
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.map((c) => [c.usd, !!c.estimated]),
    [
      [0, false], // connection error: not billed
      [0.4, true], // "terminated": worst case booked
      [0, false], // 529: not billed
      [0.024, false], // the reply's real usage: 1000 * $4/M + 1000 * $20/M
    ]
  );
  assert.match(
    calls[0].error!,
    /^APIConnectionError: Connection error\. \(not billed\)$/
  );
  assert.match(calls[1].error!, /^AnthropicError: terminated$/);
  assert.match(calls[2].error!, /^InternalServerError: 529/);
  assert.equal(calls[3].error, undefined);
  assert.ok(outcome.kind === "ok" && Math.abs(outcome.failedUsd - 0.4) < 1e-9);
  assert.ok(Math.abs(ledger.total("api") - 0.424) < 1e-9);
  // Every reservation was released: the full budget minus spend is free.
  assert.ok(ledger.reserve(100 - 0.424 - 1e-9, "api"));
  console.log("ok  retries through connection error, terminated, 529");
}

// --- retries run out -------------------------------------------------------
{
  const { outcome, model, sleeps, calls } = await run(
    Array(9).fill(connection)
  );
  assert.equal(outcome.kind, "error");
  assert.equal(model.calls, 5);
  assert.deepEqual(sleeps, [2000, 4000, 8000, 16000]);
  assert.ok(calls.every((c) => c.usd === 0 && !c.estimated));
  console.log(
    "ok  gives up after 5 attempts, nothing booked for connection errors"
  );
}

// --- fatal errors are not retried ------------------------------------------
{
  const { outcome, model } = await run([unauthorized]);
  assert.ok(outcome.kind === "error" && outcome.info.fatal);
  assert.equal(model.calls, 1);
  console.log("ok  401 is fatal and not retried");
}

// --- each attempt goes through the budget guard ----------------------------
{
  // Budget 0.5: attempt 1 reserves 0.4 and books 0.4 (dropped stream); the
  // retry cannot reserve another 0.4.
  const { outcome, model } = await run([terminated], 0.5);
  assert.equal(outcome.kind, "budget");
  assert.equal(model.calls, 1);
  console.log("ok  a retry that would break the budget is refused");
}

const LEDGER_META = {
  apiUsd: 0,
  budgetUsd: 10,
  subscriptionUsd: 0,
  subscriptionCapUsd: 40,
};

// --- report: infrastructure stops are not chart failures -------------------
{
  const job = (
    task: string,
    arm: JobResult["arm"],
    pass: boolean,
    extra: Partial<JobResult> = {}
  ): JobResult => ({
    mode: "run",
    task,
    kind: "create",
    group: "common",
    arm,
    sample: 1,
    turns: [
      {
        turn: 1,
        usage: ZERO_USAGE,
        usd: 0,
        latencyMs: 0,
        stopReason: "end_turn",
        rendered: pass,
      },
    ],
    rendered: pass,
    outcome: pass ? "pass" : "fail",
    applied: pass,
    preserved: null,
    pass,
    passFirst: pass,
    usage: ZERO_USAGE,
    usd: 0,
    latencyMs: 0,
    ...extra,
  });
  const lost = { turns: [], rendered: false, stopped: "api-error" as const };
  const results = [
    job("a", "gofish", true),
    job("a", "d3", true),
    job("b", "gofish", true),
    job("b", "d3", false, {
      ...lost,
      apiError: "APIConnectionError: Connection error.",
    }),
    job("c", "gofish", true),
    job("c", "d3", false, { turns: [], stopped: "budget" }),
    job("d", "gofish", false, {
      stopped: "api-error",
      apiError: "AnthropicError: terminated",
    }),
    job("d", "d3", true),
  ];
  assert.deepEqual(results.map(isScored), [
    true,
    true,
    true,
    false,
    true,
    false,
    true,
    true,
  ]);
  const md = buildReport(results, {
    mode: "run",
    runDir: "x",
    maxTurns: 3,
    model: "claude-opus-5-5",
    backend: "api",
    spendUsd: 0,
    ledger: LEDGER_META,
    effort: "medium",
  });
  // d3 has 2 scored jobs (a pass, d pass): 100%, not 50%. Columns: pass,
  // partial, fail, pass or partial, first-turn pass.
  assert.match(md, /\| d3 \| 2 \| 100% \| 0% \| 0% \| 100% \| 100% \|/);
  assert.match(md, /\| gofish \| 4 \| 75% \| 0% \| 25% \| 75% \| 75% \|/);
  // Paired over tasks a and d only: (0 + -1) / 2 = -50 pts.
  assert.match(md, /\| d3 \| 2 \| -50\.0 pts \|/);
  assert.match(md, /## Not scored \(infrastructure\)/);
  assert.match(md, /\| d3 \| 1 \| 1 \|/);
  assert.match(
    md,
    /b \/ d3 \/ sample 1: api-error \(APIConnectionError: Connection error\.\)/
  );
  assert.match(md, /## Scored, then cut short \(infrastructure\)/);
  assert.match(md, /d \/ gofish \/ sample 1: api-error after 1 turn\(s\)/);
  assert.match(md, /\| b \| 1\/1 \(1\) \| - \+1 not scored \|/);
  console.log("ok  report excludes unscored jobs from rates and pairs");
}

// --- outcomes: pass > partial > fail ----------------------------------------
const OK_CHECKS = { pass: true, results: [] };
const BAD_CHECKS = {
  pass: false,
  results: [{ check: "bars", pass: false, detail: "wrong" }],
};
/** A turn: "pass" (library, right picture), "partial" (contract, right
 *  picture), "contract-wrong", "render" (no picture), "wrong" (library,
 *  wrong picture). */
function turn(
  kind: "pass" | "partial" | "contract-wrong" | "render" | "wrong",
  n: number,
  extra: Partial<TurnResult> = {}
): TurnResult {
  const base: TurnResult = {
    turn: n,
    usage: { ...ZERO_USAGE, output: 1000 },
    usd: 0,
    latencyMs: 0,
    stopReason: "end_turn",
    rendered: kind === "pass" || kind === "wrong",
    ...extra,
  };
  if (kind === "render") return { ...base, error: "boom", errorKind: "render" };
  const contract = kind === "partial" || kind === "contract-wrong";
  return {
    ...base,
    ...(contract
      ? { error: "The chart must be drawn with X.\nwhy", errorKind: "contract" }
      : {}),
    checks: kind === "pass" || kind === "partial" ? OK_CHECKS : BAD_CHECKS,
  };
}
{
  assert.deepEqual(
    (["pass", "partial", "contract-wrong", "render", "wrong"] as const).map(
      (k) => turnOutcome(turn(k, 1))
    ),
    ["pass", "partial", "fail", "fail", "fail"]
  );
  // Best turn wins, in the order pass > partial > fail.
  const s1 = scoreTurns([turn("partial", 1), turn("render", 2)], false);
  assert.equal(s1.outcome, "partial");
  assert.equal(s1.applied, true);
  assert.equal(s1.rendered, false);
  const s2 = scoreTurns([turn("partial", 1), turn("pass", 2)], false);
  assert.deepEqual([s2.outcome, s2.pass, s2.passFirst], ["pass", true, false]);
  const s3 = scoreTurns([turn("contract-wrong", 1), turn("render", 2)], false);
  assert.equal(s3.outcome, "fail");
  // An edit: a right picture that does not keep what it must is a fail,
  // drawn by the library or not.
  const lost = {
    preserved: {
      pass: false,
      results: [{ check: "keep text", pass: false, detail: "lost" }],
    },
  };
  const s4 = scoreTurns([turn("partial", 1, lost)], true);
  assert.deepEqual(
    [s4.outcome, s4.applied, s4.preserved],
    ["fail", true, false]
  );
  const kept = { preserved: OK_CHECKS };
  const s5 = scoreTurns([turn("partial", 1, kept)], true);
  assert.deepEqual([s5.outcome, s5.preserved], ["partial", true]);
  console.log("ok  turn and job outcomes: pass > partial > fail");
}

// --- chains ----------------------------------------------------------------
{
  const kept = { preserved: OK_CHECKS };
  const at = (step: number, k: Parameters<typeof turn>[0], n: number) =>
    turn(k, n, { ...kept, step });
  // Step 1 passes after a repair, step 2 ends partial: 1 step passed.
  const c1 = scoreChain(
    [at(1, "render", 1), at(1, "pass", 2), at(2, "partial", 1)],
    3
  );
  assert.deepEqual(
    [c1.stepsPassed, c1.outcome, c1.pass, c1.steps.map((s) => s.outcome)],
    [1, "fail", false, ["pass", "partial"]]
  );
  const c2 = scoreChain(
    [at(1, "pass", 1), at(2, "pass", 1), at(3, "pass", 1)],
    3
  );
  assert.deepEqual([c2.stepsPassed, c2.pass, c2.passFirst], [3, true, true]);
  const c3 = scoreChain([at(1, "wrong", 1)], 3);
  assert.equal(c3.stepsPassed, 0);

  const chainJob = (
    arm: JobResult["arm"],
    sample: number,
    turns: TurnResult[]
  ): JobResult => ({
    mode: "run",
    task: "chain/x",
    kind: "chain",
    group: "common",
    arm,
    sample,
    turns,
    ...scoreChain(turns, 3),
    usage: ZERO_USAGE,
    usd: 0,
    latencyMs: 0,
  });
  const single = (
    arm: JobResult["arm"],
    task: string,
    turns: TurnResult[]
  ): JobResult => ({
    mode: "run",
    task,
    kind: "create",
    group: "common",
    arm,
    sample: 1,
    turns,
    ...scoreTurns(turns, false),
    usage: ZERO_USAGE,
    usd: 0,
    latencyMs: 0,
  });
  const md = buildReport(
    [
      single("gofish", "a", [turn("pass", 1)]),
      single("d3", "a", [turn("partial", 1), turn("render", 2)]),
      single("gofish", "b", [turn("wrong", 1)]),
      single("d3", "b", [turn("partial", 1), turn("pass", 2)]),
      chainJob("gofish", 1, [
        at(1, "pass", 1),
        at(2, "pass", 1),
        at(3, "pass", 1),
      ]),
      chainJob("gofish", 2, [at(1, "pass", 1), at(2, "partial", 1)]),
      chainJob("d3", 1, [at(1, "wrong", 1)]),
    ],
    {
      mode: "run",
      runDir: "x",
      maxTurns: 3,
      model: "claude-opus-5-5",
      backend: "api",
      spendUsd: 0,
      ledger: LEDGER_META,
      effort: "medium",
    }
  );
  // Chains stay out of the per-arm table: 2 single jobs per arm.
  assert.match(md, /\| gofish \| 2 \| 50% \| 0% \| 50% \| 50% \| 50% \|/);
  assert.match(md, /\| d3 \| 2 \| 50% \| 50% \| 0% \| 100% \| 0% \|/);
  // Headline pass: a 1-0, b 0-1 -> 0 pts; pass or partial: a 0, b -1 -> -50.
  assert.match(
    md,
    /### pass\n\n\| other arm[^\n]*\n[^\n]*\n\| d3 \| 2 \| \+0\.0 pts/
  );
  assert.match(
    md,
    /### pass or partial\n\n\| other arm[^\n]*\n[^\n]*\n\| d3 \| 2 \| -50\.0 pts/
  );
  assert.match(md, /\| a \| 1\/1 \(1\) \| 0\/1 \(0\), 1 partial \|/);
  // Reasoning: 1000 output tokens, empty replies (no reply text), estimated.
  assert.match(md, /mean reasoning tok \|/);
  // Chains: gofish 3 and 1 steps -> 2.00 of 3, 50% full chains.
  assert.match(md, /## Chains/);
  assert.match(md, /\| gofish \| 2 \| 2\.00 of 3 \| 50% \|/);
  assert.match(md, /\| d3 \| 1 \| 0\.00 of 3 \| 0% \|/);
  assert.match(md, /\| chain\/x \| 3\/3, 1\/3 \| 0\/3 \|/);
  assert.match(
    md,
    /chain\/x \/ gofish \/ sample 2: step 2 partial: contract violation/
  );
  // Contract violations name partial and failed jobs.
  assert.match(
    md,
    /a \/ d3 \/ sample 1: turn 1 \(right picture\); job partial/
  );
  assert.match(
    md,
    /chain\/x \/ gofish \/ sample 2: step 2 turn 1 \(right picture\); job fail/
  );
  // Failures list only failed single jobs.
  assert.match(md, /## Failures\n\n- b \/ gofish \/ sample 1: bars: wrong\n/);
  console.log("ok  chain scoring and report");
}

// --- reasoning tokens ------------------------------------------------------
{
  assert.deepEqual(splitOutput("x".repeat(400), 1500), {
    visibleTokens: 100,
    reasoningTokens: 1400,
    tokenSplit: "estimate",
  });
  assert.deepEqual(splitOutput("x".repeat(400), 50).reasoningTokens, 0);
  assert.deepEqual(splitOutput("anything", 1500, 1200), {
    visibleTokens: 300,
    reasoningTokens: 1200,
    tokenSplit: "api",
  });
  const withSplit = (t: TurnResult, r: number, split: "api" | "estimate") => ({
    ...t,
    reasoningTokens: r,
    tokenSplit: split,
  });
  const job = (turns: TurnResult[]): JobResult => ({
    mode: "run",
    task: "a",
    kind: "create",
    group: "common",
    arm: "gofish",
    sample: 1,
    turns,
    ...scoreTurns(turns, false),
    usage: ZERO_USAGE,
    usd: 0,
    latencyMs: 0,
  });
  const md = buildReport(
    [
      job([
        withSplit(turn("render", 1), 1000, "estimate"),
        withSplit(turn("pass", 2), 500, "estimate"),
      ]),
      job([withSplit(turn("pass", 1), 300, "estimate")]),
    ],
    {
      mode: "run",
      runDir: "x",
      maxTurns: 3,
      model: "claude-opus-5-5",
      backend: "api",
      spendUsd: 0,
      ledger: LEDGER_META,
      effort: "medium",
    }
  );
  // Per job: 1500 and 300 -> mean 900; labeled as an estimate.
  assert.match(md, /mean reasoning tok \(est\.\)/);
  assert.match(md, /\| gofish \| 2 \|[^\n]*\| 900 \|/);
  console.log("ok  reasoning tokens per job");
}

// --- claude-code backend -----------------------------------------------------

/** The shape `claude -p --output-format json` prints (CLI 2.1.283). */
const CC_OK: ClaudeCodeResult = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Here it is.\n\n```python\nprint(1)\n```\n",
  stop_reason: "end_turn",
  api_error_status: null,
  total_cost_usd: 0.123456,
  duration_ms: 21000,
  duration_api_ms: 20500,
  ttft_ms: 3000,
  num_turns: 1,
  usage: {
    input_tokens: 900,
    cache_creation_input_tokens: 5000,
    cache_read_input_tokens: 12000,
    output_tokens: 2500,
    output_tokens_details: { thinking_tokens: 1800 },
    cache_creation: {
      ephemeral_1h_input_tokens: 4000,
      ephemeral_5m_input_tokens: 1000,
    },
  },
};
{
  const r = claudeCodeReply(CC_OK, 99999);
  assert.equal(r.text, CC_OK.result);
  assert.equal(r.content, CC_OK.result);
  assert.deepEqual(r.usage, {
    input: 900,
    cacheWrite: 5000,
    cacheWrite1h: 4000,
    cacheRead: 12000,
    output: 2500,
  });
  assert.equal(r.thinkingTokens, 1800);
  assert.equal(r.costUsd, 0.123456);
  assert.equal(r.stopReason, "end_turn");
  assert.equal(r.latencyMs, 20500); // the API time, not the process wall time
  // The exact split comes from the reported thinking tokens.
  assert.deepEqual(splitOutput(r.text, r.usage.output, r.thinkingTokens), {
    visibleTokens: 700,
    reasoningTokens: 1800,
    tokenSplit: "api",
  });
  // Pricing the usage for Opus 5.5 by TTL: 900*4 + 1000*5 + 4000*8 +
  // 12000*0.2 + 2500*20 per million.
  assert.ok(
    Math.abs(costUsd(r.usage, "claude-opus-5-5") - 0.093) < 1e-9,
    String(costUsd(r.usage, "claude-opus-5-5"))
  );

  // Error results become ClaudeCodeErrors, sorted by what to do.
  const failed = (result: string, status: number | null = null) => {
    try {
      claudeCodeReply(
        {
          ...CC_OK,
          is_error: true,
          subtype: "error_during_execution",
          result,
          api_error_status: status,
          total_cost_usd: 0,
        },
        1
      );
    } catch (e) {
      assert.ok(e instanceof ClaudeCodeError);
      const c = classifyError(e);
      return [e.failure, c.retryable, c.fatal, c.usd];
    }
    assert.fail("no error");
  };
  assert.deepEqual(failed("Claude AI usage limit reached|1790000000"), [
    "usage-limit",
    false,
    true,
    0,
  ]);
  assert.deepEqual(failed("You've hit your limit · resets 3pm"), [
    "usage-limit",
    false,
    true,
    0,
  ]);
  assert.deepEqual(failed("API Error: 529 Overloaded", 529), [
    "transient",
    true,
    false,
    0,
  ]);
  assert.deepEqual(failed("Rate limited, try again"), [
    "transient",
    true,
    false,
    0,
  ]);
  assert.deepEqual(failed("Invalid API key · Please run /login", 401), [
    "fatal",
    false,
    true,
    0,
  ]);
  assert.equal(classifyClaudeCodeFailure("spawn claude ENOENT"), "fatal");
  assert.equal(
    classifyError(new ClaudeCodeError("usage limit reached", "usage-limit"))
      .label,
    "usage limit reached (ClaudeCodeError: usage limit reached)"
  );
  console.log("ok  claude-code JSON maps to usage, thinking tokens and cost");
}

// --- claude-code turns carry the conversation as text -------------------------
{
  assert.equal(
    conversationPrompt([{ role: "user", content: "Make a chart." }]),
    "Make a chart."
  );
  const p = conversationPrompt([
    { role: "user", content: "Make a chart." },
    { role: "assistant", content: "```js\nboom\n```" },
    { role: "user", content: "Running your program failed: x" },
  ]);
  assert.match(
    p,
    /<earlier_conversation>\n<user_message>\nMake a chart\.\n<\/user_message>\n\n<your_reply>\n```js\nboom\n```\n<\/your_reply>\n<\/earlier_conversation>\n\nThe latest message:\n\nRunning your program failed: x$/
  );
  console.log("ok  claude-code repair turns carry the conversation");
}

// --- the ledger keeps subscription spend off the API budget ------------------
{
  // API budget $0.05: a claude-code call booked at $0.123456 (list price)
  // does not count against it, and API calls can still reserve the whole
  // budget.
  const ccReply = claudeCodeReply(CC_OK, 1);
  const { outcome, ledger, calls } = await run([], 0.05, {
    backend: "claude-code",
    reply: ccReply,
  });
  assert.ok(outcome.kind === "ok" && outcome.usd === 0.123456);
  assert.deepEqual(
    calls.map((c) => [c.usd, c.backend, c.costBasis]),
    [[0.123456, "claude-code", "list (subscription)"]]
  );
  assert.equal(ledger.total("api"), 0);
  assert.equal(ledger.total("claude-code"), 0.123456);
  assert.ok(ledger.reserve(0.05, "api"));
  // The subscription cap still guards claude-code calls: $0.2 cap, $0.4
  // worst case per attempt.
  const capped = await run([], 100, {
    backend: "claude-code",
    reply: ccReply,
    subscriptionCap: 0.2,
  });
  assert.equal(capped.outcome.kind, "budget");
  assert.equal(capped.model.calls, 0);
  // A failed claude-code call books the cost it reported, not the worst case.
  const failedCall = await run(
    [() => new ClaudeCodeError("API Error: 500", "transient", 0.01)],
    100,
    { backend: "claude-code", reply: ccReply }
  );
  assert.deepEqual(
    failedCall.calls.map((c) => [c.usd, !!c.estimated]),
    [
      [0.01, false],
      [0.123456, false],
    ]
  );
  // The usage limit stops at once.
  const limited = await run(
    [
      () =>
        new ClaudeCodeError("Claude AI usage limit reached", "usage-limit", 0),
    ],
    100,
    { backend: "claude-code", reply: ccReply }
  );
  assert.ok(limited.outcome.kind === "error" && limited.outcome.info.fatal);
  assert.equal(limited.model.calls, 1);
  // The report header names the backend and splits the ledger.
  const md = buildReport([], {
    mode: "run",
    runDir: "x",
    maxTurns: 3,
    model: "claude-opus-5-5",
    backend: "claude-code",
    spendUsd: 0.123456,
    ledger: { ...LEDGER_META, subscriptionUsd: 0.123456 },
    effort: "medium",
  });
  assert.match(
    md,
    /Model: claude-opus-5-5\. Backend: claude-code \(headless Claude Code, billed to the Claude subscription\)/
  );
  assert.match(
    md,
    /Spend this run: \$0\.1235 \(list price, billed to the Claude subscription, not the API\)/
  );
  assert.match(
    md,
    /Ledger \(all runs\): API \$0\.0000 of \$10\.00 budget; claude-code \$0\.1235 at list price \(subscription\) of \$40\.00 cap\./
  );
  console.log("ok  subscription spend is booked apart from the API budget");
}

console.log("all llm-bench call tests passed");
