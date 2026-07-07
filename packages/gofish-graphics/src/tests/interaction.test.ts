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
// The built library: rendering goes through the solid-compiled SVG backend.
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { chart, spread, rect, derive, live, pointer, drag, wheel, timer, signal } =
  GoFish as any;

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
      Math.abs(pxToData(dataToPx(95)) - 95) < 1e-9
    );
    let threw = false;
    try {
      invertAffine(() => 3);
    } catch {
      threw = true;
    }
    ok("degenerate scale rejected", threw);

    // frameConversions over a recorded frame: data → px → data round-trips.
    const conv = frameConversions({
      items: [],
      root: {} as any,
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
        root: {} as any,
        toPixel: ([gx, gy]) => [gx, gy],
        size: { width: 10, height: 10 },
      }) === undefined
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

  /* --------------------------- timer ------------------------------- */
  console.log("\ntimer");
  {
    const t = timer({ interval: 5 });
    ok("timer starts at 0 (lazy)", t() === 0);
    await settle(6); // > a few intervals
    const ticked = t();
    ok("timer advances after intervals", ticked > 0, `ticks=${ticked}`);
    t.stop();
    const afterStop = t();
    await settle(6);
    ok("timer.stop halts ticking", t() === afterStop, `${afterStop} → ${t()}`);
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
