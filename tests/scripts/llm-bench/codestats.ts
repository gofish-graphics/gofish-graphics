/**
 * Statistics of a program: how big it is, three ways, and how much explicit
 * calculation it does (which a declarative library should make unneeded).
 *
 * Every measure but model tokens counts only the chart expression: the
 * program without its imports, its shell, its input and output, and its
 * output size, which the harness asks of each arm differently (see
 * `Program`).
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
 *   - model tokens: the whole program's length in the model's own tokens
 *     (what the model wrote, plumbing included), from the
 *     Anthropic token-counting endpoint (free, not booked in the ledger),
 *     cached by sha256 of the code. Without a key, or offline, it is
 *     estimated at 4 characters per token and marked as an estimate.
 *   - lines of code: lines that hold a token of the chart expression.
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
  plot: "js",
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
// Lexers
// ---------------------------------------------------------------------------

/** A lexical token: its text, its span in the source, and the lines it
 *  starts and ends on. */
interface Tok {
  t: string;
  s: number;
  e: number;
  line: number;
  endLine: number;
}

/** A lexer from a token regex; tokens for which `skip` holds (comments,
 *  line joins) are dropped. */
function lexer(re: RegExp, skip: (t: string) => boolean) {
  return (src: string): Tok[] => {
    const out: Tok[] = [];
    let line = 0;
    let at = 0;
    const lineAt = (pos: number) => {
      for (; at < pos; at++) if (src[at] === "\n") line++;
      return line;
    };
    for (const m of src.matchAll(re)) {
      const s = m.index!;
      const e = s + m[0].length;
      if (skip(m[0])) continue;
      const l0 = lineAt(s);
      out.push({ t: m[0], s, e, line: l0, endLine: lineAt(e) });
    }
    return out;
  };
}

const JS_TOKEN = new RegExp(
  [
    String.raw`\/\/[^\n]*`, // line comment (skipped)
    String.raw`\/\*[\s\S]*?\*\/`, // block comment (skipped)
    String.raw`\`(?:\\[\s\S]|[^\`\\])*\``, // template literal
    String.raw`"(?:\\[\s\S]|[^"\\])*"`, // double-quoted string
    String.raw`'(?:\\[\s\S]|[^'\\])*'`, // single-quoted string
    String.raw`\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+`, // number
    String.raw`[A-Za-z_$][\w$]*`, // identifier or keyword
    // JSX tag punctuation, so a closing or self-closing tag is not read as a
    // division operator.
    String.raw`<\/|\/>`,
    String.raw`\*\*=|=>|\.\.\.|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\*\*|\+\+|--|[+\-*/%]=`,
    String.raw`[{}()\[\];,.<>+\-*/%=!&|^~?:]`, // single-character punctuation
  ].join("|"),
  "g"
);
const jsTokens = lexer(
  JS_TOKEN,
  (t) => t.startsWith("//") || t.startsWith("/*")
);

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
const pyTokens = lexer(PY_TOKEN, (t) => t.startsWith("#") || t === "\\\n");

const R_TOKEN = new RegExp(
  [
    String.raw`#[^\n]*`, // comment (skipped)
    // raw string r"(...)", r"--[...]--"
    String.raw`[rR](?<q>["'])(?<d>-*)[(\[{][\s\S]*?[)\]}]\k<d>\k<q>`,
    String.raw`"(?:\\[\s\S]|[^"\\])*"`,
    String.raw`'(?:\\[\s\S]|[^'\\])*'`,
    String.raw`\`[^\`]*\``, // backquoted name
    String.raw`0[xX][\da-fA-F]+[Li]?`,
    String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[Li]?`, // number
    String.raw`(?:[A-Za-z]|\.(?!\d))[\w.]*`, // name (may contain . and _)
    String.raw`%[^%\n]*%`, // %% %/% %in% %>% ...
    String.raw`<<-|->>|:::|<-|->|\|>|::|==|!=|<=|>=|&&|\|\||\*\*`,
    String.raw`[{}()\[\];,+\-*/^<>=!&|~?:$@\\]`,
  ].join("|"),
  "g"
);
const rTokens = lexer(R_TOKEN, (t) => t.startsWith("#"));

const lex = (src: string, arm: Arm): Tok[] =>
  ({ js: jsTokens, python: pyTokens, r: rTokens })[LANG[arm]](src);

// ---------------------------------------------------------------------------
// The chart expression
// ---------------------------------------------------------------------------

/**
 * Every arm's program does the same job, but the harness hands it its input
 * and takes its output differently: the JS arms are functions that get
 * `container` and `data` as arguments, while the Python and R arms are
 * scripts that read the data from a file named by an environment variable
 * and save an SVG file. So that the measures compare the charts and not the
 * plumbing, they count only the chart expression: the program with its
 * plumbing left out. The plumbing is, in every arm:
 *
 *   1. Imports: JS `import` declarations; Python `import` and `from ...
 *      import` statements and `matplotlib.use(...)`; R `library(...)` and
 *      `require(...)` (also inside `suppressPackageStartupMessages(...)`).
 *   2. The program's shell (JS): `export default function render(container,
 *      data) {` and its closing brace, and the `return` of the function's
 *      body (with the parentheses around a returned JSX element, and the
 *      returned value itself when it is just a reference such as
 *      `svg.node()`).
 *   3. Input and output (see `scriptIO` and `jsIO`): the call that reads
 *      the data or an asset (Python and R: the call that receives `os.environ[...]` or
 *      `Sys.getenv(...)`, with the calls it is the whole argument of, as in
 *      `pd.DataFrame(json.load(open(os.environ["DATA_PATH"])))`), and the
 *      call that writes or attaches the picture (`fig.savefig(...)`,
 *      `chart.save(...)`, `ggsave(...)`, GoFish's `.render(container,
 *      ...)`, `container.append(...)` around Plot's chart, d3's
 *      `d3.select(container).append("svg")` or `d3.create("svg")`). A `with`
 *      block that opens an input file goes with it, and so does a statement
 *      left with nothing but a name to bind (`df = ` once its loader is
 *      gone), whose name then stands for the input or output if it was bound
 *      to the path alone.
 *   4. The output size (see `outputSize`): GoFish's `w` and `h` render
 *      options, Plot's `width` and `height` options, Recharts' `width` and
 *      `height` props on the chart component, the root SVG's `width`,
 *      `height` and `viewBox` attributes in d3, Altair's `width` and
 *      `height` in `.properties(...)`, and matplotlib's `figsize` and `dpi`
 *      (ggplot2's size is in `ggsave`, already gone), plus the declarations
 *      `NAME = <number>` of the constants these settings use (`const W =
 *      540`, `width <- 6.4`).
 *
 * Everything else is the chart expression and is counted, including the
 * data transforms the chart needs, helper functions, and post-processing of
 * the rendered SVG.
 */
class Program {
  readonly toks: Tok[];
  readonly lang: Lang;
  /** Index of each bracket's partner, -1 for other tokens. */
  readonly match: number[];
  /** Index of the innermost open bracket around each token, -1 at top. */
  readonly parent: number[];
  readonly drop: boolean[];
  /** Names that hold an output size (or another setting left out), whose
   *  numeric declarations are plumbing too. */
  readonly sizeNames = new Set<string>();

  constructor(
    src: string,
    readonly arm: Arm
  ) {
    this.toks = lex(src, arm);
    this.lang = LANG[arm];
    const n = this.toks.length;
    this.match = new Array(n).fill(-1);
    this.parent = new Array(n).fill(-1);
    this.drop = new Array(n).fill(false);
    const stack: number[] = [];
    const close: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    this.toks.forEach(({ t }, i) => {
      this.parent[i] = stack.length ? stack[stack.length - 1] : -1;
      if (t === "(" || t === "[" || t === "{") stack.push(i);
      else if (t in close) {
        const j = stack.length ? stack[stack.length - 1] : -1;
        if (j >= 0 && this.toks[j].t === close[t]) {
          stack.pop();
          this.match[i] = j;
          this.match[j] = i;
          this.parent[i] = this.parent[j];
        }
      }
    });
  }

  t(i: number): string | undefined {
    return this.toks[i]?.t;
  }

  dropRange(a: number, b: number): void {
    for (let i = a; i <= b; i++) this.drop[i] = true;
  }

  /** The names in a range, for the size constants (`w: W`). */
  noteNames(a: number, b: number): void {
    for (let i = a; i <= b; i++)
      if (IDENT.test(this.toks[i].t) && this.t(i - 1) !== ".")
        this.sizeNames.add(this.toks[i].t);
  }

  /** The kept tokens. */
  kept(): Tok[] {
    return this.toks.filter((_, i) => !this.drop[i]);
  }

  /** Is the `(` at `i` a call's? */
  isCall(i: number): boolean {
    const f = this.t(i - 1) ?? "";
    return (
      this.t(i) === "(" &&
      IDENT.test(f) &&
      !KEYWORDS.has(f) &&
      this.t(i - 2) !== "function"
    );
  }

  /** The first token of the callee of the call opening at `i`, with its
   *  receiver chain (`pd.read_json`, `fig.savefig`, `jsonlite::fromJSON`). */
  calleeStart(i: number): number {
    let j = i - 1;
    while (
      [".", "?.", "::", ":::", "$"].includes(this.t(j - 1) ?? "") &&
      IDENT.test(this.t(j - 2) ?? "")
    )
      j -= 2;
    return j;
  }

  /** The arguments of the bracket opening at `open`, as token ranges
   *  (commas excluded). */
  args(open: number): [number, number][] {
    const end = this.match[open];
    if (end < 0) return [];
    const out: [number, number][] = [];
    let a = open + 1;
    for (let i = open + 1; i <= end; i++)
      if (i === end || (this.t(i) === "," && this.parent[i] === open)) {
        if (i > a) out.push([a, i - 1]);
        a = i + 1;
      }
    return out;
  }

  /** Drop the arguments (or object entries) of the bracket opening at
   *  `open` whose key is one of `keys`, with a comma each. A key is a JS
   *  entry's first token (`w: 540`, `width`), or a Python keyword argument's
   *  name (`figsize=(6.4, 4)`). Returns how many arguments are left. */
  dropKeyed(open: number, keys: Set<string>): number {
    const args = this.args(open);
    let left = 0;
    for (const [a, b] of args) {
      const key = this.t(a)!.replace(/^["']|["']$/g, "");
      const named = this.lang !== "python" || this.t(a + 1) === "=";
      if (!named || !keys.has(key)) {
        left++;
        continue;
      }
      this.noteNames(a + 1, b);
      this.dropRange(a, b);
      // The comma after the argument, or before the last one.
      if (this.t(b + 1) === ",") this.drop[b + 1] = true;
      else if (this.t(a - 1) === ",") this.drop[a - 1] = true;
    }
    return left;
  }

  /** Tokens `a..b` form a plain reference to a value already built: a name
   *  with members and empty calls (`chart`, `svg.node()`). */
  isPlainRef(a: number, b: number): boolean {
    if (b < a || !IDENT.test(this.t(a)!)) return false;
    for (let i = a + 1; i <= b; i++) {
      const t = this.t(i)!;
      if ((t === "." || t === "?.") && IDENT.test(this.t(i + 1) ?? "")) i++;
      else if (t === "(" && this.t(i + 1) === ")") i++;
      else return false;
    }
    return true;
  }
}

const IDENT = /^(?:[A-Za-z_$]|\.[A-Za-z_])[\w$.]*$/;
const KEYWORDS = new Set(
  (
    "if for while switch return function catch with in of not and or " +
    "elif else lambda yield await typeof new"
  ).split(" ")
);
const NUMBER = /^(?:\d[\d_]*(?:\.[\d_]*)?|\.\d+)(?:[eE][+-]?\d+)?L?$/;

// --- 1 and 2: imports and the JS shell --------------------------------------

function jsShell(p: Program): void {
  const { toks } = p;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t;
    // import ... from "x";   import "x";
    if (
      t === "import" &&
      p.parent[i] === -1 &&
      !["(", "."].includes(p.t(i + 1) ?? "")
    ) {
      let j = i + 1;
      while (j < toks.length && !/^["'`]/.test(toks[j].t)) j++;
      if (p.t(j + 1) === ";") j++;
      p.dropRange(i, j);
      i = j;
    }
    // export default [async] function [name](params) { ... }
    if (t === "export" && p.t(i + 1) === "default") {
      let j = i + 2;
      if (p.t(j) === "async") j++;
      if (p.t(j) !== "function") continue;
      j++;
      if (p.t(j) !== "(") j++;
      const params = p.match[j];
      const body = params + 1;
      if (params < 0 || p.t(body) !== "{" || p.match[body] < 0) continue;
      p.dropRange(i, body);
      p.drop[p.match[body]] = true;
      for (let k = body + 1; k < p.match[body]; k++)
        if (p.t(k) === "return" && p.parent[k] === body) jsReturn(p, k, body);
    }
  }
}

/** The body's `return`: dropped, with the parentheses around what it
 *  returns, or with what it returns when that is a plain reference. */
function jsReturn(p: Program, k: number, body: number): void {
  p.drop[k] = true;
  const a = k + 1;
  // The end of the returned expression: a `;` or the body's `}`.
  let b = a;
  while (b < p.match[body] && !(p.t(b) === ";" && p.parent[b] === body)) b++;
  b--;
  if (p.t(a) === "(" && p.match[a] === b) {
    p.drop[a] = p.drop[b] = true;
  } else if (p.isPlainRef(a, b)) {
    p.dropRange(a, b);
    if (p.t(b + 1) === ";") p.drop[b + 1] = true;
  }
}

/** Python and R statements: a Python logical line (with its indentation),
 *  or an R expression ending at a line break that does not continue it. */
interface Stmt {
  a: number;
  b: number;
  indent: number;
}

/** Tokens after which an R expression continues on the next line. */
const R_CONTINUES =
  /^(?:[-+*/^<>=!&|~?:$@,([{]|<-|<<-|->|->>|\|>|::|:::|==|!=|<=|>=|&&|\|\||\*\*|%[^%]*%)$/;

function statements(p: Program, src: string): Stmt[] {
  const { toks } = p;
  const out: Stmt[] = [];
  const col = (i: number) =>
    toks[i].s - (src.lastIndexOf("\n", toks[i].s - 1) + 1);
  let a = 0;
  for (let i = 1; i <= toks.length; i++) {
    const brk =
      i === toks.length ||
      (p.parent[i] === -1 &&
        (toks[i - 1].t === ";" ||
          (toks[i].line > toks[i - 1].endLine &&
            !(
              p.lang === "python" &&
              /\\\r?\n/.test(src.slice(toks[i - 1].e, toks[i].s))
            ) &&
            !(p.lang === "r" && R_CONTINUES.test(toks[i - 1].t)))));
    if (brk) {
      if (i > a) out.push({ a, b: i - 1, indent: col(a) });
      a = i;
    }
  }
  return out;
}

const R_LIBRARY = new Set(["library", "require", "requireNamespace"]);

function scriptImports(p: Program, stmts: Stmt[]): void {
  for (const s of stmts) {
    const [t0, t1, t2] = [p.t(s.a), p.t(s.a + 1), p.t(s.a + 2)];
    const isImport =
      p.lang === "python"
        ? t0 === "import" ||
          t0 === "from" ||
          (t0 === "matplotlib" && t1 === "." && t2 === "use")
        : R_LIBRARY.has(t0!) ||
          (/^suppress\w+$/.test(t0!) && t1 === "(" && R_LIBRARY.has(t2!));
    if (isImport) p.dropRange(s.a, s.b);
  }
}

// --- 3: input and output ------------------------------------------------------

/** The I/O span around tokens `a..b`, a read of the environment: the call
 *  that receives it, extended to every call it is the whole argument of.
 *  Null when it is in no call (`path = os.environ["DATA_PATH"]`). */
function ioCall(p: Program, a: number, b: number): [number, number] | null {
  let open = p.parent[a];
  while (open >= 0 && !p.isCall(open)) open = p.parent[open];
  if (open < 0) return null;
  let [s, e] = [p.calleeStart(open), p.match[open]];
  for (;;) {
    const before = p.t(s - 1);
    const kw = before === "=" && IDENT.test(p.t(s - 2) ?? "");
    const prev = kw ? p.t(s - 3) : before;
    const outer = kw ? p.parent[s - 2] : p.parent[s];
    if (
      (prev === "(" || prev === ",") &&
      (p.t(e + 1) === ")" || p.t(e + 1) === ",") &&
      outer >= 0 &&
      p.isCall(outer)
    ) {
      [s, e] = [p.calleeStart(outer), p.match[outer]];
    } else return [s, e];
  }
}

/** Python and R: reads of the environment (`os.environ[...]`,
 *  `os.getenv(...)`, `Sys.getenv(...)`) and names bound to one. */
function scriptIO(p: Program, stmts: Stmt[]): void {
  const aliases = new Set<string>();
  /** The env reads in a statement, as token ranges. */
  const reads = (s: Stmt): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = s.a; i <= s.b; i++) {
      const t = p.t(i)!;
      if (p.drop[i]) continue;
      let end = -1;
      if (p.lang === "python" && t === "os" && p.t(i + 1) === ".") {
        if (p.t(i + 2) === "environ" && p.t(i + 3) === "[")
          end = p.match[i + 3];
        else if (
          p.t(i + 2) === "environ" &&
          p.t(i + 3) === "." &&
          p.t(i + 5) === "("
        )
          end = p.match[i + 5];
        else if (p.t(i + 2) === "getenv" && p.t(i + 3) === "(")
          end = p.match[i + 3];
      } else if (p.lang === "r" && t === "Sys.getenv" && p.t(i + 1) === "(")
        end = p.match[i + 1];
      else if (
        aliases.has(t) &&
        p.t(i - 1) !== "." &&
        p.t(i + 1) !== "=" &&
        p.t(i + 1) !== "<-"
      )
        end = i;
      if (end >= i) {
        out.push([i, end]);
        i = end;
      }
    }
    return out;
  };
  for (let k = 0; k < stmts.length; k++) {
    const s = stmts[k];
    const rs = reads(s);
    if (!rs.length) continue;
    // A `with` block that opens an input or output file.
    if (p.t(s.a) === "with") {
      let end = s.b;
      while (k + 1 < stmts.length && stmts[k + 1].indent > s.indent)
        end = stmts[++k].b;
      p.dropRange(s.a, end);
      continue;
    }
    let bare = true; // only the path itself was dropped
    for (const [a, b] of rs) {
      const call = ioCall(p, a, b);
      if (call) {
        bare = false;
        p.noteNames(call[0], call[1]);
        p.dropRange(call[0], call[1]);
      } else p.dropRange(a, b);
    }
    // What the statement has left.
    const left = [];
    for (let i = s.a; i <= s.b; i++) if (!p.drop[i]) left.push(i);
    const binds =
      left.length === 2 &&
      IDENT.test(p.t(left[0])!) &&
      ["=", "<-"].includes(p.t(left[1])!);
    if (binds) {
      if (bare) aliases.add(p.t(left[0])!);
      p.dropRange(s.a, s.b);
    } else if (
      left.length &&
      p.isPlainRef(left[0], left[left.length - 1]) &&
      left.length === left[left.length - 1] - left[0] + 1
    )
      p.dropRange(s.a, s.b);
  }
}

/** JS: the calls that put the picture into `container`. */
function jsIO(p: Program): void {
  const { toks } = p;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t !== "container" || p.drop[i] || p.t(i - 1) === ".") continue;
    // GoFish: .render(container, { w, h, ...options })
    if (p.t(i - 1) === "(" && p.t(i - 2) === "render" && p.t(i - 3) === ".") {
      const open = i - 1;
      const close = p.match[open];
      p.dropRange(i - 3, i);
      p.drop[close] = true;
      if (p.t(i + 1) === ",") p.drop[i + 1] = true;
      const opts = i + 2;
      if (p.t(opts) === "{" && p.match[opts] === close - 1) {
        if (p.dropKeyed(opts, new Set(["w", "h"])) === 0)
          p.dropRange(opts, close - 1);
      } else if (opts < close) {
        p.noteNames(opts, close - 1);
        p.dropRange(opts, close - 1);
      }
      continue;
    }
    // container.append(x), appendChild, replaceChildren, prepend
    if (
      p.t(i + 1) === "." &&
      /^(append|appendChild|replaceChildren|prepend)$/.test(p.t(i + 2) ?? "") &&
      p.t(i + 3) === "("
    ) {
      const close = p.match[i + 3];
      p.dropRange(i, i + 3);
      p.drop[close] = true;
      if (p.isPlainRef(i + 4, close - 1)) {
        p.dropRange(i + 4, close - 1);
        if (p.t(close + 1) === ";") p.drop[close + 1] = true;
      }
      continue;
    }
    // d3.select(container).append("svg")
    if (p.t(i - 1) === "(" && p.t(i - 2) === "select" && p.t(i - 4) === "d3") {
      let end = i + 1;
      if (
        p.t(end + 1) === "." &&
        p.t(end + 2) === "append" &&
        /^["']svg["']$/.test(p.t(end + 4) ?? "")
      )
        end += 5;
      p.dropRange(i - 4, end);
      svgChain(p, i - 4, end);
    }
  }
  // d3.create("svg")
  for (let i = 0; i < toks.length; i++)
    if (
      toks[i].t === "d3" &&
      p.t(i + 2) === "create" &&
      /^["']svg["']$/.test(p.t(i + 4) ?? "")
    ) {
      p.dropRange(i, i + 5);
      svgChain(p, i, i + 5);
    }
}

/** d3: the root SVG's `width`, `height` and `viewBox` attributes in the
 *  chain after it was made at `a..b`; and the binding left with no value
 *  (`const svg = ` when nothing else was chained). */
function svgChain(p: Program, a: number, b: number): void {
  let i = b + 1;
  while (
    p.t(i) === "." &&
    /^(attr|style|classed|property)$/.test(p.t(i + 1) ?? "") &&
    p.t(i + 2) === "("
  ) {
    const close = p.match[i + 2];
    if (close < 0) break;
    if (
      p.t(i + 1) === "attr" &&
      /^["'](width|height|viewBox)["']$/.test(p.t(i + 3) ?? "")
    ) {
      p.noteNames(i + 4, close - 1);
      p.dropRange(i, close);
    }
    i = close + 1;
  }
  const end = i - 1;
  let allDropped = true;
  for (let k = a; k <= end; k++) allDropped &&= p.drop[k];
  if (
    allDropped &&
    p.t(a - 1) === "=" &&
    /^(const|let|var)$/.test(p.t(a - 3) ?? "")
  ) {
    p.dropRange(a - 3, a - 1);
    if (p.t(end + 1) === ";") p.drop[end + 1] = true;
  }
}

// --- 4: output size -----------------------------------------------------------

const RECHARTS_ROOT = /^(\w*Chart|Treemap|Sankey|Surface)$/;
const WIDTH_HEIGHT = new Set(["width", "height"]);

function outputSize(p: Program, stmts: Stmt[] | null): void {
  const { toks } = p;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if (p.lang === "js") {
      // Plot.plot({ width, height, ... })
      if (
        t === "Plot" &&
        p.t(i + 2) === "plot" &&
        p.t(i + 3) === "(" &&
        p.t(i + 4) === "{"
      )
        p.dropKeyed(i + 4, WIDTH_HEIGHT);
      // <BarChart width={640} height={400} ...>
      if (t === "<" && RECHARTS_ROOT.test(p.t(i + 1) ?? "")) {
        for (
          let j = i + 2;
          j < toks.length && !/^(>|\/>)$/.test(toks[j].t);
          j++
        ) {
          if (toks[j].t === "{" && p.match[j] > j) {
            j = p.match[j];
            continue;
          }
          if (WIDTH_HEIGHT.has(toks[j].t) && p.t(j + 1) === "=") {
            const v = p.t(j + 2) === "{" ? p.match[j + 2] : j + 2;
            p.noteNames(j + 2, v);
            p.dropRange(j, v);
            j = v;
          }
        }
      }
    } else if (p.lang === "python" && t === "(" && p.isCall(i)) {
      if (p.arm === "matplotlib") p.dropKeyed(i, new Set(["figsize", "dpi"]));
      if (
        p.arm === "altair" &&
        p.t(i - 1) === "properties" &&
        p.t(i - 2) === "."
      )
        if (p.dropKeyed(i, WIDTH_HEIGHT) === 0) p.dropRange(i - 2, p.match[i]);
    }
  }
  // The constants these settings use: `const W = 540, H = 305;`, `W = 6.4`.
  if (stmts) {
    for (const s of stmts) {
      // `W, H = 640, 400`: every name a size constant.
      const n = (s.b - s.a) / 4 + 0.5;
      const tuple =
        Number.isInteger(n) &&
        n > 1 &&
        p.t(s.a + 2 * n - 1) === "=" &&
        Array.from({ length: n }, (_, k) => k).every(
          (k) =>
            p.sizeNames.has(p.t(s.a + 2 * k)!) &&
            NUMBER.test(p.t(s.a + 2 * n + 2 * k)!) &&
            (k === n - 1 ||
              (p.t(s.a + 2 * k + 1) === "," &&
                p.t(s.a + 2 * n + 2 * k + 1) === ","))
        );
      if (tuple) p.dropRange(s.a, s.b);
      if (
        s.b === s.a + 2 &&
        p.sizeNames.has(p.t(s.a)!) &&
        ["=", "<-"].includes(p.t(s.a + 1)!) &&
        NUMBER.test(p.t(s.a + 2)!)
      )
        p.dropRange(s.a, s.b);
    }
    return;
  }
  for (let i = 0; i < toks.length; i++) {
    if (!/^(const|let|var)$/.test(toks[i].t)) continue;
    // Declarators `NAME = <number>`, each ending at a comma, a semicolon or
    // a line break.
    let j = i + 1;
    let all = true;
    for (;;) {
      const ends =
        j + 3 >= toks.length ||
        [",", ";"].includes(toks[j + 3].t) ||
        toks[j + 3].line > toks[j + 2].line;
      if (
        !IDENT.test(p.t(j) ?? "") ||
        p.t(j + 1) !== "=" ||
        !NUMBER.test(p.t(j + 2) ?? "") ||
        !ends
      ) {
        all = false;
        break;
      }
      if (p.sizeNames.has(p.t(j)!)) {
        p.dropRange(j, j + 2);
        if (p.t(j + 3) === ",") p.drop[j + 3] = true;
        else if (p.t(j - 1) === ",") p.drop[j - 1] = true;
      } else all = false;
      if (p.t(j + 3) !== ",") break;
      j += 4;
    }
    if (all) {
      p.drop[i] = true;
      if (p.t(j + 3) === ";") p.drop[j + 3] = true;
    }
  }
}

/** The chart expression's tokens (see `Program`). */
function chartExpression(src: string, arm: Arm): Tok[] {
  const p = new Program(src, arm);
  if (p.lang === "js") {
    jsShell(p);
    jsIO(p);
    outputSize(p, null);
  } else {
    const stmts = statements(p, src);
    scriptImports(p, stmts);
    scriptIO(p, stmts);
    outputSize(p, stmts);
  }
  return p.kept();
}

/** The chart expression's tokens as text, for checking the classification
 *  by eye (`pnpm llm-bench chart-tokens`). */
export function chartTokens(src: string, arm: Arm): string[] {
  return chartExpression(src, arm).map((k) => k.t);
}

/** Lexical tokens of the chart expression (whitespace and comments
 *  excluded). */
export function syntaxTokens(src: string, arm: Arm): number {
  return chartExpression(src, arm).length;
}

/** Lines of the chart expression: lines holding one of its tokens. */
export function linesOfCode(src: string, arm: Arm): number {
  return linesOf(chartExpression(src, arm));
}

function linesOf(toks: Tok[]): number {
  const lines = new Set<number>();
  for (const k of toks) for (let l = k.line; l <= k.endLine; l++) lines.add(l);
  return lines.size;
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
 *  numbers (numeric literals other than 0 and 1) in the chart expression. A
 *  `+` that composes charts is not arithmetic (see `compositionPluses`). */
export function explicitCalculation(
  src: string,
  arm: Arm
): { arithOps: number; magicNumbers: number } {
  return calculation(chartTokens(src, arm), LANG[arm]);
}

function calculation(
  toks: string[],
  lang: Lang
): { arithOps: number; magicNumbers: number } {
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

/** The statistics that need no model, all of the chart expression: size in
 *  syntax tokens and lines, and explicit calculation. */
export function lexicalStats(
  src: string,
  arm: Arm
): Omit<CodeStats, "model" | "modelEst"> {
  const toks = chartExpression(src, arm);
  return {
    syntax: toks.length,
    loc: linesOf(toks),
    ...calculation(
      toks.map((k) => k.t),
      LANG[arm]
    ),
  };
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
