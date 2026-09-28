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
 *     and comments are not counted); R follows its parser's tokens (a
 *     `%op%` operator such as `%>%` is one token, as are `<-` and `|>`).
 *   - model tokens: the program's length in the model's own tokens, from the
 *     Anthropic token-counting endpoint (free, not booked in the ledger),
 *     cached by sha256 of the code. Without a key, or offline, it is
 *     estimated at 4 characters per token and marked as an estimate.
 *   - lines of code: lines that are not blank and not only comments.
 *
 * Explicit calculation, counted on the same lexical tokens:
 *
 *   - arithmetic operators: + - * / % ** (and // in Python; ^ %% %/% in R),
 *     their compound assignments (+= ...), and every call into the
 *     language's math library: Math, math, np or numpy (`Math.max`,
 *     `np.linspace`), and in R the base functions that mirror Math (`sqrt`,
 *     `round`, `max`, ...) plus `cumsum` and `cumprod`. A `+` that composes
 *     charts is not arithmetic (see `compositionPluses`).
 *   - magic numbers: numeric literals other than 0 and 1, i.e. hand-picked
 *     constants (pixel offsets, sizes, thresholds).
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Arm } from "./tasks";

/** The language a program is written in. */
type Lang = "js" | "python" | "r";
const LANG: Record<Arm, Lang> = {
  gofish: "js",
  recharts: "js",
  d3: "js",
  matplotlib: "python",
  altair: "python",
  ggplot2: "r",
};

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

// ---------------------------------------------------------------------------
// R
// ---------------------------------------------------------------------------

const R_STRING = [
  // raw string r"(...)", r"--[...]--"
  String.raw`[rR](?<q>["'])(?<d>-*)[(\[{][\s\S]*?[)\]}]\k<d>\k<q>`,
  String.raw`"(?:\\[\s\S]|[^"\\])*"`,
  String.raw`'(?:\\[\s\S]|[^'\\])*'`,
  String.raw`\`[^\`]*\``, // backquoted name
];
const R_TOKEN = new RegExp(
  [
    String.raw`#[^\n]*`, // comment (skipped)
    ...R_STRING,
    String.raw`0[xX][\da-fA-F]+[Li]?`,
    String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[Li]?`, // number
    String.raw`(?:[A-Za-z]|\.(?!\d))[\w.]*`, // name (may contain . and _)
    String.raw`%[^%\n]*%`, // %% %/% %in% %>% ...
    String.raw`<<-|->>|:::|<-|->|\|>|::|==|!=|<=|>=|&&|\|\||\*\*`,
    String.raw`[{}()\[\];,+\-*/^<>=!&|~?:$@\\]`,
  ].join("|"),
  "g"
);

function rTokens(src: string): string[] {
  return [...src.matchAll(R_TOKEN)]
    .map((m) => m[0])
    .filter((t) => !t.startsWith("#"));
}

const lex = (src: string, arm: Arm): string[] =>
  ({ js: jsTokens, python: pyTokens, r: rTokens })[LANG[arm]](src);

/** Lexical tokens of a program (whitespace and comments excluded). */
export function syntaxTokens(src: string, arm: Arm): number {
  return lex(src, arm).length;
}

const ARITH: Record<Lang, Set<string>> = {
  js: new Set(["+", "-", "*", "/", "%", "**"].flatMap((o) => [o, `${o}=`])),
  python: new Set(
    ["+", "-", "*", "/", "%", "**", "//"].flatMap((o) => [o, `${o}=`])
  ),
  // R has no compound assignment; ** is an alias of ^.
  r: new Set(["+", "-", "*", "/", "^", "**", "%%", "%/%"]),
};
/** Math libraries whose members count as calculation (`Math.max`,
 *  `np.linspace`). */
const MATH_LIBS = new Set(["Math", "math", "np", "numpy"]);
/** R has no math namespace: these base functions are its Math object
 *  (plus the cumulative sums numpy counts as np.cumsum). */
const R_MATH = new Set(
  (
    "abs sqrt exp expm1 log log2 log10 log1p floor ceiling round signif " +
    "trunc sign sin cos tan asin acos atan atan2 sinh cosh tanh max min " +
    "pmax pmin cumsum cumprod"
  ).split(" ")
);
const DECIMAL = /^(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)$/;

// ---------------------------------------------------------------------------
// Composition operators
// ---------------------------------------------------------------------------

/**
 * A grammar-of-graphics library overloads an arithmetic operator to compose
 * charts: ggplot2 adds layers, scales, labels and themes to a plot with `+`,
 * and Altair layers charts with `+` (and concatenates them with `|` and `&`,
 * which are not arithmetic anyway). Such a `+` joins parts of a chart
 * specification; it calculates nothing, so it is not counted.
 *
 * The rule, the same for every arm: a `+` composes when its right operand
 * (after any opening parentheses) starts with a chart part. A chart part is
 *   - ggplot2: a call to a ggplot component (`ggplot`, `aes`, `geom_*`,
 *     `stat_*`, `scale_*`, `coord_*`, `facet_*`, `theme`/`theme_*`, `labs`,
 *     `xlab`, `ylab`, `ggtitle`, `guides`, `annotate`, `annotation_*`,
 *     `xlim`, `ylim`, `lims`, `expand_limits`, `position_*`, `guide_*`),
 *     optionally `ggplot2::`-qualified, or a `list(...)` of them;
 *   - Altair: a chart constructor (`alt.Chart`, `alt.layer`, `alt.hconcat`,
 *     `alt.vconcat`, `alt.concat`, `alt.repeat`, `alt.LayerChart`, ...);
 *   - in both, a name last assigned a value that starts with a chart part
 *     (`base = alt.Chart(df)`, `bars = base.mark_bar()`, `p <- ggplot(df)`,
 *     `my_theme <- theme(...)`).
 * Only these two libraries define such chart values, so in the other arms
 * every `+` is arithmetic.
 */
const GG_PART =
  /^(ggplot|aes|geom_\w+|stat_\w+|scale_\w+|coord_\w+|facet_\w+|theme(_\w+)?|labs|xlab|ylab|ggtitle|guides|annotate|annotation_\w+|xlim|ylim|lims|expand_limits|position_\w+|guide_\w+)$/;
const ALT_CHART =
  /^(Chart|LayerChart|HConcatChart|VConcatChart|ConcatChart|FacetChart|RepeatChart|TopLevelLayerSpec|layer|hconcat|vconcat|concat|repeat)$/;
const NAME = /^[A-Za-z_.][\w.]*$/;

/** Indexes of the `+` tokens that compose charts rather than add numbers. */
export function compositionPluses(toks: string[], lang: Lang): Set<number> {
  const out = new Set<number>();
  if (lang === "js") return out;
  const parts = new Set<string>(); // names bound to chart parts
  /** Does the expression starting at token i start with a chart part? */
  const startsPart = (i: number): boolean => {
    while (toks[i] === "(") i++;
    const t = toks[i];
    if (t === undefined || !NAME.test(t)) return false;
    if (lang === "r") {
      if (toks[i + 1] === "::" || toks[i + 1] === ":::")
        return startsPart(i + 2);
      if (toks[i + 1] === "(") {
        if (GG_PART.test(t)) return true;
        if (t === "list" || t === "c") return startsPart(i + 2);
      }
      return parts.has(t);
    }
    if ((t === "alt" || t === "altair") && toks[i + 1] === ".")
      return ALT_CHART.test(toks[i + 2] ?? "");
    return parts.has(t);
  };
  toks.forEach((t, i) => {
    if (t === "+" && startsPart(i + 1)) out.add(i);
    const assign = t === "=" || (lang === "r" && (t === "<-" || t === "<<-"));
    // `name = value` as a statement, not a keyword argument f(name = value).
    if (
      assign &&
      NAME.test(toks[i - 1] ?? "") &&
      !["(", ",", "."].includes(toks[i - 2] ?? "")
    ) {
      if (startsPart(i + 1)) parts.add(toks[i - 1]);
      else parts.delete(toks[i - 1]);
    }
  });
  return out;
}

/** Arithmetic operators (with calls into the math library) and magic
 *  numbers (numeric literals other than 0 and 1). A `+` that composes
 *  charts is not arithmetic (see `compositionPluses`). */
export function explicitCalculation(
  src: string,
  arm: Arm
): { arithOps: number; magicNumbers: number } {
  const lang = LANG[arm];
  const toks = lex(src, arm);
  const composing = compositionPluses(toks, lang);
  let arithOps = 0;
  let magicNumbers = 0;
  toks.forEach((t, i) => {
    if (ARITH[lang].has(t) && !composing.has(i)) arithOps++;
    if (MATH_LIBS.has(t) && toks[i + 1] === ".") arithOps++;
    if (
      lang === "r" &&
      toks[i - 1] !== "$" &&
      ((R_MATH.has(t) && toks[i + 1] === "(") || t === "pi")
    )
      arithOps++;
    // R's integer suffix: 2L is the number 2.
    const num = lang === "r" ? t.replace(/L$/, "") : t;
    if (DECIMAL.test(num) && Number(num) !== 0 && Number(num) !== 1)
      magicNumbers++;
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
  const lang = LANG[arm];
  const re =
    lang === "r"
      ? new RegExp([...R_STRING, String.raw`#[^\n]*`].join("|"), "g")
      : lang === "python"
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
    const comment =
      lang !== "js"
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
