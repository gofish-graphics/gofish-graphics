/**
 * Prices, the persistent spend ledger, and the budget guard.
 *
 * The ledger (tests/tmp/llm-bench/ledger.json) sums every real API call
 * across every invocation. Before each call the runner reserves the call's
 * worst-case cost; the call is refused if the ledger total plus everything
 * reserved would exceed the budget.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export const MODEL = "claude-opus-5";
export const MAX_TOKENS = 16_000;

/** USD per million tokens. Cache writes are 1.25x input, reads 0.1x. */
export const PRICES: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

export interface Usage {
  input: number;
  cacheWrite: number;
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
  return {
    input: a.input + b.input,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
  };
}

export function costUsd(u: Usage, model = MODEL): number {
  const p = PRICES[model];
  return (
    (u.input * p.input +
      u.cacheWrite * p.cacheWrite +
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

/** Worst case for one call: every input token billed as a cache write and
 *  the full `max_tokens` of output. */
export function worstCaseUsd(inputChars: number): number {
  return costUsd({
    input: 0,
    cacheWrite: approxTokens(inputChars),
    cacheRead: 0,
    output: MAX_TOKENS,
  });
}

/** A typical call: the system prompt read from cache, the rest billed as
 *  input, ~3k tokens of output (thinking + code). For the pre-run estimate. */
export function typicalUsd(systemChars: number, userChars: number): number {
  return costUsd({
    input: approxTokens(userChars),
    cacheWrite: 0,
    cacheRead: approxTokens(systemChars),
    output: 3000,
  });
}

interface LedgerEntry {
  time: string;
  run: string;
  task: string;
  arm: string;
  turn: number;
  usage: Usage;
  usd: number;
  /** True when the call failed in a way that may still have been billed; the
   *  entry then books the worst-case cost. */
  estimated?: boolean;
  /** For a failed call: the error class and message, so each booking (worst
   *  case or $0) can be audited. */
  error?: string;
}

interface LedgerFile {
  totalUsd: number;
  calls: LedgerEntry[];
}

export class Ledger {
  private file: LedgerFile;
  private reserved = 0;

  constructor(
    private path: string,
    readonly budgetUsd: number
  ) {
    this.file = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { totalUsd: 0, calls: [] };
  }

  get totalUsd(): number {
    return this.file.totalUsd;
  }

  /** Reserve `usd` for a call about to start; false if it would break the
   *  budget (then nothing is reserved). */
  reserve(usd: number): boolean {
    if (this.file.totalUsd + this.reserved + usd > this.budgetUsd) return false;
    this.reserved += usd;
    return true;
  }

  /** Release a reservation and record what the call actually cost. */
  commit(
    reservedUsd: number,
    entry: Omit<LedgerEntry, "time" | "usd">,
    usdOverride?: number
  ): number {
    this.reserved -= reservedUsd;
    const usd = usdOverride ?? costUsd(entry.usage);
    this.file.totalUsd += usd;
    this.file.calls.push({ time: new Date().toISOString(), ...entry, usd });
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.file, null, 1));
    return usd;
  }

  release(reservedUsd: number): void {
    this.reserved -= reservedUsd;
  }
}
