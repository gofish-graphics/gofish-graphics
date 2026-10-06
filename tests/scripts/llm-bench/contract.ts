/**
 * The arm contract: the picture in the container must have been produced by
 * the arm's library. A program that draws the chart by hand (writing SVG
 * markup or creating SVG elements itself) is not a use of the library, so
 * its picture is not scored as one.
 *
 * Like the extractor (extract.ts), this is a declared per-library layer; the
 * checks (checks.ts) stay library-neutral. The rule has two parts:
 *
 *   1. Static, every arm (`staticViolation`, run before rendering): the
 *      program imports the arm's library (for ggplot2: calls `ggplot()`).
 *      A cheap first filter.
 *   2. Provenance, per arm (after a successful render):
 *      - gofish: every painted SVG element in the container was created by
 *        gofish-graphics code. The harness records, for each SVG element
 *        created or cloned in the page, whether gofish-graphics source was
 *        on the call stack (`trackCreation`, `stackProvenance`). The model's
 *        module and the harness share the one aliased gofish-graphics
 *        instance, served from packages/gofish-graphics/src, so its frames
 *        are recognizable by URL.
 *      - plot: the same stack rule, with Observable Plot's code on the
 *        stack. Plot draws through d3, and the program may import d3 too,
 *        so the frame that counts is Plot's own (see LIBRARY_FRAME). An
 *        element made inside a callback Plot calls (a function mark, a
 *        mark's `render` option) counts, as a custom shape inside a Recharts
 *        surface does; one made before `Plot.plot` or appended after it
 *        returns (a hand-written or d3-drawn overlay) does not.
 *      - recharts: every outermost <svg> in the container is a Recharts
 *        surface (`svg.recharts-surface`), so the chart was drawn by a
 *        Recharts chart component. Custom shapes passed to Recharts
 *        components are inside that surface and count.
 *      - matplotlib: the saved SVG carries matplotlib's own markers: the
 *        creator metadata ("Matplotlib v...") or its figure group
 *        (`<g id="figure_1">`).
 *      - ggplot2: the saved SVG was written by svglite, the SVG device
 *        ggsave uses: everything is drawn inside svglite's root group
 *        (`<g class='svglite'>`).
 *      - altair: the saved SVG was written by Vega's SVG renderer (through
 *        vl-convert): the root <svg> has class "marks" and the marks sit in
 *        Vega's mark groups (`<g class="mark-...">`).
 *      - d3: none beyond the static rule, which for d3 also requires that an
 *        imported binding is used. d3 is a DOM toolkit, so appending
 *        elements through d3 selections is how d3 draws; a module that
 *        imports d3 and never uses it fails. This is deliberately simple: a
 *        module that uses d3 for a scale and writes the SVG itself passes.
 *
 * A violation is a render error with its own kind ("contract"), and its
 * message goes back to the model like any render error.
 *
 * Browser-side functions touch the DOM only inside their bodies, so this
 * module also loads in Node.
 */

import type { Arm, ScriptArm } from "./tasks";

const LIBRARY: Record<Arm, string> = {
  gofish: "GoFish (gofish-graphics)",
  recharts: "Recharts (recharts)",
  d3: "D3 (d3)",
  matplotlib: "matplotlib",
  ggplot2: "ggplot2",
  altair: "Altair (altair)",
  plot: "Observable Plot (@observablehq/plot)",
};

/** The message the model sees, with an optional detail line. */
export function contractError(arm: Arm, detail?: string): string {
  return (
    `The chart must be drawn with ${LIBRARY[arm]}; this output was not produced by it.` +
    (detail ? `\n${detail}` : "")
  );
}

// ---------------------------------------------------------------------------
// Static rule (Node side)
// ---------------------------------------------------------------------------

/** Each JS arm's library: its package name, and the import specifiers
 *  that count as importing it. */
const JS_LIBRARY: Record<
  Exclude<Arm, ScriptArm>,
  { pkg: string; spec: RegExp }
> = {
  gofish: { pkg: "gofish-graphics", spec: /^gofish-graphics$/ },
  recharts: { pkg: "recharts", spec: /^recharts$/ },
  d3: { pkg: "d3", spec: /^d3(-[a-z-]+)?$/ },
  plot: { pkg: "@observablehq/plot", spec: /^@observablehq\/plot$/ },
};

/** Every static import (`import ... from "x"`, `import "x"`) and dynamic
 *  import (`import("x")`) in a JS module: its specifier and the local
 *  names it binds. Comments are not stripped (this is a cheap filter). */
function jsImports(code: string): { spec: string; names: string[] }[] {
  const out: { spec: string; names: string[] }[] = [];
  const re =
    /\bimport\s*(?:([\w$*{}\s,]+?)\s*from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) {
    if (m[3]) {
      out.push({ spec: m[3], names: ["*dynamic*"] });
      continue;
    }
    const clause = m[1] ?? "";
    const names: string[] = [];
    const ns = /\*\s*as\s+([\w$]+)/.exec(clause);
    if (ns) names.push(ns[1]);
    const named = /\{([^}]*)\}/.exec(clause);
    if (named)
      for (const part of named[1].split(",")) {
        const p = part.trim().split(/\s+as\s+/);
        const local = (p[1] ?? p[0]).trim();
        if (local) names.push(local);
      }
    const def = /^([\w$]+)/.exec(
      clause.replace(/\{[^}]*\}|\*\s*as\s+[\w$]+/g, "").trim()
    );
    if (def) names.push(def[1]);
    out.push({ spec: m[2], names });
  }
  return out;
}

/** Python imports of the Python arms' libraries. */
const PY_IMPORT: Record<"matplotlib" | "altair", RegExp> = {
  matplotlib: /^\s*(import\s+matplotlib\b|from\s+matplotlib\b)/m,
  altair: /^\s*(import\s+altair\b|from\s+altair\b)/m,
};

/** Why `code` breaks the static rule for `arm`, or null. */
export function staticViolation(arm: Arm, code: string): string | null {
  if (arm === "matplotlib" || arm === "altair") {
    return PY_IMPORT[arm].test(code)
      ? null
      : contractError(arm, `The script does not import ${arm}.`);
  }
  if (arm === "ggplot2") {
    // `ggplot(` or `ggplot2::ggplot(`, outside comments.
    return /\bggplot\s*\(/.test(code.replace(/#[^\n]*/g, ""))
      ? null
      : contractError(arm, "The script does not call ggplot().");
  }
  const { pkg, spec } = JS_LIBRARY[arm];
  const imports = jsImports(code).filter((i) => spec.test(i.spec));
  if (imports.length === 0)
    return contractError(arm, `The module does not import "${pkg}".`);
  if (arm === "d3") {
    // The module must use what it imports from d3.
    const names = imports.flatMap((i) => i.names);
    if (names.includes("*dynamic*")) return null;
    const rest = code.replace(
      /\bimport\s*[\w$*{}\s,]*?\s*from\s*["'][^"']+["'];?/g,
      ""
    );
    const used = names.some((n) =>
      new RegExp(`(^|[^\\w$.])${n.replace(/\$/g, "\\$")}\\b`).test(rest)
    );
    if (!used)
      return contractError(arm, "The module imports d3 but never uses it.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Script arms (Node side, on the saved SVG text)
// ---------------------------------------------------------------------------

/** For each script arm, a test that the saved SVG was written by its
 *  library, and what to say when it was not. */
const WRITER: Record<
  ScriptArm,
  { test: (svg: string) => boolean; why: string }
> = {
  matplotlib: {
    test: (svg) =>
      /Matplotlib v\d/.test(svg) || /<g id="figure_\d+">/.test(svg),
    why: "The saved SVG was not written by matplotlib's savefig.",
  },
  ggplot2: {
    test: (svg) => /<g class=['"]svglite['"]>/.test(svg),
    why: "The saved SVG was not written by ggsave with the svglite device.",
  },
  altair: {
    test: (svg) =>
      /<svg\b[^>]*\bclass="marks"/.test(svg) &&
      /<g\b[^>]*\bclass="mark-[a-z]+/.test(svg),
    why: "The saved SVG was not written by Altair's chart.save (vl-convert).",
  },
};

/** Why the SVG a script arm saved is not its library's output, or null. */
export function scriptViolation(
  arm: ScriptArm,
  svgText: string
): string | null {
  return WRITER[arm].test(svgText) ? null : contractError(arm, WRITER[arm].why);
}

// ---------------------------------------------------------------------------
// Browser side (harness page)
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

/** The arms whose provenance is read from creation stacks, and how each
 *  library's code shows up in a stack frame's URL. The model's program lives
 *  under tests/tmp, so it never matches.
 *   - gofish-graphics is aliased to its source, which Vite serves from
 *     packages/gofish-graphics/src.
 *   - @observablehq/plot is pre-bundled by Vite into its own dependency file
 *     (`.../deps/@observablehq_plot.js`); served unbundled it would be
 *     `.../@observablehq/plot/src/...`. d3, which Plot draws through, is in a
 *     separate chunk, so a program's own d3 calls do not match. */
export type StackArm = "gofish" | "plot";
const LIBRARY_FRAME: Record<StackArm, RegExp> = {
  gofish: /\/packages\/gofish-graphics\/src\//,
  plot: /\/@observablehq[_/]plot\b/,
};

/** Whether a creation stack has the arm's library code on it. */
export const libraryOnStack = (arm: StackArm, stack: string): boolean =>
  LIBRARY_FRAME[arm].test(stack);

/** Unformatted stack captured when each SVG element was created. V8 formats
 *  `.stack` lazily, so recording costs little until it is read. */
const created = new WeakMap<Element, Error>();

function capture(): Error {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  const e = new Error();
  Error.stackTraceLimit = limit;
  return e;
}

function record(root: Node, e: Error): void {
  if (!(root instanceof Element)) {
    // A fragment (e.g. a template's content): record its elements.
    root.childNodes?.forEach((c) => record(c, e));
    return;
  }
  if (root.namespaceURI === SVG_NS) created.set(root, e);
  for (const el of Array.from(root.querySelectorAll("*")))
    if (el.namespaceURI === SVG_NS) created.set(el, e);
}

/** Record the creation stack of every SVG element made in this page from
 *  now on: by createElementNS, cloneNode or importNode. Elements parsed from
 *  markup (innerHTML) are not recorded, so they count as made by the
 *  program. Called once, before the program's module loads. */
export function trackCreation(): void {
  const doc = Document.prototype;
  const createNS = doc.createElementNS;
  doc.createElementNS = function (this: Document, ...args: any[]) {
    const el = (createNS as any).apply(this, args);
    if (el.namespaceURI === SVG_NS) created.set(el, capture());
    return el;
  } as any;
  const clone = Node.prototype.cloneNode;
  Node.prototype.cloneNode = function (this: Node, deep?: boolean) {
    const copy = clone.call(this, deep);
    record(copy, capture());
    return copy;
  };
  const importNode = doc.importNode;
  doc.importNode = function (this: Document, node: Node, deep?: boolean) {
    const copy = importNode.call(this, node, deep);
    record(copy, capture());
    return copy;
  } as any;
}

/** Containers whose contents are templates or paint servers, not painted
 *  shapes; a program may supply these (a gradient, say) itself. */
const NOT_PAINTED =
  "defs, clipPath, mask, marker, pattern, symbol, linearGradient, radialGradient, filter";

/** Why the SVG in `root` was not (entirely) drawn by the arm's library
 *  (gofish-graphics or Observable Plot), or null. Every painted SVG element
 *  must have been created with the library's code on the stack. For Plot
 *  that includes elements a program creates inside a callback Plot calls (a
 *  function mark, a mark's `render` option), as Recharts counts custom
 *  shapes inside its surface. */
export function stackProvenance(arm: StackArm, root: Element): string | null {
  const els = Array.from(root.querySelectorAll("svg, svg *")).filter(
    (el) =>
      el.namespaceURI === SVG_NS &&
      !el.matches(NOT_PAINTED) &&
      !el.parentElement?.closest(NOT_PAINTED)
  );
  const byLibrary = new Map<Error, boolean>();
  const foreign = els.filter((el) => {
    const e = created.get(el);
    if (!e) return true;
    if (!byLibrary.has(e)) byLibrary.set(e, libraryOnStack(arm, e.stack ?? ""));
    return !byLibrary.get(e);
  });
  if (foreign.length === 0) return null;
  const pkg = JS_LIBRARY[arm].pkg;
  const tags = [...new Set(foreign.map((el) => `<${el.localName}>`))]
    .slice(0, 5)
    .join(", ");
  return contractError(
    arm,
    foreign.length === els.length
      ? `No SVG element in the container was created by ${pkg}.`
      : `${foreign.length} of ${els.length} SVG elements in the container (${tags}) were not created by ${pkg}.`
  );
}

/** Why the output in `root` is not a Recharts chart, or null. Every
 *  outermost <svg> must be a Recharts surface. */
export function rechartsProvenance(root: Element): string | null {
  const outer = Array.from(root.querySelectorAll("svg")).filter(
    (s) => !s.parentElement?.closest("svg")
  );
  const other = outer.filter((s) => !s.classList.contains("recharts-surface"));
  if (other.length === 0) return null;
  return contractError(
    "recharts",
    `${other.length} of ${outer.length} <svg> elements in the container are not Recharts chart surfaces (svg.recharts-surface).`
  );
}
