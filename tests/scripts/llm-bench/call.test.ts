/**
 * Offline test for retries, ledger bookings, and the report's handling of
 * infrastructure stops. No API calls, no browser.
 *
 *   pnpm --filter @gofish/tests exec tsx scripts/llm-bench/call.test.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { backoffMs, callWithRetry, classifyError } from "./call";
import { Ledger, ZERO_USAGE } from "./cost";
import type { Model, ModelReply, ModelRequest } from "./model";
import { buildReport, isScored, type JobResult } from "./report";
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
function scripted(errors: (() => unknown)[]): Model & { calls: number } {
  return {
    real: true,
    calls: 0,
    async call() {
      const e = errors[this.calls++];
      if (e) throw e();
      return REPLY;
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

function freshLedger(budget = 100) {
  const path = join(mkdtempSync(join(tmpdir(), "llm-bench-")), "ledger.json");
  return { path, ledger: new Ledger(path, budget) };
}
const entries = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")).calls as {
    usd: number;
    estimated?: boolean;
    error?: string;
  }[];

async function run(errors: (() => unknown)[], budget = 100) {
  const { path, ledger } = freshLedger(budget);
  const model = scripted(errors);
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
      [0.03, false], // the reply's real usage: 1000 * $5/M + 1000 * $25/M
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
  assert.ok(Math.abs(ledger.totalUsd - 0.43) < 1e-9);
  // Every reservation was released: the full budget minus spend is free.
  assert.ok(ledger.reserve(100 - 0.43 - 1e-9));
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
    realSpendUsd: 0,
    ledgerTotalUsd: 0,
    budgetUsd: 10,
    effort: "medium",
  });
  // d3 has 2 scored jobs (a pass, d pass): 100%, not 50%.
  assert.match(md, /\| d3 \| 2 \| 100% \| 100% \|/);
  assert.match(md, /\| gofish \| 4 \| 75% \| 75% \|/);
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

console.log("all llm-bench call tests passed");
