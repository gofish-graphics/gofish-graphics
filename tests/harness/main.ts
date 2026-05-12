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
  select,
  spread,
  stack,
  scatter,
  group,
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
  palette,
  gradient,
  clock,
  v,
  layer,
  Constraint,
  ref,
  arrow,
  over,
  inside,
  xor,
  out,
  atop,
  mask,
  type ChartBuilder,
  type Operator,
  type Mark,
} from "gofish-graphics";

// Combinator-form factory map. Each entry takes (opts, marks) and returns
// a Mark. JS storybook uses these directly via the dual-mode operator
// overloads; the harness mirrors that shape.
const COMBINATOR_FACTORIES: Record<
  string,
  (opts: Record<string, any>, marks: Mark<any>[]) => Mark<any>
> = {
  spread: (opts, marks) => spread(opts, marks) as unknown as Mark<any>,
  layer: (opts, marks) => layer(opts, marks) as unknown as Mark<any>,
  arrow: (opts, marks) => arrow(opts, marks) as unknown as Mark<any>,
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

interface SelectDataSpec {
  type: "select";
  layer: string;
}

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
  type: "align" | "distribute";
  options: Record<string, any>;
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
    return Array.isArray(result) ? result[0] : result;
  };
}

/**
 * Walk an arbitrary value and resolve Python-emitted sentinels:
 * - `{__gofish_v: field}` → `v(field)` call (literal-value wrapper).
 * - `{__gofish_lambda: id}` → an `async (d) => fetch /derive/<id>` arrow.
 *
 * Python uses sentinels because dict-only IR has no way to author a
 * function call; the harness rebuilds them before handing props to JS.
 */
function unwrapMarkOpts(value: any, deriveServerUrl: string | undefined): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((v) => unwrapMarkOpts(v, deriveServerUrl));
  if ("__gofish_v" in value) return v(value.__gofish_v);
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
};

function mapMark(spec: MarkSpec, deriveServerUrl?: string): Mark<any> {
  // Leaf-form `ref(name)`: not a combinator, not a mark factory. JS's
  // `ref(...)` returns a GoFishRef the runtime accepts wherever a mark
  // child is expected. Cast to Mark<any> for the typed mapMark signature.
  if (spec.type === "ref" && !spec.__combinator) {
    return ref(spec.selection as string) as unknown as Mark<any>;
  }

  // Combinator-form marks: a layout operator (`spread`, `layer`, or
  // `arrow`) used as a mark, with explicit nested children instead of
  // repeating a single mark across data. Python emits `{type,
  // __combinator: true, options, children, name?, label?, constraints?}`;
  // rebuild it by calling the JS operator's `(opts, marks)` overload,
  // then chain `.constrain(...)` if present.
  if (spec.__combinator) {
    const childMarks = (spec.children ?? []).map((c) =>
      mapMark(c, deriveServerUrl)
    );
    const opts = unwrapMarkOpts(spec.options ?? {}, deriveServerUrl);
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
        constraints.map((c) =>
          (Constraint as any)[c.type](
            c.options,
            c.refs.map((name) => refs[name])
          )
        )
      );
    }
    if (spec.name && typeof (mark as any).name === "function") {
      mark = (mark as any).name(spec.name);
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
  if (layerName && typeof (mark as any).name === "function") {
    mark = (mark as any).name(layerName);
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
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Build a single ChartBuilder from a chart spec, resolving select-data
 * references via `select(layerName)` like the widget bundle does.
 */
function buildChartFromSpec(
  chartSpec: ChartHarnessSpec,
  deriveServerUrl: string | undefined
): ChartBuilder<any, any> {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of chartSpec.operators || []) {
    const op = mapOperator(opSpec, deriveServerUrl);
    if (op) operators.push(op);
  }
  const mark = mapMark(chartSpec.mark, deriveServerUrl);
  const chartOpts = resolveOptions(chartSpec.options || {});

  let chartData: any = chartSpec.data;
  if (
    chartData &&
    typeof chartData === "object" &&
    !Array.isArray(chartData) &&
    (chartData as SelectDataSpec).type === "select"
  ) {
    chartData = select((chartData as SelectDataSpec).layer);
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

  try {
    if (spec.type === "raw-mark") {
      // Bypass the Chart wrapper entirely: the mark renders itself directly.
      // Mirrors JS storybook spelling `spread(opts, [marks]).render(...)`,
      // which produces a noticeably different DOM shape than going through
      // Chart (Chart adds an identity-transform Frame wrapper that JS-side
      // direct renders skip).
      const allOpts = spec.options || {};
      const { w, h, axes, debug } = allOpts;
      const mark = mapMark(spec.mark, spec.deriveServerUrl) as any;
      mark.render(container, {
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
        buildChartFromSpec(c, spec.deriveServerUrl)
      );

      const layerNode =
        Object.keys(layerOpts).length > 0
          ? Layer(layerOpts as any, childCharts)
          : Layer(childCharts);

      layerNode.render(container, {
        w,
        h,
        axes: axes ?? false,
        debug: debug ?? false,
      } as any);
    } else {
      // Single-chart path. Pull render options out; rest are chart-level.
      const allOpts = spec.options || {};
      const { w, h, axes, debug, ...chartOptsRaw } = allOpts;
      const node = buildChartFromSpec(
        {
          data: spec.data,
          operators: spec.operators,
          mark: spec.mark,
          options: chartOptsRaw,
          zOrder: spec.zOrder ?? null,
        },
        spec.deriveServerUrl
      );

      node.render(container, {
        w,
        h,
        axes: axes ?? false,
        debug: debug ?? false,
      } as any);
    }

    // Allow a tick for SolidJS to flush renders
    requestAnimationFrame(() => {
      window.__GOFISH_RENDER_COMPLETE__ = true;
    });
  } catch (err) {
    window.__GOFISH_RENDER_ERROR__ =
      err instanceof Error ? err.message : String(err);
    window.__GOFISH_RENDER_COMPLETE__ = true;
  }
}

// Expose globally so Playwright can call it
window.__renderChart__ = renderChart;
window.__GOFISH_RENDER_COMPLETE__ = false;
window.__GOFISH_RENDER_ERROR__ = null;

// If spec is already set (e.g., via inline script), render immediately
if (window.__GOFISH_SPEC__) {
  renderChart(window.__GOFISH_SPEC__);
}
