/**
 * Prices, the persistent spend ledger, and the budget guards.
 *
 * The ledger (tests/tmp/llm-bench/ledger.json) sums every real call across
 * every invocation, per backend. API calls count against the API budget
 * (`--budget-usd`). Calls through headless Claude Code (the claude-code
 * backend) bill to the Claude subscription, so they do not count against the
 * API budget; their list-price cost is summed separately and guarded by
 * `--subscription-cap-usd`, so a runaway loop stops. Before each call the
 * runner reserves the call's worst-case cost; the call is refused if that
 * backend's ledger total plus everything reserved would exceed its cap.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const MAX_TOKENS = 16_000;

/**
 * USD per million tokens, per model. Cache writes are priced by TTL: 1.25x
 * input for the 5-minute cache, 2x input for the 1-hour cache. Cache reads
 * are 0.05x input for Opus 5.5 and 0.1x for Opus 5.
 */
export const PRICES: Record<
  string,
  {
    input: number;
    output: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
  }
> = {
  "claude-opus-5-5": {
    input: 4,
    output: 20,
    cacheWrite5m: 5,
    cacheWrite1h: 8,
    cacheRead: 0.2,
  },
  "claude-opus-5": {
    input: 5,
    output: 25,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    cacheRead: 0.5,
  },
};

export function prices(model: string): (typeof PRICES)[string] {
  const p = PRICES[model];
  if (!p)
    throw new Error(
      `no prices for model ${model} (known: ${Object.keys(PRICES).join(", ")}); add it to PRICES in cost.ts`
    );
  return p;
}

export interface Usage {
  input: number;
  /** All cache-write tokens, whatever their TTL. */
  cacheWrite: number;
  /** The part of `cacheWrite` written to the 1-hour cache (the rest went to
   *  the 5-minute cache). Missing when there was none, and in results from
   *  before it was recorded. */
  cacheWrite1h?: number;
  cacheRead: number;
  output: number;
}

export const ZERO_USAGE: Usage = {
  input: 0,
  cacheWrite: 0,
  cacheRead: 0,
  output: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  const oneHour = (a.cacheWrite1h ?? 0) + (b.cacheWrite1h ?? 0);
  return {
    input: a.input + b.input,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    ...(oneHour ? { cacheWrite1h: oneHour } : {}),
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
  };
}

export function costUsd(u: Usage, model: string): number {
  const p = prices(model);
  const oneHour = u.cacheWrite1h ?? 0;
  return (
    (u.input * p.input +
      (u.cacheWrite - oneHour) * p.cacheWrite5m +
      oneHour * p.cacheWrite1h +
      u.cacheRead * p.cacheRead +
      u.output * p.output) /
    1e6
  );
}

/** Rough token count for text we are about to send (conservative: English
 *  and code average closer to 4 chars per token). */
export function approxTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

/** Worst case for one call: every input token (plus `extraTokens` the
 *  backend adds, see CLAUDE_CODE_OVERHEAD_TOKENS in model.ts) billed as a
 *  1-hour cache write, and the full `max_tokens` of output. */
export function worstCaseUsd(
  inputChars: number,
  model: string,
  extraTokens = 0
): number {
  const tokens = approxTokens(inputChars) + extraTokens;
  return costUsd(
    {
      input: 0,
      cacheWrite: tokens,
      cacheWrite1h: tokens,
      cacheRead: 0,
      output: MAX_TOKENS,
    },
    model
  );
}

/** A typical call's tokens: the system prompt (and whatever the backend
 *  adds) read from cache, the rest billed as input, ~3k tokens of output
 *  (thinking + code). For the pre-run estimate. */
export function typicalUsage(
  systemChars: number,
  userChars: number,
  extraTokens = 0
): Usage {
  return {
    input: approxTokens(userChars),
    cacheWrite: 0,
    cacheRead: approxTokens(systemChars) + extraTokens,
    output: 3000,
  };
}

/**
 * How a turn's output tokens split into visible reply text and reasoning
 * (adaptive thinking is billed as output). When the backend reports the
 * thinking tokens, the split is exact ("api"). Otherwise the visible part is
 * an estimate of 4 characters of reply text per token, and reasoning is the
 * rest of the output, never below zero ("estimate").
 */
export function splitOutput(
  replyText: string,
  output: number,
  thinkingTokens?: number
): {
  visibleTokens: number;
  reasoningTokens: number;
  tokenSplit: "api" | "estimate";
} {
  if (thinkingTokens !== undefined)
    return {
      visibleTokens: output - thinkingTokens,
      reasoningTokens: thinkingTokens,
      tokenSplit: "api",
    };
  const visibleTokens = Math.round(replyText.length / 4);
  return {
    visibleTokens,
    reasoningTokens: Math.max(0, output - visibleTokens),
    tokenSplit: "estimate",
  };
}

/** Where a real call ran. Mock calls never reach the ledger. */
export type Backend = "api" | "claude-code";

/** How a booked cost was arrived at: "api" is what the API bills (usage
 *  priced with PRICES); "list (subscription)" is the list-price equivalent
 *  that Claude Code reports (`total_cost_usd`) for a call billed to the
 *  Claude subscription. */
export type CostBasis = "api" | "list (subscription)";

export const COST_BASIS: Record<Backend, CostBasis> = {
  api: "api",
  "claude-code": "list (subscription)",
};

interface LedgerEntry {
  time: string;
  run: string;
  task: string;
  arm: string;
  turn: number;
  /** Missing in entries from before it was recorded (those were all API
   *  calls to claude-opus-5). */
  backend?: Backend;
  model?: string;
  costBasis?: CostBasis;
  usage: Usage;
  usd: number;
  /** True when the call failed in a way that may still have been billed; the
   *  entry then books the worst-case cost. */
  estimated?: boolean;
  /** For a failed call: the error class and message, so each booking (worst
   *  case, reported cost or $0) can be audited. */
  error?: string;
}

interface LedgerFile {
  /** API spend, all runs. Only this counts against the API budget. */
  totalUsd: number;
  /** claude-code spend at list price, all runs (billed to the subscription,
   *  guarded by the subscription cap). */
  subscriptionUsd?: number;
  calls: LedgerEntry[];
}

export class Ledger {
  private file: LedgerFile;
  private reserved: Record<Backend, number> = { api: 0, "claude-code": 0 };
  private caps: Record<Backend, number>;

  constructor(
    private path: string,
    caps: { apiUsd: number; subscriptionUsd: number }
  ) {
    this.file = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { totalUsd: 0, calls: [] };
    this.caps = { api: caps.apiUsd, "claude-code": caps.subscriptionUsd };
  }

  /** Spend so far on `backend`, all runs (list price for claude-code). */
  total(backend: Backend): number {
    return backend === "api"
      ? this.file.totalUsd
      : (this.file.subscriptionUsd ?? 0);
  }

  cap(backend: Backend): number {
    return this.caps[backend];
  }

  /** Reserve `usd` for a call about to start on `backend`; false if it
   *  would break that backend's cap (then nothing is reserved). */
  reserve(usd: number, backend: Backend): boolean {
    if (this.total(backend) + this.reserved[backend] + usd > this.caps[backend])
      return false;
    this.reserved[backend] += usd;
    return true;
  }

  /** Release a reservation and record what the call cost: `usd` when given
   *  (a worst-case booking, or the cost Claude Code reported), else the
   *  usage priced for the entry's model. */
  commit(
    reservedUsd: number,
    entry: Omit<
      LedgerEntry,
      "time" | "usd" | "costBasis" | "backend" | "model"
    > & {
      backend: Backend;
      model: string;
    },
    usd?: number
  ): number {
    this.reserved[entry.backend] -= reservedUsd;
    const booked = usd ?? costUsd(entry.usage, entry.model);
    if (entry.backend === "api") this.file.totalUsd += booked;
    else this.file.subscriptionUsd = (this.file.subscriptionUsd ?? 0) + booked;
    this.file.calls.push({
      time: new Date().toISOString(),
      ...entry,
      costBasis: COST_BASIS[entry.backend],
      usd: booked,
    });
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.file, null, 1));
    return booked;
  }
}
