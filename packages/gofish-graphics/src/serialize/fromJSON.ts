// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Frontend-IR deserializer: turns a {@link Frontend.FrontendIRDocument} into
 * a live `ChartBuilder` / `Mark`. Used by the Python widget today and by
 * any JS consumer that wants to reconstruct a chart from JSON.
 *
 * The deserializer is bridge-aware but transport-agnostic. Python callbacks
 * (`derive` operators, `{ __gofish_lambda: id }` accessors, mark functions)
 * are called through the caller-supplied {@link DeriveBridge}.
 */

// Source-module imports — see the note in registry.ts.
import {
  chart,
  selectAll,
  LayerBuilder,
  PREVIOUS_LAYER_MARKS,
} from "../ast/marks/chart";
import { gofish, type AxesOptions, type View } from "../ast/gofish";
import { createName, type Token } from "../ast/createName";
import { Constraint, RelateOperand } from "../ast/constraints";
import { palette, gradient } from "../families/color";
import { ref } from "../ast/shapes/ref";
import { GoFishRef } from "../ast/_ref";
import { sealComponent } from "../ast/withGoFish";
import { resolveMarkResult } from "../ast/marks/markResult";
import { Frontend } from "gofish-ir";
import { RESOLVE_ROWS } from "../ast/channels";
import { applySchema } from "../ast/schema";
import { FieldExpr } from "../ast/fieldExpr";
import {
  SOURCE,
  isExprValue,
  makeExpr,
  type ExprNode,
  type Source,
} from "../ast/expr";
import {
  ambientRegistrar,
  readUnregistered,
} from "../interaction/resolveContext";
import {
  click,
  drag,
  pointer,
  signal,
  timer,
  wheel,
} from "../interaction/inputs";
import {
  animationFromIR,
  arrangementFromIR,
  callForRows,
  rebuild,
  cutSlices,
  cutMark,
  offsetOp,
  type ChartBuilder,
  type DeriveBridge,
  type Kernel,
  type SourceValues,
  type Mark,
  type Operator,
} from "./registry";

export type ChartSpec = Frontend.ChartIR;
export type MarkSpec = Frontend.MarkIR;
export type OperatorSpec = Frontend.OperatorIR;
/** One entry of a `label` wire array — see `Frontend.LabelSpecIR`. Named
 *  `LabelSpec` here (rather than the wire field's full `Frontend.LabelIR`
 *  union) because every reapplication site below works entry-by-entry. */
export type LabelSpec = Frontend.LabelSpecIR;
export type ConstraintSpec = Frontend.ConstraintIR;
type RelateClauseIR = Frontend.RelateClauseIR;

/**
 * What rebuilding any part of a document needs besides the part itself.
 * One object is threaded through every rebuild below, so a chart rebuilds by
 * one rule wherever it sits (the root, a mark position, a tier of a
 * `.layer(...)` chain). A mark function's reply is a document of its own,
 * so the subtree it rebuilds gets its own `tables` and `inputRefs`.
 */
export interface IRContext {
  /** Runs the Python callbacks the IR names. */
  bridge?: Kernel;
  /** Mints one JS token per hygienic-name sentinel, per render. */
  resolveToken: TokenResolver;
  /** The rows of the document's charts, by the id a `{type: "table", id}`
   *  data field names. */
  tables: Frontend.Tables;
  /** The live `GoFishRef`s a mark function was called with, which an
   *  `{__inputRef: i}` sentinel in its reply resolves back to. */
  inputRefs?: any[];
  /** The live sources of the build, by id: the ones the document's `sources`
   *  table declares ({@link sourcesFromIR}), and the ones a bridge reply
   *  declares, which {@link kernelBridge} adds to this same object. */
  sources: Record<string, Source>;
}

// ---------------------------------------------------------------------------
// Sources and expressions
// ---------------------------------------------------------------------------

/** The live source a declaration describes: the same input a JS author
 *  makes with these options. */
function sourceFromIR(decl: Frontend.SourceIR): Source {
  const { kind, ...opts } = decl as Frontend.SourceIR & Record<string, any>;
  switch (kind) {
    case "timer":
      return timer(opts as any) as unknown as Source;
    case "signal":
      return signal(opts.init) as unknown as Source;
    case "wheel":
      return wheel(opts as any) as unknown as Source;
    case "pointer":
      return pointer() as unknown as Source;
    case "drag":
      return drag() as unknown as Source;
    case "click":
      return click() as unknown as Source;
    default:
      throw new Error(`unknown source kind ${JSON.stringify(kind)}`);
  }
}

/**
 * A fresh live source per declaration of a document's `sources` table. One
 * build is one render's worth of sources, so two renders of one document
 * never share a clock or an input by accident; each registers with its own
 * chart when that chart's resolve reads it (see `resolveContext.ts`).
 */
export function sourcesFromIR(
  decls: Frontend.Sources | undefined
): Record<string, Source> {
  return Object.fromEntries(
    Object.entries(decls ?? {}).map(([id, d]) => [id, sourceFromIR(d)])
  );
}

/**
 * The kernel tier: a Python callback that reads a source (`bins()` inside a
 * `derive`). It is the pipeline tier with a round trip added, so it follows
 * the JS rule for a read outside `live()`: the chart becomes a pipeline
 * reader of exactly the sources the callback read.
 *
 * Each call ships the current values of the build's sources of one value
 * (read without registering anything). The reply names the sources the
 * callback read (`reads`) and declares any the build does not have yet (a
 * source only a Python closure names, or one a mark function's IR reads),
 * which join `sources`, so ids stay one namespace per document. Then each
 * read is read again here, under the resolve's registrar, which registers
 * the chart as its reader.
 *
 * A read the call shipped no value for (a source the build did not have)
 * means the callback stopped there, so the call is made again, now with
 * that value. A read whose value changed during the round trip means the
 * reply is stale: the reply is used, and the chart is invalidated, so the
 * runtime's latest-wins scheduler re-runs it once with the newest values
 * (however many changes arrived meanwhile). Nothing is queued per change.
 */
export function kernelBridge(
  bridge: DeriveBridge,
  sources: Record<string, Source>
): Kernel {
  return {
    async call(lambdaId, rows) {
      for (;;) {
        const shipped = sourceValues(sources);
        const reply = await bridge.call(lambdaId, rows, shipped);
        for (const [id, decl] of Object.entries(reply.sources ?? {}))
          if (!Object.hasOwn(sources, id)) sources[id] = sourceFromIR(decl);
        const reads = reply.reads ?? [];
        if (reads.some((id) => !Object.hasOwn(shipped, id))) continue;
        const stale = reads.filter(
          (id) => !Object.is(readSource(sources, id), shipped[id])
        );
        if (stale.length > 0) ambientRegistrar()?.invalidate();
        return reply;
      }
    },
  };
}

/** The current values of the sources of one value, read without
 *  registering a reader. */
function sourceValues(sources: Record<string, Source>): SourceValues {
  return readUnregistered(() =>
    Object.fromEntries(
      Object.entries(sources)
        .filter(([, s]) => isExprValue(s))
        .map(([id, s]) => [id, s[SOURCE].read(undefined, undefined, undefined)])
    )
  );
}

/** Read a source a Python callback read, as a spec read: under the
 *  resolve's registrar, so the chart becomes its pipeline reader. */
function readSource(sources: Record<string, Source>, id: string): unknown {
  const source = sources[id];
  if (source === undefined || !isExprValue(source))
    throw new Error(
      `a Python callback read source "${id}", which is not a source of one ` +
        `value in this chart`
    );
  return source[SOURCE].read(undefined, undefined, undefined);
}

const EXPR_TYPES = new Set(["source", "op", "when"]);

/** Whether a wire value is an expression's object form. */
const isExprIR = (v: any): boolean =>
  v !== null && typeof v === "object" && EXPR_TYPES.has(v.type);

/** An `ExprIR` as its JS tree, each source read resolved against `sources`. */
function exprNodeFromIR(
  ir: Frontend.ExprIR,
  sources: Record<string, Source>
): ExprNode {
  if (ir === null || typeof ir !== "object") return { type: "lit", value: ir };
  switch (ir.type) {
    case "field":
      return {
        type: "field",
        field: new FieldExpr(ir.name, (ir.ops ?? []) as any),
      };
    case "source": {
      const source = sources[ir.id];
      if (source === undefined)
        throw new Error(
          `an expression reads source "${ir.id}", which the document's sources do not declare`
        );
      return {
        type: "source",
        source,
        ...(ir.read !== undefined ? { read: ir.read } : {}),
        ...(ir.arg !== undefined ? { arg: ir.arg } : {}),
      };
    }
    case "op":
      return {
        type: "op",
        op: ir.op,
        args: ir.args.map((a) => exprNodeFromIR(a, sources)),
      };
    case "when":
      return {
        type: "when",
        branches: ir.branches.map(
          ([c, v]) =>
            [exprNodeFromIR(c, sources), exprNodeFromIR(v, sources)] as [
              ExprNode,
              ExprNode,
            ]
        ),
        otherwise:
          ir.otherwise === undefined
            ? { type: "lit", value: null }
            : exprNodeFromIR(ir.otherwise, sources),
      };
  }
}

/** An `ExprIR` object as the value a JS author writes there: a read of a
 *  source's own value is the source itself (a clock handed to `on`), any
 *  other expression an `Expr`. */
function exprFromIR(
  ir: Frontend.ExprIR,
  sources: Record<string, Source>
): unknown {
  const node = exprNodeFromIR(ir, sources);
  return node.type === "source" && node.read === undefined
    ? node.source
    : makeExpr(node);
}

/**
 * Rebuild one constraint clause of a `.relate()` from its IR. The wire
 * carries operand NAMES; each becomes a `RelateOperand`, which the layer
 * resolves at layout like any other, so a name that matches no node inside
 * the layer is reported there, by name.
 */
export function constraintFromIR(c: Frontend.ConstraintIR): unknown {
  const operands = c.refs.map((name) => new RelateOperand(name));
  if (c.type === "zAbove" || c.type === "zBelow") {
    return (Constraint as any)[c.type](...operands);
  }
  return (Constraint as any)[c.type](c.options, operands);
}

// ---------------------------------------------------------------------------
// Token sentinels (hygienic-name encoding from the Python wrapper)
// ---------------------------------------------------------------------------

export type TokenSentinel = { __gofish_token: string; __tag: string };
export type TokenResolver = (s: TokenSentinel) => Token;

/**
 * Build a per-render token resolver. The Python wrapper emits hygienic-name
 * sentinels of the form `{ __gofish_token, __tag }`; the first sighting
 * mints a JS `createName(tag)` Token, subsequent sightings reuse it within
 * a single render so cross-references inside a spec resolve to the same
 * runtime Token.
 */
export function makeTokenResolver(): TokenResolver {
  const cache = new Map<string, Token>();
  return (sentinel: TokenSentinel) => {
    let t = cache.get(sentinel.__gofish_token);
    if (!t) {
      t = createName(sentinel.__tag);
      cache.set(sentinel.__gofish_token, t);
    }
    return t;
  };
}

export function isTokenSentinel(v: any): v is TokenSentinel {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.__gofish_token === "string" &&
    typeof v.__tag === "string"
  );
}

// ---------------------------------------------------------------------------
// Bridge-sentinel unwrapping
// ---------------------------------------------------------------------------

/**
 * Build the accessor for a `{ __gofish_lambda: id }` sentinel. It has only a
 * batch form ({@link RESOLVE_ROWS}): the mark and operator factories resolve
 * it before channel inference (`resolveChannelAccessors` in channels.ts) with
 * one bridge call for all of its rows. The reply's list has one value per
 * row, typed by `applySchema` like a chart's rows (a time comes back as epoch
 * milliseconds). Called per row, it throws: a Python accessor works only in
 * a channel.
 */
function makeLambdaAccessor(lambdaId: string, bridge: Kernel) {
  const accessor = () => {
    throw new Error(
      "a Python accessor was called per row; it is resolved only in a channel"
    );
  };
  return Object.assign(accessor, {
    [RESOLVE_ROWS]: async (rows: readonly unknown[]) =>
      applySchema(await callForRows(bridge, lambdaId, rows)),
  });
}

/**
 * Walk a mark's or operator's options and resolve Python-emitted lambda
 * sentinels at any depth (a top-level channel, or nested as in
 * `dims: { r: { size: … } }`).
 *
 *  - `{ __gofish_lambda: id }` becomes an `async (d) => …` arrow that
 *    RPCs into Python via the supplied bridge.
 *
 * Python's `datum(x)` emits the canonical `{type: "datum", datum: x}`
 * directly, so no unwrap step is needed for it. If no bridge is
 * supplied, lambda sentinels throw — a pure-JS consumer should never
 * emit one.
 */
export function unwrapOpts(
  value: any,
  bridge?: Kernel,
  sources: Record<string, Source> = {}
): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => unwrapOpts(item, bridge, sources));
  }
  // An expression (a source read, an operation, a `when`), at any depth.
  if (isExprIR(value)) return exprFromIR(value, sources);
  if (typeof value.__gofish_lambda === "string") {
    if (bridge === undefined) {
      throw new Error(
        "encountered { __gofish_lambda } sentinel but no DeriveBridge was supplied"
      );
    }
    return makeLambdaAccessor(value.__gofish_lambda, bridge);
  }
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(value)) {
    out[k] = unwrapOpts(val, bridge, sources);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mark wrappers and field resolution
// ---------------------------------------------------------------------------

/**
 * Wrap a Mark so its resolved GoFishNode gets `.scope()` called. Triggered
 * by the `__scope: true` flag the Python `@mark` decorator stamps on a
 * Mark's IR. Forwards `.name` / `.label` / `.render` / `.relate` so the
 * scoped mark still behaves as a `NameableMark`, wherever it sits (a root
 * renders it directly).
 */
export function wrapWithScope(inner: any): any {
  // The same closing step a JS `createMark` component gets. (`createMark` no
  // longer names its node after the data key, since #923, so neither side
  // names here: `mapMark` chains `.name(spec.name)` when the IR has one.)
  const wrapped: any = async (data: any, key: any, layerContext: any) =>
    sealComponent(await inner(data, key, layerContext), data);
  const define = (key: string, value: any) =>
    Object.defineProperty(wrapped, key, {
      value,
      writable: true,
      configurable: true,
    });
  if (typeof inner.render === "function") {
    define("render", async (container: any, options: any) => {
      const node: any = await resolveMarkResult(wrapped);
      return node.render(container, options);
    });
  }
  for (const key of ["name", "label", "relate"] as const) {
    if (typeof inner[key] === "function") {
      define(key, (...args: any[]) => wrapWithScope(inner[key](...args)));
    }
  }
  return wrapped;
}

export function resolveNameField(
  rawName: any,
  resolveToken: TokenResolver
): string | Token | undefined {
  if (rawName == null) return undefined;
  if (isTokenSentinel(rawName)) return resolveToken(rawName);
  return rawName;
}

export function resolveRefSelection(
  selection: any,
  resolveToken: TokenResolver
): any {
  if (typeof selection === "string") return selection;
  if (Array.isArray(selection)) {
    return selection.map((seg) =>
      isTokenSentinel(seg) ? resolveToken(seg) : seg
    );
  }
  return selection;
}

// ---------------------------------------------------------------------------
// Options resolution (color, coord, …)
// ---------------------------------------------------------------------------

function resolveColorConfig(colorSpec: Record<string, any>): any {
  if (colorSpec._tag === "palette") return palette(colorSpec.values);
  if (colorSpec._tag === "gradient") return gradient(colorSpec.stops);
  return colorSpec;
}

function resolveCoordConfig(coordSpec: Record<string, any>): any {
  const { type, ...opts } = coordSpec;
  const coord = rebuild("coord", type, opts);
  if (coord === undefined) {
    throw new Error(`Unknown coord type: ${String(type)}`);
  }
  return coord;
}

/** A `SelectRefIR` as the ref it stands for: `mode` "all" is
 *  `selectAll(layer)` (every node), "one" or absent is `ref(layer)` (one). */
export const refOfSelect = (spec: { layer: string; mode?: string }) =>
  spec.mode === "all" ? selectAll(spec.layer) : ref(spec.layer);

/**
 * The options of a construct with each field whose declared type names nodes
 * (`Frontend.NodeSelectionIR`, a blob's `avoiding` inside `shape`) rebuilt as
 * the refs it stands for: a list of `{ type: "ref", selection }` becomes a
 * list of `ref(selection)`, and a `{ type: "select", layer, mode: "all" }`
 * becomes `selectAll(layer)`. The walk follows the descriptor table
 * (`Frontend.mapHeldNodes`); other fields are as given.
 */
export function resolveNodeRefs(
  kind: Frontend.NodeKind,
  type: string,
  opts: Record<string, any>,
  resolveToken: TokenResolver
): Record<string, any> {
  const accepted = Frontend.acceptedFields(kind, type);
  if (accepted === undefined) return opts;
  const nodes = (v: any): any =>
    Array.isArray(v)
      ? v.map((r) => ref(resolveRefSelection(r.selection, resolveToken)))
      : refOfSelect(v);
  const out: Record<string, any> = { ...opts };
  for (const [key, value] of Object.entries(opts)) {
    const field = accepted[key];
    if (field !== undefined)
      out[key] = Frontend.mapHeldNodes(field.type, value, nodes);
  }
  return out;
}

export function resolveOptions(raw: Record<string, any>): Record<string, any> {
  const resolved: Record<string, any> = { ...raw };
  if (
    resolved.color &&
    typeof resolved.color === "object" &&
    "_tag" in resolved.color
  ) {
    resolved.color = resolveColorConfig(resolved.color);
  }
  if (
    resolved.coord &&
    typeof resolved.coord === "object" &&
    "type" in resolved.coord
  ) {
    resolved.coord = resolveCoordConfig(resolved.coord);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Deserializers
// ---------------------------------------------------------------------------

/** Build a single operator from its IR spec. `label` is either an array of
 *  label specs (one `.label(accessor, options?)` call per entry, applied in
 *  order so repeated calls round-trip) or the boolean suppression shorthand
 *  (`label: false`, e.g. Ribbon's `stack({..., label: false})`) — normalized
 *  to a one-element array here so both shapes share the same reapplication
 *  loop; destructuring `accessor`/options off a boolean primitive yields
 *  `undefined`/`{}`, reproducing the pre-array-form suppression behavior. */
export function mapOperator(
  op: OperatorSpec,
  bridge?: Kernel,
  sources: Record<string, Source> = {}
): Operator<any, any> | null {
  const { type, translate, label, transition, ...opts } = op as Record<
    string,
    any
  >;
  let operator = rebuild(
    "operator",
    type as string,
    unwrapOpts(opts, bridge, sources),
    { bridge }
  );
  if (operator === undefined) return null;
  if (transition !== undefined)
    operator = operator.transition(operatorTransitionFromIR(transition));
  if (
    operator &&
    label !== undefined &&
    typeof (operator as any).label === "function"
  ) {
    const specs = Array.isArray(label) ? label : [label];
    for (const spec of specs) {
      const { accessor, ...labelOpts } = spec as { accessor: any } & Record<
        string,
        any
      >;
      operator = (operator as any).label(
        accessor,
        Object.keys(labelOpts).length > 0 ? labelOpts : undefined
      );
    }
  }
  if (
    operator &&
    translate &&
    typeof (operator as any).translate === "function"
  ) {
    return (operator as any).translate(translate);
  }
  return operator;
}

/** An operator's `.transition(...)` spec from its IR: each phase's
 *  arrangement as `time.stagger(...)` / `time.parallel()`. */
function operatorTransitionFromIR(
  ir: Frontend.OperatorTransitionIR
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ir).map(([phase, a]) => [phase, arrangementFromIR(a)])
  );
}

/** A mark's `.transition(...)` spec from its IR: each phase's `Animation`
 *  values. */
function markTransitionFromIR(
  ir: Frontend.MarkTransitionIR
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ir).map(([phase, v]) => [phase, animationFromIR(v)])
  );
}

/** Chain a mark's `.transition(...)` when its IR has one. */
const withTransition = <M>(mark: M, ir: unknown): M =>
  ir === undefined
    ? mark
    : (mark as any).transition(markTransitionFromIR(ir as any));

/**
 * Map an array of combinator-child mark specs to runtime children, expanding
 * any `cut` child into its N slice nodes IN PLACE. The pure `cut(source, opts)`
 * returns a `Promise<GoFishNode>[]`, which combinators (Spread/Stack/…) accept
 * directly as children — so the single source of truth for cut's extent
 * resolution (flexbox sizing, absolute-vs-weight mixing, measure-unit checks)
 * stays in JS and is never reimplemented Python-side. Non-`cut` children map
 * through `mapMark` unchanged.
 *
 * The returned array mixes `Mark` functions and resolved slice-node promises;
 * the combinator factories tolerate both (the pure-JS `Spread(opts, cut(...))`
 * spelling relies on the same tolerance).
 */
export function mapMarkChildren(specs: MarkSpec[], ctx: IRContext): any[] {
  const out: any[] = [];
  for (const child of specs as any[]) {
    if (child && child.type === "cut") {
      const sourceMark = mapMark(child.source, ctx);
      // Pure cut requires an array `size`; the field-name-string sugar is only
      // valid in the chart `.mark(cut(...))` (data-bound expand) form.
      const slices = cutSlices(sourceMark as any, {
        dir: child.dir,
        size: unwrapOpts(child.size, ctx.bridge, ctx.sources),
        inset: child.inset,
      });
      out.push(...slices);
    } else {
      out.push(mapMark(child as MarkSpec, ctx));
    }
  }
  return out;
}

/**
 * Rebuild the clauses of a `.relate()` callback, in order: a constraint
 * (it carries `refs`, operand names) through {@link constraintFromIR}, a mark
 * that draws like any other mark.
 */
function relateClauses(clauses: RelateClauseIR[], ctx: IRContext): unknown[] {
  return clauses.map((c) =>
    Frontend.isConstraintIR(c)
      ? constraintFromIR(c)
      : mapMark(c as MarkSpec, ctx)
  );
}

/**
 * Serialize a mark-fn's input array for the RPC bridge. Each `GoFishRef` (the
 * shape `.flow(group(...)).mark((refs) => ...)` hands the callback — see
 * `createRelationalMark`'s `by`-split bag form and `createOperator.ts`'s
 * per-item `applyMark`) can't cross JSON as-is (it's a live class instance
 * over the render's layer registry), so it's replaced with an
 * `{__inputRef: i, datum}` sentinel carrying just its bound datum. The
 * Python wrapper reconstructs an `_InputRef` Mark from the sentinel so
 * `d[0].datum` reads naturally, and can round-trip `d[0]` itself back into a
 * returned mark tree (`resolveInputRefs` below undoes the substitution using
 * the same index against the original `GoFishRef` array). Plain data rows
 * (the pre-#591 mark-fn contract, e.g. Scatter's pie-glyph story) pass
 * through unchanged.
 */
function serializeMarkFnInput(items: any[]): {
  rows: any[];
  inputRefs?: any[];
} {
  if (!items.some((item) => item instanceof GoFishRef)) {
    return { rows: items };
  }
  const rows = items.map((item, i) =>
    item instanceof GoFishRef ? { __inputRef: i, datum: item.datum } : item
  );
  return { rows, inputRefs: items };
}

/** Build a single mark from its IR spec. Recurses into combinator children.
 *  `ctx.inputRefs`, when supplied, is the array of real `GoFishRef`s a mark-fn
 *  was invoked with — an `{__inputRef: i}` sentinel anywhere in the (possibly
 *  Python-returned) mark tree resolves back to `inputRefs[i]`, letting a
 *  Python mark-fn embed the ref it was handed directly in its returned
 *  layout (mirrors JS `spread({...}, [d[0], text(...)])`). */
export function mapMark(markSpec: MarkSpec, ctx: IRContext): Mark<any> {
  const { bridge, resolveToken, inputRefs, sources } = ctx;
  const spec = markSpec as any;
  const applyTranslate = <T>(mark: T): T =>
    spec.translate && typeof (mark as any).translate === "function"
      ? ((mark as any).translate(spec.translate) as T)
      : mark;

  // `{__inputRef: i}` sentinel — round-trip back to the real `GoFishRef` a
  // mark-fn was invoked with (see `serializeMarkFnInput`), rather than
  // reconstructing a new mark from the spec.
  if (typeof spec.__inputRef === "number") {
    if (!inputRefs) {
      throw new Error(
        "encountered an { __inputRef } sentinel but no input refs were supplied " +
          "— this mark tree must be returned from a mark-fn invocation"
      );
    }
    const inputRef = inputRefs[spec.__inputRef];
    // `.name(...)` on the Python `_InputRef` (issue #556) — `GoFishRef.name()`
    // mutates in place and returns `this`, so this renames the SAME live ref
    // the rest of the tree already shares (e.g. the stem/bar this ref also
    // points at), letting an enclosing `.layer([...]).relate(...)` target
    // it by name.
    if (spec.name != null && typeof (inputRef as any)?.name === "function") {
      (inputRef as any).name(resolveNameField(spec.name, resolveToken));
    }
    return inputRef;
  }

  // A whole chart in a mark position (`.mark(chart(...))`, a
  // `layer([rect(...), chart(...)])` child): rebuild the same `chart(...)`
  // object a JS author writes there, unresolved, so the mark machinery treats
  // it as it treats the JS one (an empty `chart()` scope inherits the rows of
  // the partition it sits in). A chart with rows of its own names its table,
  // as it does at the root. A layer of charts is the `layer` combinator below.
  if (Frontend.isChartIR(spec)) {
    return chartFromIR(spec, ctx) as unknown as Mark<any>;
  }

  // A `.layer(...)` chain, wherever it sits (#1181): rebuild it through the
  // real `LayerBuilder`, the way a JS author writes it, so JS owns the
  // chain's tier wiring and render logic (inferred axis titles, the root
  // tier's `axes`). Each tier is a mark position. In a mark position, the
  // mark machinery binds a first tier with `previous-tier` data to the rows
  // of the partition the chain sits in, as it does an empty `chart()`.
  if (Frontend.isLayerChainIR(spec)) {
    const [first, ...rest] = spec.tiers.map((tier) => mapMark(tier, ctx));
    return rest.reduce(
      (chain: any, tier) => chain.layer(tier),
      first
    ) as unknown as Mark<any>;
  }

  // Mark-as-function: Python registered a `(data) -> mark | chart` callback.
  // The JS Mark calls it through the bridge per invocation. The reply is a
  // document like the top-level one: its root is the mark-position IR of
  // what the callback returned (a mark, a chart or a layer), and its tables
  // are the ones that IR's charts name, by ids of the reply's own. So it
  // rebuilds here like any other mark position, with the reply's tables and
  // the refs this call was given. Its sources are the document's: the reply
  // declares the ones it reads by the document's ids, and `kernelBridge`
  // has already added any the build did not have to `ctx.sources`, so a
  // source the outer document declared is the same live source here. Like a
  // JS mark function's result, it is
  // returned unresolved: the caller, `resolveMarkResult`, resolves a Mark, a
  // ChartBuilder or a LayerBuilder.
  if (spec.type === "mark-fn") {
    const lambdaId = spec.lambdaId as string;
    if (!bridge) {
      throw new Error(
        "mark-fn spec encountered but no DeriveBridge was supplied"
      );
    }
    return (async (data: any, _key: any, _layerContext: any) => {
      const { rows, inputRefs: replyInputRefs } = serializeMarkFnInput(data);
      const reply = await bridge.call(lambdaId, rows);
      return mapMark(reply.root as MarkSpec, {
        ...ctx,
        // A drawn IR's tables are its charts' rows.
        tables: (reply.tables ?? {}) as Frontend.Tables,
        inputRefs: replyInputRefs,
      });
    }) as unknown as Mark<any>;
  }

  // Leaf-form `ref(name)` — not a combinator, not a mark factory.
  if (spec.type === "ref" && !spec.__combinator) {
    const refNode = ref(resolveRefSelection(spec.selection, resolveToken));
    // A named ref stand-in, `ref(token).name("a")`. GoFishRef's
    // `.name()` mutates in place and returns `this`, making the ref a
    // relate operand of the enclosing layer (RefMarkIR carries `name`;
    // mirrors the __inputRef rename branch above).
    if (spec.name != null) {
      (refNode as any).name(resolveNameField(spec.name, resolveToken));
    }
    return applyTranslate(refNode as unknown as Mark<any>);
  }

  // `offset` node: shift a single child by (x, y) render-pixels. Maps to the
  // public `offset` operator, which accepts a Mark child and resolves it.
  if (spec.type === "offset") {
    const childSpecs = (spec.children ?? []) as MarkSpec[];
    const [childMark] = mapMarkChildren(childSpecs, ctx);
    return applyTranslate(
      offsetOp({ x: spec.x, y: spec.y }, [
        childMark as any,
      ]) as unknown as Mark<any>
    );
  }

  // `cut` mark in a chart `.mark(...)` position → the expand-mark form
  // (`cutMark`). The data-bound expand path treats it as an expand mark; the
  // field-name-string `size` sugar resolves per-row here. (A `cut` used as a
  // combinator CHILD is instead expanded into its N slice nodes IN PLACE — see
  // `mapMarkChildren` — so extent resolution lives in ONE place, JS-side.)
  if (spec.type === "cut") {
    const sourceMark = mapMark(spec.source as MarkSpec, ctx);
    let mark = cutMark({
      source: sourceMark as any,
      dir: spec.dir,
      size: unwrapOpts(spec.size, bridge, sources),
      inset: spec.inset,
    });
    mark = applyTranslate(mark);
    const nameVal = resolveNameField(spec.name, resolveToken);
    if (nameVal != null && typeof (mark as any).name === "function") {
      mark = (mark as any).name(nameVal);
    }
    if (
      typeof spec.zOrder === "number" &&
      typeof (mark as any).zOrder === "function"
    ) {
      mark = (mark as any).zOrder(spec.zOrder);
    }
    return mark;
  }

  // Combinator-form marks: a layout operator (`spread`, `layer`, `arrow`,
  // `treemap`, Porter-Duff) used as a mark, with explicit nested children.
  if (spec.__combinator) {
    const childMarks = mapMarkChildren(
      (spec.children ?? []) as MarkSpec[],
      ctx
    );
    // Resolve color/coord configs (e.g. a `layer({coord: polar()})` carries
    // its coord transform in the combinator options, not chart options).
    const opts = resolveNodeRefs(
      "combinator-mark",
      spec.type,
      resolveOptions(unwrapOpts(spec.options ?? {}, bridge, sources)),
      resolveToken
    );
    let mark = rebuild("combinator-mark", spec.type, opts, {
      children: childMarks,
    });
    if (mark === undefined) {
      throw new Error(`Unknown combinator mark type: ${spec.type}`);
    }
    if (spec.relate && typeof (mark as any).relate === "function") {
      // Rebuilt per call: a `ref(...)` clause is a live GoFishRef that
      // `.name()` mutates in place, so calls must not share one.
      const clauses = spec.relate as RelateClauseIR[];
      mark = (mark as any).relate(() => relateClauses(clauses, ctx));
    }
    mark = withTransition(mark, spec.transition);
    if (spec.__scope) {
      mark = wrapWithScope(mark);
    }
    mark = applyTranslate(mark);
    const nameVal = resolveNameField(spec.name, resolveToken);
    if (nameVal != null && typeof (mark as any).name === "function") {
      mark = (mark as any).name(nameVal);
    }
    if (
      typeof spec.zOrder === "number" &&
      typeof (mark as any).zOrder === "function"
    ) {
      mark = (mark as any).zOrder(spec.zOrder);
    }
    return mark;
  }

  const { type, name: layerName, transition, ...rest } = spec as any;
  // Label is an array of `{accessor, ...opts}` specs — pull out and call the
  // chained `.label(accessor, opts)` method once per entry, in order, so
  // repeated `.label()` calls round-trip (adds one external label layer per
  // call). The legacy boolean shorthand (mark shapes interpreting `label:
  // true` themselves) was removed; `.label()` is the only surviving form
  // for marks. A non-array `label` (e.g. a stray boolean) is left inert in
  // `opts`, matching the pre-array-form fallback.
  let labelSpecs: LabelSpec[] | undefined;
  let opts: Record<string, any>;
  if (Array.isArray(rest.label)) {
    const { label: specs, ...rest2 } = rest;
    labelSpecs = specs as LabelSpec[];
    opts = rest2;
  } else {
    opts = rest;
  }

  let mark = rebuild(
    "leaf-mark",
    type as string,
    resolveNodeRefs(
      "leaf-mark",
      type as string,
      unwrapOpts(opts, bridge, sources),
      resolveToken
    )
  );
  if (mark === undefined) {
    throw new Error(`Unknown mark type: ${String(type)}`);
  }
  mark = withTransition(mark, transition);
  if (labelSpecs && typeof (mark as any).label === "function") {
    for (const labelObj of labelSpecs) {
      const { accessor, ...labelOpts } = labelObj;
      mark = (mark as any).label(
        accessor,
        Object.keys(labelOpts).length > 0 ? labelOpts : undefined
      );
    }
  }
  if (spec.__scope) {
    mark = wrapWithScope(mark);
  }
  mark = applyTranslate(mark);
  const nameVal = resolveNameField(layerName, resolveToken);
  if (nameVal != null && typeof (mark as any).name === "function") {
    mark = (mark as any).name(nameVal);
  }
  if (
    typeof spec.zOrder === "number" &&
    typeof (mark as any).zOrder === "function"
  ) {
    mark = (mark as any).zOrder(spec.zOrder);
  }
  if ("__datum" in spec) {
    const boundDatum = spec.__datum;
    const boundKey = spec.__key ?? undefined;
    const inner = mark as any;
    mark = (async (_data: any, _key: any, layerContext: any) =>
      inner(boundDatum, boundKey, layerContext)) as Mark<any>;
  }
  return mark;
}

/**
 * Read JSON IR as it arrives: parse it if it is JSON text, and turn its
 * tagged non-finite numbers (`{ "$numberDouble": "Infinity" }`, written by
 * `toJSON` and Python's `to_ir()`) back into numbers. It is the JSON codec's
 * read, so it applies where the JSON encoding put the tags: a whole JSON
 * document, or, in a document a Python host ships, every part but its
 * Arrow tables (`decodeDocument` in gofish-python's `arrowBridge.ts`, which
 * decodes a bridge call's reply the same way). `buildIR` takes a document
 * read this way.
 */
export function readIR<T = any>(json: T | string): T {
  return Frontend.decodeNonFinite(
    typeof json === "string" ? (JSON.parse(json) as T) : json
  );
}

/**
 * A chart's data, by its IR: the rows of the table it names (an array that
 * may carry column types, `setColumnTypes`, which the chart reads as it reads
 * its own `schema`'s, and its `schema` wins), a selection of named marks, or
 * the empty scope, which `LayerBuilder` (or the mark machinery, in a mark
 * position) binds to the rows of the enclosing scope.
 */
function dataFromIR(data: Frontend.DataIR, ctx: IRContext): unknown {
  switch (data.type) {
    case "table": {
      const rows = ctx.tables[data.id];
      if (rows === undefined) {
        throw new Error(
          `a chart names table "${data.id}", which its payload does not carry`
        );
      }
      return rows;
    }
    case "select":
      return refOfSelect(data);
    case "previous-tier":
      return PREVIOUS_LAYER_MARKS;
    default:
      throw new Error(
        `unknown chart data type ${JSON.stringify((data as any).type)}`
      );
  }
}

/** Rebuild a chart from its IR, wherever it sits: the same `chart(...)`
 *  builder a JS author writes there. */
function chartFromIR(chartSpec: ChartSpec, ctx: IRContext): ChartBuilder<any> {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of (chartSpec.operators ?? []) as OperatorSpec[]) {
    const op = mapOperator(opSpec, ctx.bridge, ctx.sources);
    if (op) operators.push(op);
  }
  const mark = mapMark(chartSpec.mark, ctx);
  const resolvedOptions = resolveOptions(
    ((chartSpec as any).options ?? {}) as Record<string, any>
  );
  const chartData = dataFromIR(chartSpec.data, ctx);

  // Cast the flow chain: `chart(...).flow(...).mark(...)` is typed with
  // operator-/mark-input/output relationships the runtime deserializer
  // can't statically reconstruct. The widget did the same.
  let builder = (chart as any)(chartData, resolvedOptions)
    .flow(...operators)
    .mark(mark);
  // The chart-level modifiers `.zOrder(n)` and `.name(n)` (the name lets a
  // sibling `layer([...]).relate(...)` or a cross-chart `selectAll(n)` refer
  // to this chart).
  const zOrder = (chartSpec as any).zOrder as number | undefined;
  const name = resolveNameField((chartSpec as any).name, ctx.resolveToken);
  if (zOrder === undefined && name == null) return builder;
  // A relational mark (line/ribbon) over row data fuses into an anchor tier
  // plus a connector tier, so `.mark()` returns a LayerBuilder, which has
  // neither modifier. JS cannot spell `chart(rows).mark(line()).name(...)`
  // either, so this is a gap in the language, reported the same way for both.
  if (builder instanceof LayerBuilder) {
    const used = [
      zOrder !== undefined && ".zOrder()",
      name != null && ".name()",
    ]
      .filter(Boolean)
      .join(" and ");
    throw new Error(
      `${used} on a chart whose relational mark (line/ribbon) fuses into a ` +
        `layer: the fused chart is a LayerBuilder, which has no ${used}, in ` +
        `JS as in Python.`
    );
  }
  if (zOrder !== undefined) builder = builder.zOrder(zOrder);
  if (name != null) builder = builder.name(name);
  return builder;
}

/**
 * Render options a host supplies beside the IR document: the arguments of
 * the Python `.render(...)` call. A field left undefined lets the document
 * decide (a chart's own `axes` option, the default padding). These are the
 * JS `.render(container, options)` options.
 */
export interface RenderIROptions {
  w?: number;
  h?: number;
  axes?: AxesOptions;
  legend?: boolean;
  padding?: number;
  debug?: boolean;
  /** Play the chart's build-in (its marks' `.transition({ enter })`).
   *  False holds it at `at`. */
  playing?: boolean;
  /** Where the build-in clock starts, in milliseconds. */
  at?: number;
}

/** Drop undefined fields, so a render option the host left unset is absent
 *  rather than present-and-undefined. */
function definedFields<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Rebuild a frontend-IR document, as read ({@link readIR} for a JSON
 * document; a Python host's `decodeDocument`, which also decodes its Arrow
 * tables), into the object a JS author would have written for its root: a
 * `ChartBuilder`, a `LayerBuilder`, or a mark. A root holds anything a mark
 * position does, so it rebuilds as one ({@link mapMark}), reading the
 * document's `tables` (a table may carry column types, `setColumnTypes`,
 * which the chart reads as it reads its own `schema`'s, and its `schema`
 * wins). `bridge` runs the Python callbacks the IR names, and answers each
 * call with its reply read the same way. Building throws synchronously on a
 * bad document.
 */
export function buildIR(
  doc: Frontend.FrontendIRDocument,
  bridge?: DeriveBridge
): any {
  const sources = sourcesFromIR(doc.sources);
  return mapMark(doc.root, {
    bridge: bridge && kernelBridge(bridge, sources),
    resolveToken: makeTokenResolver(),
    tables: doc.tables ?? {},
    sources,
  });
}

/**
 * Render a frontend-IR document into `container` ({@link buildIR}, then its
 * root's `.render`). This is the one entry point both Python hosts use: the
 * notebook widget (anywidget traitlets) and the parity harness (HTTP), each
 * with its tables decoded from Arrow and a bridge over its own transport.
 * The returned promise settles with the {@link View} once the chart has
 * rendered.
 */
export function renderIR(
  doc: Frontend.FrontendIRDocument,
  container: HTMLElement,
  renderOptions: RenderIROptions,
  bridge?: DeriveBridge
): Promise<View> {
  const options: any = definedFields({ ...renderOptions });
  const root = buildIR(doc, bridge);
  // A chart or a `.layer(...)` chain renders through its builder. A mark
  // root (a combinator over explicit children) renders as a component, the
  // `gofish(container, options, mark)` form a JS author writes: it resolves
  // under the interaction runtime, so the sources its expressions read
  // register (hit-testing, paint patches, re-runs), and with none it renders
  // down the static path unchanged.
  return typeof root === "function"
    ? gofish(container, options, root as () => any)
    : root.render(container, options);
}
