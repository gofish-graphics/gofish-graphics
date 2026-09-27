/**
 * The model behind a run: the real Anthropic API, or a mock that replays
 * reference solutions (so the whole loop, ledger and report can be
 * exercised without an API key).
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  approxTokens,
  MAX_TOKENS,
  MODEL,
  ZERO_USAGE,
  type Usage,
} from "./cost";
import type { SystemBlock } from "./prompt";
import {
  ARM_LANG,
  BENCH_DIR,
  loadReference,
  type Arm,
  type Task,
} from "./tasks";

export type Content = string | Anthropic.ContentBlockParam[];
export interface Turn {
  role: "user" | "assistant";
  content: Content;
}

export interface ModelRequest {
  system: SystemBlock[];
  messages: Turn[];
  task: Task;
  arm: Arm;
  /** 1-based turn number. */
  turn: number;
}

export interface ModelReply {
  text: string;
  /** What to append to the conversation as the assistant turn. */
  content: Content;
  usage: Usage;
  stopReason: string;
  latencyMs: number;
}

export interface Model {
  /** True when calls cost real money (and go through the ledger). */
  real: boolean;
  call(req: ModelRequest): Promise<ModelReply>;
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

function textChars(content: Content): number {
  return typeof content === "string"
    ? content.length
    : content.reduce(
        (n, b) =>
          n + ("text" in b && typeof b.text === "string" ? b.text.length : 0),
        0
      );
}

/**
 * Replays the task's reference solution for the arm. With `breakFirst`, turn
 * 1 returns a program with a syntax error, so the repair turn runs. Usage is
 * simulated from character counts (system prompt billed as a cache write the
 * first time per arm, a cache read after), so the report has plausible
 * numbers; nothing is added to the ledger.
 */
export class MockModel implements Model {
  real = false;
  private cached = new Set<Arm>();

  constructor(private opts: { breakFirst: boolean }) {}

  async call(req: ModelRequest): Promise<ModelReply> {
    const ref = loadReference(req.task.id, req.arm);
    const code =
      this.opts.breakFirst && req.turn === 1 ? broken(req.arm, ref) : ref;
    const text = `Here is the program.\n\n\`\`\`${ARM_LANG[req.arm]}\n${code}\`\`\`\n`;
    const systemTokens = approxTokens(
      req.system.reduce((n, b) => n + b.text.length, 0)
    );
    const inputTokens = approxTokens(
      req.messages.reduce((n, m) => n + textChars(m.content), 0)
    );
    const warm = this.cached.has(req.arm);
    this.cached.add(req.arm);
    return {
      text,
      content: text,
      usage: {
        ...ZERO_USAGE,
        input: inputTokens,
        cacheWrite: warm ? 0 : systemTokens,
        cacheRead: warm ? systemTokens : 0,
        output: approxTokens(text.length) + 1500,
      },
      stopReason: "end_turn",
      latencyMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Anthropic API
// ---------------------------------------------------------------------------

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
  real = true;
  private client: Anthropic;

  constructor(
    key: string,
    private effort: "low" | "medium" | "high" | "xhigh" | "max"
  ) {
    // No SDK retries: callWithRetry (call.ts) retries, so every attempt goes
    // through the budget guard and the ledger.
    this.client = new Anthropic({ apiKey: key, maxRetries: 0 });
  }

  async call(req: ModelRequest): Promise<ModelReply> {
    const t0 = performance.now();
    // One model, no fallbacks, no sampling parameters, no prefill.
    const message = await this.client.messages
      .stream({
        model: MODEL,
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
    return {
      text,
      content: message.content as Anthropic.ContentBlockParam[],
      usage: {
        input: u.input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        output: u.output_tokens ?? 0,
      },
      stopReason: message.stop_reason ?? "unknown",
      latencyMs,
    };
  }
}
