/**
 * The kernel tier (#774): a Python callback that reads a source, through
 * `Serialize.renderIR` and a bridge that answers as Python's `answer` does
 * (gofish-python's `gofish/ast.py`). Covers the round trip: the source
 * values each call ships, the reads its reply names, the chart re-running
 * when a read source changes, a stale reply (a read source changed during
 * the round trip) followed by exactly one re-run with the latest value, and
 * a source only the callback names (declared by the reply, then asked for).
 *
 * Run: `pnpm test:kernel-tier` (builds first; renders the built library
 * under happy-dom, like the interaction tests).
 */
import { settle } from "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { Serialize } = GoFish as any;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ROWS = Array.from({ length: 60 }, (_, i) => ({ mass: i }));

/** `k` bins over the rows, one row per bin (the semantic zoom's binning). */
const binRows = (rows: { mass: number }[], k: number) =>
  Array.from({ length: k }, (_, i) => ({
    bin: String(i),
    count: rows.filter((r) => Math.floor((r.mass * k) / 60) === i).length,
  }));

/** A document like the one Python writes for the semantic zoom: a derive
 *  that reads a wheel, and (with `declared`) the wheel in the `sources`
 *  table because a caption reads it too. */
function semanticZoom(declared: boolean): any {
  const chartIR = {
    type: "chart",
    data: { type: "table", id: "t0" },
    operators: [
      { type: "derive", lambdaId: "bin" },
      { type: "spread", by: "bin", dir: "x" },
    ],
    mark: { type: "rect", h: "count" },
  };
  const wheel = { kind: "wheel", range: [3, 40], initial: 12, round: true };
  return {
    irVersion: 0,
    ir: "gofish-frontend",
    root: chartIR,
    tables: { t0: ROWS },
    ...(declared ? { sources: { s0: wheel } } : {}),
    __wheel: wheel,
  };
}

/** A bridge that answers as Python does: the callback reads `s0`; with no
 *  shipped value it stops, and the reply declares the source. `gate`, when
 *  set, holds each reply until the test releases it. */
function pythonBridge(declaration: unknown) {
  const calls: Record<string, unknown>[] = [];
  let gate: Promise<void> | undefined;
  let release: (() => void) | undefined;
  const bridge = {
    async call(_lambdaId: string, rows: any[], sources: Record<string, unknown>) {
      calls.push({ ...sources });
      if (gate) await gate;
      const reads = ["s0"];
      const decls = { s0: declaration };
      if (!("s0" in sources))
        return { root: { type: "table", id: "r" }, tables: { r: [] }, reads, sources: decls };
      return {
        root: { type: "table", id: "r" },
        tables: { r: binRows(rows, sources.s0 as number) },
        reads,
        sources: decls,
      };
    },
  };
  return {
    bridge,
    calls,
    hold() {
      gate = new Promise((r) => (release = r));
    },
    open() {
      gate = undefined;
      release?.();
    },
  };
}

/** The bars: the rects as wide as the first one (the spread gives every bar
 *  one width; the axis chrome is drawn with other rects). */
const bars = (c: HTMLElement): number => {
  const rects = [...c.querySelectorAll("rect")];
  const width = (r: Element) => Number(r.getAttribute("width"));
  const w = rects.length > 0 ? width(rects[0]) : NaN;
  return rects.filter((r) => Math.abs(width(r) - w) < 1e-6).length;
};

function wheelTick(c: HTMLElement, deltaY: number): void {
  const W = (globalThis as any).WheelEvent;
  c.querySelector("svg")!.dispatchEvent(
    new W("wheel", { deltaY, bubbles: true, cancelable: true })
  );
}

async function main(): Promise<void> {
  console.log("kernel tier: a Python derive that reads a wheel");
  {
    const doc = semanticZoom(true);
    const py = pythonBridge(doc.__wheel);
    const c = document.createElement("div");
    document.body.appendChild(c);
    await Serialize.renderIR(doc, c, { w: 400, h: 200 }, py.bridge);
    await settle();
    ok("the first call ships the wheel's declared value", py.calls.length === 1 && py.calls[0].s0 === 12, JSON.stringify(py.calls));
    const before = bars(c);

    wheelTick(c, 100);
    await settle();
    ok("a wheel tick re-runs the derive with the new value", py.calls.length === 2 && py.calls[1].s0 === 18, JSON.stringify(py.calls));
    ok("the chart is drawn from the new bins", before === 12 && bars(c) === 18, `${before} -> ${bars(c)}`);

    // Stale: the wheel moves three times while a call is in flight. The
    // reply is used, and the chart re-runs once more, with the latest value.
    py.hold();
    wheelTick(c, 100);
    await settle(3);
    const inFlight = py.calls.length;
    wheelTick(c, 100);
    wheelTick(c, 100);
    py.open();
    await settle(20);
    const after = py.calls.slice(inFlight);
    ok("ticks during a round trip cost one more call, not one per tick", after.length === 1, JSON.stringify(py.calls));
    ok("that call has the latest value", after[0]?.s0 === 37, JSON.stringify(after));
    ok("the chart shows the latest bins", bars(c) === 37, String(bars(c)));
  }

  console.log("kernel tier: a source only the callback names");
  {
    const doc = semanticZoom(false);
    const py = pythonBridge(doc.__wheel);
    const c = document.createElement("div");
    document.body.appendChild(c);
    await Serialize.renderIR(doc, c, { w: 400, h: 200 }, py.bridge);
    await settle();
    ok("the first call ships nothing; the reply declares the source", py.calls.length === 2 && !("s0" in py.calls[0]), JSON.stringify(py.calls));
    ok("the second call ships its declared value", py.calls[1]?.s0 === 12, JSON.stringify(py.calls));
    wheelTick(c, 100);
    await settle();
    ok("the adopted source is read like a declared one", py.calls.at(-1)?.s0 === 18, JSON.stringify(py.calls));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
