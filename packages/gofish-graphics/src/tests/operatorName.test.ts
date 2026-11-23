/**
 * `.name()` on an operator (#802): each group node the operator makes is
 * filed under the name, so `selectAll(name)` yields one ref per group whose
 * `datum` is the group's rows. The name rules are a mark name's: a singular
 * `ref(name)` that matches several groups is an error, and the name survives
 * later chained calls and a round trip through JSON. Run via `tsx`
 * (`pnpm test:operator-name`).
 */
import { GoFishRef } from "../ast/_ref";
import { buildIR } from "../serialize/fromJSON";
import {
  chart,
  layer,
  line,
  rect,
  ref,
  selectAll,
  spread,
  stack,
} from "../lib";
import { check, report, textsOf } from "./testHelpers";

const rows = [
  { site: "Morris", variety: "a", v: 3 },
  { site: "Morris", variety: "b", v: 5 },
  { site: "Crookston", variety: "a", v: 2 },
  { site: "Crookston", variety: "b", v: 4 },
];

const size = { w: 300, h: 200, axes: false };

/** The refs `selectAll(name)` hands a chart layered on `base`. */
async function selected(base: any, name: string): Promise<GoFishRef[]> {
  let seen: GoFishRef[] = [];
  await base
    .layer(
      chart(selectAll(name)).mark((bag: GoFishRef[]) => {
        seen = bag;
        return rect({ w: 1, h: 1 });
      })
    )
    .toDisplayList(size);
  return seen;
}

const sitesOf = (refs: GoFishRef[]) =>
  refs.map((r) => (r.datum as any[]).map((d) => d.site).join("+")).join(",");

async function rejects(name: string, run: () => Promise<unknown>, re: RegExp) {
  try {
    await run();
    check(name, false, "rendered without throwing");
  } catch (e: any) {
    check(name, re.test(String(e?.message)), String(e?.message));
  }
}

async function main() {
  console.log("\n# operator .name(): one ref per group");

  const named = (op: any) =>
    chart(rows)
      .flow(op, spread({ by: "variety", dir: "x" }))
      .mark(rect({ h: "v", w: 10 }));

  // One ref per group, its datum the group's rows.
  {
    const refs = await selected(
      named(spread({ by: "site", dir: "x" }).name("sites")),
      "sites"
    );
    check(
      "selectAll yields one ref per group",
      refs.length === 2 && refs.every((r) => r instanceof GoFishRef),
      refs.length
    );
    check(
      "each ref's datum is its group's rows",
      sitesOf(refs) === "Morris+Morris,Crookston+Crookston",
      sitesOf(refs)
    );
  }

  // Chained calls keep the name, in either order (#919).
  for (const [what, op] of [
    [
      ".name().label()",
      spread({ by: "site", dir: "x" }).name("sites").label("site"),
    ],
    [
      ".label().name()",
      spread({ by: "site", dir: "x" }).label("site").name("sites"),
    ],
    [
      ".name().translate()",
      spread({ by: "site", dir: "x" }).name("sites").translate({ y: 5 }),
    ],
    [
      ".translate().name()",
      spread({ by: "site", dir: "x" }).translate({ y: 5 }).name("sites"),
    ],
  ] as const) {
    const refs = await selected(named(op), "sites");
    check(
      `${what} keeps the name`,
      refs.length === 2 &&
        sitesOf(refs) === "Morris+Morris,Crookston+Crookston",
      sitesOf(refs)
    );
  }
  {
    const texts = textsOf(
      await named(
        spread({ by: "site", dir: "x" }).name("sites").label("site")
      ).toDisplayList(size)
    );
    check(
      "a named operator's label still draws",
      texts.join(",") === "Morris,Crookston",
      texts
    );
  }

  // A group that is the mark's own node keeps the mark's name too.
  {
    const base = chart(rows)
      .flow(stack({ by: "site", dir: "y" }).name("sites"))
      .mark(rect({ h: "v", w: 10 }).name("bars"));
    const sites = await selected(base, "sites");
    const bars = await selected(base, "bars");
    check(
      "a node is filed under the operator's name and the mark's",
      sites.length === 2 && bars.length === 2,
      { sites: sites.length, bars: bars.length }
    );
  }

  // A singular ref to a name several groups share is the same-level
  // duplicate error a mark name gives.
  await rejects(
    "ref(name) matching several groups is an error",
    () =>
      layer([
        named(spread({ by: "site", dir: "x" }).name("sites")),
        rect({ w: 5, h: 5 }).name("b"),
      ])
        .relate(() => [line({}, [ref("sites"), ref("b")])])
        .toDisplayList(size),
    /the name "sites" is ambiguous: it matched 2 nodes/
  );

  // JSON: the name rides the operator's IR and comes back.
  {
    const spec = named(spread({ by: "site", dir: "x" }).name("sites"));
    const doc = await spec.toJSON();
    const flow = (doc.root as any).operators;
    check(
      "toJSON writes the operator's name",
      flow?.[0]?.name === "sites",
      JSON.stringify(doc.root).slice(0, 300)
    );
    const rebuilt = buildIR(doc);
    const again = await rebuilt.toJSON();
    check(
      "fromJSON reapplies it",
      JSON.stringify(again.root) === JSON.stringify(doc.root),
      again.root
    );
    const refs = await selected(rebuilt, "sites");
    check(
      "the rebuilt chart selects one ref per group",
      sitesOf(refs) === "Morris+Morris,Crookston+Crookston",
      sitesOf(refs)
    );
  }

  report();
}

main();
