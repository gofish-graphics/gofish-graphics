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
  type Operator,
  type Mark,
} from "gofish-graphics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HarnessSpec {
  data: Record<string, any>[];
  operators: OperatorSpec[];
  mark: MarkSpec;
  options: Record<string, any>;
  deriveServerUrl?: string;
}

interface OperatorSpec {
  type: string;
  lambdaId?: string;
  [key: string]: any;
}

interface MarkSpec {
  type: string;
  [key: string]: any;
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

function mapMark(spec: MarkSpec): Mark<any> {
  const { type, ...opts } = spec;
  const factory = MARK_MAP[type];
  if (!factory) throw new Error(`Unknown mark type: ${type}`);
  return factory(opts);
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

function renderChart(spec: HarnessSpec) {
  const container = document.getElementById("gofish-harness-root");
  if (!container) {
    window.__GOFISH_RENDER_ERROR__ = "Container not found";
    window.__GOFISH_RENDER_COMPLETE__ = true;
    return;
  }

  try {
    const operators: Operator<any, any>[] = [];
    for (const opSpec of spec.operators || []) {
      const op = mapOperator(opSpec, spec.deriveServerUrl);
      if (op) operators.push(op);
    }

    const mark = mapMark(spec.mark);

    // Pull render options out and pass the rest to Chart() as chart-level
    // options (color, coord, etc.). Forward `w`/`h` *as-is* — including
    // when they're undefined — so the rect default-width fallback path is
    // exercised the same way it is in JS Storybook.
    const allOpts = spec.options || {};
    const { w, h, axes, debug, ...chartOptsRaw } = allOpts;
    const chartOpts = resolveOptions(chartOptsRaw);

    const builder = Chart(spec.data, chartOpts);
    const node = builder.flow(...operators).mark(mark);

    node.render(container, {
      w,
      h,
      axes: axes ?? false,
      debug: debug ?? false,
    } as any);

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
