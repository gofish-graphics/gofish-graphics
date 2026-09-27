/**
 * Statistics of a program: how big it is, three ways, and how much explicit
 * calculation it does (which a declarative library should make unneeded).
 *
 * Size:
 *
 *   - syntax tokens (the primary measure): lexical tokens (identifiers,
 *     keywords, literals, operators, punctuation), with whitespace and
 *     comments left out, so line breaking does not change it. JS and JSX use
 *     a small regex lexer; Python follows the rules of its `tokenize` module
 *     (a string, f-strings included, is one token; NEWLINE, INDENT, DEDENT
 *     and comments are not counted).
 *   - model tokens: the program's length in the model's own tokens, from the
 *     Anthropic token-counting endpoint (free, not booked in the ledger),
 *     cached by sha256 of the code. Without a key, or offline, it is
 *     estimated at 4 characters per token and marked as an estimate.
 *   - lines of code: lines that are not blank and not only comments.
 *
 * Explicit calculation, counted on the same lexical tokens:
 *
 *   - arithmetic operators: + - * / % ** (and // in Python), their compound
 *     assignments (+= ...), and every call into Math, math, np or numpy
 *     (`Math.max`, `np.linspace`).
 *   - magic numbers: numeric literals other than 0 and 1, i.e. hand-picked
 *     constants (pixel offsets, sizes, thresholds).
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Arm } from "./tasks";

export interface CodeStats {
  /** Lexical tokens, whitespace and comments excluded. */
  syntax: number;
  /** Tokens in the model's tokenizer. */
  model: number;
  /** True when `model` is the 4-characters-per-token estimate. */
  modelEst?: boolean;
  /** Non-blank lines that are not only comments. */
  loc: number;
  /** Arithmetic operators plus calls into Math/math/np/numpy. Missing in
   *  results from before it was recorded. */
  arithOps?: number;
  /** Numeric literals other than 0 and 1. Missing in results from before
   *  it was recorded. */
  magicNumbers?: number;
}

const isPython = (arm: Arm) => arm === "matplotlib";

// ---------------------------------------------------------------------------
// JS / JSX
// ---------------------------------------------------------------------------

const JS_TOKEN = new RegExp(
  [
    String.raw`\/\/[^\n]*`, // line comment (skipped)
    String.raw`\/\*[\s\S]*?\*\/`, // block comment (skipped)
    String.raw`\`(?:\\[\s\S]|[^\`\\])*\``, // template literal
    String.raw`"(?:\\[\s\S]|[^"\\])*"`, // double-quoted string
    String.raw`'(?:\\[\s\S]|[^'\\])*'`, // single-quoted string
    String.raw`\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+`, // number
    String.raw`[A-Za-z_$][\w$]*`, // identifier or keyword
    String.raw`\*\*=|=>|\.\.\.|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\*\*|\+\+|--|[+\-*/%]=`,
    String.raw`[{}()\[\];,.<>+\-*/%=!&|^~?:]`, // single-character punctuation
  ].join("|"),
  "g"
);

function jsTokens(src: string): string[] {
  return [...src.matchAll(JS_TOKEN)]
    .map((m) => m[0])
    .filter((t) => !t.startsWith("//") && !t.startsWith("/*"));
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

const PY_STRING_PREFIX = "(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])?";
const PY_TOKEN = new RegExp(
  [
    String.raw`#[^\n]*`, // comment (skipped)
    `${PY_STRING_PREFIX}'''[\\s\\S]*?'''`,
    `${PY_STRING_PREFIX}"""[\\s\\S]*?"""`,
    `${PY_STRING_PREFIX}'(?:\\\\.|[^'\\\\\\n])*'`,
    `${PY_STRING_PREFIX}"(?:\\\\.|[^"\\\\\\n])*"`,
    String.raw`0[xXoObB][\da-fA-F_]+`,
    String.raw`(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?[jJ]?`,
    String.raw`[A-Za-z_][\w]*`, // name or keyword
    String.raw`\*\*=|\/\/=|>>=|<<=|\.\.\.|->|:=|==|!=|<=|>=|\*\*|\/\/|<<|>>|[+\-*/%&|^@]=`,
    String.raw`[()\[\]{}:;,.+\-*/%<>=&|^~@!]`,
    String.raw`\\\n`, // explicit line joining (skipped)
  ].join("|"),
  "g"
);

function pyTokens(src: string): string[] {
  return [...src.matchAll(PY_TOKEN)]
    .map((m) => m[0])
    .filter((t) => !t.startsWith("#") && t !== "\\\n");
}

const lex = (src: string, arm: Arm) =>
  isPython(arm) ? pyTokens(src) : jsTokens(src);

/** Lexical tokens of a program (whitespace and comments excluded). */
export function syntaxTokens(src: string, arm: Arm): number {
  return lex(src, arm).length;
}

const ARITH = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "**",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "//",
  "//=",
]);
const MATH_LIBS = new Set(["Math", "math", "np", "numpy"]);
const DECIMAL = /^(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)$/;

/** Arithmetic operators (with calls into Math/math/np/numpy) and magic
 *  numbers (numeric literals other than 0 and 1). */
export function explicitCalculation(
  src: string,
  arm: Arm
): { arithOps: number; magicNumbers: number } {
  const toks = lex(src, arm);
  let arithOps = 0;
  let magicNumbers = 0;
  toks.forEach((t, i) => {
    if (ARITH.has(t)) arithOps++;
    if (MATH_LIBS.has(t) && toks[i + 1] === ".") arithOps++;
    if (DECIMAL.test(t) && Number(t) !== 0 && Number(t) !== 1) magicNumbers++;
  });
  return { arithOps, magicNumbers };
}

/** The statistics that need no model: size in syntax tokens and lines, and
 *  explicit calculation. */
export function lexicalStats(
  src: string,
  arm: Arm
): Omit<CodeStats, "model" | "modelEst"> {
  return {
    syntax: syntaxTokens(src, arm),
    loc: linesOfCode(src, arm),
    ...explicitCalculation(src, arm),
  };
}

// ---------------------------------------------------------------------------
// Lines of code
// ---------------------------------------------------------------------------

/** Remove comments, keeping strings intact (a `//` inside a string is not a
 *  comment). */
function stripComments(src: string, arm: Arm): string {
  const re = isPython(arm)
    ? new RegExp(
        [
          `${PY_STRING_PREFIX}'''[\\s\\S]*?'''`,
          `${PY_STRING_PREFIX}"""[\\s\\S]*?"""`,
          `${PY_STRING_PREFIX}'(?:\\\\.|[^'\\\\\\n])*'`,
          `${PY_STRING_PREFIX}"(?:\\\\.|[^"\\\\\\n])*"`,
          String.raw`#[^\n]*`,
        ].join("|"),
        "g"
      )
    : new RegExp(
        [
          String.raw`\`(?:\\[\s\S]|[^\`\\])*\``,
          String.raw`"(?:\\[\s\S]|[^"\\])*"`,
          String.raw`'(?:\\[\s\S]|[^'\\])*'`,
          String.raw`\/\/[^\n]*`,
          String.raw`\/\*[\s\S]*?\*\/`,
        ].join("|"),
        "g"
      );
  return src.replace(re, (m) => {
    const comment = isPython(arm)
      ? m.startsWith("#")
      : m.startsWith("//") || m.startsWith("/*");
    // A block comment keeps its line breaks, so line numbers stay put.
    return comment ? m.replace(/[^\n]/g, "") : m;
  });
}

/** Lines that are not blank and not only comments. */
export function linesOfCode(src: string, arm: Arm): number {
  return stripComments(src, arm)
    .split("\n")
    .filter((l) => l.trim() !== "").length;
}

// ---------------------------------------------------------------------------
// Model tokens
// ---------------------------------------------------------------------------

/**
 * Counts a program's tokens in the model's tokenizer through the free
 * token-counting endpoint, caching every count in a JSON file keyed by model
 * and the sha256 of the code. The count is of a user message holding only
 * the code, minus that message's fixed overhead (measured once per model as
 * the count of a one-character message, less one). Without a key, or when a
 * request fails, it falls back to 4 characters per token (marked `est`).
 */
export class ModelTokenCounter {
  private cache: Record<string, number>;
  private client?: Anthropic;
  private overhead?: Promise<number | null>;
  private offline = false;

  constructor(
    private cachePath: string,
    key?: string
  ) {
    this.cache = existsSync(cachePath)
      ? JSON.parse(readFileSync(cachePath, "utf8"))
      : {};
    if (key) this.client = new Anthropic({ apiKey: key, maxRetries: 2 });
  }

  private async raw(model: string, text: string): Promise<number | null> {
    if (!this.client || this.offline) return null;
    try {
      const r = await this.client.messages.countTokens({
        model,
        messages: [{ role: "user", content: text }],
      });
      return r.input_tokens;
    } catch (e) {
      // One failure (no network, bad key) turns counting off for the run.
      this.offline = true;
      console.error(
        `token counting unavailable, estimating at 4 characters per token: ${(e as Error).message}`
      );
      return null;
    }
  }

  async count(
    code: string,
    model: string
  ): Promise<{ tokens: number; est: boolean }> {
    const key = `${model}:${createHash("sha256").update(code).digest("hex")}`;
    if (key in this.cache) return { tokens: this.cache[key], est: false };
    this.overhead ??= this.raw(model, "x").then((n) =>
      n === null ? null : n - 1
    );
    const overhead = await this.overhead;
    const n = overhead === null ? null : await this.raw(model, code);
    if (n === null || overhead === null)
      return { tokens: Math.round(code.length / 4), est: true };
    const tokens = Math.max(0, n - overhead);
    this.cache[key] = tokens;
    mkdirSync(dirname(this.cachePath), { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 1));
    return { tokens, est: false };
  }
}

/** Every statistic of one program. */
export async function codeStats(
  code: string,
  arm: Arm,
  model: string,
  counter: ModelTokenCounter
): Promise<CodeStats> {
  const m = await counter.count(code, model);
  return {
    ...lexicalStats(code, arm),
    model: m.tokens,
    ...(m.est ? { modelEst: true } : {}),
  };
}
