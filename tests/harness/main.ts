/**
 * Test harness entry point.
 *
 * Reads a chart spec (IR + data + options) from `window.__GOFISH_SPEC__`
 * and renders it using the GoFish v3 API. For derive operators, calls out
 * to the Python derive server over HTTP instead of AnyWidget RPC.
 *
 * The caller (Playwright) sets __GOFISH_SPEC__ via page.evaluate() and then
 * waits for window.__GOFISH_RENDER_COMPLETE__ to be set to true.
 */

import {
  Chart,
  Layer,
  selectAll,
  spread,
  stack,
  scatter,
  group,
  treemap,
  table,
  log as logOp,
  derive,
  rect,
  circle,
  line,
  area,
  blank,
  ellipse,
  petal,
  text,
  image,
  polygon,
  palette,
  gradient,
  clock,
  polar,
  wavy,
  layer,
  Constraint,
  ref,
  arrow,
  connect,
  over,
  inside,
  xor,
  out,
  atop,
  mask,
  createName,
  Treemap,
  type ChartBuilder,
  type Operator,
  type Mark,
  type Token,
} from "gofish-graphics";
import { Frontend } from "gofish-ir";

// Combinator-form factory map. Each entry takes (opts, marks) and returns
// a Mark. JS storybook uses these directly via the dual-mode operator
// overloads; the harness mirrors that shape.
const COMBINATOR_FACTORIES: Record<
  string,
  (opts: Record<string, any>, marks: Mark<any>[]) => Mark<any>
> = {
  spread: (opts, marks) => spread(opts, marks) as unknown as Mark<any>,
  // stack/scatter/group/table are dual-mode operators (createOperator) whose
  // `(opts, marks)` overload yields a combinator-form Mark — Python emits the
  // matching `__combinator: true` IR (e.g. the v1 `stackX`/`stackY` ports).
  stack: (opts, marks) => stack(opts, marks) as unknown as Mark<any>,
  scatter: (opts, marks) => scatter(opts, marks) as unknown as Mark<any>,
  group: (opts, marks) => group(opts, marks) as unknown as Mark<any>,
  table: (opts, marks) => table(opts, marks) as unknown as Mark<any>,
  layer: (opts, marks) => layer(opts, marks) as unknown as Mark<any>,
  arrow: (opts, marks) => arrow(opts, marks) as unknown as Mark<any>,
  connect: (opts, marks) => connect(opts, marks) as unknown as Mark<any>,
  treemap: (opts, marks) => Treemap(opts, marks) as unknown as Mark<any>,
  over: (opts, marks) => over(opts, marks) as unknown as Mark<any>,
  inside: (opts, marks) => inside(opts, marks) as unknown as Mark<any>,
  xor: (opts, marks) => xor(opts, marks) as unknown as Mark<any>,
  out: (opts, marks) => out(opts, marks) as unknown as Mark<any>,
  atop: (opts, marks) => atop(opts, marks) as unknown as Mark<any>,
  mask: (opts, marks) => mask(opts, marks) as unknown as Mark<any>,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Derived from the canonical frontend-IR schema rather than re-declared, so the
// harness can't drift from the `{ type: "select" }` arm of `Frontend.DataIR`.
type SelectDataSpec = Extract<Frontend.DataIR, { type: "select" }>;

interface ChartHarnessSpec {
  data: Record<string, any>[] | SelectDataSpec | null;
  operators: OperatorSpec[];
  mark: MarkSpec;
  options: Record<string, any>;
  zOrder?: number | null;
}

interface SingleChartHarnessSpec extends ChartHarnessSpec {
  type?: undefined;
  deriveServerUrl?: string;
}

interface LayerHarnessSpec {
  type: "layer";
  charts: ChartHarnessSpec[];
  options: Record<string, any>;
  deriveServerUrl?: string;
}

interface RawMarkHarnessSpec {
  type: "raw-mark";
  mark: MarkSpec;
  options: Record<string, any>;
  deriveServerUrl?: string;
}

type HarnessSpec =
  | SingleChartHarnessSpec
  | LayerHarnessSpec
  | RawMarkHarnessSpec;

interface OperatorSpec {
  type: string;
  lambdaId?: string;
  [key: string]: any;
}

interface ConstraintSpec {
  type: "align" | "distribute" | "zAbove" | "zBelow";
  // Positioning constraints carry `options`; z-order constraints don't.
  options?: Record<string, any>;
  refs: string[];
}

interface MarkSpec {
  type: string;
  name?: string;
  __combinator?: boolean;
  options?: Record<string, any>;
  children?: MarkSpec[];
  constraints?: ConstraintSpec[];
  [key: string]: any;
}

/**
 * Build the async arrow that swaps in for a `{__gofish_lambda: id}`
 * sentinel. The arrow is called by the JS-side mark factory (e.g. by
 * `inferRaw` for `text({text: ...})`); its body posts the per-row datum
 * to the same `/derive/<id>` endpoint user-authored derive operators use,
 * receives the lambda's result, and returns it.
 *
 * The lambda is registered server-side during `/load` (see
 * `derive-server.py`'s `_collect_mark_lambdas` walk).
 */
function makeLambdaAccessor(
  lambdaId: string,
  deriveServerUrl: string | undefined
) {
  if (!deriveServerUrl) {
    throw new Error(
      `lambda accessor ${lambdaId} requires deriveServerUrl on the spec`
    );
  }
  return async (d: any) => {
    const resp = await fetch(`${deriveServerUrl}/derive/${lambdaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([d]),
    });
    if (!resp.ok) {
      throw new Error(
        `lambda accessor ${lambdaId} failed: ${resp.status} ${await resp.text()}`
      );
    }
    const result = await resp.json();
    if (Array.isArray(result)) {
      if (result.length === 0) {
        console.warn(
          `lambda accessor ${lambdaId} returned an empty array; ` +
            `did the Python lambda raise or return None? Surfacing as null.`
        );
        return null;
      }
      return result[0];
    }
    return result;
  };
}

/**
 * Walk an arbitrary value and resolve Python-emitted lambda sentinels.
 * - `{__gofish_lambda: id}` → an `async (d) => fetch /derive/<id>` arrow.
 *
 * Python's `datum(x)` emits the canonical `{type: "datum", datum: x}`
 * shape directly, so no unwrap is needed for per-row values.
 */
function unwrapMarkOpts(value: any, deriveServerUrl: string | undefined): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((v) => unwrapMarkOpts(v, deriveServerUrl));
  if (typeof value.__gofish_lambda === "string") {
    return makeLambdaAccessor(value.__gofish_lambda, deriveServerUrl);
  }
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(value)) {
    out[k] = unwrapMarkOpts(val, deriveServerUrl);
  }
  return out;
}

/** Backwards-compatible alias for callsites that pre-date the lambda
 * sentinel. New code should pass `deriveServerUrl` and use
 * `unwrapMarkOpts` directly. */
function unwrapValues(value: any): any {
  return unwrapMarkOpts(value, undefined);
}

/**
 * Per-render Token resolver. Python emits hygienic-name tokens as
 * `{__gofish_token: <uuid>, __tag: <tag>}` sentinels — first sighting
 * mints a JS `createName(tag)` Token; subsequent sightings of the same
 * uuid reuse it so all `.name(token)` / `ref(token).x` callsites refer
 * to the same JS Token within a single render.
 */
type TokenSentinel = { __gofish_token: string; __tag: string };
type TokenResolver = (s: TokenSentinel) => Token;

function makeTokenResolver(): TokenResolver {
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

function isTokenSentinel(v: any): v is TokenSentinel {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.__gofish_token === "string" &&
    typeof v.__tag === "string"
  );
}

/**
 * Wrap a Mark so its resolved GoFishNode gets `.scope()` called on it —
 * matches what JS `createMark` does for any component-defined mark. The
 * Python wrapper's `@mark` decorator flags its output with `__scope: true`;
 * this wrapper does the post-resolve call.
 *
 * The inner mark may be a `NameableMark`/`ConstrainableMark` (which has
 * `.name` / `.label` / `.render` / `.constrain` properties); forward all
 * of these so callers can still chain or directly `.render()` a scoped
 * combinator-form mark used at the raw-mark level.
 */
function wrapWithScope(inner: any): any {
  const wrapped: any = async (data: any, key: any, layerContext: any) => {
    const node: any = await Promise.resolve(inner(data, key, layerContext));
    // Match JS `createMark`'s post-resolve sequence: stamp datum, then
    // declare a scope boundary. Layout reads `node.datum` during some
    // bbox / inferRaw passes — missing the stamp shifts text positions
    // by a pixel or two in the python-tutor stories. We skip the
    // `node.name(key)` step JS createMark does because (a) the harness's
    // mapMark already chains `.name(spec.name)` when set, and (b) calling
    // `.name("")` on a nested combinator child disrupts layer-context
    // registration when the parent expects un-named children.
    if (node) {
      node.datum = data;
      if (typeof node.scope === "function") {
        node.scope();
      }
      // Match JS `createMark`: the composite is an opaque unit. Ref-name
      // resolution and z-order flattening both stop at `_isComponent`,
      // which is otherwise only set by `createMark` itself. Without this,
      // an inner `layer` produced by a Python `@mark`-decorated function
      // would be transparent — flattenForZOrder would descend into it and
      // emit its children as separate paint items.
      node._isComponent = true;
    }
    return node;
  };
  // `Function.prototype.name` and other built-ins are read-only — use
  // defineProperty to override them on the wrapper function.
  const define = (key: string, value: any) =>
    Object.defineProperty(wrapped, key, {
      value,
      writable: true,
      configurable: true,
    });
  if (typeof inner.render === "function") {
    define("render", async (container: any, options: any) => {
      const node: any = await wrapped(undefined, undefined, undefined);
      return node.render(container, options);
    });
  }
  for (const key of ["name", "label", "constrain"] as const) {
    if (typeof inner[key] === "function") {
      define(key, (...args: any[]) => wrapWithScope(inner[key](...args)));
    }
  }
  return wrapped;
}

declare global {
  interface Window {
    __GOFISH_SPEC__: HarnessSpec | null;
    __GOFISH_RENDER_COMPLETE__: boolean;
    __GOFISH_RENDER_ERROR__: string | null;
    __renderChart__: (spec: HarnessSpec) => void;
  }
}

// ---------------------------------------------------------------------------
// Operator mapping (mirrors widget-src/index.ts but uses HTTP for derive)
// ---------------------------------------------------------------------------

function mapOperator(
  op: OperatorSpec,
  deriveServerUrl?: string
): Operator<any, any> | null {
  const { type, ...opts } = op;

  switch (type) {
    case "derive": {
      const lambdaId = opts.lambdaId;
      if (!lambdaId) throw new Error("derive operator missing lambdaId");
      if (!deriveServerUrl)
        throw new Error("derive operator requires deriveServerUrl");

      return derive(async (d: any) => {
        const rows = Array.isArray(d) ? d : d == null ? [] : [d];
        if (rows.length === 0) return Array.isArray(d) ? d : (d ?? null);

        const resp = await fetch(`${deriveServerUrl}/derive/${lambdaId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rows),
        });

        if (!resp.ok) {
          throw new Error(
            `Derive server error: ${resp.status} ${await resp.text()}`
          );
        }

        const result = await resp.json();
        return Array.isArray(d) ? result : (result[0] ?? null);
      });
    }
    // Modern v3 operators all take a single options object with `by`,
    // `dir`, etc. as keyword args. The previous `field`-positional shape
    // was stale and silently miscalled most ops.
    case "spread":
      return spread(opts as any);
    case "stack":
      return stack(opts as any);
    case "group":
      return group(opts as any);
    case "scatter":
      return scatter(opts as any);
    case "table":
      return table(opts as any);
    case "treemap":
      return treemap(opts as any);
    case "log":
      return logOp(opts.label);
    default:
      console.warn(`Unknown operator type: ${type}`);
      return null;
  }
}

const MARK_MAP: Record<string, (opts: Record<string, any>) => Mark<any>> = {
  rect: (opts) => rect(opts),
  circle: (opts) => circle(opts),
  line: (opts) => line(opts),
  area: (opts) => area(opts),
  blank: (opts) => blank(opts),
  ellipse: (opts) => ellipse(opts),
  petal: (opts) => petal(opts),
  text: (opts) => text(opts),
  image: (opts) => image(opts),
  polygon: (opts) => polygon(opts as any) as unknown as Mark<any>,
};

/** Resolve a `.name` field that's either a string or a token sentinel. */
function resolveNameField(
  rawName: any,
  resolveToken: TokenResolver
): string | Token | undefined {
  if (rawName == null) return undefined;
  if (isTokenSentinel(rawName)) return resolveToken(rawName);
  return rawName;
}

/** Resolve a `ref(...)` spec into a JS GoFishRef. Accepts string,
 *  string-array, or array containing token sentinels. */
function resolveRefSelection(selection: any, resolveToken: TokenResolver): any {
  if (typeof selection === "string") return selection;
  if (Array.isArray(selection)) {
    return selection.map((seg) =>
      isTokenSentinel(seg) ? resolveToken(seg) : seg
    );
  }
  return selection;
}

function mapMark(
  spec: MarkSpec,
  deriveServerUrl: string | undefined,
  resolveToken: TokenResolver
): Mark<any> {
  // Mark-as-function: Python registered a `(data) -> ChartBuilder` lambda
  // in the derive-server registry. The JS Mark fetches a chart IR per
  // invocation and rebuilds a ChartBuilder JS-side; `resolveMarkResult`
  // already accepts ChartBuilders as mark results. We memoize the
  // ChartBuilder per data-key since the gofish runtime may resolve the
  // same mark multiple times during a render (measurement + placement)
  // and each RPC round-trip is expensive over localhost HTTP.
  if (spec.type === "mark-fn") {
    const lambdaId = spec.lambdaId as string;
    if (!deriveServerUrl) {
      throw new Error(
        `mark-fn ${lambdaId} requires deriveServerUrl on the spec`
      );
    }
    const cache = new Map<string, Promise<any>>();
    return (async (data: any, _key: any, _layerContext: any) => {
      const cacheKey = JSON.stringify(data);
      let entry = cache.get(cacheKey);
      if (!entry) {
        entry = (async () => {
          const resp = await fetch(`${deriveServerUrl}/derive/${lambdaId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!resp.ok) {
            throw new Error(
              `mark-fn ${lambdaId} failed: ${resp.status} ${await resp.text()}`
            );
          }
          const result = await resp.json();
          const chartSpec = Array.isArray(result) ? result[0] : result;
          return buildChartFromSpec(chartSpec, deriveServerUrl, resolveToken);
        })();
        cache.set(cacheKey, entry);
      }
      return entry;
    }) as Mark<any>;
  }

  // Leaf-form `ref(name)`: not a combinator, not a mark factory. JS's
  // `ref(...)` returns a GoFishRef the runtime accepts wherever a mark
  // child is expected. Selection may be a string (flat name), an array
  // (for `ref(token).foo[2].bar` proxy navigation), or contain token
  // sentinels that need resolving.
  if (spec.type === "ref" && !spec.__combinator) {
    return ref(
      resolveRefSelection(spec.selection, resolveToken)
    ) as unknown as Mark<any>;
  }

  // Combinator-form marks: a layout operator (`spread`, `layer`, or
  // `arrow`) used as a mark, with explicit nested children instead of
  // repeating a single mark across data. Python emits `{type,
  // __combinator: true, options, children, name?, label?, constraints?}`;
  // rebuild it by calling the JS operator's `(opts, marks)` overload,
  // then chain `.constrain(...)` if present.
  if (spec.__combinator) {
    const childMarks = (spec.children ?? []).map((c) =>
      mapMark(c, deriveServerUrl, resolveToken)
    );
    // Resolve color/coord configs too — e.g. a `layer({coord: polar()})`
    // carries its coord transform in the combinator options (BalloonChart,
    // FlowerChart), not chart options.
    const opts = resolveOptions(
      unwrapMarkOpts(spec.options ?? {}, deriveServerUrl)
    );
    const factory = COMBINATOR_FACTORIES[spec.type];
    if (!factory) {
      throw new Error(`Unknown combinator mark type: ${spec.type}`);
    }
    let mark = factory(opts, childMarks);
    // Constraint chain. The Python side serializes refs by name; reify the
    // JS-side ConstraintRef objects from those names by looking them up in
    // the `refs` map the JS callback receives.
    if (spec.constraints && typeof (mark as any).constrain === "function") {
      const constraints = spec.constraints;
      mark = (mark as any).constrain((refs: Record<string, any>) =>
        constraints.map((c) => {
          // JS positioning constraints take (options, refs); z-order
          // constraints (`zAbove` / `zBelow`) take two refs directly.
          if (c.type === "zAbove" || c.type === "zBelow") {
            return (Constraint as any)[c.type](
              ...c.refs.map((name) => refs[name])
            );
          }
          // Align/distribute: Python surfaces refs-first ergonomically
          // (`Constraint.align([a,b], x=...)`) but serializes to the same
          // `{options, refs}` IR. See
          // packages/gofish-graphics/src/ast/constraints/index.ts.
          return (Constraint as any)[c.type](
            c.options,
            c.refs.map((name) => refs[name])
          );
        })
      );
    }
    // `@mark`-decorated components flag their output for a
    // `node.scope()` post-resolution pass — wrap before applying name.
    if (spec.__scope) {
      mark = wrapWithScope(mark);
    }
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

  const { type, name: layerName, label, ...opts } = spec;
  const factory = MARK_MAP[type];
  if (!factory) throw new Error(`Unknown mark type: ${type}`);

  // `label: true` (boolean) is a primitive kwarg the mark itself understands
  // (auto-value labels). The Python Mark.label() chain emits a structured
  // `{accessor, position?, fontSize?, ...}` dict that must be reapplied as a
  // chained `.label(accessor, options)` call — same shape the JS storybook
  // uses (e.g. `rect({h: "count"}).label("count", {position: "outset"})`).
  const isStructuredLabel =
    label && typeof label === "object" && !Array.isArray(label);
  const factoryOpts: Record<string, any> = unwrapMarkOpts(
    isStructuredLabel
      ? opts
      : { ...opts, ...(label !== undefined ? { label } : {}) },
    deriveServerUrl
  );

  let mark = factory(factoryOpts);
  if (isStructuredLabel && typeof (mark as any).label === "function") {
    const { accessor, ...labelOpts } = label as { accessor: any } & Record<
      string,
      any
    >;
    mark = (mark as any).label(accessor, labelOpts);
  }
  if (spec.__scope) {
    mark = wrapWithScope(mark);
  }
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
  // `bind_data(d, key)` (Treemap-style) pre-binds a datum so the JS-side
  // mark factory is invoked as `mark(d, key)`. Wrap last so name/label
  // chains take effect on the underlying mark first.
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
 * Resolve color / coord configs the same way the widget bundle does.
 * Python emits a tagged dict (`{_tag: "palette", values}` etc.) so the
 * spec can be JSON-serialized; here we turn those tags back into real
 * function calls before passing the options to gofish.
 */
function resolveOptions(
  raw: Record<string, any> | undefined
): Record<string, any> {
  const resolved: Record<string, any> = { ...(raw ?? {}) };
  if (
    resolved.color &&
    typeof resolved.color === "object" &&
    "_tag" in resolved.color
  ) {
    if (resolved.color._tag === "palette") {
      resolved.color = palette(resolved.color.values);
    } else if (resolved.color._tag === "gradient") {
      resolved.color = gradient(resolved.color.stops);
    }
  }
  if (
    resolved.coord &&
    typeof resolved.coord === "object" &&
    "type" in resolved.coord
  ) {
    if (resolved.coord.type === "clock") {
      resolved.coord = clock();
    } else if (resolved.coord.type === "polar") {
      resolved.coord = polar();
    } else if (resolved.coord.type === "wavy") {
      resolved.coord = wavy();
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Build a single ChartBuilder from a chart spec, resolving select-data
 * references via `ref(layerName)` / `selectAll(layerName)` like the widget
 * bundle does.
 */
function buildChartFromSpec(
  chartSpec: ChartHarnessSpec,
  deriveServerUrl: string | undefined,
  resolveToken: TokenResolver
): ChartBuilder<any, any> {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of chartSpec.operators || []) {
    const op = mapOperator(opSpec, deriveServerUrl);
    if (op) operators.push(op);
  }
  const mark = mapMark(chartSpec.mark, deriveServerUrl, resolveToken);
  const chartOpts = resolveOptions(chartSpec.options || {});

  // Unwrap the canonical DataIR shapes. The wire formats are:
  //   - { type: "inline", rows: [...] } → use the rows directly
  //   - { type: "select", layer: name, mode } → resolve against the layer
  //     registry: mode "all" → selectAll(layer), otherwise → ref(layer)
  //   - null / array (legacy) → treat as bare rows
  let chartData: any = chartSpec.data;
  if (chartData && typeof chartData === "object" && !Array.isArray(chartData)) {
    if ((chartData as SelectDataSpec).type === "select") {
      const sel = chartData as SelectDataSpec;
      chartData = sel.mode === "all" ? selectAll(sel.layer) : ref(sel.layer);
    } else if ((chartData as any).type === "inline") {
      chartData = (chartData as any).rows;
    }
  }

  let builder = Chart(chartData, chartOpts)
    .flow(...operators)
    .mark(mark);
  if (chartSpec.zOrder !== undefined && chartSpec.zOrder !== null) {
    builder = builder.zOrder(chartSpec.zOrder);
  }
  return builder;
}

function renderChart(spec: HarnessSpec) {
  const container = document.getElementById("gofish-harness-root");
  if (!container) {
    window.__GOFISH_RENDER_ERROR__ = "Container not found";
    window.__GOFISH_RENDER_COMPLETE__ = true;
    return;
  }

  // Fresh per-render Token cache so Python's `createName(...)` UUIDs map
  // to the same JS Token everywhere they appear in this spec.
  const resolveToken = makeTokenResolver();

  // Wrap the render path in an async IIFE so we can `await` each path's
  // gofish `.render()` (Promise-returning since `inferRaw` went async and
  // RPC-based mark-fns/lambda-accessors layer on top). Without awaiting,
  // `__GOFISH_RENDER_COMPLETE__` would fire while the DOM is still being
  // mutated, and Playwright's screenshot times out waiting for the element
  // to stabilize. (Font-readiness gating now lives inside gofish itself,
  // `packages/gofish-graphics/src/ast/gofish.tsx`, so the harness doesn't
  // need its own `document.fonts.ready` await.)
  (async () => {
    try {
      if (spec.type === "raw-mark") {
        const allOpts = spec.options || {};
        const { w, h, axes, debug } = allOpts;
        const mark = mapMark(
          spec.mark,
          spec.deriveServerUrl,
          resolveToken
        ) as any;
        await mark.render(container, {
          w,
          h,
          axes: axes ?? false,
          debug: debug ?? false,
        });
      } else if (spec.type === "layer") {
        // Layer-level options: w/h/axes/debug are render options; the rest
        // (coord, color) become Layer's chart-level options.
        const layerAll = spec.options || {};
        const { w, h, axes, debug, ...layerOptsRaw } = layerAll;
        const layerOpts = resolveOptions(layerOptsRaw);

        const childCharts = spec.charts.map((c) =>
          buildChartFromSpec(c, spec.deriveServerUrl, resolveToken)
        );

        const layerNode =
          Object.keys(layerOpts).length > 0
            ? Layer(layerOpts as any, childCharts)
            : Layer(childCharts);

        await layerNode.render(container, {
          w,
          h,
          axes: axes ?? false,
          debug: debug ?? false,
        } as any);
      } else {
        // Single-chart path. Only w/h/debug are render options; rest are chart-level.
        const allOpts = spec.options || {};
        const { w, h, debug, ...chartOptsRaw } = allOpts;
        const node = buildChartFromSpec(
          {
            data: spec.data,
            operators: spec.operators,
            mark: spec.mark,
            options: chartOptsRaw,
            zOrder: spec.zOrder ?? null,
          },
          spec.deriveServerUrl,
          resolveToken
        );

        await node.render(container, {
          w,
          h,
          debug: debug ?? false,
        } as any);
      }

      // Allow a tick for SolidJS to flush renders.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      window.__GOFISH_RENDER_COMPLETE__ = true;
    } catch (err) {
      window.__GOFISH_RENDER_ERROR__ =
        err instanceof Error ? err.message : String(err);
      window.__GOFISH_RENDER_COMPLETE__ = true;
    }
  })();
}

// Expose globally so Playwright can call it
window.__renderChart__ = renderChart;
window.__GOFISH_RENDER_COMPLETE__ = false;
window.__GOFISH_RENDER_ERROR__ = null;

// If spec is already set (e.g., via inline script), render immediately
if (window.__GOFISH_SPEC__) {
  renderChart(window.__GOFISH_SPEC__);
}
