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
  click,
  signal,
  // The low-level render terminal (`gofish as GoFish`) + a v1 operator, for the
  // component-level (no chart(), no data) reactive cases.
  GoFish: gofish,
  spreadX,
  geo,
  group,
  scatter,
  line,
  text,
  // The animated bird panels: `filter` + `between` + a `timer()` clock.
  circle,
  filter,
  between,
  // Panel E: controls as ordinary marks, laid out with the ordinary operators.
  slider,
  button,
  spreadY,
  Frame,
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

/* ------------------- the bird-migration fixture ------------------- */
// The stories in miniature: 4 species over 40 days instead of 72 over 365, so
// the assertions are the same shape as the stories' but the tests stay cheap.
// Every day has its own latitude, so distinct `cy` values COUNT the days a
// window kept — several assertions below rely on that.
const SPECIES = ["a", "b", "c", "d"];
const DAYS = 40;
const WINDOW = 20;
const birdRows = SPECIES.flatMap((species, s) =>
  Array.from({ length: DAYS }, (_unused, k) => ({
    day: k + 1,
    species,
    lon: -120 + s * 10 + k,
    lat: 40 - k,
  }))
);

const dots = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll("ellipse, circle"));

/**
 * The panel C/D/E chart: the bird fixture as a geo scatter, filtered by a clock.
 * `window` omitted keeps only the clock's own day (panel C); given, it keeps a
 * CYCLIC window of that many days back from the playhead (panels D and E), which
 * is what makes the trail stay `window` days long across the loop boundary
 * instead of shrinking at the new year. `fade` dims everything but the current
 * day. Returns the builder, so panel E can nest it under an operator.
 */
function trailChart(opts: {
  day: () => number;
  window?: number;
  fade?: boolean;
  padding?: number;
}): any {
  const { day, window: win, fade, padding } = opts;
  const pred =
    win === undefined
      ? (d: any) => d.day === day()
      : (d: any) =>
          between((day() - d.day + DAYS) % DAYS, 0, win, { closed: "left" });
  return chart(birdRows, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    axes: false,
    legend: false,
    ...(padding !== undefined ? { padding } : {}),
  })
    .flow(filter(pred), scatter({ x: "lon", y: "lat" }))
    .mark(
      circle({
        r: 3,
        fill: "species",
        ...(fade ? { opacity: (d: any) => (d.day === day() ? 1 : 0.1) } : {}),
      })
    );
}

/** Handle radius, and so the inset of the handle centre's travel at each end. */
const HANDLE_R = 7;

/**
 * The slider's pixel geometry, inverted: `xFor(v)` is the client x whose value is
 * `v` under the widget's own ABSOLUTE map (the handle centre travels `w − 2r`
 * from `trackX + r`). `track` re-queries, because a re-render replaces the svg.
 */
function sliderPx(
  container: HTMLElement,
  w: number,
  domain: readonly [number, number]
) {
  const track = (): any => container.querySelector('rect[fill="#e5e5e5"]');
  const trackX = Number(track().getAttribute("x"));
  const travel = w - 2 * HANDLE_R;
  const [lo, hi] = domain;
  return {
    track,
    trackX,
    travel,
    startX: trackX + HANDLE_R,
    xFor: (v: number): number =>
      trackX + HANDLE_R + ((v - lo) / (hi - lo)) * travel,
  };
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
    ok(
      "invalidate while running re-runs once more",
      runs2 === 2,
      `runs=${runs2}`
    );

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
    ok(
      "degenerate scale returns undefined",
      invertAffine(() => 3) === undefined
    );

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
      bars()
        .map((r) => r.getAttribute("fill"))
        .join(",")
    );
    ok(
      "live paint patch caused ZERO re-runs",
      resolves === 1,
      `resolves=${resolves}`
    );
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
    ok(
      "two coalesced writes → one re-run",
      resolves === 3,
      `resolves=${resolves}`
    );
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
    ok(
      "wheel.set in spec → one re-run",
      resolves === 2,
      `resolves=${resolves}`
    );
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
    ok(
      "all bars start blue",
      bars().every((r) => r.getAttribute("fill") === "#00f")
    );

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
      bars()
        .map((r) => r.getAttribute("fill"))
        .join(",")
    );
    ok("hover caused zero re-runs", resolves === 1, `resolves=${resolves}`);
  }

  /* ------------------------- drag lifecycle ------------------------ */
  console.log("\ndrag lifecycle");
  {
    const container = makeContainer();
    const dr = drag();
    await chart(data, { axes: false })
      // Read drag.isActive() inside live() so the input registers + attaches.
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(
        rect({ h: "count", fill: live(() => (dr.isActive() ? "#f00" : "#00f")) })
      )
      .render(container, { w: 200, h: 120 });
    await settle();
    const svg = container.querySelector("svg") as any;
    ok("drag inactive initially", dr.isActive() === false);

    const P = (globalThis as any).PointerEvent;
    svg.dispatchEvent(
      new P("pointerdown", { clientX: 10, clientY: 10, bubbles: true })
    );
    ok("drag active after pointerdown", dr.isActive() === true);
    ok(
      "origin captured",
      dr.origin()?.x === 10 && dr.origin()?.y === 10,
      JSON.stringify(dr.origin())
    );
    svg.dispatchEvent(
      new P("pointermove", { clientX: 35, clientY: 22, bubbles: true })
    );
    ok(
      "delta tracks the move",
      dr.delta()?.x === 25 && dr.delta()?.y === 12,
      JSON.stringify(dr.delta())
    );
    svg.dispatchEvent(
      new P("pointerup", { clientX: 40, clientY: 25, bubbles: true })
    );
    ok("drag inactive after pointerup", dr.isActive() === false);
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
      .mark(
        rect({ h: "count", fill: live(() => (dr.isActive() ? "#f00" : "#00f")) })
      )
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
        matrixTransform(m: {
          a: number;
          b: number;
          c: number;
          d: number;
          e: number;
          f: number;
        }) {
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
  // `timer()` is a scale from a data domain onto wall-clock time, read
  // backward: t() = scale(domain → [0, duration]).invert(elapsed). Elapsed is
  // measured with performance.now() deltas, so the seek/pause assertions below
  // are exact and only the "it advances" ones need a real delay.
  console.log("\ntimer");
  {
    // -- continuous domain + step quantization --
    const day = timer({ domain: [1, 365], step: 1, duration: 10000 });
    ok(
      "continuous timer starts at the domain's low end",
      day() === 1,
      `${day()}`
    );
    ok("a first read lazy-starts the clock", day.isPlaying() === true);
    ok("domain is readable", JSON.stringify(day.domain) === "[1,365]");
    ok("step is readable", day.step === 1);
    day.set(50);
    ok(
      "seeking does not change playing state",
      day.isPlaying() === true,
      "still playing"
    );
    day.pause();
    ok("isPlaying is false while paused", day.isPlaying() === false);
    day.set(200);
    ok("set() seeks in domain units", day() === 200, `${day()}`);
    ok("seeking a paused clock leaves it paused", day.isPlaying() === false);
    day.set(200.7);
    ok(
      "a continuous read is quantized to lo + k*step (floor)",
      day() === 200,
      `${day()}`
    );
    const frozen = day();
    await realDelay(40);
    ok("pause freezes the value", day() === frozen, `${frozen} → ${day()}`);
    ok(
      "a read does not resurrect a paused clock",
      day.isPlaying() === false && day() === frozen
    );
    day.play();
    ok("isPlaying is true after play", day.isPlaying() === true);
    await realDelay(80);
    ok(
      "the clock advances in domain units after play",
      day() > frozen,
      `${frozen} → ${day()}`
    );
    day.pause();

    // -- values-array domain (a band) --
    const phase = timer({
      domain: ["spring", "summer", "fall", "winter"],
      duration: 4000,
      playing: false,
    });
    ok("band timer emits its first value", phase() === "spring", `${phase()}`);
    ok("band timer starts paused when playing:false", phase.isPlaying() === false);
    phase.set("fall");
    ok("set() seeks to a band value", phase() === "fall", `${phase()}`);
    ok("band step is undefined", phase.step === undefined);

    // -- the high endpoint of a quantized domain --
    // A quantized domain's N values each own 1/N of the LOOP, so the last one
    // is emitted like any other and `set(hi)` round-trips. (Spreading them over
    // [lo, hi] instead gives the last slot zero width, because a looping
    // `elapsed` folds into [0, duration): `hi` was never emitted and
    // `set(hi)` read back as `lo`.)
    const year = timer({
      domain: [1, 365],
      step: 1,
      duration: 10000,
      playing: false,
    });
    year.set(365);
    ok("set(hi) reads back hi on a quantized domain", year() === 365, `${year()}`);
    year.set(1);
    ok("set(lo) reads back lo", year() === 1, `${year()}`);
    const bandEnd = timer({
      domain: ["spring", "summer", "fall", "winter"],
      duration: 4000,
      playing: false,
    });
    bandEnd.set("winter");
    ok(
      "set(last band value) reads back that value",
      bandEnd() === "winter",
      `${bandEnd()}`
    );
    // Every quantized value round-trips, not just the ends.
    const roundTrips = timer({
      domain: [0, 10],
      step: 2,
      duration: 500,
      playing: false,
    });
    let allRoundTrip = true;
    for (const v of [0, 2, 4, 6, 8, 10]) {
      roundTrips.set(v);
      if (roundTrips() !== v) allRoundTrip = false;
    }
    ok("set(v) round-trips for every quantized value", allRoundTrip);

    // -- loop wrap: every value is emitted, the high endpoint included --
    const pulse = timer({ domain: [0, 1], step: 1, duration: 60 });
    const seen = new Set<number>();
    pulse(); // first read starts it
    for (let i = 0; i < 14; i++) {
      await realDelay(10);
      seen.add(pulse());
    }
    pulse.pause();
    ok(
      "a looping clock emits the domain's high endpoint",
      seen.has(1),
      `saw ${[...seen].join(",")}`
    );
    ok(
      "a looping clock comes back round to the low endpoint",
      seen.has(0),
      `saw ${[...seen].join(",")}`
    );

    const wrapped = timer({ domain: [0, 10], step: 1, duration: 100 });
    wrapped(); // first read starts it
    wrapped.set(9);
    await realDelay(60); // past the end of the 100ms sweep → wraps
    ok(
      "a looping clock wraps at duration",
      wrapped() < 9,
      `wrapped to ${wrapped()}`
    );
    wrapped.pause();

    // -- no loop: clamps at the end and stops --
    const once = timer({ domain: [0, 10], step: 1, duration: 60, loop: false });
    once();
    await realDelay(140);
    ok("a non-looping clock clamps at the domain's end", once() === 10, `${once()}`);
    ok("a non-looping clock pauses itself at the end", once.isPlaying() === false);

    // -- no domain: elapsed milliseconds, the degenerate case --
    const ms = timer({ duration: 1000, playing: false });
    ok("a domainless timer's domain is [0, duration]", JSON.stringify(ms.domain) === "[0,1000]");
    ms.set(250);
    ok("a domainless timer reads milliseconds", Math.round(ms()) === 250, `${ms()}`);
  }

  console.log("\ntimer regimes (live vs derive)");
  {
    // Live-only timer read: paint pulses, ZERO pipeline re-runs.
    const liveContainer = makeContainer();
    let liveResolves = 0;
    const tLive = timer({ domain: [0, 1], step: 1, duration: 20 });
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          liveResolves++;
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(
        rect({ h: "count", fill: live(() => (tLive() ? "#f00" : "#00f")) })
      )
      .render(liveContainer, { w: 200, h: 120 });
    await settle();
    ok(
      "live timer: initial resolve",
      liveResolves === 1,
      `resolves=${liveResolves}`
    );
    await realDelay(30);
    await settle();
    ok(
      "live-only timer read causes no pipeline re-runs",
      liveResolves === 1,
      `resolves=${liveResolves}`
    );
    tLive.pause();

    // Timer read in derive(): the pipeline re-runs as the clock's value moves.
    const specContainer = makeContainer();
    let specResolves = 0;
    // Starts PAUSED so no new value lands before we capture the baseline, then
    // played explicitly below.
    const tSpec = timer({
      domain: [0, 100],
      step: 1,
      duration: 1000,
      playing: false,
    });
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
    ok(
      "a paused spec timer causes no re-runs",
      specResolves === baseline,
      `resolves=${specResolves}`
    );
    tSpec.play();
    await realDelay(150);
    await settle();
    ok(
      "timer read in derive re-runs the pipeline as its value moves",
      specResolves > baseline,
      `resolves=${specResolves}`
    );
    tSpec.pause();

    // `isPlaying()` read in a spec: a bare play()/pause() — no event of any
    // kind — must re-run it. (It used to appear to work only because the click
    // that called play() invalidated the same spec for its own reasons.)
    const playContainer = makeContainer();
    let playResolves = 0;
    const tPlay = timer({
      domain: [0, 100],
      step: 1,
      duration: 100000, // long enough that no VALUE change can confound the count
      playing: false,
    });
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          playResolves++;
          tPlay.isPlaying(); // spec read → pipeline dependency
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(playContainer, { w: 200, h: 120 });
    await settle();
    const playBaseline = playResolves;
    tPlay.play();
    await settle();
    ok(
      "play() re-runs a spec that reads isPlaying()",
      playResolves > playBaseline,
      `resolves=${playResolves} (baseline ${playBaseline})`
    );
    const afterPlay = playResolves;
    tPlay.pause();
    await settle();
    ok(
      "pause() re-runs it too",
      playResolves > afterPlay,
      `resolves=${playResolves} (after play ${afterPlay})`
    );
    const afterPause = playResolves;
    tPlay.pause(); // already paused — not a transition
    await settle();
    ok(
      "a pause() that changes nothing re-runs nothing",
      playResolves === afterPause,
      `resolves=${playResolves} (after pause ${afterPause})`
    );
  }

  /* ----------------------- click arming ---------------------------- */
  // A press that lands on nothing leaves `armed` undefined, exactly as it was,
  // so it must not re-run the specs reading `isArmed()`.
  console.log("\nclick arming");
  {
    const container = makeContainer();
    const press = click();
    let clickResolves = 0;
    await chart(data, { axes: false })
      .flow(
        derive((rows: any) => {
          clickResolves++;
          press.isArmed(); // spec read → pipeline dependency
          return rows;
        }),
        spread({ by: "cat", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#00f" }))
      .render(container, { w: 200, h: 120 });
    await settle();
    const svg = container.querySelector("svg") as any;
    const P = (globalThis as any).PointerEvent;
    const baseline = clickResolves;
    ok("click: initial resolve", baseline >= 1, `resolves=${baseline}`);
    ok("nothing armed initially", press.isArmed() === false);

    // Dispatched ON THE SVG, so the hit test finds no `data-gf-id` mark under
    // the pointer and the press is rejected.
    svg.dispatchEvent(
      new P("pointerdown", { clientX: 10, clientY: 10, bubbles: true })
    );
    await settle();
    ok("a press off any mark arms nothing", press.isArmed() === false);
    ok(
      "a rejected press re-runs nothing",
      clickResolves === baseline,
      `resolves=${clickResolves} (baseline ${baseline})`
    );

    // A press ON a mark does arm, and that IS a transition. Press and release
    // in the same tick: a re-resolve in between would hand the release a mark
    // with a fresh uid, which is a different target by the commit rule.
    const bar = container.querySelector("rect[data-gf-id]") as any;
    bar.dispatchEvent(
      new P("pointerdown", { clientX: 5, clientY: 5, bubbles: true })
    );
    ok("a press on a mark arms the click", press.isArmed() === true);
    bar.dispatchEvent(
      new P("pointerup", { clientX: 5, clientY: 5, bubbles: true })
    );
    ok("the release commits one click", press.count() === 1, `${press.count()}`);
    await settle();
    ok(
      "arming re-runs the spec that reads it",
      clickResolves > baseline,
      `resolves=${clickResolves} (baseline ${baseline})`
    );
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
    ok(
      "first render produced one svg",
      container.querySelectorAll("svg").length === 1
    );

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
    ok(
      "initial box count from signal",
      rects().length === 2,
      String(rects().length)
    );
    ok(
      "initial live fill is resolve-time value",
      rects().every((r) => r.getAttribute("fill") === "#00f")
    );

    // A spec-read signal write → exactly one coalesced re-render; layout reflows.
    n.set(4);
    await settle();
    ok(
      "signal write re-ran the thunk once",
      thunkRuns === 2,
      `runs=${thunkRuns}`
    );
    ok(
      "layout reflowed to new box count",
      rects().length === 4,
      String(rects().length)
    );

    // A live-only signal write patches paint with ZERO thunk re-runs.
    fillSig.set("#f00");
    await nextTick();
    ok(
      "live fill patched the DOM attribute",
      rects().every((r) => r.getAttribute("fill") === "#f00"),
      rects()
        .map((r) => r.getAttribute("fill"))
        .join(",")
    );
    ok(
      "live paint patch caused zero re-runs",
      thunkRuns === 2,
      `runs=${thunkRuns}`
    );
  }

  console.log(
    "\ncomponent plain node: live over a RAW solid signal, no runtime"
  );
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
    ok(
      "first thunk render → one svg",
      container.querySelectorAll("svg").length === 1
    );
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

  /* ------- geo coord: hover a path, live channels on a connector ------- */
  console.log("\ngeo coord + live() on a line connector");
  {
    const container = makeContainer();
    const p = pointer();
    const rows = [
      { day: 1, lon: -120, lat: 50, species: "a" },
      { day: 2, lon: -100, lat: 30, species: "a" },
      { day: 3, lon: -90, lat: 10, species: "a" },
      { day: 1, lon: -60, lat: -10, species: "b" },
      { day: 2, lon: -55, lat: -25, species: "b" },
      { day: 3, lon: -50, lat: -40, species: "b" },
    ];
    // The stamped datum of a `line` is its group's projected datum, so the
    // species field is readable off it — the panel-B `hot` predicate.
    const hot = (d: any) => p.datum()?.species === d?.species;
    await chart(rows, {
      coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
      axes: false,
    })
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" })
      )
      .mark(
        line({
          stroke: "species",
          strokeWidth: live((d: any) => (hot(d) ? 3 : 0.1)),
          opacity: live((d: any) => (hot(d) ? 1 : 0.5)),
        })
      )
      // The panel-B readout: a text tier whose CONTENT is a live channel.
      .layer(text({ text: live(() => p.datum()?.species ?? ""), fontSize: 14 }))
      .render(container, { w: 300, h: 300 });
    await settle();
    const readout = () =>
      Array.from(container.querySelectorAll("text"))
        .map((el: any) => el.textContent)
        .join("");
    const threads = () =>
      Array.from(container.querySelectorAll("path")).filter(
        (el: any) => el.getAttribute("stroke-width") !== "0"
      );
    ok(
      "one connector per species",
      threads().length === 2,
      String(threads().length)
    );
    ok(
      "live() strokeWidth paints its resting value on a connector",
      threads().every((el: any) => el.getAttribute("stroke-width") === "0.1"),
      threads()
        .map((el: any) => el.getAttribute("stroke-width"))
        .join(",")
    );

    // Text before hovering: the legend's entries only — the readout is empty.
    const restingText = readout();
    const target = threads()[0];
    target.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: 5,
        clientY: 5,
        bubbles: true,
      })
    );
    await nextTick();
    const widths = threads().map((el: any) => el.getAttribute("stroke-width"));
    ok(
      "hovering a path thickens exactly that species' thread",
      widths.filter((w: string) => w === "3").length === 1 &&
        widths.filter((w: string) => w === "0.1").length === 1,
      widths.join(",")
    );
    ok(
      "the live() readout gains the hovered species' name",
      readout().length === restingText.length + 1,
      `${JSON.stringify(restingText)} -> ${JSON.stringify(readout())}`
    );
  }

  /* ---- panels C and D: a timer-driven filter over a geo basemap ---- */
  // The clock is SEEKED rather than waited on, which is what makes the
  // frame-by-frame assertions exact. Fixture and chart: `birdRows`/`trailChart`.
  console.log("\ntimer + filter: animated panels (C and D)");
  {
    // -- panel C: one circle per species, at the current day --
    const container = makeContainer();
    const day = timer({ domain: [1, DAYS], step: 1, duration: 10000 });
    await trailChart({ day }).render(container, { w: 300, h: 300 });
    await settle();
    day.pause();
    day.set(1);
    await settle();
    ok(
      "panel C renders one circle per species on the current day",
      dots(container).length === SPECIES.length,
      String(dots(container).length)
    );
    const firstFrame = dots(container).map((el: any) => el.getAttribute("cx"));
    day.set(20);
    await settle();
    ok(
      "seeking the clock moves the circles to another day",
      dots(container).length === SPECIES.length &&
        dots(container).some(
          (el: any, i: number) => el.getAttribute("cx") !== firstFrame[i]
        ),
      `${firstFrame.join(",")} → ${dots(container)
        .map((el: any) => el.getAttribute("cx"))
        .join(",")}`
    );

    // -- panel D: a 20-day trail, current day at full opacity --
    const trailContainer = makeContainer();
    const day2 = timer({ domain: [1, DAYS], step: 1, duration: 10000 });
    await trailChart({ day: day2, window: WINDOW, fade: true }).render(
      trailContainer,
      { w: 300, h: 300 }
    );
    await settle();
    day2.pause();
    day2.set(30);
    await settle();
    const trail = dots(trailContainer);
    const opacities = trail.map((el: any) => el.getAttribute("opacity"));
    ok(
      "panel D keeps at most window × species rows",
      trail.length === WINDOW * SPECIES.length,
      `${trail.length} (max ${WINDOW * SPECIES.length})`
    );
    ok(
      "exactly the current day's positions are at full opacity",
      opacities.filter((o: string) => o === "1").length === SPECIES.length,
      opacities.join(","),
    );
    ok(
      "the rest of the trail is faded",
      opacities.filter((o: string) => o === "0.1").length ===
        (WINDOW - 1) * SPECIES.length,
      opacities.join(",")
    );
    // The loop boundary: at day 3 the window reaches back over the new year,
    // covering days 3, 2, 1 and then DAYS…DAYS−16. A non-cyclic window would
    // collapse to the 3 days of the year so far.
    day2.set(3);
    await settle();
    const wrapped = dots(trailContainer);
    ok(
      "the trail wraps across the loop boundary",
      wrapped.length === WINDOW * SPECIES.length,
      `${wrapped.length} (expected ${WINDOW * SPECIES.length})`
    );
    ok(
      "the wrapped window still covers WINDOW distinct days",
      // One row per species per day, and each day has its own latitude, so the
      // distinct y positions count the days in the window.
      new Set(wrapped.map((el: any) => el.getAttribute("cy"))).size === WINDOW,
      String(new Set(wrapped.map((el: any) => el.getAttribute("cy"))).size)
    );
    ok(
      "the current day is still the opaque one across the boundary",
      wrapped.filter((el: any) => el.getAttribute("opacity") === "1").length ===
        SPECIES.length,
      wrapped.map((el: any) => el.getAttribute("opacity")).join(",")
    );
  }

  /* ------------- widgets: slider + button as ordinary marks ------------- */
  // A control is a mark, not a node: the thunk re-invokes it every resolve (so
  // the handle can move) while its drag/click input and write effect are made
  // once. These tests drive it exactly as a user would — press the track or the
  // handle, move, release — and read the value back out of the signal it writes.
  // The pixel → value map is ABSOLUTE: the widget reads the track's on-screen box
  // off the published frame (`drag().nodeBox`), so the pointer's position along
  // the handle's travel IS the value.
  console.log("\nwidgets: slider + button");
  {
    const container = makeContainer();
    const level = signal(50);
    const inputs: number[] = [];
    let clicks = 0;
    const levelSlider = slider({
      value: level,
      onInput: (v: number) => {
        inputs.push(v);
        level.set(v);
      },
      domain: [0, 100],
      step: 1,
      w: 240,
      format: (v: number) => `v=${v}`,
    });
    const resetButton = button({
      label: "0",
      onClick: () => {
        clicks++;
        level.set(0);
      },
    });
    await gofish(container, { w: 420, h: 120 }, () =>
      spreadX({ spacing: 8 }, [resetButton, levelSlider])
    );
    await settle();

    const P = (globalThis as any).PointerEvent;
    // Re-query every time: a re-render replaces the whole <svg>.
    const svg = (): any => container.querySelector("svg");
    const handle = (): any => container.querySelector("ellipse");
    const box = (): any => container.querySelector("rect");
    const readout = (): string =>
      Array.from(container.querySelectorAll("text"))
        .map((t: any) => t.textContent)
        .join("|");

    const { track, trackX, travel, xFor } = sliderPx(container, 240, [0, 100]);
    ok(
      "the handle starts at the value's fraction of the travel",
      Number(handle().getAttribute("cx")) === trackX + 7 + 0.5 * travel,
      `${handle().getAttribute("cx")} (track x=${trackX})`
    );
    ok(
      "the readout shows the formatted initial value",
      readout() === "0|v=50",
      readout()
    );

    // A press on the BARE TRACK at a quarter of the travel lands the handle
    // there: 0 + 0.25 · 100 = 25.
    track().dispatchEvent(
      new P("pointerdown", { clientX: xFor(25), clientY: 50, bubbles: true })
    );
    await settle();
    ok(
      "a press on the track jumps to the pointed-at value",
      inputs.length === 1 && inputs[0] === 25 && level() === 25,
      `${inputs.join(",")} / ${level()}`
    );
    ok(
      "the handle is under the pointer that pressed the track",
      Math.abs(Number(handle().getAttribute("cx")) - xFor(25)) < 1e-6,
      String(handle().getAttribute("cx"))
    );
    ok(
      "the readout re-formatted the new value",
      readout() === "0|v=25",
      readout()
    );
    svg().dispatchEvent(
      new P("pointerup", { clientX: xFor(25), clientY: 50, bubbles: true })
    );
    await settle();

    // Press the HANDLE, then move: the value follows the pointer absolutely, not
    // by an offset from the press.
    handle().dispatchEvent(
      new P("pointerdown", { clientX: xFor(25), clientY: 50, bubbles: true })
    );
    svg().dispatchEvent(
      new P("pointermove", { clientX: xFor(61), clientY: 50, bubbles: true })
    );
    await settle();
    ok(
      "a drag from the handle follows the pointer absolutely",
      level() === 61,
      String(level())
    );
    ok(
      "the handle follows the value it wrote",
      Math.abs(Number(handle().getAttribute("cx")) - xFor(61)) < 1e-6,
      String(handle().getAttribute("cx"))
    );
    svg().dispatchEvent(
      new P("pointerup", { clientX: xFor(61), clientY: 50, bubbles: true })
    );
    await settle();

    // Past the right end: with no `wrap`, the fraction clamps, so the value
    // stops at the domain's max.
    handle().dispatchEvent(
      new P("pointerdown", { clientX: xFor(61), clientY: 50, bubbles: true })
    );
    svg().dispatchEvent(
      new P("pointermove", { clientX: 900, clientY: 50, bubbles: true })
    );
    await settle();
    ok("a drag past the end clamps to the domain", level() === 100, String(level()));
    svg().dispatchEvent(
      new P("pointermove", { clientX: -900, clientY: 50, bubbles: true })
    );
    await settle();
    ok("a drag past the start clamps too", level() === 0, String(level()));
    svg().dispatchEvent(
      new P("pointerup", { clientX: -900, clientY: 50, bubbles: true })
    );
    await settle();
    level.set(61);
    await settle();

    // A press anywhere else is not this slider's drag.
    const before = level();
    svg().dispatchEvent(
      new P("pointerdown", { clientX: 5, clientY: 5, bubbles: true })
    );
    svg().dispatchEvent(
      new P("pointermove", { clientX: 80, clientY: 5, bubbles: true })
    );
    await settle();
    ok("a drag off the slider is inert", level() === before, String(level()));
    svg().dispatchEvent(
      new P("pointerup", { clientX: 80, clientY: 5, bubbles: true })
    );
    await settle();

    // A press on the button: down then up on the same control = one click.
    box().dispatchEvent(
      new P("pointerdown", { clientX: 45, clientY: 45, bubbles: true })
    );
    box().dispatchEvent(
      new P("pointerup", { clientX: 45, clientY: 45, bubbles: true })
    );
    await settle();
    ok(
      "a press fires onClick exactly once",
      clicks === 1 && level() === 0,
      `clicks=${clicks} level=${level()}`
    );
    ok("the readout followed the reset", readout() === "0|v=0", readout());

    // A press that is released off the button is not a click.
    box().dispatchEvent(
      new P("pointerdown", { clientX: 45, clientY: 45, bubbles: true })
    );
    svg().dispatchEvent(
      new P("pointerup", { clientX: 300, clientY: 90, bubbles: true })
    );
    await settle();
    ok("a press released elsewhere is not a click", clicks === 1, `clicks=${clicks}`);
  }

  /* ------------- widgets: a wrapping slider over a cyclic domain ------------- */
  // `wrap: true` drops the clamp: the RAW fraction of the travel is mapped and
  // the quantized value folded modulo the cycle, which for a quantized domain is
  // `span + step` (here 355 + 5 = 360, i.e. 72 five-degree slots) so both ends
  // are distinct values.
  console.log("\nwidgets: a wrapping slider");
  {
    const container = makeContainer();
    const bearing = signal(45);
    const bearingSlider = slider({
      value: bearing,
      onInput: (v: number) => bearing.set(v),
      domain: [0, 355],
      step: 5,
      w: 240,
      wrap: true,
      format: (v: number) => `${v}°`,
    });
    const northButton = button({ label: "N", onClick: () => bearing.set(0) });
    await gofish(container, { w: 420, h: 120 }, () =>
      spreadX({ spacing: 8 }, [northButton, bearingSlider])
    );
    await settle();

    const P = (globalThis as any).PointerEvent;
    const svg = (): any => container.querySelector("svg");
    const readout = (): string =>
      (container.querySelectorAll("text")[1] as any)?.textContent ?? "";

    const { track, travel, startX } = sliderPx(container, 240, [0, 355]);
    ok("the wrapping slider shows its formatted value", readout() === "45°", readout());

    // Press the far end of the travel: the last slot is reachable (355, not 0).
    track().dispatchEvent(
      new P("pointerdown", { clientX: startX + travel, clientY: 50, bubbles: true })
    );
    await settle();
    ok("the wrapping slider reaches its top value", bearing() === 355, String(bearing()));

    // 4px past the end: 1.0177 · 355 = 361.3, quantized to 360, folded mod 360.
    svg().dispatchEvent(
      new P("pointermove", { clientX: startX + travel + 4, clientY: 50, bubbles: true })
    );
    await settle();
    ok("a drag past the end wraps to the start", bearing() === 0, String(bearing()));
    ok("the readout wrapped with it", readout() === "0°", readout());

    // 4px before the start: −6.28, quantized to −5, folded mod 360 onto 355.
    svg().dispatchEvent(
      new P("pointermove", { clientX: startX - 4, clientY: 50, bubbles: true })
    );
    await settle();
    ok("a drag past the start wraps to the end", bearing() === 355, String(bearing()));
    svg().dispatchEvent(
      new P("pointerup", { clientX: startX - 4, clientY: 50, bubbles: true })
    );
    await settle();
  }

  /* ------------- panel E: the controls drive the clock ------------- */
  console.log("\npanel E: slider + button over a timer");
  {
    const container = makeContainer();
    const day = timer({ domain: [1, DAYS], step: 1, duration: 10000 });
    const map = trailChart({ day, window: WINDOW, padding: 0 });
    const timeSlider = slider({
      value: day,
      onInput: (v: number) => {
        day.pause();
        day.set(v);
      },
      domain: day.domain,
      step: day.step,
      w: 200,
      // As in the story: day-of-year is a cycle, so a scrub off either end of the
      // track continues around the year.
      wrap: true,
      format: (v: number) => `day ${v}`,
    });
    const playButton = button({
      label: () => (day.isPlaying() ? "pause" : "play"),
      onClick: () => (day.isPlaying() ? day.pause() : day.play()),
    });
    await gofish(container, { w: 400, h: 400, legend: false }, () =>
      spreadY({ spacing: 12 }, [
        Frame({ w: 300, h: 300 }, [map]),
        spreadX({ spacing: 8 }, [playButton, timeSlider]),
      ])
    );
    await settle();

    const P = (globalThis as any).PointerEvent;
    const svg = (): any => container.querySelector("svg");
    // The handle is the r=7 ellipse; the bird dots are r=3.
    const handle = (): any => container.querySelector('ellipse[rx="7"]');
    const buttonBox = (): any => container.querySelector('rect[rx="4"]');

    ok("the clock starts playing on first read", day.isPlaying() === true);
    // Seek to a known day, so the drag's arithmetic is exact.
    day.pause();
    day.set(10);
    await settle();
    ok("the map drew the wrapped trail",
      container.querySelectorAll('ellipse[rx="3"]').length ===
        WINDOW * SPECIES.length,
      String(container.querySelectorAll('ellipse[rx="3"]').length)
    );
    day.play();
    await settle();

    // Drag the handle to the x whose value is day 25: the map is absolute, so the
    // pointer's position along the travel is the day — and the drag pauses the
    // clock first (the delegation rule).
    const { xFor: xForDay } = sliderPx(container, 200, [1, DAYS]);
    handle().dispatchEvent(
      new P("pointerdown", { clientX: xForDay(10), clientY: 340, bubbles: true })
    );
    svg().dispatchEvent(
      new P("pointermove", { clientX: xForDay(25), clientY: 340, bubbles: true })
    );
    await settle();
    ok("dragging the slider pauses the clock", day.isPlaying() === false);
    ok("the scrub seeks in domain units", day() === 25, String(day()));
    ok(
      "the slider reads out the day it seeked to",
      Array.from(container.querySelectorAll("text")).some(
        (t: any) => t.textContent === "day 25"
      ),
      Array.from(container.querySelectorAll("text"))
        .map((t: any) => t.textContent)
        .join("|")
    );
    svg().dispatchEvent(
      new P("pointerup", { clientX: xForDay(25), clientY: 340, bubbles: true })
    );
    await settle();

    buttonBox().dispatchEvent(
      new P("pointerdown", { clientX: 60, clientY: 340, bubbles: true })
    );
    buttonBox().dispatchEvent(
      new P("pointerup", { clientX: 60, clientY: 340, bubbles: true })
    );
    await settle();
    ok("the button resumes play", day.isPlaying() === true);
    buttonBox().dispatchEvent(
      new P("pointerdown", { clientX: 60, clientY: 340, bubbles: true })
    );
    buttonBox().dispatchEvent(
      new P("pointerup", { clientX: 60, clientY: 340, bubbles: true })
    );
    await settle();
    ok("the button pauses again", day.isPlaying() === false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
