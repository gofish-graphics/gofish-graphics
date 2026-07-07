/**
 * Reactive interaction-layer tests. Run: `pnpm test:interaction`
 * (`pnpm build && tsx src/tests/interaction.test.ts` — the rendering tests
 * import the built library so the SVG backend's Solid JSX is compiled by
 * Vite's solid plugin, not tsx/esbuild).
 *
 * Covers: the rAF-coalesced scheduler; `frameScales` affine inversion;
 * static-path purity (no `data-gf-id`, no reactivity when nothing registers);
 * the `live()` paint-patch regime (zero pipeline re-runs); the spec-read
 * regime (`signal()`/`wheel()`/`timer()` read in `derive()` → one coalesced
 * re-run per change); `usedInSpec` reset; pointer hit-testing; the drag
 * lifecycle; and container dispose.
 */
import { settle, nextTick } from "./interactionDomSetup";
// Pure (.ts, no JSX) internals — safe to run through tsx directly.
import { InteractionRuntime } from "../interaction/runtime";
import { invertAffine, frameConversions } from "../interaction/frameScales";
// A RAW Solid signal (not a gofish input) — the component paint-only case proves
// paint reactivity is runtime-independent. dist externalizes solid-js (peer dep),
// so this resolves to the SAME solid instance the built backend tracks.
import { createSignal } from "solid-js";
// The built library: rendering goes through the solid-compiled SVG backend.
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const {
  chart,
  spread,
  rect,
  derive,
  live,
  pointer,
  drag,
  wheel,
  timer,
  signal,
  // The low-level render terminal (`gofish as GoFish`) + a v1 operator, for the
  // component-level (no chart(), no data) reactive cases.
  GoFish: gofish,
  spreadX,
} = GoFish as any;

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

const data = [
  { cat: "a", count: 3 },
  { cat: "b", count: 5 },
  { cat: "c", count: 2 },
];

function makeContainer(): HTMLElement {
  const c = document.createElement("div");
  document.body.appendChild(c);
  return c;
}

/** A real wall-clock delay (ms) — for timer tests that must let a genuine
 *  `setInterval` interval elapse, unlike `settle`'s zero-ms macrotasks. */
const realDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  /* --------------------------- scheduler --------------------------- */
  console.log("\nscheduler");
  {
    const rt = new InteractionRuntime();
    let runs = 0;
    rt.setRerender(async () => {
      runs++;
    });
    // Three synchronous invalidates coalesce into one rAF run.
    rt.invalidate();
    rt.invalidate();
    rt.invalidate();
    ok("invalidate is async (no synchronous run)", runs === 0);
    await settle();
    ok("three coalesced invalidates run once", runs === 1, `runs=${runs}`);

    // latest-wins: an invalidate DURING a run schedules exactly one more run.
    const rt2 = new InteractionRuntime();
    let runs2 = 0;
    let reentered = false;
    rt2.setRerender(async () => {
      runs2++;
      if (!reentered) {
        reentered = true;
        rt2.invalidate(); // fired while running
      }
    });
    rt2.invalidate();
    await settle();
    ok("invalidate while running re-runs once more", runs2 === 2, `runs=${runs2}`);

    const rt3 = new InteractionRuntime();
    ok("no rerender fn → invalidate is inert", (rt3.invalidate(), true));
  }

  /* ------------------------- frameScales --------------------------- */
  console.log("\nframeScales inversion");
  {
    const posScale = (d: number) => d * 2.857142857;
    const toPixelY = (g: number) => 440 - g;
    const dataToPx = (d: number) => toPixelY(posScale(d));
    const pxToData = invertAffine(dataToPx);
    ok(
      "invertAffine round-trips composed affine legs",
      pxToData !== undefined && Math.abs(pxToData(dataToPx(95)) - 95) < 1e-9
    );
    ok("degenerate scale returns undefined", invertAffine(() => 3) === undefined);

    // frameConversions over a recorded frame: data → px → data round-trips.
    const conv = frameConversions({
      items: [],
      toPixel: ([gx, gy]) => [gx + 10, 300 - gy],
      posScales: [(d) => d * 3, (d) => d * 3],
      domains: { x: [0, 100], y: [0, 100] },
      size: { width: 300, height: 300 },
    });
    ok("frameConversions built for continuous axes", conv !== undefined);
    if (conv) {
      ok(
        "data→px→data round-trips (x)",
        Math.abs(conv.pxToData[0](conv.dataToPx[0](42)) - 42) < 1e-9
      );
      ok(
        "data→px→data round-trips (y)",
        Math.abs(conv.pxToData[1](conv.dataToPx[1](42)) - 42) < 1e-9
      );
    }
    ok(
      "frameConversions undefined with no continuous axis",
      frameConversions({
        items: [],
        toPixel: ([gx, gy]) => [gx, gy],
        size: { width: 10, height: 10 },
      }) === undefined
    );

    // Per-axis legs: only the axis with a posScale AND a continuous domain
    // gets a leg. Here x is ordinal (no posScale/domain), y is continuous.
    const perAxis = frameConversions({
      items: [],
      toPixel: ([gx, gy]) => [gx, 300 - gy],
      posScales: [undefined, (d) => d * 3],
      domains: { y: [0, 100] },
      size: { width: 300, height: 300 },
    });
    ok("per-axis conversions built (y only)", perAxis !== undefined);
    if (perAxis) {
      ok("ordinal x has no leg", perAxis.pxToData[0] === undefined);
      ok("continuous y has a leg", typeof perAxis.pxToData[1] === "function");
      ok(
        "y round-trips",
        Math.abs(perAxis.pxToData[1]!(perAxis.dataToPx[1]!(20)) - 20) < 1e-9
      );
    }

    // A degenerate (zero-slope) leg is DROPPED, not thrown — a zero-size axis
    // must not fail the whole render from inside publishFrame.
    let degenThrew = false;
    let degen: ReturnType<typeof frameConversions> | undefined;
    try {
      degen = frameConversions({
        items: [],
        // y collapses to a constant → zero-slope y leg.
        toPixel: ([gx]) => [gx, 42],
        posScales: [(d) => d * 3, (d) => d * 3],
        domains: { x: [0, 100], y: [0, 100] },
        size: { width: 300, height: 300 },
      });
    } catch {
      degenThrew = true;
    }
    ok("degenerate leg does not throw", !degenThrew);
    ok(
      "degenerate y leg dropped, x leg kept",
      degen !== undefined &&
        degen.pxToData[1] === undefined &&
        typeof degen.pxToData[0] === "function"
    );
  }

  /* ----------------------- static-path purity ---------------------- */
  console.log("\nstatic-path purity");
  {
    const container = makeContainer();
    await chart(data, { axes: false })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    const svg = container.querySelector("svg");
    ok("static chart renders an svg", svg !== null);
    ok(
      "static chart has three bars",
      container.querySelectorAll("rect").length === 3,
      String(container.querySelectorAll("rect").length)
    );
    ok(
      "static chart emits NO data-gf-id",
      container.querySelectorAll("[data-gf-id]").length === 0
    );
  }

  /* -------------------- live() paint-patch regime ------------------ */
  console.log("\nlive() regime");
  {
    const container = makeContainer();
    let resolves = 0;
    const hi = signal(false);
    await chart(data, { axes: false })
      // derive counts pipeline runs; it does NOT read `hi`.
      .flow(
        derive((rows: any) => {
          resolves++;
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: live(() => (hi() ? "#f00" : "#00f")) }))
      .render(container, { w: 200, h: 120 });
    await settle();
    ok("initial resolve ran once", resolves === 1, `resolves=${resolves}`);
    const bars = () => Array.from(container.querySelectorAll("rect"));
    ok(
      "live fill renders resolve-time value",
      bars().every((r) => r.getAttribute("fill") === "#00f")
    );
    // live() activates hit-testing (the signal wires no input, but the runtime
    // is active because a live channel exists only when something registered —
    // here nothing else does, so data-gf-id may be absent; the paint patch
    // works regardless).
    hi.set(true);
    await nextTick();
    ok(
      "signal write patches the DOM attribute",
      bars().every((r) => r.getAttribute("fill") === "#f00"),
      bars().map((r) => r.getAttribute("fill")).join(",")
    );
    ok("live paint patch caused ZERO re-runs", resolves === 1, `resolves=${resolves}`);
    hi.set(false);
    await nextTick();
    ok(
      "signal write patches back",
      bars().every((r) => r.getAttribute("fill") === "#00f")
    );
    ok("still zero re-runs", resolves === 1, `resolves=${resolves}`);
  }

  /* ---------------------- spec-read regime ------------------------- */
  console.log("\nspec-read regime (signal in derive)");
  {
    const container = makeContainer();
    let resolves = 0;
    const s = signal(1);
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          resolves++;
          s(); // read in spec → pipeline dependency
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    ok("initial resolve", resolves === 1, `resolves=${resolves}`);
    s.set(2);
    await settle();
    ok("one write → one re-run", resolves === 2, `resolves=${resolves}`);
    // Coalescing: two writes in the same tick → a single re-run.
    s.set(3);
    s.set(4);
    await settle();
    ok("two coalesced writes → one re-run", resolves === 3, `resolves=${resolves}`);
  }

  console.log("\nspec-read regime (wheel + input read only in live)");
  {
    const container = makeContainer();
    let resolves = 0;
    const bins = wheel({ range: [3, 40], initial: 12, round: true });
    const liveOnly = signal("#00f");
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          resolves++;
          bins(); // spec read → dependency
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: live(() => liveOnly()) }))
      .render(container, { w: 200, h: 120 });
    await settle();
    ok("initial resolve", resolves === 1, `resolves=${resolves}`);
    bins.set(20);
    await settle();
    ok("wheel.set in spec → one re-run", resolves === 2, `resolves=${resolves}`);
    // An input read ONLY inside live() never invalidates.
    liveOnly.set("#0f0");
    await settle();
    ok(
      "live-only signal write → no re-run",
      resolves === 2,
      `resolves=${resolves}`
    );
    ok(
      "live-only signal still patches paint",
      Array.from(container.querySelectorAll("rect")).every(
        (r) => r.getAttribute("fill") === "#0f0"
      )
    );
  }

  console.log("\nshared input across two charts");
  {
    // One signal() read in TWO charts' derive() must invalidate BOTH on set()
    // (regression: a single-runtime input only re-ran the last-attached chart).
    const containerA = makeContainer();
    const containerB = makeContainer();
    let resolvesA = 0;
    let resolvesB = 0;
    const shared = signal(1);
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          resolvesA++;
          shared();
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(containerA, { w: 200, h: 120 });
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          resolvesB++;
          shared();
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#0a0" }))
      .render(containerB, { w: 200, h: 120 });
    await settle();
    ok(
      "both charts resolved once initially",
      resolvesA === 1 && resolvesB === 1,
      `A=${resolvesA} B=${resolvesB}`
    );
    shared.set(2);
    await settle();
    ok(
      "one set() re-runs BOTH charts that read the shared signal",
      resolvesA === 2 && resolvesB === 2,
      `A=${resolvesA} B=${resolvesB}`
    );
  }

  /* ----------------------- usedInSpec reset ------------------------ */
  console.log("\nusedInSpec reset");
  {
    const container = makeContainer();
    let resolves = 0;
    const toggle = signal(true);
    const value = signal(1);
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          resolves++;
          if (toggle()) value(); // value read only while toggle is true
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    ok("initial resolve", resolves === 1, `resolves=${resolves}`);
    value.set(2);
    await settle();
    ok("value read in spec → re-runs", resolves === 2, `resolves=${resolves}`);
    // Stop reading `value` in the next resolve.
    toggle.set(false);
    await settle();
    ok("toggle write re-runs", resolves === 3, `resolves=${resolves}`);
    // Now `value` was NOT read in the last resolve → its writes no longer
    // invalidate.
    value.set(3);
    await settle();
    ok(
      "value no longer read → its write is inert",
      resolves === 3,
      `resolves=${resolves}`
    );
  }

  /* ---------------------- pointer hit-testing ---------------------- */
  console.log("\npointer hit-test → datum()");
  {
    const container = makeContainer();
    let resolves = 0;
    const p = pointer();
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          resolves++;
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(
        rect({
          h: "count",
          // Reference equality: a bar's live thunk is bound to its node datum,
          // which is the very object `pointer().datum()` returns on hit-test.
          fill: live((d: any) => (d === p.datum() ? "#f00" : "#00f")),
        })
      )
      .render(container, { w: 200, h: 120 });
    await settle();
    const bars = () => Array.from(container.querySelectorAll("rect"));
    ok(
      "pointer chart emits data-gf-id (runtime active)",
      container.querySelectorAll("[data-gf-id]").length === 3
    );
    ok("all bars start blue", bars().every((r) => r.getAttribute("fill") === "#00f"));

    // Hover the second bar: dispatch a bubbling pointermove on it.
    const target = bars()[1];
    target.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: 5,
        clientY: 5,
        bubbles: true,
      })
    );
    await nextTick();
    ok(
      "hovered bar's datum drives its live fill",
      bars()[1].getAttribute("fill") === "#f00" &&
        bars()[0].getAttribute("fill") === "#00f" &&
        bars()[2].getAttribute("fill") === "#00f",
      bars().map((r) => r.getAttribute("fill")).join(",")
    );
    ok("hover caused zero re-runs", resolves === 1, `resolves=${resolves}`);
  }

  /* ------------------------- drag lifecycle ------------------------ */
  console.log("\ndrag lifecycle");
  {
    const container = makeContainer();
    const dr = drag();
    await chart(data, { axes: false })
      // Read drag.active() inside live() so the input registers + attaches.
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: live(() => (dr.active() ? "#f00" : "#00f")) }))
      .render(container, { w: 200, h: 120 });
    await settle();
    const svg = container.querySelector("svg") as any;
    ok("drag inactive initially", dr.active() === false);

    const P = (globalThis as any).PointerEvent;
    svg.dispatchEvent(new P("pointerdown", { clientX: 10, clientY: 10, bubbles: true }));
    ok("drag active after pointerdown", dr.active() === true);
    ok(
      "origin captured",
      dr.origin()?.x === 10 && dr.origin()?.y === 10,
      JSON.stringify(dr.origin())
    );
    svg.dispatchEvent(new P("pointermove", { clientX: 35, clientY: 22, bubbles: true }));
    ok(
      "delta tracks the move",
      dr.delta()?.x === 25 && dr.delta()?.y === 12,
      JSON.stringify(dr.delta())
    );
    svg.dispatchEvent(new P("pointerup", { clientX: 40, clientY: 25, bubbles: true }));
    ok("drag inactive after pointerup", dr.active() === false);
  }

  /* ------------- local point honors a scaled screen CTM ------------- */
  // When the svg is visually scaled (CSS transform — e.g. Storybook's preview
  // zoom), client coords must be mapped through the inverse screen CTM or
  // every coordinate-based input is offset by the scale. happy-dom provides no
  // real CTM, so mock one on the svg instance (screen = user·2 + (100, 50))
  // and shim DOMPoint for the duration of the test.
  console.log("\nlocal point honors a scaled screen CTM");
  {
    const container = makeContainer();
    const dr = drag();
    await chart(data, { axes: false })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: live(() => (dr.active() ? "#f00" : "#00f")) }))
      .render(container, { w: 200, h: 120 });
    await settle();
    const svg = container.querySelector("svg") as any;

    const g = globalThis as any;
    const hadDOMPoint = g.DOMPoint !== undefined;
    if (!hadDOMPoint) {
      g.DOMPoint = class {
        constructor(
          public x = 0,
          public y = 0
        ) {}
        matrixTransform(m: { a: number; b: number; c: number; d: number; e: number; f: number }) {
          return {
            x: m.a * this.x + m.c * this.y + m.e,
            y: m.b * this.x + m.d * this.y + m.f,
          };
        }
      };
    }
    svg.getScreenCTM = () => ({
      inverse: () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: -50, f: -25 }),
    });
    try {
      const P = (globalThis as any).PointerEvent;
      svg.dispatchEvent(
        new P("pointerdown", { clientX: 300, clientY: 250, bubbles: true })
      );
      ok(
        "client coords mapped through the inverse CTM",
        dr.origin()?.x === 100 && dr.origin()?.y === 100,
        JSON.stringify(dr.origin())
      );
      svg.dispatchEvent(
        new P("pointerup", { clientX: 300, clientY: 250, bubbles: true })
      );
    } finally {
      if (!hadDOMPoint) delete g.DOMPoint;
    }
  }

  /* --------------------------- timer ------------------------------- */
  console.log("\ntimer");
  {
    const t = timer({ interval: 5 });
    ok("timer starts at 0 (lazy)", t() === 0);
    // Wall-clock robust: wait a real span several intervals long, then assert
    // it advanced (a fixed count of setTimeout(0) macrotasks is flaky because
    // each is ~0ms, so the 5ms interval may never elapse under `settle`).
    await realDelay(30);
    const first = t();
    ok("timer advances after a real interval", first >= 1, `ticks=${first}`);
    await realDelay(30);
    const second = t();
    ok("timer ticks are monotonic", second >= first, `${first} → ${second}`);
    t.stop();
    const afterStop = t();
    await realDelay(30);
    ok(
      "timer.stop halts ticking",
      t() === afterStop,
      `${afterStop} → ${t()}`
    );
  }

  console.log("\ntimer regimes (live vs derive)");
  {
    // Live-only timer read: paint pulses, ZERO pipeline re-runs.
    const liveContainer = makeContainer();
    let liveResolves = 0;
    const tLive = timer({ interval: 5 });
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          liveResolves++;
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: live(() => (tLive() % 2 ? "#f00" : "#00f")) }))
      .render(liveContainer, { w: 200, h: 120 });
    await settle();
    ok("live timer: initial resolve", liveResolves === 1, `resolves=${liveResolves}`);
    await realDelay(30);
    await settle();
    ok(
      "live-only timer read causes no pipeline re-runs",
      liveResolves === 1,
      `resolves=${liveResolves}`
    );
    tLive.stop();

    // Timer read in derive(): the pipeline re-runs as ticks accrue.
    const specContainer = makeContainer();
    let specResolves = 0;
    // A longer interval than `settle`'s zero-ms macrotasks so no tick lands
    // before we capture the baseline (5ms would already re-run during settle).
    const tSpec = timer({ interval: 40 });
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          specResolves++;
          tSpec(); // spec read → pipeline dependency
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(specContainer, { w: 200, h: 120 });
    await settle();
    const baseline = specResolves;
    ok("spec timer: initial resolve", baseline >= 1, `resolves=${baseline}`);
    await realDelay(150);
    await settle();
    ok(
      "timer read in derive re-runs the pipeline as it ticks",
      specResolves > baseline,
      `resolves=${specResolves}`
    );
    tSpec.stop();
  }

  /* ------------------------ container dispose ---------------------- */
  console.log("\ncontainer dispose");
  {
    const container = makeContainer();
    await chart(data, { axes: false })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    const firstSvg = container.querySelector("svg");
    ok("first render produced one svg", container.querySelectorAll("svg").length === 1);

    await chart(data, { axes: false })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: "#0a0" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    ok(
      "second render into same container leaves exactly one svg",
      container.querySelectorAll("svg").length === 1,
      String(container.querySelectorAll("svg").length)
    );
    ok("previous svg was removed", container.querySelector("svg") !== firstSvg);
    ok(
      "second render's bars present",
      container.querySelectorAll("rect").length === 3
    );
  }

  /* ------------------- .layer(mark) annotation tier ---------------- */
  console.log("\nlayer(mark) annotation tier");
  {
    const container = makeContainer();
    // A bare rect passed to .layer(...) is a component-level annotation tier
    // (a datumless overlay). It should resolve and render over the bars — no
    // empty-data chart() scope needed.
    await chart(data, { axes: false })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: "#00f" }))
      .layer(rect({ y: 4, h: 3, w: 180, fill: "#333" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    ok("one svg rendered", container.querySelectorAll("svg").length === 1);
    ok(
      "bars plus the annotation rule are present",
      container.querySelectorAll("rect").length === 4,
      String(container.querySelectorAll("rect").length)
    );
  }

  /* ---------------- component-level reactivity (no chart()) -------------- */
  console.log("\ncomponent thunk: pipeline tier + live coexist");
  {
    // A low-level component rendered through the THUNK form of the terminal:
    // gofish(container, opts, () => node). A signal() read INSIDE the thunk
    // (outside live) drives layout; a signal read only in live() patches paint.
    const container = makeContainer();
    let thunkRuns = 0;
    const n = signal(2); // spec read → pipeline dependency
    const fillSig = signal("#00f"); // read only in live() → paint patch
    await gofish(container, { w: 240, h: 120 }, () => {
      thunkRuns++;
      const count = n();
      return spreadX(
        { spacing: 6 },
        Array.from({ length: count }, () =>
          rect({ w: 24, h: 60, fill: live(() => fillSig()) })
        )
      );
    });
    await settle();
    const rects = () => Array.from(container.querySelectorAll("rect"));
    ok("thunk ran once initially", thunkRuns === 1, `runs=${thunkRuns}`);
    ok("initial box count from signal", rects().length === 2, String(rects().length));
    ok(
      "initial live fill is resolve-time value",
      rects().every((r) => r.getAttribute("fill") === "#00f")
    );

    // A spec-read signal write → exactly one coalesced re-render; layout reflows.
    n.set(4);
    await settle();
    ok("signal write re-ran the thunk once", thunkRuns === 2, `runs=${thunkRuns}`);
    ok("layout reflowed to new box count", rects().length === 4, String(rects().length));

    // A live-only signal write patches paint with ZERO thunk re-runs.
    fillSig.set("#f00");
    await nextTick();
    ok(
      "live fill patched the DOM attribute",
      rects().every((r) => r.getAttribute("fill") === "#f00"),
      rects().map((r) => r.getAttribute("fill")).join(",")
    );
    ok("live paint patch caused zero re-runs", thunkRuns === 2, `runs=${thunkRuns}`);
  }

  console.log("\ncomponent plain node: live over a RAW solid signal, no runtime");
  {
    // A plain-NODE component (an operator wrapping a live rect) — NOT a thunk —
    // over a raw Solid createSignal. No InteractionRuntime is created, so no
    // data-gf-id is emitted; yet the raw signal still patches paint (paint
    // reactivity is runtime-independent).
    const container = makeContainer();
    const [c, setC] = createSignal("#00f");
    // spreadX(...) resolves to a Promise<node> (not a function), so the terminal
    // takes the STATIC path — a bare v1 mark would look like a thunk.
    await gofish(
      container,
      { w: 120, h: 80 },
      spreadX({ spacing: 0 }, [rect({ w: 40, h: 40, fill: live(() => c()) })])
    );
    await settle();
    const rects = () => Array.from(container.querySelectorAll("rect"));
    ok("plain-node component rendered a rect", rects().length === 1);
    ok(
      "no runtime attached → no data-gf-id",
      container.querySelectorAll("[data-gf-id]").length === 0,
      String(container.querySelectorAll("[data-gf-id]").length)
    );
    ok(
      "raw solid signal initial value painted",
      rects()[0]?.getAttribute("fill") === "#00f"
    );
    setC("#f00");
    await nextTick();
    ok(
      "raw solid signal patches paint with no runtime",
      rects()[0]?.getAttribute("fill") === "#f00",
      rects()[0]?.getAttribute("fill") ?? "null"
    );
  }

  console.log("\ncomponent thunk: container takeover disposal");
  {
    const container = makeContainer();
    let firstRuns = 0;
    const a = signal(2);
    await gofish(container, { w: 200, h: 100 }, () => {
      firstRuns++;
      a(); // spec dependency of the FIRST component
      return spreadX(
        { spacing: 4 },
        Array.from({ length: 2 }, () => rect({ w: 20, h: 30, fill: "#00f" }))
      );
    });
    await settle();
    ok("first thunk render → one svg", container.querySelectorAll("svg").length === 1);
    const runsBeforeTakeover = firstRuns;

    // A DIFFERENT thunk-rendered component takes over the same container.
    await gofish(container, { w: 200, h: 100 }, () =>
      spreadX(
        { spacing: 4 },
        Array.from({ length: 3 }, () => rect({ w: 20, h: 30, fill: "#0a0" }))
      )
    );
    await settle();
    ok(
      "takeover leaves exactly one svg",
      container.querySelectorAll("svg").length === 1,
      String(container.querySelectorAll("svg").length)
    );
    ok(
      "takeover shows the new component's boxes",
      container.querySelectorAll("rect").length === 3,
      String(container.querySelectorAll("rect").length)
    );

    // The old component's runtime was disposed, so its spec signal no longer
    // invalidates anything — its thunk must not re-run.
    a.set(9);
    await settle();
    ok(
      "disposed component's signal no longer re-runs it",
      firstRuns === runsBeforeTakeover,
      `runs=${firstRuns}`
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
