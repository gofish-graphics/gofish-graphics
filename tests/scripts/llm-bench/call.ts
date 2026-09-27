/**
 * One model call with retries, each attempt going through the budget guard.
 *
 * Every attempt reserves its worst-case cost, then commits what it cost to
 * the ledger: the real usage on success, and on failure either nothing (the
 * request never reached the API, or the API rejected it with a status) or the
 * worst case (it may have been billed, e.g. a stream dropped mid-reply).
 * Transient failures are retried with exponential backoff; only when retries
 * run out does the caller see the error.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ZERO_USAGE, type Ledger } from "./cost";
import type { Model, ModelReply, ModelRequest } from "./model";

export interface ErrorClass {
  /** "Class: message", for the ledger and the report. */
  label: string;
  /** The call may have been billed, so the worst case is booked. */
  billed: boolean;
  /** Worth another attempt. */
  retryable: boolean;
  /** Retrying anything is pointless (bad key, bad request): stop the run. */
  fatal: boolean;
  /** From a retry-after(-ms) header, when the API sent one. */
  retryAfterMs?: number;
}

const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
/** Mid-stream and socket failures that surface as plain errors. */
const TRANSIENT_MESSAGE =
  /terminated|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|other side closed|fetch failed|network/i;
/** Error types the API can send as an SSE `error` event mid-stream. */
const TRANSIENT_STREAM_TYPE = new Set([
  "overloaded_error",
  "api_error",
  "rate_limit_error",
]);

function retryAfterMs(headers: Headers | undefined): number | undefined {
  if (!headers || typeof headers.get !== "function") return undefined;
  const ms = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const s = Number(raw);
  if (Number.isFinite(s)) return s >= 0 ? s * 1000 : undefined;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

export function classifyError(e: unknown): ErrorClass {
  const name = (e as Error)?.constructor?.name ?? "Error";
  const label = `${name}: ${(e as Error)?.message ?? String(e)}`;
  // Timeouts may fire after the server started generating: book the worst
  // case. Checked before APIConnectionError, which it extends.
  if (e instanceof Anthropic.APIConnectionTimeoutError)
    return { label, billed: true, retryable: true, fatal: false };
  // The request never reached the server.
  if (e instanceof Anthropic.APIConnectionError)
    return { label, billed: false, retryable: true, fatal: false };
  if (e instanceof Anthropic.APIError) {
    if (e.status === undefined) {
      // An error event inside a stream that had already started.
      const type = (e as { type?: string | null }).type ?? "";
      return {
        label,
        billed: true,
        retryable: TRANSIENT_STREAM_TYPE.has(type),
        fatal: false,
      };
    }
    // Rejected with a status before generating anything.
    return {
      label,
      billed: false,
      retryable: RETRY_STATUS.has(e.status),
      fatal: [400, 401, 403].includes(e.status),
      retryAfterMs: retryAfterMs(e.headers as Headers | undefined),
    };
  }
  // Anything else (e.g. undici "terminated" when a stream drops) may have
  // been billed.
  return {
    label,
    billed: true,
    retryable: TRANSIENT_MESSAGE.test((e as Error)?.message ?? ""),
    fatal: false,
  };
}

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 32_000;
const MAX_RETRY_AFTER_MS = 120_000;

/** Delay before attempt `attempt + 1`: 2s, 4s, 8s, 16s, 32s, or the
 *  server's retry-after when it gave one. */
export function backoffMs(attempt: number, retryAfter?: number): number {
  if (retryAfter !== undefined) return Math.min(retryAfter, MAX_RETRY_AFTER_MS);
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
}

export type CallOutcome =
  | { kind: "ok"; reply: ModelReply; usd: number; failedUsd: number }
  /** The budget refused an attempt; nothing was reserved for it. */
  | { kind: "budget"; failedUsd: number; reserveUsd: number }
  | { kind: "error"; error: unknown; info: ErrorClass; failedUsd: number };

export async function callWithRetry(args: {
  model: Model;
  req: ModelRequest;
  ledger: Ledger;
  /** Worst-case cost of one attempt (0 for a mock model). */
  reserveUsd: number;
  run: string;
  /** Checked before each retry: stop early (e.g. another job hit a fatal
   *  error). */
  stop?: () => boolean;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}): Promise<CallOutcome> {
  const {
    model,
    req,
    ledger,
    reserveUsd,
    run,
    stop = () => false,
    maxAttempts = MAX_ATTEMPTS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    log = console.error,
  } = args;
  const where = `${req.task.id}/${req.arm} turn ${req.turn}`;
  const entry = { run, task: req.task.id, arm: req.arm, turn: req.turn };
  let failedUsd = 0;
  for (let attempt = 1; ; attempt++) {
    if (model.real && !ledger.reserve(reserveUsd))
      return { kind: "budget", failedUsd, reserveUsd };
    try {
      const reply = await model.call(req);
      const usd = model.real
        ? ledger.commit(reserveUsd, { ...entry, usage: reply.usage })
        : 0;
      return { kind: "ok", reply, usd, failedUsd };
    } catch (e) {
      const info = classifyError(e);
      if (model.real)
        failedUsd += ledger.commit(
          reserveUsd,
          {
            ...entry,
            usage: ZERO_USAGE,
            estimated: info.billed,
            error: `${info.label}${info.billed ? "" : " (not billed)"}`,
          },
          info.billed ? reserveUsd : 0
        );
      const last = !info.retryable || attempt >= maxAttempts || stop();
      if (last) {
        log(
          `API error on ${where} (attempt ${attempt}/${maxAttempts}, giving up): ${info.label}`
        );
        return { kind: "error", error: e, info, failedUsd };
      }
      const delay = backoffMs(attempt, info.retryAfterMs);
      log(
        `API error on ${where} (attempt ${attempt}/${maxAttempts}, retrying in ${(delay / 1000).toFixed(1)}s): ${info.label}`
      );
      await sleep(delay);
    }
  }
}
