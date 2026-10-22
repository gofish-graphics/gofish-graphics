/**
 * The frontend IR is complete for the animation and interaction surface: a
 * spec written in JS, serialized (`Serialize.toJSON`), validated, and rebuilt
 * (`Serialize.renderIR`) draws the same DOM as the spec rendered directly.
 *
 * Run: `pnpm test:ir-round-trip` (builds first; renders the built library
 * under happy-dom, like the interaction tests).
 */
import { settle } from "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { Frontend } from "gofish-ir";
import data from "vega-datasets";
import {
  categoryBrands,
  type CategoryBrand,
} from "../data/categoryBrands";
import { seafood } from "../data/catch";

const {
  chart,
  spread,
  stack,
  scatter,
  rect,
  circle,
  line,
  text,
  layer,
  field,
  selectAll,
  time,
  timer,
  drag,
  pointer,
  when,
  Animation,
  Curve,
  Serialize,
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

function makeContainer(): HTMLElement {
  const c = document.createElement("div");
  document.body.appendChild(c);
  return c;
}

/** The DOM with the ids a render mints (node uids, clip and gradient ids)
 *  numbered by first appearance, so two renders compare by structure. */
function normalized(container: HTMLElement): string {
  const html = container.innerHTML;
  const seen = new Map<string, string>();
  const canon = (id: string) => {
    if (!seen.has(id)) seen.set(id, `#${seen.size}`);
    return seen.get(id)!;
  };
  return html
    .replace(/data-gf-id="([^"]*)"/g, (_m, id) => `data-gf-id="${canon(id)}"`)
    .replace(/\bid="([^"]*)"/g, (_m, id) => `id="${canon(id)}"`)
    .replace(/url\(#([^)]*)\)/g, (_m, id) => `url(${canon(id)})`);
}

/**
 * Render `build()` directly, and again through the IR, and compare. `build`
 * is called once per render so each has sources of its own, as two renders
 * of one spec in two notebook cells would.
 */
async function roundTrip(
  name: string,
  build: () => any,
  options: Record<string, unknown>
): Promise<Record<string, any>> {
  const direct = makeContainer();
  await build().render(direct, options);
  await settle();

  const doc = await Serialize.toJSON(build());
  const v = Frontend.validate(doc);
  ok(`${name}: the IR validates`, v.valid, JSON.stringify(v.errors ?? []));
  // As a host gets it: JSON text.
  const read = Serialize.readIR(JSON.stringify(doc));
  const viaIR = makeContainer();
  await Serialize.renderIR(read, viaIR, options);
  await settle();
  const a = normalized(direct);
  const b = normalized(viaIR);
  ok(`${name}: the direct render drew a chart`, /<svg/.test(a) && a.length > 500, String(a.length));
  ok(
    `${name}: the IR draws the same DOM`,
    a === b,
    a === b ? undefined : firstDiff(a, b)
  );
  return doc;
}

function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}: direct …${a.slice(Math.max(0, i - 60), i + 80)}… vs IR …${b.slice(Math.max(0, i - 60), i + 80)}…`;
}

async function main(): Promise<void> {
  /* ----------------------- Gapminder trails, paused ----------------------- */
  console.log("\nGapminder trails, paused at 1997.5");
  const gapminder = ((await (data as any)["gapminder.json"]()) as any[]).filter(
    (d) =>
      ["China", "India", "United States", "Rwanda", "Brazil"].includes(
        d.country
      )
  );
  const trailsDoc = await roundTrip(
    "Gapminder trails",
    () => {
      const year = timer({
        domain: [1955, 2005],
        duration: 10000,
        playing: false,
        loop: false,
        at: 1997.5,
      });
      return chart(gapminder, { legend: false })
        .flow(
          time.sequence({ by: "year", on: year }),
          scatter({ by: "country", x: "fertility", y: "life_expect" })
        )
        .mark(
          layer([
            time.history([circle({ r: 4, fill: "country", opacity: 0.3 })]),
            circle({ r: 4, fill: "country" }).transition({
              update: Animation.tween({ curve: Curve.monotone() }),
            }),
          ])
        )
        .layer(
          line({
            along: "year",
            stroke: "country",
            strokeWidth: 1.5,
            opacity: 0.6,
            curve: Curve.monotone(),
          })
        )
        .layer(
          chart([{ fertility: 7.5, life_expect: 83 }])
            .flow(scatter({ x: "fertility", y: "life_expect" }))
            .mark(
              text({ text: year.floor(), fontSize: 48, fill: "#ccc" }).zOrder(
                -1
              )
            )
        );
    },
    { w: 500, h: 400 }
  );
  ok(
    "the clock is one source, declared once",
    JSON.stringify(trailsDoc.sources) ===
      JSON.stringify({
        s0: {
          kind: "timer",
          domain: [1955, 2005],
          duration: 10000,
          playing: false,
          loop: false,
          at: 1997.5,
        },
      }),
    JSON.stringify(trailsDoc.sources)
  );

  /* ---------------------- the top-10 race, paused ---------------------- */
  console.log("\nTop-10 bar chart race, paused at 2007.5");
  const ranked = Array.from(new Set(categoryBrands.map((d) => d.year))).flatMap(
    (y) =>
      categoryBrands
        .filter((d) => d.year === y)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
  ) as CategoryBrand[];
  await roundTrip(
    "race top 10",
    () => {
      const year = timer({
        domain: [2000, 2019],
        duration: 20000,
        playing: false,
        loop: false,
        at: 2007.5,
      });
      return chart(ranked, { legend: false })
        .flow(
          time.sequence({ by: "year", on: year }),
          spread({
            by: field("name").sort("value", "desc"),
            dir: "y",
            spacing: 2,
          })
        )
        .mark(
          rect({ w: "value", fill: "category" }).label("name", {
            position: "outset-right",
          })
        )
        .layer(time.transition({ curve: Curve.linear() }))
        .layer(
          chart([{ value: 210000 }])
            .flow(scatter({ x: "value" }))
            .mark(
              text({
                text: year.floor(),
                fontSize: 48,
                fill: "#ccc",
                y: 270,
              }).zOrder(-1)
            )
        );
    },
    { w: 600, h: 400, axes: { x: true, y: false } }
  );

  /* ------------------------ draggable threshold ------------------------ */
  console.log("\nDraggable threshold");
  const bars = [
    { cat: "a", count: 30 },
    { cat: "b", count: 95 },
    { cat: "c", count: 55 },
    { cat: "d", count: 72 },
    { cat: "e", count: 40 },
    { cat: "f", count: 88 },
  ];
  const thresholdDoc = await roundTrip(
    "threshold",
    () => {
      const dr = drag();
      const cut = dr.y.clip(0, 95).fillNull(60);
      return chart(bars)
        .flow(spread({ by: "cat", dir: "x" }))
        .mark(
          rect({
            h: "count",
            fill: when(field("count").sum().gt(cut))
              .then("#d62728")
              .otherwise("#6b9bd1"),
          })
        )
        .layer(rect({ y: cut, h: 3, w: 500, fill: "#333" }));
    },
    { w: 500, h: 360 }
  );
  ok(
    "the threshold's fill and rule are expressions on the wire",
    JSON.stringify(thresholdDoc).includes('"type":"when"') &&
      JSON.stringify(thresholdDoc).includes('"read":"y"')
  );
  ok(
    "the drag is one source, read in two places",
    Object.keys(thresholdDoc.sources ?? {}).length === 1 &&
      JSON.stringify(thresholdDoc).split('"id":"s0"').length - 1 === 2
  );

  /* ---------------------------- hover ---------------------------- */
  console.log("\nHover highlight");
  await roundTrip(
    "hover",
    () => {
      const hover = pointer();
      return chart(seafood)
        .flow(spread({ by: "lake", dir: "x" }))
        .mark(
          rect({
            h: "count",
            fill: when(hover.over).then("#d62728").otherwise("#6b9bd1"),
          })
        );
    },
    { w: 400, h: 400 }
  );

  /* ----------------- build-ins, held by the render options ----------------- */
  console.log("\nBuild-ins");
  const alphabet = "ABCDEFGH".split("").map((letter, i) => ({
    letter,
    frequency: (i % 5) + 1,
  }));
  await roundTrip(
    "chained stagger + grow at 700 ms",
    () =>
      chart(alphabet)
        .flow(
          spread({ by: "letter", dir: "x" }).transition({
            enter: time.stagger({ lag: 60 }),
          })
        )
        .mark(
          rect({ h: "frequency" }).transition({
            enter: Animation.grow({ duration: 600 }),
          })
        ),
    { w: 480, h: 220, playing: false, at: 700 }
  );
  const sales = ["Q1", "Q2", "Q3"].flatMap((quarter, q) =>
    ["a", "b"].map((product, p) => ({
      quarter,
      product,
      revenue: 10 + q * 3 + p * 5,
    }))
  );
  await roundTrip(
    "selection-form stagger + wipe at 400 ms",
    () =>
      chart(sales)
        .flow(
          spread({ by: "quarter", dir: "x" }),
          stack({ by: "product", dir: "y" })
        )
        .mark(rect({ h: "revenue", fill: "product" }).name("bars"))
        .layer(
          chart(selectAll("bars"))
            .flow(
              time.stagger({ by: "product", spacing: 0 }),
              time.stagger({ by: "quarter", lag: 100 })
            )
            .mark(
              time.transition({ enter: Animation.wipe({ from: "bottom" }) })
            )
        ),
    { w: 400, h: 240, playing: false, at: 400 }
  );

  /* ------------------------- loud failures ------------------------- */
  console.log("\nWhat does not cross");
  const fails = async (name: string, build: () => any, re: RegExp) => {
    try {
      await Serialize.toJSON(build());
      ok(name, false, "did not throw");
    } catch (e) {
      ok(name, re.test(String(e)), String(e));
    }
  };
  await fails(
    "a function ease",
    () =>
      chart(alphabet)
        .flow(spread({ by: "letter", dir: "x" }))
        .mark(
          rect({ h: "frequency" }).transition({
            enter: Animation.grow({ ease: (u: number) => u }),
          })
        ),
    /takes a JS function/
  );
  await fails(
    "a drag with a hitTest function",
    () => {
      const dr = drag({ hitTest: () => true });
      return chart(bars)
        .flow(spread({ by: "cat", dir: "x" }))
        .mark(rect({ h: "count", y: dr.y.fillNull(0) }));
    },
    /takes a JS function/
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
