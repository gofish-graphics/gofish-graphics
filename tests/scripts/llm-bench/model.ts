/**
 * The model behind a run, on one of three backends: the Anthropic API,
 * headless Claude Code on the user's Claude subscription ("claude-code"), or
 * a mock that replays reference solutions (so the whole loop, ledger and
 * report can be exercised without spending anything).
 */

import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  approxTokens,
  costUsd,
  MAX_TOKENS,
  ZERO_USAGE,
  type Backend,
  type Usage,
} from "./cost";
import type { SystemBlock } from "./prompt";
import {
  ARM_LANG,
  BENCH_DIR,
  loadReference,
  type Arm,
  type SingleTask,
} from "./tasks";

export type Content = string | Anthropic.ContentBlockParam[];
export interface Turn {
  role: "user" | "assistant";
  content: Content;
}

export interface ModelRequest {
  system: SystemBlock[];
  messages: Turn[];
  task: SingleTask;
  arm: Arm;
  /** 1-based turn number. */
  turn: number;
}

export interface ModelReply {
  text: string;
  /** What to append to the conversation as the assistant turn. */
  content: Content;
  usage: Usage;
  /** Output tokens spent on reasoning, when the backend reports it
   *  (`usage.output_tokens_details.thinking_tokens`). */
  thinkingTokens?: number;
  /** The call's cost as the backend reported it (claude-code:
   *  `total_cost_usd`, the list-price equivalent). When missing, the cost is
   *  the usage priced with PRICES. */
  costUsd?: number;
  stopReason: string;
  latencyMs: number;
}

export interface Model {
  /** "mock" calls cost nothing and never reach the ledger. */
  backend: "mock" | Backend;
  /** The model id, e.g. claude-opus-5-5. */
  id: string;
  call(req: ModelRequest): Promise<ModelReply>;
}

/** The plain text of a message. Thinking and other non-text blocks are
 *  left out. */
export function textOf(content: Content): string {
  return typeof content === "string"
    ? content
    : content
        .map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("\n");
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

/** A program that fails to parse in the arm's language. */
function broken(arm: Arm, code: string): string {
  return arm === "matplotlib"
    ? `${code}\nprint("unclosed"\n`
    : `${code}\nexport default }\n`;
}

/**
 * Replays the task's reference solution for the arm. With `breakFirst`, turn
 * 1 returns a program with a syntax error, so the repair turn runs. Usage is
 * simulated from character counts (system prompt billed as a cache write the
 * first time per arm, a cache read after), so the report has plausible
 * numbers; nothing is added to the ledger.
 */
export class MockModel implements Model {
  backend = "mock" as const;
  private cached = new Set<Arm>();

  constructor(
    readonly id: string,
    private opts: { breakFirst: boolean }
  ) {}

  async call(req: ModelRequest): Promise<ModelReply> {
    const ref = loadReference(req.task.id, req.arm);
    const code =
      this.opts.breakFirst && req.turn === 1 ? broken(req.arm, ref) : ref;
    const text = `Here is the program.\n\n\`\`\`${ARM_LANG[req.arm]}\n${code}\`\`\`\n`;
    const systemTokens = approxTokens(
      req.system.reduce((n, b) => n + b.text.length, 0)
    );
    const inputTokens = approxTokens(
      req.messages.reduce((n, m) => n + textOf(m.content).length, 0)
    );
    const warm = this.cached.has(req.arm);
    this.cached.add(req.arm);
    const usage = {
      ...ZERO_USAGE,
      input: inputTokens,
      cacheWrite: warm ? 0 : systemTokens,
      cacheRead: warm ? systemTokens : 0,
      output: approxTokens(text.length) + 1500,
    };
    return {
      text,
      content: text,
      usage,
      costUsd: costUsd(usage, this.id), // simulated
      stopReason: "end_turn",
      latencyMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Anthropic API
// ---------------------------------------------------------------------------

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** ANTHROPIC_API_KEY from the environment, else from tests/llm-bench/.env. */
export function apiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envPath = join(BENCH_DIR, ".env");
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*ANTHROPIC_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

export class AnthropicModel implements Model {
  backend = "api" as const;
  private client: Anthropic;

  constructor(
    key: string,
    readonly id: string,
    private effort: Effort
  ) {
    // No SDK retries: callWithRetry (call.ts) retries, so every attempt goes
    // through the budget guard and the ledger.
    this.client = new Anthropic({ apiKey: key, maxRetries: 0 });
  }

  async call(req: ModelRequest): Promise<ModelReply> {
    const t0 = performance.now();
    // One model, no fallbacks, no sampling parameters, no prefill. Thinking
    // is adaptive (Opus 5.5 cannot turn it off); effort is passed
    // explicitly.
    const message = await this.client.messages
      .stream({
        model: this.id,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort },
        system: req.system,
        messages: req.messages,
      })
      .finalMessage();
    const latencyMs = performance.now() - t0;
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const u = message.usage;
    const oneHour = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    return {
      text,
      content: message.content as Anthropic.ContentBlockParam[],
      usage: {
        input: u.input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        ...(oneHour ? { cacheWrite1h: oneHour } : {}),
        cacheRead: u.cache_read_input_tokens ?? 0,
        output: u.output_tokens ?? 0,
      },
      thinkingTokens: u.output_tokens_details?.thinking_tokens ?? undefined,
      stopReason: message.stop_reason ?? "unknown",
      latencyMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Claude Code (headless, on the subscription)
// ---------------------------------------------------------------------------

/**
 * Input tokens Claude Code adds to every call on top of our system prompt
 * and message, with the flags below (`--safe-mode`, `--tools ""`,
 * `--system-prompt-file`). Measured on CLI 2.1.283: a 7-token system prompt
 * and a 9-token message came to 440 input tokens. Without `--safe-mode` it
 * was ~11.7k, because the user's own CLAUDE.md, skills, plugins and MCP
 * servers were loaded too. The same for every arm. Used only for estimates;
 * the real counts are in each turn's usage.
 */
export const CLAUDE_CODE_OVERHEAD_TOKENS = 450;

/** Kill a claude process that runs longer than this. */
const CLAUDE_CODE_TIMEOUT_MS = 15 * 60_000;

/**
 * The prompt for one claude-code turn. Each turn is a fresh `claude -p`
 * process, so a repair turn carries the conversation so far as plain text:
 * the earlier messages (the task, the model's own earlier replies without
 * their thinking, the render errors), delimited, then the latest message.
 * On turn 1 it is the task message unchanged.
 */
export function conversationPrompt(messages: Turn[]): string {
  const last = textOf(messages[messages.length - 1].content);
  if (messages.length === 1) return last;
  const earlier = messages
    .slice(0, -1)
    .map((m) => {
      const tag = m.role === "user" ? "user_message" : "your_reply";
      return `<${tag}>\n${textOf(m.content).trim()}\n</${tag}>`;
    })
    .join("\n\n");
  return (
    "This continues an earlier conversation with you. The earlier messages, in order:\n\n" +
    `<earlier_conversation>\n${earlier}\n</earlier_conversation>\n\n` +
    `The latest message:\n\n${last}`
  );
}

/** The fields of `claude -p --output-format json` that we read. */
export interface ClaudeCodeResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  stop_reason?: string | null;
  api_error_status?: number | null;
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  ttft_ms?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { thinking_tokens?: number };
    cache_creation?: {
      ephemeral_1h_input_tokens?: number;
      ephemeral_5m_input_tokens?: number;
    };
  };
}

export type ClaudeCodeFailure =
  /** The subscription's usage limit: stop the run (not scored). */
  | "usage-limit"
  /** Rate limit, overload, server or network error: retry. */
  | "transient"
  /** Not logged in, unknown model, CLI missing: retrying is pointless. */
  | "fatal";

export class ClaudeCodeError extends Error {
  constructor(
    message: string,
    readonly failure: ClaudeCodeFailure,
    /** What the failed call cost, when Claude Code reported it. */
    readonly usd?: number,
    /** Whether it may have been billed when no cost was reported. */
    readonly billed = false
  ) {
    super(message);
  }
}

const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/** Sort a Claude Code error message (and the API status it carried) into
 *  what the runner should do about it. */
export function classifyClaudeCodeFailure(
  text: string,
  apiStatus?: number | null
): ClaudeCodeFailure {
  if (
    /usage limit|hit your (usage )?limit|limit (reached|will reset|resets)|out of (extra )?usage/i.test(
      text
    )
  )
    return "usage-limit";
  if (
    (apiStatus && RETRY_STATUS.has(apiStatus)) ||
    /rate.?limit|overloaded|\b(429|5\d\d)\b|timed? ?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|fetch failed|network/i.test(
      text
    )
  )
    return "transient";
  if (
    (apiStatus && [400, 401, 403, 404].includes(apiStatus)) ||
    /not logged in|\/login|invalid api key|authentication|model .*(not found|not available|invalid)|ENOENT/i.test(
      text
    )
  )
    return "fatal";
  // Anything else is most likely passing trouble: retry (a bounded number
  // of times).
  return "transient";
}

/**
 * The reply from a `claude -p --output-format json` result, or a
 * ClaudeCodeError when the result is an error. Thinking tokens come from
 * `output_tokens_details.thinking_tokens` (exact); the cost is
 * `total_cost_usd`, the list-price equivalent of the call.
 */
export function claudeCodeReply(
  r: ClaudeCodeResult,
  wallMs: number
): ModelReply {
  const text = r.result ?? "";
  if (r.is_error || (r.subtype && r.subtype !== "success")) {
    const msg = `claude-code ${r.subtype ?? "error"}${r.api_error_status ? ` (status ${r.api_error_status})` : ""}: ${text || "(no message)"}`;
    throw new ClaudeCodeError(
      msg,
      classifyClaudeCodeFailure(text, r.api_error_status),
      r.total_cost_usd
    );
  }
  const u = r.usage ?? {};
  const oneHour = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return {
    text,
    content: text,
    usage: {
      input: u.input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      ...(oneHour ? { cacheWrite1h: oneHour } : {}),
      cacheRead: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
    },
    thinkingTokens: u.output_tokens_details?.thinking_tokens ?? undefined,
    costUsd: r.total_cost_usd,
    stopReason: r.stop_reason ?? r.subtype ?? "unknown",
    // The API time, which is what the API backend's latency measures; the
    // process start-up is left out.
    latencyMs: r.duration_api_ms ?? r.duration_ms ?? wallMs,
  };
}

/**
 * Each call runs `claude -p` with the arm's system prompt from a file, no
 * tools, no session saved, and `--safe-mode` (no CLAUDE.md, skills,
 * plugins, hooks or MCP servers of the user's), in an empty temporary
 * directory of its own (so no project context is found, and concurrent
 * calls do not share one). ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are
 * removed from its environment, so it uses the subscription login, not an
 * API key. The message goes in on stdin.
 */
export class ClaudeCodeModel implements Model {
  backend = "claude-code" as const;

  constructor(
    readonly id: string,
    private effort: Effort,
    private bin = "claude"
  ) {}

  async call(req: ModelRequest): Promise<ModelReply> {
    const dir = mkdtempSync(join(tmpdir(), "llm-bench-cc-"));
    const cwd = join(dir, "cwd");
    mkdirSync(cwd);
    const systemPath = join(dir, "system.md");
    // The API backend sends the blocks separately; here they are one text.
    writeFileSync(systemPath, req.system.map((b) => b.text).join("\n\n"));
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    // The same output cap as the API backend.
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(MAX_TOKENS);
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      this.id,
      "--effort",
      this.effort,
      "--tools",
      "",
      "--system-prompt-file",
      systemPath,
      "--no-session-persistence",
      "--safe-mode",
    ];
    const t0 = performance.now();
    try {
      const { code, stdout, stderr, timedOut } = await run(
        this.bin,
        args,
        cwd,
        env,
        conversationPrompt(req.messages)
      );
      const wallMs = performance.now() - t0;
      let parsed: ClaudeCodeResult | undefined;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        parsed = undefined;
      }
      if (parsed && typeof parsed === "object" && parsed.type === "result")
        return claudeCodeReply(parsed, wallMs);
      const text = `${stderr.trim()}\n${stdout.trim()}`.trim();
      if (timedOut)
        throw new ClaudeCodeError(
          `claude-code timed out after ${CLAUDE_CODE_TIMEOUT_MS / 1000}s`,
          "transient",
          undefined,
          true
        );
      throw new ClaudeCodeError(
        `claude-code exited with code ${code}: ${text.slice(0, 2000) || "(no output)"}`,
        classifyClaudeCodeFailure(text),
        undefined,
        true
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function run(
  bin: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdin: string
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, CLAUDE_CODE_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new ClaudeCodeError(`could not start ${bin}: ${e.message}`, "fatal", 0)
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => {}); // a child that exits early
    child.stdin.end(stdin);
  });
}
